import { parse as parseYaml } from "yaml";
import { z } from "zod";

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function normalizeStringList(
  values: string[],
  normalize: (value: string) => string = (value) => value.trim()
): string[] {
  return unique(values.map(normalize));
}

const lowerTrim = (value: string): string => value.trim().toLowerCase();
const upperTrim = (value: string): string => value.trim().toUpperCase();
const stringList = (maxItems: number, maxLength: number) =>
  z.array(z.string().trim().min(1).max(maxLength)).max(maxItems);
const pathList = (maxItems = 100) => stringList(maxItems, 200);

const DEFAULT_MULTIPLE_CHOICE_GATE = Object.freeze({
  type: "multiple_choice" as const,
  questions: 4,
  pass_threshold: 3,
});

const DEFAULT_HONEYPOT_SIGNAL = Object.freeze({
  type: "honeypot" as const,
  report_only: true,
});

const DEFAULT_CONTEXT = Object.freeze({
  strategy: "adaptive" as const,
  investigator: "auto" as const,
  map_tokens: 8000,
  detail_tokens: 24000,
  max_files: 12,
  max_model_calls: 3,
  ignore_paths: Object.freeze([] as string[]),
  large_pr: Object.freeze({
    changed_files: 100,
    changed_lines: 5000,
  }),
});

const DEFAULT_BOT_POLICY = Object.freeze({
  default: "skip" as const,
  trusted_logins: Object.freeze([] as string[]),
});

const DEFAULT_RECHALLENGE = Object.freeze({
  on_push: "never" as const,
  ignore_paths: Object.freeze([] as string[]),
});

const DEFAULT_DRAFT_PRS = "ignore" as const;

const DEFAULT_OUTPUT = Object.freeze({
  comments: "normal" as const,
  labels: true,
});

const DEFAULT_ACCOUNTABILITY = Object.freeze({
  require_pr_acknowledgement: false,
  require_ai_disclosure: false,
});

const multipleChoiceGateSchema = z.object({
  type: z.literal("multiple_choice"),
  questions: z.number().int().min(1).max(10).catch(DEFAULT_MULTIPLE_CHOICE_GATE.questions),
  pass_threshold: z.number().int().min(1).max(10).catch(DEFAULT_MULTIPLE_CHOICE_GATE.pass_threshold),
}).transform((gate) => ({
  ...gate,
  pass_threshold: Math.min(gate.pass_threshold, gate.questions),
}));

const honeypotSignalSchema = z.object({
  type: z.literal("honeypot"),
  report_only: z.boolean().catch(DEFAULT_HONEYPOT_SIGNAL.report_only),
}).transform((signal) => ({
  ...signal,
  report_only: true,
}));

const codeHoneypotSignalSchema = z.object({
  type: z.literal("code_honeypot"),
  patterns: stringList(20, 200).catch(() => []),
  paths: pathList(50).catch(() => ["**"]),
  report_only: z.boolean().catch(true),
}).transform((signal) => ({
  ...signal,
  patterns: normalizeStringList(signal.patterns),
  paths: normalizeStringList(signal.paths),
  report_only: true,
}));

const signalSchema = z.union([
  honeypotSignalSchema,
  codeHoneypotSignalSchema,
]);

const botPolicySchema = z.object({
  default: z.enum(["skip", "challenge"]).catch(DEFAULT_BOT_POLICY.default),
  trusted_logins: stringList(200, 100).catch(() => []),
}).transform((policy) => ({
  ...policy,
  trusted_logins: normalizeStringList(policy.trusted_logins, lowerTrim),
})).catch(() => ({
  default: DEFAULT_BOT_POLICY.default,
  trusted_logins: [...DEFAULT_BOT_POLICY.trusted_logins],
}));

const linkedIssueMatchExemptionSchema = z.object({
  type: z.literal("linked_issue_match"),
  require_same_repo: z.boolean().catch(true),
  require_trusted_signal: z.boolean().catch(true),
  min_match_score: z.number().min(0).max(1).catch(0.7),
  max_issues: z.number().int().min(1).max(10).catch(5),
  trusted_labels: stringList(50, 100).catch(() => []),
}).transform((exemption) => ({
  ...exemption,
  trusted_labels: normalizeStringList(exemption.trusted_labels),
}));

const authorAssociationExemptionSchema = z.object({
  type: z.literal("author_association"),
  associations: stringList(20, 80).min(1).catch(() => []),
}).transform((exemption) => ({
  ...exemption,
  associations: normalizeStringList(exemption.associations, upperTrim),
}));

