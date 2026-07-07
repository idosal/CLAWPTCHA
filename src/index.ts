import { Hono, type Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { Env, Challenge } from "./types";
import { verifyWebhookSignature } from "./github/webhook";
import { handlePullRequestEvent, handleIssueCommentEvent } from "./github/events";
import { apiForInstallation, onChallengeResolved, sweepStaleChallenges } from "./resolve";
import { getChallenge, getInvestigationByPr, randomToken, upsertInvestigation } from "./store";
import { signSessionCookie, verifySessionCookie } from "./ui/session";
import { authorizeUrl, exchangeCodeForLogin } from "./github/oauth";
import { startPage, questionPage, resultPage, errorPage, homePage, HONEYPOT_FIELD_NAME } from "./ui/pages";
import { startQuizAttempt, submitAnswer, type ChallengeDeps, type PrContext } from "./challenge";
import { generateQuiz, generateQuizFromInvestigation } from "./quiz/generate";
import { redactForClient, type Quiz } from "./quiz/schema";
import { QUESTION_TIME_LIMIT_MS } from "./quiz/grade";
import { getMultipleChoiceGate, hasHoneypotSignal, resolveConfig, type ClawptchaConfig } from "./config";
import { providerFromEnv, type QuizProvider } from "./quiz/providers";
import { matchesGlob } from "./policy/exemptions";
import { chooseInvestigatorSource, investigatePrWithFlue, type InvestigationSource } from "./flue/investigator";
import {
  investigatePr,
  investigationMode,
  validateInvestigationArtifact,
  type InvestigationArtifact,
} from "./quiz/investigate";

const app = new Hono<{ Bindings: Env }>();

async function docsAsset(c: Context<{ Bindings: Env }>): Promise<Response> {
  if (new URL(c.req.url).pathname === "/docs") return c.redirect("/docs/");
  if (!c.env.ASSETS) {
    return c.html(errorPage("Docs unavailable", "The Starlight documentation bundle is not available in this environment."), 503);
  }
  return c.env.ASSETS.fetch(c.req.raw);
}

app.onError((err, c) => {
  console.error("unhandled route error", c.req.path, err);
  return c.html(
    errorPage("Something went wrong", "Temporary problem on our side — please try again in a minute. Your PR is not blocked by this error."),
    500
  );
});

// ---------- webhooks ----------
app.post("/webhook", async (c) => {
  const body = await c.req.text();
  const ok = await verifyWebhookSignature(
    c.env.GITHUB_WEBHOOK_SECRET, body, c.req.header("x-hub-signature-256") ?? null
  );
  if (!ok) return c.text("bad signature", 401);

  const event = c.req.header("x-github-event");
  const payload = JSON.parse(body);
  // Respond 200 fast; do the work via waitUntil so GitHub doesn't time out.
  c.executionCtx.waitUntil((async () => {
    try {
      // Probe/ping payloads carry no installation — nothing to do.
      if (!payload.installation?.id) return;
      if (event === "installation" && payload.action === "created") {
        await c.env.DB.prepare("INSERT OR IGNORE INTO installations (id, account_login) VALUES (?, ?)")
          .bind(payload.installation.id, payload.installation.account.login).run();
        return;
      }
      const api = await apiForInstallation(c.env, payload.installation.id);
      if (event === "pull_request") await handlePullRequestEvent(c.env, api, payload);
      else if (event === "issue_comment") await handleIssueCommentEvent(c.env, api, payload);
    } catch (e) {
      console.error("webhook handling failed", event, e);
    }
  })());
  return c.text("ok");
});

// ---------- session helpers ----------
const SESSION_MAX_AGE_MS = 60 * 60_000;

function hasSubmittedHoneypot(form: Record<string, unknown>): boolean {
  const raw = form[HONEYPOT_FIELD_NAME];
  if (Array.isArray(raw)) return raw.some((value) => String(value ?? "").trim().length > 0);
  if (typeof raw === "string") return raw.trim().length > 0;
  return raw !== undefined && raw !== null;
}

function pathIgnored(path: string, patterns: string[]): boolean {
  return patterns.some((pattern) => matchesGlob(pattern, path));
}

function filterDiffByIgnoredPaths(diff: string, ignoredPaths: string[]): string {
  if (ignoredPaths.length === 0 || !diff.includes("diff --git ")) return diff;
  const blocks = diff.split(/(?=^diff --git )/m);
  return blocks.filter((block) => {
    const firstLine = block.split("\n", 1)[0] ?? "";
    const match = /^diff --git a\/(.+) b\/(.+)$/.exec(firstLine);
    const path = match?.[2] ?? match?.[1];
    return !path || !pathIgnored(path, ignoredPaths);
  }).join("");
}

function filterContextForGeneration(ctx: PrContext, cfg: ClawptchaConfig): PrContext {
  const ignoredPaths = cfg.context.ignore_paths;
  if (ignoredPaths.length === 0) return ctx;
  const filePatches = ctx.filePatches?.filter((file) => !pathIgnored(file.filename, ignoredPaths));
  const files = ctx.files.filter((file) => !pathIgnored(file, ignoredPaths));
  const changedLines = filePatches
    ? filePatches.reduce((sum, file) => sum + file.additions + file.deletions, 0)
    : ctx.changedLines;
  return {
    ...ctx,
    diff: filterDiffByIgnoredPaths(ctx.diff, ignoredPaths),
    files,
    filePatches,
    changedLines,
  };
}

async function currentSession(
  c: Context<{ Bindings: Env }>
): Promise<{ id: string; gh_login: string | null } | null> {
  const cookie = getCookie(c, "clawptcha_session");
  if (!cookie) return null;
  const sessionId = await verifySessionCookie(c.env.SESSION_SIGNING_KEY, cookie);
  if (!sessionId) return null;
  const row = await c.env.DB.prepare("SELECT id, gh_login, created_at FROM sessions WHERE id=?")
    .bind(sessionId)
    .first<{ id: string; gh_login: string | null; created_at: string }>();
  if (!row) return null;
  // Sessions expire after 1 hour (matches the cookie max-age, enforced server-side).
  if (Date.now() - new Date(row.created_at).getTime() > SESSION_MAX_AGE_MS) return null;
  return { id: row.id, gh_login: row.gh_login };
}

export function challengeDeps(env: Env): ChallengeDeps {
  async function getOrCreateInvestigation(
    ctx: PrContext,
    cfg: ClawptchaConfig,
    provider: QuizProvider
  ): Promise<
    { ok: true; artifact: InvestigationArtifact; source: InvestigationSource; callsUsed: number }
    | { ok: false; error: string; source?: InvestigationSource; mode: InvestigationArtifact["mode"]; callsUsed: number }
  > {
    const mode = investigationMode(ctx, cfg);
    if (!ctx.repoFullName || !ctx.prNumber || !ctx.headSha) {
      return { ok: false, error: "missing PR cache key", mode, callsUsed: 0 };
    }
    const cached = await getInvestigationByPr(env.DB, ctx.repoFullName, ctx.prNumber, ctx.headSha);
    if (cached?.status === "ready") {
      try {
        const parsed = validateInvestigationArtifact(JSON.parse(cached.artifact_json), mode);
        if (parsed.ok) return { ok: true, artifact: parsed.artifact, source: cached.source, callsUsed: 0 };
      } catch { /* invalid cache, regenerate below */ }
    }

    const selected = chooseInvestigatorSource(env, cfg, ctx);
    if (!selected.ok) return { ...selected, callsUsed: 0 };

    const investigationAttempts = selected.source === "flue"
      ? 1
      : Math.max(1, Math.min(2, cfg.context.max_model_calls - 1));
    let result;
    if (selected.source === "flue") {
      result = await investigatePrWithFlue(env, ctx, cfg);
    } else {
      result = await investigatePr(provider, ctx, cfg, investigationAttempts);
    }

    await upsertInvestigation(env.DB, {
      id: cached?.id ?? randomToken(),
      repo_full_name: ctx.repoFullName,
      pr_number: ctx.prNumber,
      head_sha: ctx.headSha,
      source: selected.source,
      status: result.ok ? "ready" : "failed",
      artifact_json: result.ok ? JSON.stringify(result.artifact) : "{}",
      error: result.ok ? null : result.error,
    });
    return result.ok
      ? { ok: true, artifact: result.artifact, source: selected.source, callsUsed: investigationAttempts }
      : { ok: false, error: result.error, source: selected.source, mode, callsUsed: investigationAttempts };
  }

  return {
    now: () => new Date(),
    async fetchPrContext(ch: Challenge) {
      const api = await apiForInstallation(env, ch.installation_id);
      const [diff, pr, filePatches] = await Promise.all([
        api.getPrDiff(ch.repo_full_name, ch.pr_number),
        api.getPr(ch.repo_full_name, ch.pr_number),
        api.listPrFileDetails(ch.repo_full_name, ch.pr_number),
      ]);
      return {
        diff,
        title: pr.title,
        body: pr.body,
        files: filePatches.map((file) => file.filename),
        repoFullName: ch.repo_full_name,
        prNumber: ch.pr_number,
        headSha: ch.head_sha,
        installationId: ch.installation_id,
        changedLines: pr.additions + pr.deletions,
        filePatches,
      };
    },
    async generateQuiz(ctx, cfg) {
      ctx = filterContextForGeneration(ctx, cfg);
      const quizGate = getMultipleChoiceGate(cfg);
      const selected = providerFromEnv(env);
      if (!selected.ok) {
        // Misconfiguration degrades exactly like an LLM outage: failed
        // generation -> neutral check. Log loudly for the operator.
        console.error("LLM provider misconfigured:", selected.error);
        return { ok: false as const, error: selected.error };
      }
      if (cfg.context.strategy === "adaptive" && cfg.context.max_model_calls > 1) {
        const investigation = await getOrCreateInvestigation(ctx, cfg, selected.provider);
        if (investigation.ok) {
          const generationAttempts = Math.max(1, cfg.context.max_model_calls - investigation.callsUsed);
          return generateQuizFromInvestigation(
            selected.provider,
            investigation.artifact,
            ctx.title,
            ctx.body,
            ctx.files,
            quizGate.questions,
            generationAttempts
          );
        }
        if (investigation.mode === "large_pr" || investigation.source === "flue") {
          console.error("PR investigation failed; not falling back for large/Flue investigation:", investigation.error);
          return { ok: false as const, error: investigation.error };
        }
        console.error("PR investigation failed; falling back to bounded direct quiz generation:", investigation.error);
        const fallbackAttempts = Math.max(1, cfg.context.max_model_calls - investigation.callsUsed);
        return generateQuiz(
          selected.provider,
          ctx.diff, ctx.title, ctx.body, ctx.files, cfg.max_context_tokens ?? cfg.context.detail_tokens,
          quizGate.questions,
          fallbackAttempts
        );
      }
      return generateQuiz(
        selected.provider,
        ctx.diff, ctx.title, ctx.body, ctx.files, cfg.max_context_tokens,
        quizGate.questions,
        cfg.context.max_model_calls
      );
    },
    async verifyTurnstile(token: string) {
      // Turnstile informs risk scoring but never blocks: any failure (network,
      // parse, service outage) degrades to `false`, which callers treat as a
      // signal — not a gate. A siteverify outage must not lock authors out.
      try {
        if (!token) return false;
        const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: token }),
        });
        if (!res.ok) return false;
        return ((await res.json()) as { success: boolean }).success;
      } catch {
        return false;
      }
    },
    async onChallengeResolved(r) {
      await onChallengeResolved(env, r);
    },
  };
}

