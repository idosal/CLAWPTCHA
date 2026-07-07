export interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
  AI?: Ai;
  APP_BASE_URL: string;
  LLM_PROVIDER: "workers-ai" | "anthropic" | "openai-compat";
  LLM_MODEL: string;
  LLM_API_KEY?: string;
  LLM_BASE_URL?: string;
  AI_GATEWAY_ID?: string;
  FLUE_INVESTIGATOR?: Fetcher;
  FLUE_INVESTIGATOR_URL?: string;
  FLUE_INVESTIGATOR_SECRET?: string;
  FLUE_INVESTIGATOR_TIMEOUT_MS?: string;
  GITHUB_APP_ID: string;
  GITHUB_PRIVATE_KEY: string;
  GITHUB_WEBHOOK_SECRET: string;
  GITHUB_OAUTH_CLIENT_ID: string;
  GITHUB_OAUTH_CLIENT_SECRET: string;
  TURNSTILE_SITE_KEY: string;
  TURNSTILE_SECRET_KEY: string;
  SESSION_SIGNING_KEY: string;
}

export type ChallengeStatus =
  | "awaiting_approval"
  | "ready"
  | "passed"
  | "failed_final"
  | "neutral"
  | "superseded";

export interface Challenge {
  id: string;
  installation_id: number;
  repo_full_name: string;
  pr_number: number;
  head_sha: string;
  author_login: string;
  check_run_id: number | null;
  status: ChallengeStatus;
  approved_by: string | null;
  attempts_used: number;
  cooldown_until: string | null;
  config_json: string;
  created_at: string;
}

export interface PrInvestigation {
  id: string;
  repo_full_name: string;
  pr_number: number;
  head_sha: string;
  source: "worker" | "flue";
  status: "ready" | "failed";
  artifact_json: string;
  error: string | null;
  created_at: string;
  updated_at: string;
}