const authorLoginExemptionSchema = z.object({
  type: z.literal("author_login"),
  logins: stringList(200, 100).min(1).catch(() => []),
}).transform((exemption) => ({
  ...exemption,
  logins: normalizeStringList(exemption.logins, lowerTrim),
}));

const repositoryPermissionExemptionSchema = z.object({
  type: z.literal("repository_permission"),
  permissions: stringList(10, 40).min(1).catch(() => []),
}).transform((exemption) => ({
  ...exemption,
  permissions: normalizeStringList(exemption.permissions, lowerTrim),
}));

const githubTeamExemptionSchema = z.object({
  type: z.literal("github_team"),
  teams: stringList(50, 120).min(1).catch(() => []),
  roles: z.array(z.enum(["member", "maintainer"])).min(1).max(2).optional().catch(undefined),
}).transform((exemption) => ({
  ...exemption,
  teams: normalizeStringList(exemption.teams, lowerTrim),
  roles: exemption.roles ? normalizeStringList(exemption.roles, lowerTrim) as Array<"member" | "maintainer"> : undefined,
}));

const priorMergedPrsExemptionSchema = z.object({
  type: z.literal("prior_merged_prs"),
  min_count: z.number().int().min(1).max(1000).catch(3),
});

const exemptionSchema = z.union([
  linkedIssueMatchExemptionSchema,
  authorAssociationExemptionSchema,
  authorLoginExemptionSchema,
  repositoryPermissionExemptionSchema,
  githubTeamExemptionSchema,
  priorMergedPrsExemptionSchema,
]);

const pathRuleSchema = z.object({
  paths: pathList().min(1).catch(() => []),
  gates: z.array(multipleChoiceGateSchema).min(1).optional().catch(undefined),
  require_approval: z.enum(["first_time", "always", "never"]).optional().catch(undefined),
  max_attempts: z.number().int().min(1).max(10).optional().catch(undefined),
  cooldown_minutes: z.number().int().min(0).optional().catch(undefined),
  min_changed_lines: z.number().int().min(0).optional().catch(undefined),
  skip_paths: pathList().optional().catch(undefined),
  include_paths: pathList().optional().catch(undefined),
}).transform((rule) => ({
  ...rule,
  paths: normalizeStringList(rule.paths),
  gates: rule.gates?.map((gate) => ({ ...gate })),
  skip_paths: rule.skip_paths ? normalizeStringList(rule.skip_paths) : undefined,
  include_paths: rule.include_paths ? normalizeStringList(rule.include_paths) : undefined,
}));

const contextSchema = z.object({
  strategy: z.enum(["adaptive", "truncate"]).catch(DEFAULT_CONTEXT.strategy),
  investigator: z.enum(["auto", "worker", "flue"]).catch(DEFAULT_CONTEXT.investigator),
  map_tokens: z.number().int().positive().max(64000).catch(DEFAULT_CONTEXT.map_tokens),
  detail_tokens: z.number().int().positive().max(128000).catch(DEFAULT_CONTEXT.detail_tokens),
  max_files: z.number().int().min(1).max(50).catch(DEFAULT_CONTEXT.max_files),
  max_model_calls: z.number().int().min(1).max(3).catch(DEFAULT_CONTEXT.max_model_calls),
  ignore_paths: pathList().catch(() => []),
  large_pr: z.object({
    changed_files: z.number().int().min(1).max(5000).catch(DEFAULT_CONTEXT.large_pr.changed_files),
    changed_lines: z.number().int().min(1).max(200000).catch(DEFAULT_CONTEXT.large_pr.changed_lines),
  }).catch(() => ({ ...DEFAULT_CONTEXT.large_pr })),
}).transform((context) => ({
  ...context,
  ignore_paths: normalizeStringList(context.ignore_paths),
})).catch(() => ({
  strategy: DEFAULT_CONTEXT.strategy,
  investigator: DEFAULT_CONTEXT.investigator,
  map_tokens: DEFAULT_CONTEXT.map_tokens,
  detail_tokens: DEFAULT_CONTEXT.detail_tokens,
  max_files: DEFAULT_CONTEXT.max_files,
  max_model_calls: DEFAULT_CONTEXT.max_model_calls,
  ignore_paths: [...DEFAULT_CONTEXT.ignore_paths],
  large_pr: { ...DEFAULT_CONTEXT.large_pr },
}));

