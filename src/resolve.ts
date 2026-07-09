import type { Env, Challenge } from "./types";
import type { ResolvedChallenge } from "./challenge";
import { resolveConfig, shouldAutoClosePr, type VouchaConfig } from "./config";
import { GitHubApi } from "./github/api";
import { getInstallationToken } from "./github/auth";
import { buildRiskReport, renderRiskReportMarkdown } from "./risk/report";

const FLAGGED_LABEL = "pr-comprehension:flagged";
const FLAGGED_LABEL_COLOR = "b60205";
const FLAGGED_LABEL_DESCRIPTION = "Multiple passive risk signals were observed on a passed PR comprehension challenge.";

function challengeUrl(env: Env, challengeId: string): string {
  return `${env.APP_BASE_URL}/challenge/${challengeId}`;
}

type AutoCloseResult = "not_configured" | "closed" | "failed";

async function maybeAutoClosePr(
  api: GitHubApi,
  challenge: Challenge,
  cfg: VouchaConfig,
  outcome: string
): Promise<AutoCloseResult> {
  if (!shouldAutoClosePr(cfg, outcome)) return "not_configured";
  try {
    await api.closePullRequest(challenge.repo_full_name, challenge.pr_number);
    return "closed";
  } catch (err) {
    console.error("auto-close pull request failed", {
      challengeId: challenge.id,
      repo: challenge.repo_full_name,
      prNumber: challenge.pr_number,
      outcome,
      error: err instanceof Error ? err.message : String(err),
    });
    return "failed";
  }
}

function autoCloseCheckLine(result: AutoCloseResult): string | null {
  if (result === "closed") {
    return "Repository policy auto-closed this pull request. Maintainers can reopen it after manual review.";
  }
  if (result === "failed") {
    return "Repository policy is configured to auto-close this pull request, but VOUCHA could not close it. Maintainers should review manually.";
  }
  return null;
}

function withAutoCloseCheckLine(summary: string, result: AutoCloseResult): string {
  const line = autoCloseCheckLine(result);
  return line ? `${summary}\n\n${line}` : summary;
}

function maintainerActionLine(result: AutoCloseResult): string {
  if (result === "closed") {
    return "Repository policy auto-closed this PR. Maintainers can reopen it after manual review.";
  }
  if (result === "failed") {
    return "Repository policy is configured to auto-close this PR, but VOUCHA could not close it. Maintainers: please review manually before merging.";
  }
  return "Maintainers: please review this PR manually before merging.";
}

export async function apiForInstallation(env: Env, installationId: number): Promise<GitHubApi> {
  const token = await getInstallationToken(env.GITHUB_APP_ID, env.GITHUB_PRIVATE_KEY, installationId);
  return new GitHubApi(token);
}

