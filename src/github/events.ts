import type { Env } from "../types";
import type { GitHubApi } from "./api";
import { parseConfig, resolveConfig, type ClawptchaConfig } from "../config";
import { evaluateExemption } from "../policy/exemptions";
import {
  getChallengeByPr, getLatestChallengeForPr, hasPassedChallenge,
  insertChallenge, setChallengeStatus, supersedeOldChallenges,
  updateChallengeCheckRun, randomToken,
} from "../store";

export const CHECK_NAME = "clawptcha";

function challengeUrl(env: Env, challengeId: string): string {
  return `${env.APP_BASE_URL}/challenge/${challengeId}`;
}

function commentBody(env: Env, challengeId: string, status: string, cfg: ClawptchaConfig, authorLogin: string): string {
  const url = challengeUrl(env, challengeId);
  if (status === "awaiting_approval") {
    return [
      "## 🦞 Clawptcha",
      "",
      "This PR requires a comprehension check before merge. A maintainer must approve the challenge first:",
      "",
      "> Maintainers: comment `/clawptcha approve` to unlock the challenge.",
      "",
      `Once approved, the author takes a short quiz about this change: ${url}`,
      "",
      "_Passing posts a public attestation that the author personally understands this change._",
    ].join("\n");
  }
  return [
    "## 🦞 Clawptcha",
    "",
    `@${authorLogin}: take a short comprehension quiz about this change to turn the check green (${cfg.max_attempts} attempts max):`,
    "",
    `➡️ **[Start the challenge](${url})**`,
    "",
    "_Passing posts a public attestation that you personally understand this change. The quiz is generated from the diff; answers are graded automatically._",
  ].join("\n");
}

export async function handlePullRequestEvent(
  env: Env, api: GitHubApi, payload: any
): Promise<void> {
  const action = payload.action as string;
  if (!["opened", "synchronize", "reopened"].includes(action)) return;

  const repo = payload.repository.full_name as string;
  const installationId = payload.installation.id as number;
  const prNumber = payload.pull_request.number as number;
  const headSha = payload.pull_request.head.sha as string;
  const baseSha = payload.pull_request.base.sha as string;

  // Idempotency: webhook redeliveries for a known (pr, sha) are no-ops.
  if (await getChallengeByPr(env.DB, repo, prNumber, headSha)) return;

  const pr = await api.getPr(repo, prNumber);
  // Config comes from the merge target, never the PR branch — a PR must not be able to weaken its own gate.
  const configYaml = await api.getFileContent(repo, ".github/clawptcha.yml", baseSha);
  const cfg = parseConfig(configYaml);

  // A new head SHA obsoletes any open challenge for this PR, regardless of
  // which branch below handles it — stale challenges must never stay takeable.
  await supersedeOldChallenges(env.DB, repo, prNumber, headSha);

  const changedFiles = await api.listPrFiles(repo, prNumber);
  const exemption = evaluateExemption(
    {
      authorLogin: pr.author_login,
      authorType: pr.author_type,
      authorAssociation: pr.author_association,
      changedLines: pr.additions + pr.deletions,
      changedFiles,
    },
    cfg
  );

  if (exemption.exempt) {
    await api.createCheckRun(repo, {
      name: CHECK_NAME, head_sha: headSha, status: "completed", conclusion: "success",
      output: { title: "Exempt", summary: `Auto-passed: ${exemption.reason}.` },
    });
    return;
  }

  // synchronize with an existing pass and rechallenge_on_push=false → keep the pass.
  if (action === "synchronize" && !cfg.rechallenge_on_push) {
    if (await hasPassedChallenge(env.DB, repo, prNumber)) {
      await api.createCheckRun(repo, {
        name: CHECK_NAME, head_sha: headSha, status: "completed", conclusion: "success",
        output: { title: "Passed", summary: "Author previously passed the challenge for this PR." },
      });
      return;
    }
  }

  const needsApproval =
    cfg.require_approval === "always" ||
    (cfg.require_approval === "first_time" &&
      ["FIRST_TIME_CONTRIBUTOR", "FIRST_TIMER", "NONE"].includes(pr.author_association));
  const status = needsApproval ? "awaiting_approval" : "ready";

  const challengeId = randomToken();
  const checkRunId = await api.createCheckRun(repo, {
    name: CHECK_NAME, head_sha: headSha, status: "queued",
    output: {
      title: needsApproval ? "Awaiting maintainer approval" : "Awaiting challenge",
      summary:
        (needsApproval
          ? "A maintainer must approve the challenge (`/clawptcha approve`) before the author can take it."
          : "The PR author must pass a comprehension quiz. Link in the PR comment.") +
        `\n\nChallenge link: ${challengeUrl(env, challengeId)}`,
    },
  });

  try {
    await insertChallenge(env.DB, {
      id: challengeId,
      installation_id: installationId,
      repo_full_name: repo,
      pr_number: prNumber,
      head_sha: headSha,
      author_login: pr.author_login,
      check_run_id: checkRunId,
      status,
      approved_by: null,
      attempts_used: 0,
      cooldown_until: null,
      config_json: JSON.stringify(cfg),
    });
  } catch (e) {
    // Concurrent duplicate delivery: the other handler won the UNIQUE race.
    // Point the stored challenge at the newest check run (GitHub evaluates the
    // latest run per name+SHA) and stop — the winner posts the comment.
    if (String(e).includes("UNIQUE")) {
      await updateChallengeCheckRun(env.DB, repo, prNumber, headSha, checkRunId);
      return;
    }
    throw e;
  }

  await api.upsertPrComment(repo, prNumber, commentBody(env, challengeId, status, cfg, pr.author_login));
}

export async function handleIssueCommentEvent(
  env: Env, api: GitHubApi, payload: any
): Promise<void> {
  if (payload.action !== "created") return;
  if (!payload.issue?.pull_request) return; // not a PR comment
  const body = (payload.comment.body as string).trim();
  if (!/^\/clawptcha\s+approve\b/.test(body)) return;

  const repo = payload.repository.full_name as string;
  const prNumber = payload.issue.number as number;
  const commenter = payload.comment.user.login as string;

  const permission = await api.getUserPermission(repo, commenter);
  if (!["admin", "write"].includes(permission)) return;

  const challenge = await getLatestChallengeForPr(env.DB, repo, prNumber);
  if (!challenge || challenge.status !== "awaiting_approval") return;

  await setChallengeStatus(env.DB, challenge.id, "ready", commenter);
  const storedCfg = resolveConfig(challenge.config_json);
  if (challenge.check_run_id) {
    await api.updateCheckRun(repo, challenge.check_run_id, {
      output: {
        title: "Awaiting challenge",
        summary: `Approved by @${commenter}. The PR author can now take the quiz.`,
      },
    });
  }
  await api.upsertPrComment(repo, prNumber, commentBody(env, challenge.id, "ready", storedCfg, challenge.author_login));
}
