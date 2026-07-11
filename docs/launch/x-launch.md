# VOUCHA launch package for X

## Launch gate

Publish the main post after:

- the GitHub App listing uses the VOUCHA identity, logo, description, and
  support/privacy links;
- the demo repository policy uses the nested `output.labels` object with
  `passed`, `failed`, and `flagged` switches;
- the curated demo PR has a current completed VOUCHA result and its configured
  `pr-comprehension:passed` label;
- the final video cut replaces the pending state with that completed result.

The final 26-second video is
[`assets/voucha-x-demo.mp4`](assets/voucha-x-demo.mp4). It uses only real
VOUCHA and GitHub screens, including the completed challenge, green check,
attestation, and maintainer risk report from the curated demo PR.

## Main post

Attach the demo video. Keep the product link in the post and put the GitHub
links in replies.

> AI-generated PRs are cheap. Maintainer attention isn’t.
>
> VOUCHA is a free GitHub App that asks contributors PR-specific questions before review—and records when they prove they understand the change.
>
> AI-assisted code is welcome. Code you can’t explain isn’t.
>
> https://voucha.dev

The post is 279 characters as written.

## Reply thread

### Reply 1 — public proof

> Here is the complete workflow on a small public PR: the repository policy,
> VOUCHA check, author verification, diff-specific challenge, and recorded
> result—including the PR label selected by repository settings.
>
> https://github.com/idosal/voucha-owner-check-e2e/pull/11

### Reply 2 — install

> The hosted app is free for public repositories. Install it, choose a repo,
> and use the defaults or add `.github/voucha.yml` for path rules, trust,
> linked-issue exemptions, retries, and enforcement.
>
> https://github.com/apps/voucha-checks/installations/new

### Reply 3 — positioning

> VOUCHA is not an AI detector and it does not replace CI or code review.
> AI-assisted code is allowed. The check asks whether the person submitting the
> PR understands, tested, and can support the change.
>
> https://voucha.dev/docs/why-voucha/

### Reply 4 — design-partner ask

> Maintain a public repo receiving low-context or drive-by PRs? I’ll personally
> configure VOUCHA for the first few projects and tune it with you. Reply or DM
> with the repo—no sales call and no paid plan.

## One-to-one outreach message

Use this privately or as a thoughtful reply to an existing maintainer
discussion. Do not mass-tag the list below.

> Hi — I saw your comments about the cost of reviewing low-context PRs. I built
> VOUCHA, a free GitHub App that lets maintainers keep AI-assisted contributions
> open while requiring the author to answer questions about their own diff.
> It’s not an AI detector; it is a comprehension and accountability check. If
> useful, I’ll configure it on a sandbox/public repo with you and remove it if
> it adds noise. Live example: https://github.com/idosal/voucha-owner-check-e2e/pull/11

## Priority outreach list

Contact the people who have already described the problem. Start with the first
three as potential design partners; treat the GitHub staff accounts as product
feedback/amplification, not sales targets.

