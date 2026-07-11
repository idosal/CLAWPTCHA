import type { Env, Challenge } from "./types";
import type { ResolvedChallenge } from "./challenge";
import { resolveConfig, shouldAutoClosePr, type VouchaConfig } from "./config";
import { GitHubApi } from "./github/api";
import { getInstallationToken } from "./github/auth";
import { buildRiskReport, renderRiskReportMarkdown } from "./risk/report";
import { markChallengeAutoClosed, markChallengeTerminalReconciled } from "./store";

const FLAGGED_LABEL = "VOUCHA:flagged";
const FLAGGED_LABEL_COLOR = "b60205";
const FLAGGED_LABEL_DESCRIPTION = "VOUCHA recorded strong automation evidence for maintainer review.";
const PASSED_LABEL = "VOUCHA:passed";
const PASSED_LABEL_COLOR = "0e8a16";
const PASSED_LABEL_DESCRIPTION = "VOUCHA verification passed.";
const FAILED_LABEL = "VOUCHA:failed";
const FAILED_LABEL_COLOR = "b60205";
const FAILED_LABEL_DESCRIPTION = "VOUCHA verification is currently failing.";
const LEGACY_LABELS = [
  "pr-comprehension:passed",
  "pr-comprehension:failed",
  "pr-comprehension:flagged",
] as const;

function challengeUrl(env: Env, challengeId: string): string {
  return `${env.APP_BASE_URL}/challenge/${challengeId}`;
}

type AutoCloseResult = "not_configured" | "closed" | "failed" | "stale_head";

