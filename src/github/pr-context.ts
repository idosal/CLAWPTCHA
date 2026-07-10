import type { PrContext } from "../challenge";
import type { Challenge } from "../types";
import type { GitHubApi } from "./api";

type PrContextApi = Pick<
  GitHubApi,
  "compareCommits" | "getCommitComparisonDiff" | "getPr" | "getPrDiff" | "listPrFileDetails"
>;

export async function fetchPrContextForChallenge(
  api: PrContextApi,
  challenge: Challenge
): Promise<PrContext> {
  if (challenge.delta_base_sha) {
    const [diff, pr, comparison] = await Promise.all([
      api.getCommitComparisonDiff(
        challenge.repo_full_name,
        challenge.delta_base_sha,
        challenge.head_sha
      ),
      api.getPr(challenge.repo_full_name, challenge.pr_number),
      api.compareCommits(
        challenge.repo_full_name,
        challenge.delta_base_sha,
        challenge.head_sha
      ),
    ]);
    return {
      diff,
      title: pr.title,
      body: pr.body,
      files: comparison.files.map((file) => file.filename),
      repoFullName: challenge.repo_full_name,
      prNumber: challenge.pr_number,
      headSha: challenge.head_sha,
      deltaBaseSha: challenge.delta_base_sha,
      installationId: challenge.installation_id,
      changedLines: comparison.files.reduce(
        (total, file) => total + file.additions + file.deletions,
        0
      ),
      filePatches: comparison.files,
    };
  }

  const [diff, pr, filePatches] = await Promise.all([
    api.getPrDiff(challenge.repo_full_name, challenge.pr_number),
    api.getPr(challenge.repo_full_name, challenge.pr_number),
    api.listPrFileDetails(challenge.repo_full_name, challenge.pr_number),
  ]);
  return {
    diff,
    title: pr.title,
    body: pr.body,
    files: filePatches.map((file) => file.filename),
    repoFullName: challenge.repo_full_name,
    prNumber: challenge.pr_number,
    headSha: challenge.head_sha,
    installationId: challenge.installation_id,
    changedLines: pr.additions + pr.deletions,
    filePatches,
  };
}