| Priority | Maintainer or community | Public signal | Contact | Angle |
| --- | --- | --- | --- | --- |
| 1 | OpenClaw — Vincent Koc | Publicly described very high PR volume and custom anti-spam bots in GitHub’s PR-limits launch | X: [@vincent_koc](https://x.com/vincent_koc), GitHub: [vincentkoc](https://github.com/vincentkoc) | Offer a sandbox install that complements volume limits with comprehension proof. |
| 2 | Homebrew — Mike McQuaid | Reported repeated near-identical PR review load accelerated by AI | X: [@MikeMcQuaid](https://x.com/MikeMcQuaid), GitHub: [MikeMcQuaid](https://github.com/MikeMcQuaid) | Ask whether path-scoped checks could preserve outside contribution without adding maintainer ceremony. |
| 3 | AutoGPT — Nicholas Tindle | Said PR limits made maintainers want to review incoming work again | X: [@nicktindle](https://x.com/nicktindle), GitHub: [ntindle](https://github.com/ntindle) | Position VOUCHA as the next filter after volume control. |
| 4 | Kubernetes contributor community | Requires disclosure, human accountability, personal explanation, testing, and understanding for AI-assisted changes | X: [@Kubernetesio](https://x.com/Kubernetesio), community channels in the [Kubernetes article](https://kubernetes.io/blog/2026/06/26/open-source-maintainership-in-the-age-of-ai/) | Request feedback from SIG Contributor Experience before proposing any pilot. |
| 5 | hledger — Simon Michael | Explicitly balances reviewer time against AI policy and limits contributors to one open PR | GitHub: [simonmichael](https://github.com/simonmichael), [project chat](https://matrix.hledger.org/) | Ask whether comprehension checks would help trusted returning contributors while preserving its stricter first-timer policy. |
| 6 | GitHub Maintainers — Abigail Cabunoc Mayes | Published the comprehension/context/continuity framework for AI-era mentorship | X: [@abbycabs](https://x.com/abbycabs), GitHub: [abbycabs](https://github.com/abbycabs) | Ask for product feedback and whether VOUCHA fits the “comprehension” layer. |
| 7 | GitHub PR limits — Camilla Moraes and Ashley Wolf | Published maintainer evidence behind persistent PR-volume controls | X: [@moraes_c_](https://x.com/moraes_c_), [@ashleywolf](https://x.com/ashleywolf) | Show how VOUCHA complements GitHub’s volume limit rather than competing with it. |
| 8 | Godot — Rémi Verschelde | Publicly discussed the maintainer burden of low-context AI-generated PRs | X: [@Akien](https://x.com/Akien), GitHub: [akien-mga](https://github.com/akien-mga) | Feedback target only: Godot’s policy may be stricter than VOUCHA’s AI-allowed stance. |
| 9 | tldraw — Steve Ruiz | Closed external PRs as maintainer attention became harder to allocate | X: [@steveruizok](https://x.com/steveruizok), GitHub: [steveruizok](https://github.com/steveruizok) | Ask whether proof of comprehension would change the reopen calculus; do not assume it will. |
| 10 | curl — Daniel Stenberg | Has documented severe inbound low-quality/AI-generated report load | GitHub: [bagder](https://github.com/bagder), site: [daniel.haxx.se](https://daniel.haxx.se/) | Seek feedback on accountability framing; VOUCHA is PR-specific, so this is not a direct install pitch. |

Sources for the outreach rationale:

- [GitHub: How pull request limits are cutting down the noise](https://github.blog/open-source/maintainers/how-pull-request-limits-are-cutting-down-the-noise/)
- [GitHub: Rethinking open source mentorship in the AI era](https://github.blog/open-source/maintainers/rethinking-open-source-mentorship-in-the-ai-era/)
- [Kubernetes: Open source maintainership in the age of AI](https://kubernetes.io/blog/2026/06/26/open-source-maintainership-in-the-age-of-ai/)
- [hledger pull-request and AI policy](https://hledger.org/PULLREQUESTS.html)

## Seven-day follow-through

| Day | Action | Evidence to collect |
| --- | --- | --- |
| 0 | Publish the video and reply thread; contact the first three design-partner candidates individually | Link clicks, install events, substantive maintainer replies |
| 1 | Post the smallest useful `.github/voucha.yml` example, including outcome-specific label settings | Config questions and objections |
| 2 | Share the completed demo result and explain what VOUCHA stores | Challenge starts/completions and privacy questions |
| 3 | Publish “not an AI detector” positioning with the failure posture | Quality of discussion, not impressions |
| 5 | Share one real maintainer setup or an honest no-fit outcome | Time-to-first-check and noise introduced |
| 7 | Publish what changed after maintainer feedback | External repos installed, first PRs processed, completed challenges |

Success for the first week is three maintainer conversations, two external
public-repository installs, and one completed challenge outside the demo—not a
specific impression count.