const rechallengeSchema = z.object({
  on_push: z.enum(["never", "always", "included_paths"]).catch(DEFAULT_RECHALLENGE.on_push),
  ignore_paths: pathList().catch(() => []),
}).transform((policy) => ({
  ...policy,
  ignore_paths: normalizeStringList(policy.ignore_paths),
})).catch(() => ({
  on_push: DEFAULT_RECHALLENGE.on_push,
  ignore_paths: [...DEFAULT_RECHALLENGE.ignore_paths],
}));

const outputSchema = z.object({
  comments: z.enum(["quiet", "normal", "detailed"]).catch(DEFAULT_OUTPUT.comments),
  labels: z.boolean().catch(DEFAULT_OUTPUT.labels),
}).catch(() => ({
  comments: DEFAULT_OUTPUT.comments,
  labels: DEFAULT_OUTPUT.labels,
}));

const accountabilitySchema = z.object({
  require_pr_acknowledgement: z.boolean().catch(DEFAULT_ACCOUNTABILITY.require_pr_acknowledgement),
  require_ai_disclosure: z.boolean().catch(DEFAULT_ACCOUNTABILITY.require_ai_disclosure),
}).catch(() => ({
  require_pr_acknowledgement: DEFAULT_ACCOUNTABILITY.require_pr_acknowledgement,
  require_ai_disclosure: DEFAULT_ACCOUNTABILITY.require_ai_disclosure,
}));

const configSchema = z.object({
  pass_threshold: z.number().int().min(1).max(4).catch(3),
  gates: z.array(multipleChoiceGateSchema).min(1).catch(() => [{ ...DEFAULT_MULTIPLE_CHOICE_GATE }]),
  path_rules: z.array(pathRuleSchema).catch(() => []),
  signals: z.array(signalSchema).catch(() => [{ ...DEFAULT_HONEYPOT_SIGNAL }]),
  exemptions: z.array(exemptionSchema).catch(() => []),
  context: contextSchema,
  draft_prs: z.enum(["challenge", "neutral", "ignore"]).catch(DEFAULT_DRAFT_PRS),
  bot_policy: botPolicySchema,
  max_attempts: z.number().int().min(1).max(10).catch(3),
  cooldown_minutes: z.number().int().min(0).catch(15),
  require_approval: z.enum(["first_time", "always", "never"]).catch("first_time"),
  rechallenge: rechallengeSchema,
  rechallenge_on_push: z.boolean().catch(false),
  // A single invalid element intentionally falls back to the whole-field
  // default (fail-safe direction), not per-element filtering.
  skip_authors: stringList(200, 100).catch(() => []),
  skip_bots: z.boolean().catch(true),
  min_changed_lines: z.number().int().min(0).catch(10),
  // Same fail-safe direction as skip_authors: any invalid entry defaults
  // the entire array rather than dropping just the bad element.
  skip_paths: pathList().catch(() => ["docs/**", "*.md"]),
  include_paths: pathList().catch(() => []),
  // Invalid values (including 0/negative) intentionally fall back to
  // null = uncapped, since null is the documented default for this field.
  max_context_tokens: z.number().int().positive().nullable().catch(null),
  output: outputSchema,
  accountability: accountabilitySchema,
}).transform((cfg) => ({
  ...cfg,
  skip_authors: normalizeStringList(cfg.skip_authors, lowerTrim),
  skip_paths: normalizeStringList(cfg.skip_paths),
  include_paths: normalizeStringList(cfg.include_paths),
}));

type RawClawptchaConfig = z.infer<typeof configSchema>;
export type ClawptchaConfig = RawClawptchaConfig;
export type MultipleChoiceGate = z.infer<typeof multipleChoiceGateSchema>;
export type PathRule = z.infer<typeof pathRuleSchema>;
export type ClawptchaSignal = z.infer<typeof signalSchema>;
export type HoneypotSignal = Extract<ClawptchaSignal, { type: "honeypot" }>;
export type CodeHoneypotSignal = Extract<ClawptchaSignal, { type: "code_honeypot" }>;
export type ClawptchaExemption = z.infer<typeof exemptionSchema>;
export type LinkedIssueMatchExemption = z.infer<typeof linkedIssueMatchExemptionSchema>;
export type AuthorAssociationExemption = z.infer<typeof authorAssociationExemptionSchema>;
export type AuthorLoginExemption = z.infer<typeof authorLoginExemptionSchema>;
export type RepositoryPermissionExemption = z.infer<typeof repositoryPermissionExemptionSchema>;
export type GitHubTeamExemption = z.infer<typeof githubTeamExemptionSchema>;
export type PriorMergedPrsExemption = z.infer<typeof priorMergedPrsExemptionSchema>;