// ---------- OAuth ----------
app.get("/oauth/callback", async (c) => {
  if (c.req.query("error")) {
    return c.html(errorPage("Sign-in canceled",
      "You canceled GitHub sign-in — reopen the challenge link from the PR to try again."), 400);
  }
  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state) return c.html(errorPage("OAuth error", "Missing code or state."), 400);
  const session = await c.env.DB.prepare("SELECT * FROM sessions WHERE oauth_state=?")
    .bind(state).first<{ id: string; challenge_id: string }>();
  if (!session) return c.html(errorPage("OAuth error", "Unknown or expired state."), 400);
  // Login-CSRF guard: the browser completing OAuth must be the same browser that
  // started it. Without this, an attacker who holds a session's `state` could get
  // the PR author to complete the flow and have the author's identity written into
  // the attacker's session — forging an attestation in the author's name. Require
  // the request's own signed session cookie to match the state-bound session row.
  const cookie = getCookie(c, "clawptcha_session");
  const cookieSessionId = cookie
    ? await verifySessionCookie(c.env.SESSION_SIGNING_KEY, cookie)
    : null;
  if (cookieSessionId !== session.id) {
    return c.html(errorPage("Sign-in error",
      "This sign-in link doesn't match your session. Reopen the challenge link from the PR and try again."), 400);
  }
  const login = await exchangeCodeForLogin(c.env, code);
  if (!login) return c.html(errorPage("OAuth error", "GitHub login failed. Try again."), 400);
  await c.env.DB.prepare("UPDATE sessions SET gh_login=?, oauth_state=NULL WHERE id=?")
    .bind(login, session.id).run();
  return c.redirect(`/challenge/${session.challenge_id}`);
});

