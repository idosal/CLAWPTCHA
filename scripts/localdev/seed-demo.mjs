// Seed a takeable challenge + author-bound session + quiz into the LOCAL D1,
// and print the signed session cookie so you can drive the quiz UI with curl
// or a browser. Local dev only.
//
// Usage:
//   node scripts/localdev/seed-demo.mjs [quizJsonPath] > /tmp/seed.sql
//   # then: npx wrangler d1 execute clawptcha --local --file /tmp/seed.sql
//   # the signed cookie + ids are printed to stderr.
//
// SESSION_SIGNING_KEY must match .dev.vars (default below matches the sample).
import crypto from "node:crypto";
import { readFileSync } from "node:fs";

const KEY = process.env.SESSION_SIGNING_KEY || "0123456789abcdef0123456789abcdef";
const sid = "sess_localdemo";
const qid = "quiz_localdemo";
const cid = "chal_localdemo";
const author = "alice";

const defaultQuiz = {
  questions: [
    { type: "consequence_mcq", prompt: "After this change, what happens when the auth token is expired on an incoming request?", options: ["A 401 is returned before any handler runs", "The token is silently refreshed", "The request is queued for retry", "A 500 error is thrown"], correct: [0] },
    { type: "blast_radius_multi", prompt: "Which areas does this PR change the behavior of?", options: ["The login middleware", "The billing calculator", "The request logging format", "The database schema"], correct: [0, 2] },
    { type: "false_claim", prompt: "One statement about this PR is FALSE. Which?", options: ["It adds retry logic to the token check", "It changes the public API surface", "It touches the auth middleware", "It adds a unit test"], correct: [1] },
    { type: "consequence_mcq", prompt: "What is the effect on the first request after a cold deploy?", options: ["It is slightly slower while the cache warms", "It crashes", "It loses data", "No change at all"], correct: [0] },
  ],
};
const quiz = process.argv[2] ? JSON.parse(readFileSync(process.argv[2], "utf8")) : defaultQuiz;

const cookie = `${sid}.${crypto.createHmac("sha256", KEY).update(sid).digest("hex")}`;

// SQL to stdout (feed to `wrangler d1 execute --local --file`)
process.stdout.write(
  `INSERT INTO challenges (id,installation_id,repo_full_name,pr_number,head_sha,author_login,check_run_id,status,config_json) ` +
  `VALUES ('${cid}',1,'octo/demo',42,'sha_demo','${author}',999,'ready','{}');\n` +
  `INSERT INTO sessions (id,challenge_id,gh_login,created_at) ` +
  `VALUES ('${sid}','${cid}','${author}',strftime('%Y-%m-%dT%H:%M:%fZ','now'));\n` +
  `INSERT INTO quizzes (id,challenge_id,attempt_number,questions_json,current_question) ` +
  `VALUES ('${qid}','${cid}',1,'${JSON.stringify(quiz).replace(/'/g, "''")}',0);\n`
);

// Human-facing bits to stderr so stdout stays pure SQL
process.stderr.write(
  `\nchallengeId: ${cid}\nquizId:      ${qid}\nauthor:      ${author}\n` +
  `Cookie header for curl / browser:\n` +
  `  clawptcha_session=${cookie}; clawptcha_quiz=${qid}\n\n` +
  `Drive it:\n` +
  `  curl -s localhost:8787/challenge/${cid}/question -H "Cookie: clawptcha_session=${cookie}; clawptcha_quiz=${qid}"\n`
);
