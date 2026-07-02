import { parse as parseYaml } from "yaml";
import { z } from "zod";

const configSchema = z.object({
  pass_threshold: z.number().int().min(1).max(4).catch(3),
  max_attempts: z.number().int().min(1).max(10).catch(3),
  cooldown_minutes: z.number().int().min(0).catch(15),
  require_approval: z.enum(["first_time", "always", "never"]).catch("first_time"),
  rechallenge_on_push: z.boolean().catch(false),
  // A single invalid element intentionally falls back to the whole-field
  // default (fail-safe direction), not per-element filtering.
  skip_authors: z.array(z.string()).catch(() => []),
  skip_bots: z.boolean().catch(true),
  min_changed_lines: z.number().int().min(0).catch(10),
  // Same fail-safe direction as skip_authors: any invalid entry defaults
  // the entire array rather than dropping just the bad element.
  skip_paths: z.array(z.string()).catch(() => ["docs/**", "*.md"]),
  // Invalid values (including 0/negative) intentionally fall back to
  // null = uncapped, since null is the documented default for this field.
  max_context_tokens: z.number().int().positive().nullable().catch(null),
});

export type ClawptchaConfig = z.infer<typeof configSchema>;

function freshDefaults(): ClawptchaConfig {
  return configSchema.parse({});
}

export const DEFAULT_CONFIG: ClawptchaConfig = Object.freeze({
  ...configSchema.parse({}),
  skip_authors: Object.freeze([] as string[]),
  skip_paths: Object.freeze(["docs/**", "*.md"] as string[]),
}) as ClawptchaConfig;

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
  return parsed.success ? parsed.data : freshDefaults();
}

// Parse a stored config_json snapshot back into a validated config.
export function resolveConfig(json: string): ClawptchaConfig {
  try {
    return configSchema.parse(JSON.parse(json));
  } catch {
    return DEFAULT_CONFIG;
  }
}
