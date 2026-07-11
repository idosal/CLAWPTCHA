import { describe, expect, it, vi } from "vitest";
import { evaluateVouchTrust, parseVouchStatus } from "../src/policy/vouch";
import { parseConfig } from "../src/config";

describe("parseVouchStatus", () => {
  it("recognizes unprefixed and GitHub-prefixed vouched users case-insensitively", () => {
    const content = [
      "# Trusted contributors",
      "Alice long-time contributor",
      "github:BoB",
      "gitlab:carol",
      "",
    ].join("\n");

    expect(parseVouchStatus(content, "alice")).toBe("vouched");
    expect(parseVouchStatus(content, "BOB")).toBe("vouched");
    expect(parseVouchStatus(content, "carol")).toBe("unknown");
  });

  it("recognizes denounced GitHub users without exposing the reason", () => {
    const content = "-github:BadActor Submitted repeated low-quality PRs\n";

    expect(parseVouchStatus(content, "badactor")).toBe("denounced");
  });

  it("matches Vouch's first-entry-wins behavior for malformed duplicate lists", () => {
    const content = "alice\n-alice later duplicate\n";

    expect(parseVouchStatus(content, "alice")).toBe("vouched");
  });

  it("normalizes whitespace around GitHub handles and the requested login", () => {
    const content = "   github:OctoCat   trusted contributor   \n";

    expect(parseVouchStatus(content, "  octocat  ")).toBe("vouched");
  });
});

describe("evaluateVouchTrust", () => {
  it("reads the configured file at the merge-target ref", async () => {
    const cfg = parseConfig([
      "trust:",
      "  vouch:",
      "    enabled: true",
      "    file: VOUCHED.td",
      "",
    ].join("\n"));
    const getFileContent = vi.fn(async () => "github:octocat\n");

    await expect(evaluateVouchTrust(
      { repo: "o/r", authorLogin: "octocat", baseRef: "main" },
      cfg,
      { getFileContent }
    )).resolves.toEqual({ status: "vouched", file: "VOUCHED.td" });
    expect(getFileContent).toHaveBeenCalledWith("o/r", "VOUCHED.td", "main");
  });

  it("falls back to unknown when disabled, missing, or unavailable", async () => {
    const disabledLookup = vi.fn(async () => "octocat\n");
    await expect(evaluateVouchTrust(
      { repo: "o/r", authorLogin: "octocat", baseRef: "main" },
      parseConfig(null),
      { getFileContent: disabledLookup }
    )).resolves.toEqual({ status: "unknown" });
    expect(disabledLookup).not.toHaveBeenCalled();

    const enabled = parseConfig("trust:\n  vouch:\n    enabled: true\n");
    await expect(evaluateVouchTrust(
      { repo: "o/r", authorLogin: "octocat", baseRef: "main" },
      enabled,
      { getFileContent: vi.fn(async () => null) }
    )).resolves.toEqual({ status: "unknown" });
    await expect(evaluateVouchTrust(
      { repo: "o/r", authorLogin: "octocat", baseRef: "main" },
      enabled,
      { getFileContent: vi.fn(async () => { throw new Error("GitHub unavailable"); }) }
    )).resolves.toEqual({ status: "unknown" });
  });
});
