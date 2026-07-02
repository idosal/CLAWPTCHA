import { Hono, type Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import Anthropic from "@anthropic-ai/sdk";
import type { Env, Challenge } from "./types";
import { verifyWebhookSignature } from "./github/webhook";
import { handlePullRequestEvent, handleIssueCommentEvent } from "./github/events";
import { apiForInstallation, onChallengeResolved, sweepStaleChallenges } from "./resolve";
import { getChallenge, randomToken } from "./store";
import { signSessionCookie, verifySessionCookie } from "./ui/session";
import { authorizeUrl, exchangeCodeForLogin } from "./github/oauth";
import { startPage, questionPage, resultPage, errorPage } from "./ui/pages";
import { startQuizAttempt, submitAnswer, type ChallengeDeps } from "./challenge";
import { generateQuiz } from "./quiz/generate";
import { redactForClient, type Quiz } from "./quiz/schema";
import { QUESTION_TIME_LIMIT_MS } from "./quiz/grade";

const app = new Hono<{ Bindings: Env }>();

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

function challengeDeps(env: Env): ChallengeDeps {
  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return {
    now: () => new Date(),
    async fetchPrContext(ch: Challenge) {
      const api = await apiForInstallation(env, ch.installation_id);
      const [diff, pr, files] = await Promise.all([
        api.getPrDiff(ch.repo_full_name, ch.pr_number),
        api.getPr(ch.repo_full_name, ch.pr_number),
        api.listPrFiles(ch.repo_full_name, ch.pr_number),
      ]);
      return { diff, title: pr.title, body: pr.body, files };
    },
    async generateQuiz(ctx, cfg) {
      return generateQuiz(
        anthropic as any, env.CLAUDE_MODEL,
        ctx.diff, ctx.title, ctx.body, ctx.files, cfg.max_context_tokens
      );
    },
    async verifyTurnstile(token: string) {
      if (!token) return false;
      const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: token }),
      });
      if (!res.ok) return false;
      return ((await res.json()) as { success: boolean }).success;
    },
    async onChallengeResolved(r) {
      await onChallengeResolved(env, r);
    },
  };
}

// ---------- OAuth ----------
app.get("/oauth/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state) return c.html(errorPage("OAuth error", "Missing code or state."), 400);
  const session = await c.env.DB.prepare("SELECT * FROM sessions WHERE oauth_state=?")
    .bind(state).first<{ id: string; challenge_id: string }>();
  if (!session) return c.html(errorPage("OAuth error", "Unknown or expired state."), 400);
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
    return c.html(resultPage(true, 0, 0, "You already passed this challenge. The check is green."));
  }
  return c.html(startPage(
    `${challenge.repo_full_name}#${challenge.pr_number}`, c.env.TURNSTILE_SITE_KEY, challenge.id
  ));
});

app.post("/challenge/:id/start", async (c) => {
  const session = await currentSession(c);
  if (!session?.gh_login) return c.redirect(`/challenge/${c.req.param("id")}`);
  const form = await c.req.parseBody();
  const result = await startQuizAttempt(
    c.env, challengeDeps(c.env), c.req.param("id"),
    session.gh_login, String(form["cf-turnstile-response"] ?? "")
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
    return c.html(errorPage("Cannot start", messages[result.error] ?? result.error), 409);
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
    `SELECT q.questions_json, q.current_question, q.finished_at, ch.author_login
     FROM quizzes q JOIN challenges ch ON ch.id = q.challenge_id WHERE q.id=?`
  ).bind(quizId).first<{
    questions_json: string; current_question: number; finished_at: string | null; author_login: string;
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
    redactForClient(q), QUESTION_TIME_LIMIT_MS
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
    String((Array.isArray(telemetryRaw) ? telemetryRaw[0] : telemetryRaw) ?? "")
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

app.get("/", (c) => c.text("clawptcha: a captcha for GitHub contributions"));

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(sweepStaleChallenges(env, new Date()));
  },
};