function clonePathRule(rule: PathRule): PathRule {
  return {
    ...rule,
    paths: [...rule.paths],
    gates: rule.gates?.map((gate) => ({ ...gate })),
    skip_paths: rule.skip_paths ? [...rule.skip_paths] : undefined,
    include_paths: rule.include_paths ? [...rule.include_paths] : undefined,
  };
}

function cloneSignal(signal: ClawptchaSignal): ClawptchaSignal {
  if (signal.type === "code_honeypot") {
    return {
      ...signal,
      patterns: [...signal.patterns],
      paths: [...signal.paths],
    };
  }
  return { ...signal };
}

function cloneExemption(exemption: ClawptchaExemption): ClawptchaExemption {
  if (exemption.type === "linked_issue_match") {
    return {
      ...exemption,
      trusted_labels: [...exemption.trusted_labels],
    };
  }
  if (exemption.type === "author_association") {
    return {
      ...exemption,
      associations: [...exemption.associations],
    };
  }
  if (exemption.type === "author_login") {
    return {
      ...exemption,
      logins: [...exemption.logins],
    };
  }
  if (exemption.type === "github_team") {
    return {
      ...exemption,
      teams: [...exemption.teams],
      roles: exemption.roles ? [...exemption.roles] : undefined,
    };
  }
  if (exemption.type === "prior_merged_prs") {
    return { ...exemption };
  }
  return {
    ...exemption,
    permissions: [...exemption.permissions],
  };
}

function normalizeConfig(
  parsed: RawClawptchaConfig,
  raw?: Record<string, unknown>
): ClawptchaConfig {
  const gates = parsed.gates.map((gate) => ({ ...gate }));
  const cfg: ClawptchaConfig = {
    ...parsed,
    gates,
    path_rules: parsed.path_rules.map(clonePathRule),
    signals: parsed.signals.map(cloneSignal),
    exemptions: parsed.exemptions.map(cloneExemption),
    context: {
      ...parsed.context,
      ignore_paths: [...parsed.context.ignore_paths],
      large_pr: { ...parsed.context.large_pr },
    },
    bot_policy: {
      ...parsed.bot_policy,
      trusted_logins: [...parsed.bot_policy.trusted_logins],
    },
    rechallenge: {
      ...parsed.rechallenge,
      ignore_paths: [...parsed.rechallenge.ignore_paths],
    },
    output: { ...parsed.output },
    accountability: { ...parsed.accountability },
    skip_authors: [...parsed.skip_authors],
    skip_paths: [...parsed.skip_paths],
    include_paths: [...parsed.include_paths],
  };

  if (!raw || !Object.hasOwn(raw, "bot_policy")) {
    cfg.bot_policy = {
      ...cfg.bot_policy,
      default: parsed.skip_bots ? "skip" : "challenge",
    };
  }
  cfg.skip_bots = cfg.bot_policy.default === "skip";

  if (!raw || !Object.hasOwn(raw, "rechallenge")) {
    cfg.rechallenge = {
      ...cfg.rechallenge,
      on_push: parsed.rechallenge_on_push ? "always" : "never",
    };
  }
  cfg.rechallenge_on_push = cfg.rechallenge.on_push !== "never";

  // Legacy configs can keep using top-level pass_threshold. Once `gates` is
  // present, the multiple-choice gate owns its own threshold and question count.
  if (!raw || !Object.hasOwn(raw, "gates")) {
    cfg.gates = [{
      ...DEFAULT_MULTIPLE_CHOICE_GATE,
      pass_threshold: Math.min(parsed.pass_threshold, DEFAULT_MULTIPLE_CHOICE_GATE.questions),
    }];
  }
  cfg.pass_threshold = getMultipleChoiceGate(cfg).pass_threshold;
  return cfg;
}

