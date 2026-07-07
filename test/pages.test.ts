import { describe, expect, it } from "vitest";
import { HONEYPOT_FIELD_NAME, homePage, questionPage, startPage } from "../src/ui/pages";

const question = {
  type: "consequence_mcq" as const,
  prompt: "What does this PR change?",
  options: ["One", "Two", "Three", "Four"],
  multiSelect: false,
};

describe("challenge pages", () => {
  it("renders the public website with install and product framing", () => {
    const html = homePage("https://clawptcha.example.com");

    expect(html).toContain("<h1 id=\"home-title\">Proof before<br>review.</h1>");
    expect(html).toContain("Yes to contributions. No to slop.");
    expect(html).toContain("Unowned diffs are not.");
    expect(html).toContain("Use managed service");
    expect(html).toContain("Managed free");
    expect(html).toContain("Deploy to Cloudflare");
    expect(html).toContain("Trust context");
    expect(html).toContain("Post check run");
    expect(html).toContain("Docs built for operators.");
    expect(html).toContain("Starlight docs");
    expect(html).toContain('href="/docs/"');
    expect(html).toContain('href="/docs/why-clawptcha/"');
    expect(html).toContain('href="/docs/getting-started/"');
    expect(html).toContain('href="/docs/policy/"');
    expect(html).toContain('href="/docs/issue-triage/"');
    expect(html).toContain('href="/docs/passive-signals/"');
    expect(html).toContain('href="/docs/common-practices/"');
    expect(html).toContain('href="/docs/configuration/"');
    expect(html).toContain("Open the Starlight docs");
    expect(html).toContain("Why use it");
    expect(html).toContain("Getting started");
    expect(html).toContain("Policy evaluation");
    expect(html).toContain("Issue-backed triage");
    expect(html).toContain("Passive signals");
    expect(html).toContain("Common practices");
    expect(html).toContain("code canaries");
    expect(html).toContain("honeypot signals");
    expect(html).toContain("npx wrangler login &amp;&amp; npm run setup");
    expect(html).toContain("clawptcha.example.com");
    expect(html).toContain("Policy stays with the repo.");
  });

  it("renders the honeypot field when the signal is enabled", () => {
    const start = startPage("o/r#1", "site-key", "challenge-id", true);
    const questionHtml = questionPage("challenge-id", 0, 4, question, 90_000, true);

    expect(start).toContain(`name="${HONEYPOT_FIELD_NAME}"`);
    expect(questionHtml).toContain(`name="${HONEYPOT_FIELD_NAME}"`);
    expect(questionHtml).toContain('tabindex="-1"');
    expect(start).toContain("passive canary signals");
  });

  it("omits the honeypot field when signals are disabled", () => {
    const start = startPage("o/r#1", "site-key", "challenge-id", false);
    const questionHtml = questionPage("challenge-id", 0, 4, question, 90_000, false);

    expect(start).not.toContain(`name="${HONEYPOT_FIELD_NAME}"`);
    expect(questionHtml).not.toContain(`name="${HONEYPOT_FIELD_NAME}"`);
  });
});