// ---------- challenge pages ----------
app.get("/challenge/:id", async (c) => {
  const challenge = await getChallenge(c.env.DB, c.req.param("id"));
  if (!challenge) return c.html(errorPage("Not found", "This challenge link is invalid or expired."), 404);

  const session = await currentSession(c);
  if (!session || !session.gh_login) {
    const sessionId = randomToken();
    const state = randomToken();
    await c.env.DB.prepare(
      "INSERT INTO sessions (id, challenge_id, oauth_state) VALUES (?, ?, ?)"
    ).bind(sessionId, challenge.id, state).run();
    setCookie(c, "clawptcha_session", await signSessionCookie(c.env.SESSION_SIGNING_KEY, sessionId), {
      httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: 3600,
    });
    return c.redirect(authorizeUrl(c.env, state));
  }

  if (session.gh_login !== challenge.author_login) {
    return c.html(errorPage("Not your challenge",
      `This challenge belongs to @${challenge.author_login}. You are signed in as @${session.gh_login}.`), 403);
  }
  if (challenge.status === "awaiting_approval") {
    return c.html(errorPage("Awaiting approval",
      "A maintainer must approve this challenge first (`/clawptcha approve` on the PR)."));
  }
  if (challenge.status === "passed") {
    return c.html(errorPage("✅ Already passed", "You already passed this challenge. The check is green."));
  }
  // Only a `ready` challenge is takeable. Stale/closed states get an explanation
  // instead of the start page, so an author on an old link doesn't complete
  // Turnstile only to be rejected at submit time.
  if (challenge.status !== "ready") {
    return c.html(errorPage("Challenge no longer active",
      "This challenge is no longer active — a newer commit or outcome has replaced it. Check the PR for the current status."));
  }
  const cfg = resolveConfig(challenge.config_json);
  return c.html(startPage(
    `${challenge.repo_full_name}#${challenge.pr_number}`, c.env.TURNSTILE_SITE_KEY, challenge.id,
    hasHoneypotSignal(cfg)
  ));
});