export async function onChallengeResolved(
  env: Env, r: ResolvedChallenge,
  apiFactory: (env: Env, installationId: number) => Promise<GitHubApi> = apiForInstallation
): Promise<void> {
  const api = await apiFactory(env, r.challenge.installation_id);
  const repo = r.challenge.repo_full_name;
  const pr = r.challenge.pr_number;
  const checkId = r.challenge.check_run_id;
  const url = challengeUrl(env, r.challenge.id);

  const report = buildRiskReport(r.telemetry);
  const riskMd = renderRiskReportMarkdown(report, r.telemetry);
  const commentsEnabled = r.cfg.output.comments !== "quiet";
  const detailedComments = r.cfg.output.comments === "detailed";

  switch (r.outcome) {
    case "passed": {
      if (checkId) await api.updateCheckRun(repo, checkId, {
        status: "completed", conclusion: "success",
        details_url: url,
        output: {
          title: report.automationLikely ? "Passed — but the quiz looks scripted" : "Passed",
          summary: `Score ${r.score}/${r.total}.\n\n${riskMd}`,
        },
      });
      if (report.automationLikely && r.cfg.output.labels) {
        // Comment edits don't notify anyone; the label is what makes a flagged
        // pass visible from the PR list. Best-effort: a labeling failure (e.g.
        // missing permission) must not block the attestation below.
        try {
          await api.ensureLabel(repo, FLAGGED_LABEL, FLAGGED_LABEL_COLOR, FLAGGED_LABEL_DESCRIPTION);
          await api.addLabels(repo, pr, [FLAGGED_LABEL]);
        } catch { /* attestation still posts; check title carries the flag */ }
      }
      if (commentsEnabled) {
        await api.upsertPrComment(repo, pr, [
          "## VOUCHA — passed",
          "",
          `@${r.challenge.author_login} certified under challenge that they personally understand this change (score ${r.score}/${r.total}).`,
          "",
          report.automationLikely
            ? `> ⚠️ **Worth a second look before merging:** this quiz was completed in a way that looks scripted — ${report.signals.join("; ")}.`
            : "_Behavioral risk report attached to the check run for maintainers._",
          ...(detailedComments ? ["", riskMd] : []),
        ].join("\n"));
      }
      break;
    }
    case "failed_retry": {
      // No risk report while attempts remain: per-attempt signal feedback is a
      // training signal for evasion (fail → read fired signals → adjust →
      // retry). The full behavioral report ships with the final verdict only.
      if (checkId) await api.updateCheckRun(repo, checkId, {
        status: "completed", conclusion: "failure",
        details_url: url,
        output: {
          title: `Failed (attempt ${r.challenge.attempts_used}/${r.cfg.max_attempts})`,
          summary: `Score ${r.score}/${r.total}. Retry available after cooldown (${r.cfg.cooldown_minutes} min) with a freshly generated quiz. A behavioral report accompanies the final result.`,
        },
      });
      if (commentsEnabled) {
        await api.upsertPrComment(repo, pr, [
          "## VOUCHA — retry needed",
          "",
          `@${r.challenge.author_login} did not pass attempt ${r.challenge.attempts_used}/${r.cfg.max_attempts} (score ${r.score}/${r.total}).`,
          "",
          `Retry after the ${r.cfg.cooldown_minutes} minute cooldown with a freshly generated quiz: ${url}`,
          "",
          "_Per-attempt behavioral details are withheld until the final verdict._",
        ].join("\n"));
      }
      break;
    }
    case "failed_assisted": {
      const reasonLine = r.failureReason ? `Reason: ${r.failureReason}\n\n` : "";
      const autoClose = await maybeAutoClosePr(api, r.challenge, r.cfg, r.outcome);
      if (checkId) await api.updateCheckRun(repo, checkId, {
        status: "completed", conclusion: "failure",
        details_url: url,
        output: {
          title: "Failed — challenge assistance detected",
          summary: `${withAutoCloseCheckLine(
            `${reasonLine}Score ${r.score}/${r.total}. This challenge must be answered from the author's own understanding.`,
            autoClose
          )}\n\n${riskMd}`,
        },
      });
      if (commentsEnabled) {
        await api.upsertPrComment(repo, pr, [
          "## VOUCHA — challenge failed",
          "",
          `@${r.challenge.author_login} answered the challenge in a way that showed automation or outside assistance.`,
          ...(r.failureReason ? ["", `Reason: ${r.failureReason}`] : []),
          "",
          maintainerActionLine(autoClose),
          ...(detailedComments ? ["", riskMd] : []),
        ].join("\n"));
      }
      break;
    }
    case "failed_final": {
      const title = r.failureReason ? "Failed — bot verification" : "Failed — attempts exhausted";
      const reasonLine = r.failureReason ? `Reason: ${r.failureReason}\n\n` : "";
      const autoClose = await maybeAutoClosePr(api, r.challenge, r.cfg, r.outcome);
      if (checkId) await api.updateCheckRun(repo, checkId, {
        status: "completed", conclusion: "failure",
        details_url: url,
        output: {
          title,
          summary: `${withAutoCloseCheckLine(
            `${reasonLine}Score ${r.score}/${r.total}. ${r.failureReason ? "Bot verification did not pass." : "Max attempts reached."}`,
            autoClose
          )}\n\n${riskMd}`,
        },
      });
      if (commentsEnabled) {
        await api.upsertPrComment(repo, pr, [
          "## VOUCHA — challenge failed",
          "",
          r.failureReason
            ? `@${r.challenge.author_login} did not pass bot verification for this challenge.`
            : `@${r.challenge.author_login} did not pass the comprehension check after ${r.cfg.max_attempts} attempts.`,
          ...(r.failureReason ? ["", `Reason: ${r.failureReason}`] : []),
          "",
          maintainerActionLine(autoClose),
          ...(detailedComments ? ["", riskMd] : []),
        ].join("\n"));
      }
      break;
    }
    case "neutral": {
      if (checkId) await api.updateCheckRun(repo, checkId, {
        status: "completed", conclusion: "neutral",
        details_url: url,
        output: {
          title: "VOUCHA unavailable",
          summary: "Quiz generation failed (LLM/service issue). Not blocking the merge — this is a VOUCHA-side problem, not a verdict on the PR.",
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
    case "failed_assisted": return "failure";
    case "failed_final": return "failure";
    case "neutral": return "neutral";
    default: return null;
  }
}

// Cron: any check left dangling gets neutralized so we never block on our own outage.
export async function sweepStaleChallenges(
  env: Env, now: Date,
  apiFactory: (env: Env, installationId: number) => Promise<GitHubApi> = apiForInstallation
): Promise<void> {
  // Rate-limit events older than the sliding window are dead weight — purge them
  // (2h cutoff = WINDOW_MS + margin) so the table doesn't grow unboundedly.
  await env.DB.prepare("DELETE FROM rate_events WHERE created_at < ?")
    .bind(new Date(now.getTime() - 2 * 60 * 60_000).toISOString())
    .run();

  // Expired sessions (1h TTL) are dead rows — and anonymous visits create them.
  await env.DB.prepare("DELETE FROM sessions WHERE created_at < ?")
    .bind(new Date(now.getTime() - 2 * 60 * 60_000).toISOString())
    .run();

  // Prepared quizzes include correct answers but are not attempts. Keep them
  // only long enough to bridge GitHub comment verification to the start click.
  await env.DB.prepare(
    `DELETE FROM prepared_quizzes
     WHERE created_at < ?
        OR challenge_id IN (
          SELECT id FROM challenges
          WHERE status IN ('passed','failed_assisted','failed_final','neutral','superseded')
        )`
  ).bind(new Date(now.getTime() - 24 * 60 * 60_000).toISOString()).run();

  // Neutralize dangling challenges: awaiting/ready with no quiz attempt after
  // 24h means the service failed mid-setup or the author never showed — mark
  // neutral so the check doesn't dangle forever. LIMIT caps per-tick GitHub
  // calls; stragglers get picked up next cron tick.
  const cutoff = new Date(now.getTime() - 24 * 60 * 60_000).toISOString();
  const { results } = await env.DB.prepare(
    `SELECT * FROM challenges
     WHERE status IN ('awaiting_approval','ready') AND created_at < ?
       AND check_run_id IS NOT NULL
       AND id NOT IN (SELECT challenge_id FROM quizzes)
     LIMIT 100`
  ).bind(cutoff).all<Challenge>();

  for (const ch of results) {
    try {
      const api = await apiFactory(env, ch.installation_id);
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
  // Recency covers two resolution paths: a quiz that finished recently (a pass
  // or failure can land well over 24h after the PR opened, via attempts +
  // cooldowns — keying on challenge created_at alone would strand such a check
  // forever), and a generation-failure `neutral` that has no quiz row at all
  // (caught by the challenge's own created_at). Either recent signal qualifies.
  const recentCutoff = new Date(now.getTime() - 24 * 60 * 60_000).toISOString();
  const terminal = await env.DB.prepare(
    `SELECT * FROM challenges c
     WHERE c.status IN ('passed','failed_assisted','failed_final','neutral')
       AND c.check_run_id IS NOT NULL
       AND (c.created_at >= ?
            OR EXISTS (SELECT 1 FROM quizzes q WHERE q.challenge_id = c.id
                       AND q.finished_at IS NOT NULL AND q.finished_at >= ?))
     LIMIT 100`
  ).bind(recentCutoff, recentCutoff).all<Challenge>();

  for (const ch of terminal.results) {
    const conclusion = conclusionForStatus(ch.status);
    if (!conclusion) continue;
    try {
      const api = await apiFactory(env, ch.installation_id);
      const current = await api.getCheckRun(ch.repo_full_name, ch.check_run_id!);
      if (current.status === "completed") continue; // callback succeeded; leave the real report intact

      const quiz = await env.DB.prepare(
        "SELECT score FROM quizzes WHERE challenge_id=? AND score IS NOT NULL ORDER BY attempt_number DESC LIMIT 1"
      ).bind(ch.id).first<{ score: number }>();
      const scoreLine = quiz ? ` Final score: ${quiz.score}/4.` : "";
      const cfg = resolveConfig(ch.config_json);
      const autoClose = await maybeAutoClosePr(api, ch, cfg, ch.status);
      await api.updateCheckRun(ch.repo_full_name, ch.check_run_id!, {
        status: "completed", conclusion,
        output: {
          title: conclusion === "success" ? "Passed"
            : ch.status === "failed_assisted" ? "Failed — challenge assistance detected"
            : conclusion === "failure" ? "Failed — attempts exhausted"
            : "VOUCHA unavailable",
          summary: withAutoCloseCheckLine(
            `Reconciled by scheduled sweep: challenge resolved as '${ch.status}'.${scoreLine}`,
            autoClose
          ),
        },
      });
    } catch { /* try again next cron tick */ }
  }
}
