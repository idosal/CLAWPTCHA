import type { Challenge, Env } from "../types";
import type { GitHubApi } from "./api";
import {
  getCodeHoneypotSignals,
  getLinkedIssueMatchExemption,
  applyRechallengeGate,
  parseConfig,
  resolveConfig,
  type VouchaConfig,
} from "../config";
import { evaluateAccountability } from "../policy/accountability";
import { evaluateCodeHoneypotSignals, type CodeHoneypotResult } from "../policy/code-honeypot";
import {
  applyPathRules,
  evaluateExemption,
  evaluateGitHubTeamExemption,
  evaluatePriorMergedPrsExemption,
  evaluateRepositoryPermissionExemption,
  shouldRechallengeOnPush,
} from "../policy/exemptions";
import { evaluateLinkedIssueExemption } from "../policy/linked-issue";
import {
  getChallengeByPr, getLatestChallengeForPr, getLatestPassedChallenge,
  insertChallenge, restartChallengeForRetry, setChallengeStatus, supersedeOldChallenges,
  updateChallengeCheckRun, randomToken, verifySessionFromComment,
} from "../store";
import { hasWriteRepositoryAccess } from "./permissions";
import { sameGitHubLogin } from "./login";

const CHECK_NAME = "PR comprehension check";
const CODE_HONEYPOT_SIGNAL = "the PR introduced a configured code honeypot marker";

function emptyCodeHoneypotResult(): CodeHoneypotResult {
  return { triggered: false, matches: [] };
}

async function evaluatePrCodeHoneypot(
  api: GitHubApi,
  repo: string,
  prNumber: number,
  cfg: VouchaConfig
): Promise<CodeHoneypotResult> {
  const signals = getCodeHoneypotSignals(cfg);
  if (signals.length === 0 || signals.every((signal) => signal.patterns.length === 0)) {
    return emptyCodeHoneypotResult();
  }
  try {
    return evaluateCodeHoneypotSignals(await api.getPrDiff(repo, prNumber), signals);
  } catch {
    // Report-only signals must not prevent check creation or exemption handling.
    return emptyCodeHoneypotResult();
  }
}

function withCodeHoneypotSummary(summary: string, result: CodeHoneypotResult): string {
  if (!result.triggered) return summary;
  return [
    summary,
    "",
    `Passive signal: ${CODE_HONEYPOT_SIGNAL}. This does not change the check conclusion.`,
  ].join("\n");
}

function challengeUrl(env: Env, challengeId: string): string {
  return `${env.APP_BASE_URL}/challenge/${challengeId}`;
}

function commentsEnabled(cfg: VouchaConfig): boolean {
  return cfg.output.comments !== "quiet";
}

async function commentAuthorCanMaintain(api: GitHubApi, repo: string, payload: any): Promise<boolean> {
  const association = String(payload.comment.author_association ?? "").toUpperCase();
  if (["OWNER", "MEMBER", "COLLABORATOR"].includes(association)) return true;
  return hasWriteRepositoryAccess(await api.getUserPermission(repo, payload.comment.user.login));
}

function commentBody(
  env: Env,
  challengeId: string,
  status: string,
  cfg: VouchaConfig,
  authorLogin: string,
  deltaBaseSha?: string | null
): string {
  const url = challengeUrl(env, challengeId);
  const shortDeltaBase = deltaBaseSha?.slice(0, 12);
  if (status === "awaiting_approval") {
    return [
      "## VOUCHA",
      "",
      "This PR requires a comprehension check before merge. A maintainer must approve the challenge first:",
      "",
      "> Maintainers: comment `/voucha approve` to unlock the challenge.",
      "",
      shortDeltaBase
        ? `Once approved, the author takes a short follow-up quiz about changes since ${shortDeltaBase}: ${url}`
        : `Once approved, the author takes a short quiz about this change: ${url}`,
      "",
      "_AI assistance in authoring is allowed. Challenge answers must come from the author's own understanding. Passing posts a public attestation that the author personally understands, tested, and can support this change._",
    ].join("\n");
  }
  return [
    "## VOUCHA",
    "",
    shortDeltaBase
      ? `@${authorLogin}: take a short follow-up quiz about changes since ${shortDeltaBase} to turn the check green (${cfg.max_attempts} attempts max):`
      : `@${authorLogin}: take a short comprehension quiz about this change to turn the check green (${cfg.max_attempts} attempts max):`,
    "",
    `➡️ **[Start the challenge](${url})**`,
    "",
    "The challenge page copies the one-time verification command, opens this PR, and continues automatically after your comment lands.",
    "",
    shortDeltaBase
      ? "_AI assistance in authoring is allowed. Challenge answers must come from your own understanding. This follow-up quiz is generated only from the commits after your previous pass; answers are graded automatically._"
      : "_AI assistance in authoring is allowed. Challenge answers must come from your own understanding. Passing posts a public attestation that you personally understand, tested, and can support this change. The quiz is generated from the diff; answers are graded automatically._",
  ].join("\n");
}