app.post("/challenge/:id/start", async (c) => {
  const session = await currentSession(c);
  if (!session?.gh_login) return c.redirect(`/challenge/${c.req.param("id")}`);
  const form = await c.req.parseBody();
  const result = await startQuizAttempt(
    c.env, challengeDeps(c.env), c.req.param("id"),
    session.gh_login, String(form["cf-turnstile-response"] ?? ""),
    hasSubmittedHoneypot(form)
  );
  if (!result.ok) {
    const messages: Record<string, string> = {
      not_ready: "This challenge isn't ready (awaiting approval or already resolved).",
      cooldown: "Cooldown in effect — try again in a few minutes. You'll get a fresh quiz.",
      attempts_exhausted: "No attempts remain. A maintainer has been asked to review manually.",
      rate_limited: "Rate limit reached. Try again later.",
      generation_failed: "We couldn't generate the quiz. The check has been marked neutral — you're not blocked.",
      not_author: "Only the PR author can take this challenge.",
      not_found: "Challenge not found.",
    };
    return c.html(errorPage("Cannot start", messages[result.error] ?? result.error),
      result.error === "not_found" ? 404 : 409);
  }
  // Store active quiz id on the session row to route question/answer requests.
  await c.env.DB.prepare("UPDATE sessions SET challenge_id=? WHERE id=?")
    .bind(c.req.param("id"), session.id).run();
  setCookie(c, "clawptcha_quiz", result.quizId, {
    httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: 3600,
  });
  return c.redirect(`/challenge/${c.req.param("id")}/question`);
});