async function maybeAutoClosePr(
  env: Env,
  api: GitHubApi,
  challenge: Challenge,
  cfg: VouchaConfig,
  outcome: string
): Promise<AutoCloseResult> {
  if (!shouldAutoClosePr(cfg, outcome)) return "not_configured";
  if (challenge.auto_closed_at) return "closed";

  let liveHeadSha: string;
  try {
    liveHeadSha = (await api.getPr(challenge.repo_full_name, challenge.pr_number)).head_sha;
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

  if (liveHeadSha !== challenge.head_sha) {
    console.warn("skipping auto-close for stale challenge head", {
      challengeId: challenge.id,
      repo: challenge.repo_full_name,
      prNumber: challenge.pr_number,
      challengeHeadSha: challenge.head_sha,
      liveHeadSha,
    });
    return "stale_head";
  }

  try {
    await api.closePullRequest(challenge.repo_full_name, challenge.pr_number);
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

  try {
    await markChallengeAutoClosed(env.DB, challenge.id);
  } catch (err) {
    console.error("record auto-close failed", {
      challengeId: challenge.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return "closed";
}

function autoCloseCheckLine(result: AutoCloseResult): string | null {
  if (result === "closed") {
    return "Repository policy auto-closed this pull request. Maintainers can reopen it after manual review.";
  }
  if (result === "failed") {
    return "Repository policy is configured to auto-close this pull request, but VOUCHA could not close it. Maintainers should review manually.";
  }
  if (result === "stale_head") {
    return "Repository policy did not auto-close this pull request because the challenge belongs to an older commit. Review the current PR check before merging.";
  }
  return null;
}

function withAutoCloseCheckLine(summary: string, result: AutoCloseResult): string {
  const line = autoCloseCheckLine(result);
  return line ? `${summary}\n\n${line}` : summary;
}

function maintainerActionLine(result: AutoCloseResult): string {
  if (result === "closed") {
    return "Repository policy auto-closed this PR. Maintainers can reopen it after manual review, then comment `/voucha retry` to start a fresh challenge.";
  }
  if (result === "failed") {
    return "Repository policy is configured to auto-close this PR, but VOUCHA could not close it. Maintainers: review manually or comment `/voucha retry` to start a fresh challenge.";
  }
  if (result === "stale_head") {
    return "Repository policy did not auto-close this PR because the failed challenge belongs to an older commit. Review the current PR check before merging.";
  }
  return "Maintainers: review this PR manually or comment `/voucha retry` to start a fresh challenge for this commit.";
}

function retryAvailability(cfg: VouchaConfig): { summary: string; instruction: string } {
  if (cfg.cooldown_minutes === 0) {
    return {
      summary: "Retry available immediately with a freshly generated quiz.",
      instruction: "Retry immediately with a freshly generated quiz",
    };
  }
  return {
    summary: `Retry available after cooldown (${cfg.cooldown_minutes} min) with a freshly generated quiz.`,
    instruction: `Retry after the ${cfg.cooldown_minutes} minute cooldown with a freshly generated quiz`,
  };
}

export async function apiForInstallation(env: Env, installationId: number): Promise<GitHubApi> {
  const token = await getInstallationToken(env.GITHUB_APP_ID, env.GITHUB_PRIVATE_KEY, installationId);
  return new GitHubApi(token);
}

async function applyFailureLabel(api: GitHubApi, repo: string, pr: number): Promise<void> {
  try {
    await api.ensureLabel(repo, FAILED_LABEL, FAILED_LABEL_COLOR, FAILED_LABEL_DESCRIPTION);
    await api.addLabels(repo, pr, [FAILED_LABEL]);
  } catch { /* the failed check remains the enforcement source of truth */ }
}

async function applyPassedLabel(api: GitHubApi, repo: string, pr: number): Promise<void> {
  try {
    await api.ensureLabel(repo, PASSED_LABEL, PASSED_LABEL_COLOR, PASSED_LABEL_DESCRIPTION);
    await api.addLabels(repo, pr, [PASSED_LABEL]);
  } catch { /* the successful check remains the source of truth */ }
}

async function clearLabel(api: GitHubApi, repo: string, pr: number, label: string): Promise<void> {
  try {
    await api.removeLabel(repo, pr, label);
  } catch { /* label reconciliation must not override the check-run outcome */ }
}

async function clearLegacyLabels(api: GitHubApi, repo: string, pr: number): Promise<void> {
  for (const label of LEGACY_LABELS) await clearLabel(api, repo, pr, label);
}

async function reconcileFailureLabels(
  api: GitHubApi,
  repo: string,
  pr: number,
  failedLabelEnabled: boolean
): Promise<void> {
  await clearLabel(api, repo, pr, PASSED_LABEL);
  await clearLabel(api, repo, pr, FLAGGED_LABEL);
  if (failedLabelEnabled) await applyFailureLabel(api, repo, pr);
  else await clearLabel(api, repo, pr, FAILED_LABEL);
}

type CheckRunPatch = Parameters<GitHubApi["updateCheckRun"]>[2];

async function updateTerminalCheckRun(
  env: Env,
  api: GitHubApi,
  challenge: Challenge,
  patch: CheckRunPatch
): Promise<void> {
  if (!challenge.check_run_id) return;
  await api.updateCheckRun(challenge.repo_full_name, challenge.check_run_id, patch);
  try {
    await markChallengeTerminalReconciled(env.DB, challenge.id);
  } catch (err) {
    console.error("record terminal reconciliation failed", {
      challengeId: challenge.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
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

  await clearLegacyLabels(api, repo, pr);

  switch (r.outcome) {
    case "passed": {
      await updateTerminalCheckRun(env, api, r.challenge, {
        status: "completed", conclusion: "success",
        details_url: url,
        output: {
          title: report.automationLikely ? "Passed — strong automation evidence requires review" : "Passed",
          summary: `Score ${r.score}/${r.total}.\n\n${riskMd}`,
        },
      });
      await clearLabel(api, repo, pr, FAILED_LABEL);
      if (r.cfg.output.labels.passed) await applyPassedLabel(api, repo, pr);
      else await clearLabel(api, repo, pr, PASSED_LABEL);
      if (report.automationLikely && r.cfg.output.labels.flagged) {
        // Comment edits don't notify anyone; the label is what makes a flagged
        // pass visible from the PR list. Best-effort: a labeling failure (e.g.
        // missing permission) must not block the attestation below.
        try {
          await api.ensureLabel(repo, FLAGGED_LABEL, FLAGGED_LABEL_COLOR, FLAGGED_LABEL_DESCRIPTION);
          await api.addLabels(repo, pr, [FLAGGED_LABEL]);
        } catch { /* attestation still posts; check title carries the flag */ }
      } else await clearLabel(api, repo, pr, FLAGGED_LABEL);
      if (commentsEnabled) {
        await api.upsertPrComment(repo, pr, [
          "## VOUCHA — passed",
          "",
          `@${r.challenge.author_login} certified under challenge that they personally understand this change (score ${r.score}/${r.total}).`,
          "",
          report.automationLikely
            ? `> ⚠️ **Review before merging:** strong automation evidence was recorded — ${report.signals.join("; ")}.`
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
      const retry = retryAvailability(r.cfg);
      if (checkId) await api.updateCheckRun(repo, checkId, {
        status: "completed", conclusion: "failure",
        details_url: url,
        output: {
          title: `Failed (attempt ${r.challenge.attempts_used}/${r.cfg.max_attempts})`,
          summary: `Score ${r.score}/${r.total}. ${retry.summary} A behavioral report accompanies the final result.`,
        },
      });
      await reconcileFailureLabels(api, repo, pr, r.cfg.output.labels.failed);
      if (commentsEnabled) {
        await api.upsertPrComment(repo, pr, [
          "## VOUCHA — retry needed",
          "",
          `@${r.challenge.author_login} did not pass attempt ${r.challenge.attempts_used}/${r.cfg.max_attempts} (score ${r.score}/${r.total}).`,
          "",
          `${retry.instruction}: ${url}`,
          "",
          "_Per-attempt behavioral details are withheld until the final verdict._",
        ].join("\n"));
      }
      break;
    }
    case "failed_assisted": {
      const reasonLine = r.failureReason ? `Reason: ${r.failureReason}\n\n` : "";
      const autoClose = await maybeAutoClosePr(env, api, r.challenge, r.cfg, r.outcome);
      await updateTerminalCheckRun(env, api, r.challenge, {
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
      await reconcileFailureLabels(api, repo, pr, r.cfg.output.labels.failed);
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
      const autoClose = await maybeAutoClosePr(env, api, r.challenge, r.cfg, r.outcome);
      await updateTerminalCheckRun(env, api, r.challenge, {
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
      await reconcileFailureLabels(api, repo, pr, r.cfg.output.labels.failed);
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
      await updateTerminalCheckRun(env, api, r.challenge, {
        status: "completed", conclusion: "neutral",
        details_url: url,
        output: {
          title: "VOUCHA unavailable",
          summary: "Quiz generation failed (LLM/service issue). Not blocking the merge — this is a VOUCHA-side problem, not a verdict on the PR.",
        },
      });
      if (commentsEnabled) {
        await api.upsertPrComment(repo, pr, [
          "## VOUCHA — unavailable",
          "",
          "VOUCHA could not complete this challenge because of a service-side problem. The check is neutral and does not block the PR.",
          "",
          "Maintainers: after the service recovers, comment `/voucha retry` to start a fresh challenge for this commit.",
        ].join("\n"));
      }
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
       AND c.terminal_reconciled_at IS NULL
       AND (c.created_at >= ?
            OR EXISTS (SELECT 1 FROM quizzes q WHERE q.challenge_id = c.id
                       AND q.finished_at IS NOT NULL AND q.finished_at >= ?))
     ORDER BY COALESCE(
       (SELECT MAX(q.finished_at) FROM quizzes q
        WHERE q.challenge_id = c.id AND q.finished_at IS NOT NULL),
       c.created_at
     ) ASC, c.created_at ASC, c.id ASC
     LIMIT 100`
  ).bind(recentCutoff, recentCutoff).all<Challenge>();

  for (const ch of terminal.results) {
    const conclusion = conclusionForStatus(ch.status);
    if (!conclusion) continue;
    try {
      const api = await apiFactory(env, ch.installation_id);
      const current = await api.getCheckRun(ch.repo_full_name, ch.check_run_id!);
      if (current.status === "completed") {
        await markChallengeTerminalReconciled(env.DB, ch.id);
        continue; // callback succeeded; leave the real report intact
      }

      const quiz = await env.DB.prepare(
        "SELECT score FROM quizzes WHERE challenge_id=? AND score IS NOT NULL ORDER BY retry_cycle DESC, attempt_number DESC LIMIT 1"
      ).bind(ch.id).first<{ score: number }>();
      const scoreLine = quiz ? ` Final score: ${quiz.score}/4.` : "";
      const cfg = resolveConfig(ch.config_json);
      const autoClose = await maybeAutoClosePr(env, api, ch, cfg, ch.status);
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
      await markChallengeTerminalReconciled(env.DB, ch.id);
    } catch { /* try again next cron tick */ }
  }
}