export async function handlePullRequestEvent(
  env: Env, api: GitHubApi, payload: any
): Promise<void> {
  const action = payload.action as string;
  if (!["opened", "synchronize", "reopened", "ready_for_review", "converted_to_draft"].includes(action)) return;

  const repo = payload.repository.full_name as string;
  const installationId = payload.installation.id as number;
  const prNumber = payload.pull_request.number as number;
  const headSha = payload.pull_request.head.sha as string;
  const baseSha = payload.pull_request.base.sha as string;
  const baseConfigRef = (payload.pull_request.base.ref as string | undefined) ?? baseSha;

  const existingChallenge = await getChallengeByPr(env.DB, repo, prNumber, headSha);
  // Idempotency: webhook redeliveries for a known (pr, sha) are no-ops, except
  // draft conversion may intentionally retire an open challenge for the same SHA.
  if (existingChallenge && action !== "converted_to_draft") return;

  const pr = await api.getPr(repo, prNumber);
  // Config comes from the merge target, never the PR branch — a PR must not be able to weaken its own gate.
  const configYaml = await api.getFileContent(repo, ".github/voucha.yml", baseConfigRef);
  let cfg = parseConfig(configYaml);

  // A new head SHA obsoletes any open challenge for this PR, regardless of
  // which branch below handles it — stale challenges must never stay takeable.
  await supersedeOldChallenges(env.DB, repo, prNumber, headSha);

  const changedFiles = await api.listPrFiles(repo, prNumber);
  cfg = applyPathRules(cfg, changedFiles);
  const codeHoneypot = await evaluatePrCodeHoneypot(api, repo, prNumber, cfg);

  if (pr.draft && cfg.draft_prs !== "challenge") {
    if (existingChallenge && ["awaiting_approval", "ready"].includes(existingChallenge.status)) {
      await setChallengeStatus(env.DB, existingChallenge.id, "superseded");
    }
    if (cfg.draft_prs === "neutral") {
      await api.createCheckRun(repo, {
        name: CHECK_NAME, head_sha: headSha, status: "completed", conclusion: "neutral",
        output: {
          title: "Draft PR",
          summary: withCodeHoneypotSummary("No challenge required while this pull request is a draft.", codeHoneypot),
        },
      });
    }
    return;
  }

  const accountability = evaluateAccountability(pr.body, cfg);
  if (!accountability.ok) {
    await api.createCheckRun(repo, {
      name: CHECK_NAME, head_sha: headSha, status: "completed", conclusion: "failure",
      output: {
        title: "PR policy incomplete",
        summary: withCodeHoneypotSummary(accountability.summary, codeHoneypot),
      },
    });
    if (commentsEnabled(cfg)) {
      await api.upsertPrComment(repo, prNumber, [
        "## VOUCHA",
        "",
        accountability.summary,
      ].join("\n"));
    }
    return;
  }

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
      output: {
        title: "Exempt",
        summary: withCodeHoneypotSummary(`No challenge required: ${exemption.reason}.`, codeHoneypot),
      },
    });
    return;
  }

  const teamExemption = await evaluateGitHubTeamExemption(
    { repo, authorLogin: pr.author_login },
    cfg,
    { getTeamMembership: (org, teamSlug, username) => api.getTeamMembership(org, teamSlug, username) }
  );
  if (teamExemption.exempt) {
    await api.createCheckRun(repo, {
      name: CHECK_NAME, head_sha: headSha, status: "completed", conclusion: "success",
      output: {
        title: "Exempt",
        summary: withCodeHoneypotSummary(`No challenge required: ${teamExemption.reason}.`, codeHoneypot),
      },
    });
    return;
  }

  const repositoryPermissionExemption = await evaluateRepositoryPermissionExemption(
    { repo, authorLogin: pr.author_login },
    cfg,
    { getUserPermission: (repoName, username) => api.getUserPermission(repoName, username) }
  );
  if (repositoryPermissionExemption.exempt) {
    await api.createCheckRun(repo, {
      name: CHECK_NAME, head_sha: headSha, status: "completed", conclusion: "success",
      output: {
        title: "Exempt",
        summary: withCodeHoneypotSummary(
          `No challenge required: ${repositoryPermissionExemption.reason}.`,
          codeHoneypot
        ),
      },
    });
    return;
  }

  const priorMergedPrsExemption = await evaluatePriorMergedPrsExemption(
    { repo, authorLogin: pr.author_login },
    cfg,
    { countMergedPullRequestsByAuthor: (repoName, username) => api.countMergedPullRequestsByAuthor(repoName, username) }
  );
  if (priorMergedPrsExemption.exempt) {
    await api.createCheckRun(repo, {
      name: CHECK_NAME, head_sha: headSha, status: "completed", conclusion: "success",
      output: {
        title: "Exempt",
        summary: withCodeHoneypotSummary(`No challenge required: ${priorMergedPrsExemption.reason}.`, codeHoneypot),
      },
    });
    return;
  }

  const linkedIssueCfg = getLinkedIssueMatchExemption(cfg);
  if (linkedIssueCfg) {
    const linkedIssueExemption = await evaluateLinkedIssueExemption(
      {
        repo,
        title: pr.title,
        body: pr.body,
        changedFiles,
      },
      linkedIssueCfg,
      {
        getIssue: (issueRepo, issueNumber) => api.getIssue(issueRepo, issueNumber),
        getUserPermission: (issueRepo, username) => api.getUserPermission(issueRepo, username),
      }
    );
    if (linkedIssueExemption.exempt) {
      await api.createCheckRun(repo, {
        name: CHECK_NAME, head_sha: headSha, status: "completed", conclusion: "success",
        output: {
          title: "Exempt",
          summary: withCodeHoneypotSummary(
            `No challenge required: ${linkedIssueExemption.reason}.`,
            codeHoneypot
          ),
        },
      });
      return;
    }
  }

  // Only the commits since the latest passed head decide whether that pass is
  // invalidated. The full PR file list above still owns overall policy scope.
  let deltaBaseSha: string | null = null;
  let priorPassForDelta: Challenge | null = null;
  if (action === "synchronize") {
    const priorPass = await getLatestPassedChallenge(env.DB, repo, prNumber);
    if (priorPass) {
      let resetGate = false;
      if (cfg.rechallenge.on_push !== "never") {
        try {
          const comparison = await api.compareCommits(repo, priorPass.head_sha, headSha);
          resetGate = comparison.status === "ahead"
            ? comparison.files.length > 0 && shouldRechallengeOnPush(
              cfg,
              comparison.files.map((file) => file.filename)
            )
            : comparison.status !== "identical";
          if (resetGate && comparison.status === "ahead") {
            deltaBaseSha = priorPass.head_sha;
            priorPassForDelta = priorPass;
          }
        } catch {
          // If a configured reset policy cannot be evaluated, fall back to a
          // fresh full-PR challenge instead of silently preserving a stale pass.
          resetGate = true;
        }
      }

      if (!resetGate) {
        await api.createCheckRun(repo, {
          name: CHECK_NAME, head_sha: headSha, status: "completed", conclusion: "success",
          output: {
            title: "Pass carried forward",
            summary: withCodeHoneypotSummary(
              `Author passed the challenge at ${priorPass.head_sha.slice(0, 12)}; changes since then do not reset the gate under repository policy.`,
              codeHoneypot
            ),
          },
        });
        return;
      }
    }
  }

  if (deltaBaseSha) cfg = applyRechallengeGate(cfg);

  const needsApproval =
    cfg.require_approval === "always" ||
    (cfg.require_approval === "first_time" &&
      !deltaBaseSha &&
      ["FIRST_TIME_CONTRIBUTOR", "FIRST_TIMER", "NONE"].includes(pr.author_association));
  const status = needsApproval ? "awaiting_approval" : "ready";

  const challengeId = randomToken();
  const checkRunId = await api.createCheckRun(repo, {
    name: CHECK_NAME, head_sha: headSha, status: "queued",
    details_url: challengeUrl(env, challengeId),
    output: {
      title: deltaBaseSha
        ? (needsApproval ? "Awaiting approval for follow-up" : "Awaiting follow-up challenge")
        : (needsApproval ? "Awaiting maintainer approval" : "Awaiting challenge"),
      summary:
        (deltaBaseSha
          ? (needsApproval
            ? `A maintainer must approve a follow-up challenge covering changes since ${deltaBaseSha.slice(0, 12)}.`
            : `The PR author must pass a follow-up quiz covering changes since ${deltaBaseSha.slice(0, 12)}.`)
          : (needsApproval
            ? "A maintainer must approve the challenge (`/voucha approve`) before the author can take it."
            : "The PR author must pass a comprehension quiz. Link in the PR comment.")) +
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
      delta_base_sha: deltaBaseSha,
      author_login: pr.author_login,
      check_run_id: checkRunId,
      status,
      approved_by: deltaBaseSha && cfg.require_approval !== "always"
        ? priorPassForDelta?.approved_by ?? null
        : null,
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

  if (commentsEnabled(cfg)) {
    await api.upsertPrComment(
      repo,
      prNumber,
      commentBody(env, challengeId, status, cfg, pr.author_login, deltaBaseSha)
    );
  }
}

export async function handleIssueCommentEvent(
  env: Env,
  api: GitHubApi,
  payload: any,
  options: { prepareQuiz?: (challenge: Challenge) => Promise<void> } = {}
): Promise<void> {
  if (payload.action !== "created") return;
  if (!payload.issue?.pull_request) return; // not a PR comment
  const body = (payload.comment.body as string).trim();

  const repo = payload.repository.full_name as string;
  const prNumber = payload.issue.number as number;
  const commenter = payload.comment.user.login as string;

  const verification = /^\/voucha\s+verify\s+([a-f0-9]{6,64})\b/i.exec(body);
  if (verification) {
    const challenge = await getLatestChallengeForPr(env.DB, repo, prNumber);
    if (!challenge) return;
    if (!sameGitHubLogin(challenge.author_login, commenter)) return;
    const verified = await verifySessionFromComment(env.DB, challenge.id, verification[1].toLowerCase(), commenter);
    if (verified && challenge.status === "ready") {
      try {
        await options.prepareQuiz?.(challenge);
      } catch (err) {
        console.error("verified-session quiz preparation failed", challenge.id, err);
      }
    }
    return;
  }

  if (/^\/voucha\s+(?:retry|retrigger)\b/i.test(body)) {
    if (!(await commentAuthorCanMaintain(api, repo, payload))) return;

    const challenge = await getLatestChallengeForPr(env.DB, repo, prNumber);
    if (!challenge || !["failed_assisted", "failed_final", "neutral"].includes(challenge.status)) return;
    const pr = await api.getPr(repo, prNumber);
    if (pr.head_sha !== challenge.head_sha) return;

    const checkRunId = await api.createCheckRun(repo, {
      name: CHECK_NAME,
      head_sha: challenge.head_sha,
      status: "queued",
      details_url: challengeUrl(env, challenge.id),
      output: {
        title: "Retry requested",
        summary: `@${commenter} restarted the challenge for this commit.`,
      },
    });
    const restarted = await restartChallengeForRetry(env.DB, challenge.id, checkRunId, commenter);
    if (!restarted) return;
    const storedCfg = resolveConfig(restarted.config_json);
    if (commentsEnabled(storedCfg)) {
      await api.upsertPrComment(
        repo,
        prNumber,
        `${commentBody(env, restarted.id, "ready", storedCfg, restarted.author_login)}\n\n_Retry requested by @${commenter}._`
      );
    }
    return;
  }

  if (!/^\/voucha\s+approve\b/.test(body)) return;

  if (!(await commentAuthorCanMaintain(api, repo, payload))) return;

  const challenge = await getLatestChallengeForPr(env.DB, repo, prNumber);
  if (!challenge || challenge.status !== "awaiting_approval") return;

  await setChallengeStatus(env.DB, challenge.id, "ready", commenter);
  const storedCfg = resolveConfig(challenge.config_json);
  if (challenge.check_run_id) {
    await api.updateCheckRun(repo, challenge.check_run_id, {
      details_url: challengeUrl(env, challenge.id),
      output: {
        title: "Awaiting challenge",
        summary: `Approved by @${commenter}. The PR author can now take the quiz.`,
      },
    });
  }
  if (commentsEnabled(storedCfg)) {
    await api.upsertPrComment(repo, prNumber, commentBody(env, challenge.id, "ready", storedCfg, challenge.author_login));
  }
}