app.get("/challenge/:id/question", async (c) => {
  const session = await currentSession(c);
  const quizId = getCookie(c, "clawptcha_quiz");
  if (!session?.gh_login || !quizId) return c.redirect(`/challenge/${c.req.param("id")}`);
  const quiz = await c.env.DB.prepare(
    `SELECT q.questions_json, q.current_question, q.finished_at, ch.author_login, ch.config_json
     FROM quizzes q JOIN challenges ch ON ch.id = q.challenge_id WHERE q.id=?`
  ).bind(quizId).first<{
    questions_json: string; current_question: number; finished_at: string | null;
    author_login: string; config_json: string;
  }>();
  // The quiz cookie is a capability token, but still bind it to the signed-in
  // author — a leaked/transplanted cookie must not expose questions to others.
  if (!quiz || quiz.finished_at || quiz.author_login !== session.gh_login) {
    return c.redirect(`/challenge/${c.req.param("id")}`);
  }
  const questions = (JSON.parse(quiz.questions_json) as Quiz).questions;
  const q = questions[quiz.current_question];
  if (!q) return c.redirect(`/challenge/${c.req.param("id")}`);
  // Stamp served_at when the question page first renders — this starts the 90s
  // window (submitAnswer clears it on advance, so each question stamps fresh
  // here). COALESCE keeps the original stamp on refresh: no timer resets.
  await c.env.DB.prepare(
    "UPDATE quizzes SET question_served_at=COALESCE(question_served_at, ?) WHERE id=?"
  ).bind(new Date().toISOString(), quizId).run();
  return c.html(questionPage(
    c.req.param("id"), quiz.current_question, questions.length,
    redactForClient(q), QUESTION_TIME_LIMIT_MS,
    hasHoneypotSignal(resolveConfig(quiz.config_json))
  ));
});

app.post("/challenge/:id/answer", async (c) => {
  const session = await currentSession(c);
  const quizId = getCookie(c, "clawptcha_quiz");
  if (!session?.gh_login || !quizId) return c.redirect(`/challenge/${c.req.param("id")}`);
  // Same author binding as the question route: only the challenge author's
  // session may submit answers for this quiz.
  const owner = await c.env.DB.prepare(
    "SELECT ch.author_login FROM quizzes q JOIN challenges ch ON ch.id = q.challenge_id WHERE q.id=?"
  ).bind(quizId).first<{ author_login: string }>();
  if (!owner || owner.author_login !== session.gh_login) {
    return c.redirect(`/challenge/${c.req.param("id")}`);
  }
  const form = await c.req.parseBody({ all: true });
  const raw = form["answer"];
  const answer = (Array.isArray(raw) ? raw : raw !== undefined ? [raw] : [])
    .map((v) => parseInt(String(v), 10))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 3);
  // Hidden `qi` field says which question this answer targets; a stale or
  // missing index makes submitAnswer re-render the current question.
  const qiRaw = form["qi"];
  const qi = parseInt(String(Array.isArray(qiRaw) ? qiRaw[0] : qiRaw ?? ""), 10);
  const questionIndex = Number.isNaN(qi) ? -1 : qi;
  const telemetryRaw = form["telemetry"];
  const result = await submitAnswer(
    c.env, challengeDeps(c.env), quizId, questionIndex, answer,
    String((Array.isArray(telemetryRaw) ? telemetryRaw[0] : telemetryRaw) ?? ""),
    hasSubmittedHoneypot(form)
  );
  if ("error" in result) return c.redirect(`/challenge/${c.req.param("id")}`);
  if (!result.done) return c.redirect(`/challenge/${c.req.param("id")}/question`);
  return c.html(resultPage(
    result.passed, result.score, result.total,
    result.passed
      ? "The check is now green and an attestation was posted to the PR."
      : "Check the PR for retry availability (cooldown applies; retries get a fresh quiz)."
  ));
});

app.get("/", (c) => c.html(homePage(new URL(c.req.url).origin)));
app.get("/docs", docsAsset);
app.get("/docs/*", docsAsset);

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(sweepStaleChallenges(env, new Date()));
  },
};
