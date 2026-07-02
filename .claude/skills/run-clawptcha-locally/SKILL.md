---
name: run-clawptcha-locally
description: Boot and drive Clawptcha locally (wrangler dev + local D1). Use when asked to run, test, or demo the app locally, exercise the quiz UI/challenge flow, or generate a quiz from a real diff without an Anthropic API key. Covers the parts that work without external accounts and names the one leg (GitHub check-run/attestation) that needs a real GitHub App.
---

# Run Clawptcha locally

Clawptcha is a Cloudflare Worker (Hono + D1). `wrangler dev` runs it against a
local SQLite-backed D1. The full product needs four external services — GitHub
OAuth, the GitHub Checks API, Anthropic, and Turnstile — but the entire interior
(quiz UI, grading, retention purge) is exercisable locally by seeding D1 and
forging the signed cookies. Quiz *generation* is exercisable via `claude -p`.

## 1. One-time local setup

Create `.dev.vars` (gitignored) with **known** signing/webhook secrets so you can
forge valid cookies and webhook signatures, and dummy values for the externals:

```
SESSION_SIGNING_KEY=0123456789abcdef0123456789abcdef
GITHUB_WEBHOOK_SECRET=local-webhook-secret
GITHUB_APP_ID=12345
GITHUB_PRIVATE_KEY=
GITHUB_OAUTH_CLIENT_ID=local-client-id
GITHUB_OAUTH_CLIENT_SECRET=local-client-secret
ANTHROPIC_API_KEY=sk-ant-local-none
TURNSTILE_SITE_KEY=1x00000000000000000000AA
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
```

Apply migrations to the local D1 (shares `.wrangler/state` with `wrangler dev`):

```bash
npx wrangler d1 migrations apply clawptcha --local
```

## 2. Boot and smoke-test (no external accounts needed)

```bash
npx wrangler dev --port 8787 --local   # backgrounded; wait for "Ready on http://localhost:8787"
curl -s localhost:8787/                # -> "clawptcha: a captcha for GitHub contributions"
```

Webhook HMAC verification, live:

```bash
BODY='{"action":"labeled","installation":{"id":1}}'
SIG="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac local-webhook-secret | sed 's/^.* //')"
curl -s -o /dev/null -w "%{http_code}\n" -XPOST localhost:8787/webhook -H "x-github-event: pull_request" -d "$BODY"                                  # 401 (unsigned)
curl -s -o /dev/null -w "%{http_code}\n" -XPOST localhost:8787/webhook -H "x-github-event: pull_request" -H "x-hub-signature-256: $SIG" -d "$BODY"    # 200
```

## 3. Drive the quiz UI (seed D1, forge cookies)

OAuth + Turnstile + LLM gate the *start* of a quiz; skip them by seeding a
`ready` challenge + an author-bound session + a quiz row directly:

```bash
node scripts/localdev/seed-demo.mjs > /tmp/seed.sql   # prints cookie+ids to stderr
npx wrangler d1 execute clawptcha --local --file /tmp/seed.sql
```

Then drive the real routes with the printed `Cookie` header. IMPORTANT: render
each question (GET /question) **before** answering it — the GET stamps the 90s
server-side clock (submitAnswer nulls it on advance), so answering without the
GET is (correctly) recorded as a timeout:

```bash
CK='clawptcha_session=<from stderr>; clawptcha_quiz=quiz_localdemo'
B=localhost:8787/challenge/chal_localdemo
curl -s "$B/question" -H "Cookie: $CK" | grep -c '"correct"'   # 0 — answers never sent to client
curl -s -XPOST "$B/answer" -H "Cookie: $CK" --data-urlencode answer=0 --data-urlencode qi=0 --data-urlencode 'telemetry={}'
```

Repeat GET-then-POST for qi=1,2,3. After the last answer, inspect D1:
`score`, `challenge.status` → `passed`, and `questions_json` → `{"questions":[]}`
(retention purge). The final POST returns 500 locally — that's the GitHub
check-run/attestation leg (see §5), not a grading failure; DB state commits first.

## 4. Generate a quiz from a real diff via `claude -p` (no API key)

The production model call uses `output_config.format` (structured outputs) to
pin the schema. `claude -p` has no such channel, so the committed harness inlines
`QUIZ_JSON_SCHEMA` into the prompt — the fair local equivalent. It drives the
REAL `src/quiz/generate.ts` (retry + `validateQuiz`), backed by `claude -p`:

```bash
gh pr diff <N> --repo <owner/repo> > /tmp/real.diff
gh pr view <N> --repo <owner/repo> --json title,body > /tmp/real.meta.json
npx --no-install tsx scripts/localdev/local-quizgen.mts /tmp/real.diff /tmp/real.meta.json /tmp/raw.txt
```

Requires `tsx` (`npm install --no-save tsx`). Prints a schema-valid 4-question
quiz. If it prints validation errors, the model free-formed field names — that
is exactly why production uses structured outputs; keep the schema in the prompt.

## 5. The one leg that needs a real GitHub App

Posting the check run + attestation comment uses GitHub's **Checks API**, which
requires an App-minted installation token — `gh`'s user auth cannot mint one.
To test it, create a GitHub App (checks:write, pull_requests:write, contents:read),
install it on a repo, put its `GITHUB_APP_ID` + PKCS#8 `GITHUB_PRIVATE_KEY` in
`.dev.vars`, seed a challenge whose `repo_full_name`/`pr_number`/`head_sha`/
`installation_id` match a real open PR, and drive the quiz to completion — the
resolution leg then calls GitHub for real. Inbound webhooks (auto-creating
challenges on PR open) additionally need a public tunnel to `localhost:8787`.

## Cleanup

`pkill -f "wrangler dev"`. `.dev.vars`, `.wrangler/`, and `node_modules/` are
gitignored; nothing here touches tracked source.
