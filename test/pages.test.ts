import { describe, expect, it } from "vitest";
import {
  HONEYPOT_FIELD_NAME,
  errorPage,
  homePage,
  questionPage,
  resultPage,
  startPage,
  verificationPage,
} from "../src/ui/pages";

const question = {
  type: "consequence_mcq" as const,
  prompt: "What does this PR change?",
  options: ["One", "Two", "Three", "Four"],
  multiSelect: false,
};

describe("challenge pages", () => {
  it("renders the public website with install and product framing", () => {
    const html = homePage("https://voucha.example.com");

    expect(html).toContain("<h1 id=\"home-title\">Say yes to <br>contributions.</h1>");
    expect(html).toContain("A policy layer for GitHub pull requests.");
    expect(html).toContain("VOUCHA allows contributors to prove their understanding and intent in an interactive app.");
    expect(html).toContain("complements code review, CI, tests, and branch protection");
    expect(html).toContain('<link rel="canonical" href="https://voucha.example.com">');
    expect(html).toContain('<meta property="og:image" content="https://voucha.example.com/voucha-social-card.png">');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(html).toContain('<meta property="og:image:width" content="1200">');
    expect(html).toContain('<meta property="og:image:height" content="630">');
    expect(html).toContain('<source media="(prefers-color-scheme: dark)" srcset="/voucha-logo-dark.svg">');
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/favicon-dark.svg" media="(prefers-color-scheme: dark)">');
    expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon-dark.png" media="(prefers-color-scheme: dark)">');
    expect(html).toContain("Deploy to Cloudflare");
    expect(html).toContain("Install on GitHub");
    expect(html).toContain("Self-host");
    expect(html).toContain("Challenge required");
    expect(html).toContain("Screen the PR");
    expect(html).toContain("Review the record");
    expect(html).toContain('href="/docs/"');
    expect(html).toContain('href="https://github.com/apps/voucha-app/installations/new"');
    expect(html).not.toContain("Open the Starlight docs");
    expect(html).not.toContain("VOUCHAA");
    expect(html).toContain("short configurable tests scoped to the diff");
    expect(html).not.toContain("Team exemptions require GitHub Members read permission");
    expect(html).not.toContain("contributor-accepted answers");
    expect(html).not.toContain("npx wrangler login &amp;&amp; npm run setup");
  });

  it("renders the honeypot field when the signal is enabled", () => {
    const start = startPage("o/r#1", "site-key", "challenge-id", true);
    const questionHtml = questionPage("challenge-id", 0, 4, question, 60_000, true);

    expect(start).toContain(`name="${HONEYPOT_FIELD_NAME}"`);
    expect(start).toContain('name="terms_acceptance"');
    expect(start).toContain("Stand behind this PR.");
    expect(start).toContain("I understand what will be posted.");
    expect(start).toContain("post the result to the PR");
    expect(start).toContain("/docs/privacy-data/");
    expect(start).toContain("Preparing the quiz");
    expect(start).toContain("Reading the pull request");
    expect(start).toContain("Generating PR-specific questions");
    expect(start).toContain("First runs and larger diffs can take a little longer.");
    expect(questionHtml).toContain(`name="${HONEYPOT_FIELD_NAME}"`);
    expect(questionHtml).toContain('tabindex="-1"');
    expect(start).toContain("Bot verification failures stop the challenge");
    expect(start).not.toContain("Privacy posture");
    expect(start).toContain("@media (prefers-color-scheme:dark)");
    expect(start).toContain("color-scheme:dark");
  });

  it("renders GitHub comment verification without delegated account access", () => {
    const html = verificationPage("o/r#1", "alice", "challenge-id", "abc123", "https://github.com/o/r/pull/1#issuecomment-new");

    expect(html).toContain("Verify from the PR.");
    expect(html).toContain("/voucha verify abc123");
    expect(html).toContain("Copy and open PR");
    expect(html).toContain('id="copyCommandButton"');
    expect(html).toContain('aria-label="Copy verification command"');
    expect(html).toContain(">Copy</button>");
    expect(html).toContain('id="openPrLink"');
    expect(html).toContain("Open PR");
    expect(html).toContain("Waiting for your GitHub comment.");
    expect(html).toContain("https://github.com/o/r/pull/1#issuecomment-new");
    expect(html).toContain("/challenge/challenge-id/verify/status");
    expect(html).toContain("never receives a GitHub user token");
    expect(html).toContain("cannot comment, approve, or answer on your behalf");
    expect(html).toContain('action="/challenge/challenge-id/verify"');
    expect(html).toContain("Copy failed. The command text is selected; copy it manually, then use Open PR");
  });

  it("renders terminal page actions back to the PR and challenge", () => {
    const actions = [
      { label: "Back to PR", href: "https://github.com/o/r/pull/1", primary: true, external: true },
      { label: "Refresh challenge", href: "/challenge/challenge-id" },
    ];
    const result = resultPage(true, 4, 4, "Done.", actions);
    const error = errorPage("Challenge no longer active", "Check the PR.", actions);

    for (const html of [result, error]) {
      expect(html).toContain("Back to PR");
      expect(html).toContain('href="https://github.com/o/r/pull/1"');
      expect(html).toContain('target="_blank" rel="noopener noreferrer"');
      expect(html).toContain("Refresh challenge");
      expect(html).toContain('href="/challenge/challenge-id"');
    }
  });

  it("omits the honeypot field when signals are disabled", () => {
    const start = startPage("o/r#1", "site-key", "challenge-id", false);
    const questionHtml = questionPage("challenge-id", 0, 4, question, 60_000, false);

    expect(start).not.toContain(`name="${HONEYPOT_FIELD_NAME}"`);
    expect(questionHtml).not.toContain(`name="${HONEYPOT_FIELD_NAME}"`);
  });
});
