import type { Env, Challenge } from "./types";
import type { ResolvedChallenge } from "./challenge";
import { GitHubApi } from "./github/api";
import { getInstallationToken } from "./github/auth";
import { buildRiskReport, renderRiskReportMarkdown } from "./risk/report";

export async function apiForInstallation(env: Env, installationId: number): Promise<GitHubApi> {
  const token = await getInstallationToken(env.GITHUB_APP_ID, env.GITHUB_PRIVATE_KEY, installationId);
  return new GitHubApi(token);
}

export async function onChallengeResolved(env: Env, r: ResolvedChallenge): Promise<void> {
  const api = await apiForInstallation(env, r.challenge.installation_id);
  const repo = r.challenge.repo_full_name;
  const pr = r.challenge.pr_number;
  const checkId = r.challenge.check_run_id;

  const report = buildRiskReport(r.telemetry);
  const riskMd = renderRiskReportMarkdown(report, r.telemetry);

  switch (r.outcome) {
    case "passed": {
      if (checkId) await api.updateCheckRun(repo, checkId, {
        status: "completed", conclusion: "success",
        output: {
          title: report.automationLikely ? "Passed (automation-likely)" : "Passed",
          summary: `Score ${r.score}/${r.total}.\n\n${riskMd}`,
        },
      });
      await api.upsertPrComment(repo, pr, [
        "## 🦞 Clawptcha — passed ✅",
        "",
        `@${r.challenge.author_login} certified under challenge that they personally understand this change (score ${r.score}/${r.total}).`,
        "",
        report.automationLikely
          ? "> ⚠️ The behavioral risk report flagged this pass as **automation-likely**. Maintainers: see the check run details."
          : "_Behavioral risk report attached to the check run for maintainers._",
      ].join("\n"));
      break;
    }
    case "failed_retry": {
      if (checkId) await api.updateCheckRun(repo, checkId, {
        status: "completed", conclusion: "failure",
        output: {
          title: `Failed (attempt ${r.challenge.attempts_used}/${r.cfg.max_attempts})`,
          summary: `Score ${r.score}/${r.total}. Retry available after cooldown (${r.cfg.cooldown_minutes} min) with a freshly generated quiz.\n\n${riskMd}`,
        },
      });
      break;
    }
    case "failed_final": {
      if (checkId) await api.updateCheckRun(repo, checkId, {
        status: "completed", conclusion: "failure",
        output: {
          title: "Failed — attempts exhausted",
          summary: `Score ${r.score}/${r.total}. Max attempts reached.\n\n${riskMd}`,
        },
      });
      await api.upsertPrComment(repo, pr, [
        "## 🦞 Clawptcha — challenge failed ❌",
        "",
        `@${r.challenge.author_login} did not pass the comprehension check after ${r.cfg.max_attempts} attempts.`,
        "",
        "Maintainers: please review this PR manually before merging.",
      ].join("\n"));
      break;
    }
    case "neutral": {
      if (checkId) await api.updateCheckRun(repo, checkId, {
        status: "completed", conclusion: "neutral",
        output: {
          title: "Clawptcha unavailable",
          summary: "Quiz generation failed (LLM/service issue). Not blocking the merge — this is a Clawptcha-side problem, not a verdict on the PR.",
        },
      });
      break;
    }
  }
}

// Terminal challenge status → check-run conclusion, for cron reconciliation.
function conclusionForStatus(status: Challenge["status"]): "success" | "failure" | "neutral" | null {
  switch (status) {
    case "passed": return "success";
    case "failed_final": return "failure";
    case "neutral": return "neutral";
    default: return null;
  }
}

// Cron: any check left pending >30 min gets neutralized so we never block on our own outage.
export async function sweepStaleChallenges(env: Env, now: Date): Promise<void> {
  // Rate-limit events older than the sliding window are dead weight — purge them
  // (2h cutoff = WINDOW_MS + margin) so the table doesn't grow unboundedly.
  await env.DB.prepare("DELETE FROM rate_events WHERE created_at < ?")
    .bind(new Date(now.getTime() - 2 * 60 * 60_000).toISOString())
    .run();

  const cutoff = new Date(now.getTime() - 30 * 60_000).toISOString();
  const { results } = await env.DB.prepare(
    `SELECT * FROM challenges
     WHERE status IN ('awaiting_approval','ready') AND created_at < ?
       AND check_run_id IS NOT NULL
       AND id NOT IN (SELECT challenge_id FROM quizzes)`
  ).bind(cutoff).all<Challenge>();

  for (const ch of results) {
    // Stale but structurally fine challenges stay open — only neutralize ones
    // whose check was never moved past 'queued' AND that predate the cutoff by
    // a lot (service failed mid-setup). Heuristic: awaiting/ready with no quiz
    // after 24h → mark neutral so the check doesn't dangle forever.
    const dayCutoff = new Date(now.getTime() - 24 * 60 * 60_000).toISOString();
    if (ch.created_at >= dayCutoff) continue;
    try {
      const api = await apiForInstallation(env, ch.installation_id);
      await api.updateCheckRun(ch.repo_full_name, ch.check_run_id!, {
        status: "completed", conclusion: "neutral",
        output: {
          title: "Challenge expired",
          summary: "No quiz attempt within 24h. Not blocking the merge. Push a new commit to re-trigger.",
        },
      });
      await env.DB.prepare("UPDATE challenges SET status='neutral' WHERE id=?").bind(ch.id).run();
    } catch { /* try again next cron tick */ }
  }

  // Reconcile terminal challenges whose GitHub callback may have failed after
  // the DB commit (state is finalized before the check-run PATCH). This sweep
  // repairs ONLY check runs left incomplete by a failed resolution callback —
  // it must never touch a check run that already completed, or it will
  // clobber the real risk report with this generic placeholder on every tick.
  // The challenges table has no updated_at, so recent created_at is the
  // practical proxy for "recently resolved" — challenges are short-lived by design.
  const recentCutoff = new Date(now.getTime() - 24 * 60 * 60_000).toISOString();
  const terminal = await env.DB.prepare(
    `SELECT * FROM challenges
     WHERE status IN ('passed','failed_final','neutral')
       AND check_run_id IS NOT NULL AND created_at >= ?`
  ).bind(recentCutoff).all<Challenge>();

  for (const ch of terminal.results) {
    const conclusion = conclusionForStatus(ch.status);
    if (!conclusion) continue;
    try {
      const api = await apiForInstallation(env, ch.installation_id);
      const current = await api.getCheckRun(ch.repo_full_name, ch.check_run_id!);
      if (current.status === "completed") continue; // callback succeeded; leave the real report intact

      const quiz = await env.DB.prepare(
        "SELECT score FROM quizzes WHERE challenge_id=? AND score IS NOT NULL ORDER BY attempt_number DESC LIMIT 1"
      ).bind(ch.id).first<{ score: number }>();
      const scoreLine = quiz ? ` Final score: ${quiz.score}/4.` : "";
      await api.updateCheckRun(ch.repo_full_name, ch.check_run_id!, {
        status: "completed", conclusion,
        output: {
          title: conclusion === "success" ? "Passed"
            : conclusion === "failure" ? "Failed — attempts exhausted"
            : "Clawptcha unavailable",
          summary: `Reconciled by scheduled sweep: challenge resolved as '${ch.status}'.${scoreLine}`,
        },
      });
    } catch { /* try again next cron tick */ }
  }
}