function freezeConfig(cfg: ClawptchaConfig): ClawptchaConfig {
  for (const gate of cfg.gates) Object.freeze(gate);
  for (const rule of cfg.path_rules) {
    Object.freeze(rule.paths);
    if (rule.gates) {
      for (const gate of rule.gates) Object.freeze(gate);
      Object.freeze(rule.gates);
    }
    if (rule.skip_paths) Object.freeze(rule.skip_paths);
    if (rule.include_paths) Object.freeze(rule.include_paths);
    Object.freeze(rule);
  }
  for (const signal of cfg.signals) {
    if (signal.type === "code_honeypot") {
      Object.freeze(signal.patterns);
      Object.freeze(signal.paths);
    }
    Object.freeze(signal);
  }
  for (const exemption of cfg.exemptions) {
    if (exemption.type === "linked_issue_match") {
      Object.freeze(exemption.trusted_labels);
    } else if (exemption.type === "author_association") {
      Object.freeze(exemption.associations);
    } else if (exemption.type === "author_login") {
      Object.freeze(exemption.logins);
    } else if (exemption.type === "github_team") {
      Object.freeze(exemption.teams);
      if (exemption.roles) Object.freeze(exemption.roles);
    } else {
      if ("permissions" in exemption) Object.freeze(exemption.permissions);
    }
    Object.freeze(exemption);
  }
  Object.freeze(cfg.context.large_pr);
  Object.freeze(cfg.context.ignore_paths);
  Object.freeze(cfg.context);
  Object.freeze(cfg.bot_policy.trusted_logins);
  Object.freeze(cfg.bot_policy);
  Object.freeze(cfg.rechallenge.ignore_paths);
  Object.freeze(cfg.rechallenge);
  Object.freeze(cfg.output);
  Object.freeze(cfg.accountability);
  Object.freeze(cfg.gates);
  Object.freeze(cfg.path_rules);
  Object.freeze(cfg.signals);
  Object.freeze(cfg.exemptions);
  Object.freeze(cfg.skip_authors);
  Object.freeze(cfg.skip_paths);
  Object.freeze(cfg.include_paths);
  return Object.freeze(cfg);
}

function freshDefaults(): ClawptchaConfig {
  return normalizeConfig(configSchema.parse({}));
}

export const DEFAULT_CONFIG: ClawptchaConfig = freezeConfig(freshDefaults());

export function getMultipleChoiceGate(cfg: ClawptchaConfig): MultipleChoiceGate {
  return cfg.gates.find((gate) => gate.type === "multiple_choice") ?? { ...DEFAULT_MULTIPLE_CHOICE_GATE };
}

export function hasHoneypotSignal(cfg: ClawptchaConfig): boolean {
  return cfg.signals.some((signal) => signal.type === "honeypot");
}

export function getCodeHoneypotSignals(cfg: ClawptchaConfig): CodeHoneypotSignal[] {
  return cfg.signals.filter((signal) => signal.type === "code_honeypot");
}

export function getLinkedIssueMatchExemption(
  cfg: ClawptchaConfig
): LinkedIssueMatchExemption | null {
  return cfg.exemptions.find((exemption) => exemption.type === "linked_issue_match") ?? null;
}

export function getAuthorAssociationExemptions(
  cfg: ClawptchaConfig
): AuthorAssociationExemption[] {
  return cfg.exemptions.filter((exemption) => exemption.type === "author_association");
}

export function getAuthorLoginExemptions(
  cfg: ClawptchaConfig
): AuthorLoginExemption[] {
  return cfg.exemptions.filter((exemption) => exemption.type === "author_login");
}

export function getRepositoryPermissionExemptions(
  cfg: ClawptchaConfig
): RepositoryPermissionExemption[] {
  return cfg.exemptions.filter((exemption) => exemption.type === "repository_permission");
}

export function getGitHubTeamExemptions(
  cfg: ClawptchaConfig
): GitHubTeamExemption[] {
  return cfg.exemptions.filter((exemption) => exemption.type === "github_team");
}

export function getPriorMergedPrsExemptions(
  cfg: ClawptchaConfig
): PriorMergedPrsExemption[] {
  return cfg.exemptions.filter((exemption) => exemption.type === "prior_merged_prs");
}

export function parseConfig(yamlText: string | null): ClawptchaConfig {
  if (!yamlText) return freshDefaults();
  let raw: unknown;
  try {
    raw = parseYaml(yamlText);
  } catch {
    return freshDefaults();
  }
  // Reject anything that isn't a plain YAML mapping (arrays and scalars
  // are technically `typeof === "object"` for arrays, or primitives,
  // neither of which the schema can parse as a config object).
  if (raw === null || Array.isArray(raw) || typeof raw !== "object") return freshDefaults();
  const parsed = configSchema.safeParse(raw);
  return parsed.success ? normalizeConfig(parsed.data, raw as Record<string, unknown>) : freshDefaults();
}

// Parse a stored config_json snapshot back into a validated config.
export function resolveConfig(json: string): ClawptchaConfig {
  try {
    const raw = JSON.parse(json) as unknown;
    if (raw === null || Array.isArray(raw) || typeof raw !== "object") return DEFAULT_CONFIG;
    const parsed = configSchema.safeParse(raw);
    return parsed.success ? normalizeConfig(parsed.data, raw as Record<string, unknown>) : DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}
