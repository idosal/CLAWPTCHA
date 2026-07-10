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
    expect(html).toContain("Questions maintainers ask.");
    expect(html).toContain("How does this fit with code review, CI, and branch protection?");
    expect(html).toContain("Is this a quiz, or a governance layer?");
    expect(html).toContain('href="/docs/challenge-lifecycle/"');
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
    const questionHtml = questionPage("challenge-id", 0, 4, question, 42_000, true, {
      totalTimeMs: 60_000,
      prRef: "o/r#1",
      prUrl: "https://github.com/o/r/pull/1/files",
    });

    expect(start).toContain(`name="${HONEYPOT_FIELD_NAME}"`);
    expect(start).toContain('name="terms_acceptance"');
    expect(start).toContain("Stand behind this PR.");
    expect(start).toContain("I understand the challenge rules.");
    expect(start).toContain("post the result to the PR");
    expect(start).toContain("4</b> questions");
    expect(start).toContain("3/4</b> passes");
    expect(start).not.toContain('name="extended_timing"');
    expect(start).not.toContain("Recorded:");
    expect(start).not.toContain("Never recorded:");
    expect(start).not.toContain("Outcome:");
    expect(start).toContain("/docs/privacy-data/");
    expect(start).toContain("Preparing the quiz");
    expect(start).toContain("Reading the pull request");
    expect(start).toContain("Generating PR-specific questions");
    expect(start).toContain("First runs and larger diffs can take a little longer.");
    expect(start).toContain('data-callback="vouchaTurnstileReady"');
    expect(start).toContain('data-expired-callback="vouchaTurnstileExpired"');
    expect(start).toContain('data-appearance="interaction-only"');
    expect(start).not.toContain("turnstile-fallback");
    expect(start).toContain('<button class="btn" type="submit" id="startButton" disabled>Verifying browser...</button>');
    expect(start).toContain("window.vouchaTurnstileVerified = false");
    expect(questionHtml).toContain(`name="${HONEYPOT_FIELD_NAME}"`);
    expect(questionHtml).toContain('tabindex="-1"');
    expect(start).toContain("AI-written code may be allowed");
    expect(start).not.toContain("Privacy posture");
    expect(start).toContain("@media (prefers-color-scheme:dark)");
    expect(start).toContain("color-scheme:dark");
    expect(questionHtml).toContain('<span id="tnum">42</span>');
    expect(questionHtml).toContain("command-meta has-timer");
    expect(questionHtml).toContain("Open o/r#1 diff");
    expect(questionHtml).toContain("You may consult the PR; tab changes are report-only.");
    expect(questionHtml).toContain('aria-keyshortcuts="A"');
    expect(questionHtml).toContain("Keys A–D select · Enter submits");
    expect(questionHtml).toContain('id="timerAnnouncement" aria-live="polite"');
    expect(questionHtml).toContain("body:not(.site-body) .command-meta.has-timer");
    expect(questionHtml).not.toContain("correct answers are not sent to the browser");
  });

  it("renders GitHub comment verification without delegated account access", () => {
    const html = verificationPage("o/r#1", "alice", "challenge-id", "abc123", "https://github.com/o/r/pull/1#issuecomment-new");

    expect(html).toContain("Verify from the PR.");
    expect(html).toContain("/voucha verify abc123");
    expect(html).toContain("Copy and open PR");
    expect(html).toContain('id="copyCommandButton"');
    expect(html).toContain('aria-label="Copy verification command"');
    expect(html).toContain(">Copy</button>");
    expect(html).toContain("grid-template-columns:minmax(0,1fr) auto");
    expect(html).toContain("white-space:pre");
    expect(html).toContain("body:not(.site-body) .verify-actions > .btn-secondary");
    expect(html).toContain(".command-copy-button.btn-secondary{width:auto; min-width:76px}");
    expect(html).toContain('id="openPrLink"');
    expect(html).toContain("Open PR");
    expect(html).toContain("Waiting for your GitHub comment.");
    expect(html).toContain("https://github.com/o/r/pull/1#issuecomment-new");
    expect(html).toContain("/challenge/challenge-id/verify/status");
    expect(html).toContain("never receives a GitHub user token");
    expect(html).toContain("cannot comment, approve, or answer on your behalf");
    expect(html).toContain('action="/challenge/challenge-id/verify"');
    expect(html).toContain("Copy failed. The command text is selected; copy it manually, then use Open PR");
    expect(html).toContain("navigator.clipboard.writeText(commandText)");
    expect(html).toContain("Verified as @");
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
    expect(result).toContain("Attestation recorded");
    expect(result).toContain('class="attestation-receipt"');
    expect(result).toContain("Recorded now");
  });

  it("omits the honeypot field when signals are disabled", () => {
    const start = startPage("o/r#1", "site-key", "challenge-id", false);
    const questionHtml = questionPage("challenge-id", 0, 4, question, 60_000, false);

    expect(start).not.toContain(`name="${HONEYPOT_FIELD_NAME}"`);
    expect(questionHtml).not.toContain(`name="${HONEYPOT_FIELD_NAME}"`);
  });
});
