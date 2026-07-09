// test/config.test.ts
import { describe, it, expect } from "vitest";
import defaultTemplateYaml from "../templates/voucha.yml?raw";
import {
  getAuthorAssociationExemptions,
  getGitHubTeamExemptions,
  getAuthorLoginExemptions,
  getLinkedIssueMatchExemption,
  getCodeHoneypotSignals,
  getMultipleChoiceGate,
  getPriorMergedPrsExemptions,
  getRepositoryPermissionExemptions,
  hasHoneypotSignal,
  parseConfig,
  shouldAutoClosePr,
  DEFAULT_CONFIG,
} from "../src/config";

describe("parseConfig", () => {
  it("returns defaults for null/empty input", () => {
    expect(parseConfig(null)).toEqual(DEFAULT_CONFIG);
    expect(parseConfig("")).toEqual(DEFAULT_CONFIG);
  });

  it("keeps the default repository template in sync with DEFAULT_CONFIG", () => {
    expect(parseConfig(defaultTemplateYaml)).toEqual(DEFAULT_CONFIG);
  });

  it("merges partial YAML over defaults", () => {
    const cfg = parseConfig("pass_threshold: 4\nmax_attempts: 5\n");
    expect(cfg.pass_threshold).toBe(4);
    expect(getMultipleChoiceGate(cfg)).toEqual({ type: "multiple_choice", questions: 4, pass_threshold: 4 });
    expect(cfg.max_attempts).toBe(5);
    expect(cfg.cooldown_minutes).toBe(15); // default preserved
  });

  it("parses configurable gates", () => {
    const cfg = parseConfig(
      "gates:\n  - type: multiple_choice\n    questions: 6\n    pass_threshold: 5\n"
    );
    expect(getMultipleChoiceGate(cfg)).toEqual({ type: "multiple_choice", questions: 6, pass_threshold: 5 });
    expect(cfg.pass_threshold).toBe(5); // legacy compatibility mirror
  });

  it("parses path-specific policy overrides", () => {
    const cfg = parseConfig([
      "path_rules:",
      "  - paths: ['src/core/**', 'migrations/**', 'src/core/**']",
      "    gates:",
      "      - type: multiple_choice",
      "        questions: 6",
      "        pass_threshold: 5",
      "    require_approval: always",
      "    max_attempts: 2",
      "    cooldown_minutes: 30",
      "    min_changed_lines: 0",
      "    skip_paths: ['*.md']",
      "    include_paths: ['src/core/**']",
      "",
    ].join("\n"));

    expect(cfg.path_rules).toEqual([{
      paths: ["src/core/**", "migrations/**"],
      gates: [{ type: "multiple_choice", questions: 6, pass_threshold: 5 }],
      require_approval: "always",
      max_attempts: 2,
      cooldown_minutes: 30,
      min_changed_lines: 0,
      skip_paths: ["*.md"],
      include_paths: ["src/core/**"],
    }]);
  });

  it("caps a multiple-choice threshold at its question count", () => {
    const cfg = parseConfig(
      "gates:\n  - type: multiple_choice\n    questions: 3\n    pass_threshold: 9\n"
    );
    expect(getMultipleChoiceGate(cfg)).toEqual({ type: "multiple_choice", questions: 3, pass_threshold: 3 });
  });

  it("parses linked issue match exemptions", () => {
    const cfg = parseConfig(
      "exemptions:\n  - type: linked_issue_match\n    min_match_score: 0.8\n    trusted_labels: [accepted, accepted]\n"
    );
    expect(getLinkedIssueMatchExemption(cfg)).toEqual({
      type: "linked_issue_match",
      require_same_repo: true,
      require_trusted_signal: true,
      min_match_score: 0.8,
      max_issues: 5,
      trusted_labels: ["accepted"],
    });
  });

  it("parses author association exemptions", () => {
    const cfg = parseConfig([
      "exemptions:",
      "  - type: author_association",
      "    associations: [contributor, MEMBER, contributor]",
      "",
    ].join("\n"));

    expect(getAuthorAssociationExemptions(cfg)).toEqual([{
      type: "author_association",
      associations: ["CONTRIBUTOR", "MEMBER"],
    }]);
  });

  it("parses author login and repository permission exemptions", () => {
    const cfg = parseConfig([
      "exemptions:",
      "  - type: author_login",
      "    logins: [OctoCat, hubot, OctoCat]",
      "  - type: repository_permission",
      "    permissions: [WRITE, maintain, write]",
      "",
    ].join("\n"));

    expect(getAuthorLoginExemptions(cfg)).toEqual([{
      type: "author_login",
      logins: ["octocat", "hubot"],
    }]);
    expect(getRepositoryPermissionExemptions(cfg)).toEqual([{
      type: "repository_permission",
      permissions: ["write", "maintain"],
    }]);
  });

  it("parses GitHub team and prior merged PR exemptions", () => {
    const cfg = parseConfig([
      "exemptions:",
      "  - type: github_team",
      "    teams: [Maintainers, octo-org/security, maintainers]",
      "    roles: [maintainer]",
      "  - type: prior_merged_prs",
      "    min_count: 3",
      "",
    ].join("\n"));

    expect(getGitHubTeamExemptions(cfg)).toEqual([{
      type: "github_team",
      teams: ["maintainers", "octo-org/security"],
      roles: ["maintainer"],
    }]);
    expect(getPriorMergedPrsExemptions(cfg)).toEqual([{
      type: "prior_merged_prs",
      min_count: 3,
    }]);
  });

  it("enables honeypot signals by default and supports opt-out", () => {
    expect(hasHoneypotSignal(parseConfig(null))).toBe(true);
    expect(parseConfig(null).signals).toEqual([{ type: "honeypot", report_only: true }]);
    expect(hasHoneypotSignal(parseConfig("signals: []\n"))).toBe(false);
  });

  it("normalizes honeypot signal report_only for backward-compatible config", () => {
    const cfg = parseConfig(
      "signals:\n  - type: honeypot\n    report_only: false\n"
    );
    expect(cfg.signals).toEqual([{ type: "honeypot", report_only: true }]);
  });

  it("parses code honeypot signals with literal patterns and path filters", () => {
    const cfg = parseConfig([
      "signals:",
      "  - type: code_honeypot",
      "    report_only: false",
      "    patterns: [VOUCHA_DO_NOT_ADD_THIS, VOUCHA_DO_NOT_ADD_THIS]",
      "    paths: ['src/**', '*.md', 'src/**']",
      "",
    ].join("\n"));

    expect(getCodeHoneypotSignals(cfg)).toEqual([{
      type: "code_honeypot",
      report_only: true,
      patterns: ["VOUCHA_DO_NOT_ADD_THIS"],
      paths: ["src/**", "*.md"],
    }]);
  });

  it("keeps invalid code honeypot patterns inert", () => {
    const cfg = parseConfig([
      "signals:",
      "  - type: code_honeypot",
      "    patterns: []",
      "",
    ].join("\n"));

    expect(getCodeHoneypotSignals(cfg)).toEqual([{
      type: "code_honeypot",
      report_only: true,
      patterns: [],
      paths: ["**"],
    }]);
  });

  it("parses require_approval enum and rejects bad values", () => {
    expect(parseConfig("require_approval: always").require_approval).toBe("always");
    // invalid value falls back to default rather than crashing webhook handling
    expect(parseConfig("require_approval: sometimes").require_approval).toBe("first_time");
  });

  it("parses draft, bot, rechallenge, output, and context ignore settings", () => {
    const cfg = parseConfig([
      "draft_prs: neutral",
      "bot_policy:",
      "  default: challenge",
      "  trusted_logins: ['Dependabot[bot]', 'dependabot[bot]']",
      "rechallenge:",
      "  on_push: included_paths",
      "  ignore_paths: ['docs/**', 'docs/**']",
      "output:",
      "  comments: detailed",
      "  labels: false",
      "context:",
      "  ignore_paths: ['dist/**', '*.lock', 'dist/**']",
      "",
    ].join("\n"));

    expect(cfg.draft_prs).toBe("neutral");
    expect(cfg.skip_bots).toBe(false);
    expect(cfg.bot_policy).toEqual({ default: "challenge", trusted_logins: ["dependabot[bot]"] });
    expect(cfg.rechallenge_on_push).toBe(true);
    expect(cfg.rechallenge).toEqual({ on_push: "included_paths", ignore_paths: ["docs/**"] });
    expect(cfg.output).toEqual({ comments: "detailed", labels: false });
    expect(cfg.context.ignore_paths).toEqual(["dist/**", "*.lock"]);
  });

  it("parses accountability settings", () => {
    const cfg = parseConfig([
      "accountability:",
      "  require_pr_acknowledgement: true",
      "  require_ai_disclosure: true",
      "",
    ].join("\n"));

    expect(cfg.accountability).toEqual({
      require_pr_acknowledgement: true,
      require_ai_disclosure: true,
    });
  });

  it("parses auto-close enforcement settings", () => {
    const cfg = parseConfig([
      "enforcement:",
      "  auto_close:",
      "    enabled: true",
      "    outcomes: [failed_final, failed_final, nope]",
      "",
    ].join("\n"));

    expect(cfg.enforcement).toEqual({
      auto_close: {
        enabled: true,
        outcomes: ["failed_final"],
      },
    });
    expect(shouldAutoClosePr(cfg, "failed_final")).toBe(true);
    expect(shouldAutoClosePr(cfg, "failed_assisted")).toBe(false);
    expect(shouldAutoClosePr(cfg, "failed_retry")).toBe(false);

    const shorthand = parseConfig([
      "enforcement:",
      "  auto_close: true",
      "",
    ].join("\n"));
    expect(shorthand.enforcement.auto_close).toEqual({
      enabled: true,
      outcomes: ["failed_assisted", "failed_final"],
    });
  });

  it("parses default trusted author associations", () => {
    expect(parseConfig(null).trust.default_author_associations).toEqual(["OWNER", "MEMBER", "COLLABORATOR"]);
    expect(parseConfig([
      "trust:",
      "  default_author_associations: [owner, member, owner]",
      "",
    ].join("\n")).trust.default_author_associations).toEqual(["OWNER", "MEMBER"]);
    expect(parseConfig([
      "trust:",
      "  default_author_associations: []",
      "",
    ].join("\n")).trust.default_author_associations).toEqual([]);
    expect(parseConfig([
      "trust:",
      "  default_author_associations: [owner, nope]",
      "",
    ].join("\n")).trust.default_author_associations).toEqual(["OWNER", "MEMBER", "COLLABORATOR"]);
  });

  it("maps legacy bot and rechallenge booleans into structured policies", () => {
    expect(parseConfig("skip_bots: false\n").bot_policy.default).toBe("challenge");
    expect(parseConfig("rechallenge_on_push: true\n").rechallenge.on_push).toBe("always");
  });

  it("parses skip lists and max_context_tokens", () => {
    const cfg = parseConfig(
      "skip_authors: [OctoCat, octocat]\nskip_paths: ['*.md', '*.md']\ninclude_paths: ['src/core/**', 'src/core/**']\nmax_context_tokens: 20000\n"
    );
    expect(cfg.skip_authors).toEqual(["octocat"]);
    expect(cfg.skip_paths).toEqual(["*.md"]);
    expect(cfg.include_paths).toEqual(["src/core/**"]);
    expect(cfg.max_context_tokens).toBe(20000);
  });

  it("parses adaptive context settings", () => {
    const cfg = parseConfig([
      "context:",
      "  strategy: adaptive",
      "  investigator: flue",
      "  map_tokens: 6000",
      "  detail_tokens: 32000",
      "  max_files: 20",
      "  max_model_calls: 2",
      "  large_pr:",
      "    changed_files: 250",
      "    changed_lines: 10000",
      "",
    ].join("\n"));

    expect(cfg.context).toEqual({
      strategy: "adaptive",
      investigator: "flue",
      map_tokens: 6000,
      detail_tokens: 32000,
      max_files: 20,
      max_model_calls: 2,
      ignore_paths: [],
      large_pr: {
        changed_files: 250,
        changed_lines: 10000,
      },
    });
  });

  it("keeps bad context settings bounded", () => {
    const cfg = parseConfig([
      "context:",
      "  strategy: omniscient",
      "  map_tokens: -1",
      "  detail_tokens: 999999999",
      "  max_files: 0",
      "  max_model_calls: 99",
      "  large_pr:",
      "    changed_files: -1",
      "    changed_lines: 0",
      "",
    ].join("\n"));

    expect(cfg.context).toEqual(DEFAULT_CONFIG.context);
  });

  it("returns defaults on malformed YAML", () => {
    expect(parseConfig(":: not yaml ::[")).toEqual(DEFAULT_CONFIG);
  });

  it("returns defaults for top-level arrays and scalars", () => {
    expect(parseConfig("- 1\n- 2\n")).toEqual(DEFAULT_CONFIG);
    expect(parseConfig("42")).toEqual(DEFAULT_CONFIG);
    expect(parseConfig("just a string")).toEqual(DEFAULT_CONFIG);
  });

  it("degrades out-of-range numbers to their defaults", () => {
    const cfg = parseConfig("pass_threshold: 0\nmax_attempts: -3\n");
    expect(cfg.pass_threshold).toBe(3);
    expect(cfg.max_attempts).toBe(3);
  });

  it("returns a fresh object per call (no shared mutable state)", () => {
    const a = parseConfig(null);
    a.pass_threshold = 999;
    a.skip_paths.push("mutated/**");
    a.include_paths.push("mutated/**");
    a.skip_authors.push("mallory");
    a.gates.push({ type: "multiple_choice", questions: 2, pass_threshold: 2 });
    a.path_rules.push({
      paths: ["mutated/**"],
      gates: [{ type: "multiple_choice", questions: 2, pass_threshold: 2 }],
      skip_paths: undefined,
      include_paths: undefined,
    });
    a.signals.push({ type: "honeypot", report_only: true });
    a.signals.push({
      type: "code_honeypot",
      report_only: true,
      patterns: ["MUTATE_ME"],
      paths: ["src/**"],
    });
    a.context.large_pr.changed_files = 999;
    a.context.ignore_paths.push("mutated/**");
    a.bot_policy.trusted_logins.push("bot");
    a.rechallenge.ignore_paths.push("mutated/**");
    a.enforcement.auto_close.enabled = true;
    a.enforcement.auto_close.outcomes.pop();
    a.accountability.require_ai_disclosure = true;
    a.trust.default_author_associations.push("CONTRIBUTOR");
    const codeSignal = a.signals.find((signal) => signal.type === "code_honeypot");
    codeSignal?.patterns.push("changed");
    const b = parseConfig(null);
    expect(b.pass_threshold).toBe(3);
    expect(b.skip_paths).toEqual(["docs/**", "*.md"]);
    expect(b.include_paths).toEqual([]);
    expect(b.skip_authors).toEqual([]);
    expect(b.gates).toEqual([{ type: "multiple_choice", questions: 4, pass_threshold: 3 }]);
    expect(b.path_rules).toEqual([]);
    expect(b.signals).toEqual([{ type: "honeypot", report_only: true }]);
    expect(b.context.large_pr.changed_files).toBe(100);
    expect(b.context.ignore_paths).toEqual([]);
    expect(b.bot_policy.trusted_logins).toEqual([]);
    expect(b.rechallenge.ignore_paths).toEqual([]);
    expect(b.enforcement).toEqual({
      auto_close: {
        enabled: false,
        outcomes: ["failed_assisted", "failed_final"],
      },
    });
    expect(b.accountability).toEqual({
      require_pr_acknowledgement: false,
      require_ai_disclosure: false,
    });
    expect(b.trust.default_author_associations).toEqual(["OWNER", "MEMBER", "COLLABORATOR"]);
    expect(DEFAULT_CONFIG.pass_threshold).toBe(3);
  });

  it("gives fresh arrays even when other fields are set", () => {
    const a = parseConfig("pass_threshold: 4");
    a.skip_paths.push("mutated/**");
    a.include_paths.push("mutated/**");
    expect(parseConfig("pass_threshold: 4").skip_paths).toEqual(["docs/**", "*.md"]);
    expect(parseConfig("pass_threshold: 4").include_paths).toEqual([]);
  });

  it("gives fresh arrays for author association exemptions", () => {
    const yaml = [
      "exemptions:",
      "  - type: author_association",
      "    associations: [CONTRIBUTOR]",
      "",
    ].join("\n");
    const a = parseConfig(yaml);
    getAuthorAssociationExemptions(a)[0].associations.push("MEMBER");

    expect(getAuthorAssociationExemptions(parseConfig(yaml))).toEqual([{
      type: "author_association",
      associations: ["CONTRIBUTOR"],
    }]);
  });

  it("gives fresh arrays for author login and repository permission exemptions", () => {
    const yaml = [
      "exemptions:",
      "  - type: author_login",
      "    logins: [octocat]",
      "  - type: repository_permission",
      "    permissions: [write]",
      "",
    ].join("\n");
    const a = parseConfig(yaml);
    getAuthorLoginExemptions(a)[0].logins.push("hubot");
    getRepositoryPermissionExemptions(a)[0].permissions.push("maintain");

    expect(getAuthorLoginExemptions(parseConfig(yaml))).toEqual([{
      type: "author_login",
      logins: ["octocat"],
    }]);
    expect(getRepositoryPermissionExemptions(parseConfig(yaml))).toEqual([{
      type: "repository_permission",
      permissions: ["write"],
    }]);
  });

  it("gives fresh arrays for GitHub team exemptions", () => {
    const yaml = [
      "exemptions:",
      "  - type: github_team",
      "    teams: [maintainers]",
      "    roles: [member, maintainer]",
      "",
    ].join("\n");
    const a = parseConfig(yaml);
    getGitHubTeamExemptions(a)[0].teams.push("security");
    getGitHubTeamExemptions(a)[0].roles?.push("member");

    expect(getGitHubTeamExemptions(parseConfig(yaml))).toEqual([{
      type: "github_team",
      teams: ["maintainers"],
      roles: ["member", "maintainer"],
    }]);
  });
});
