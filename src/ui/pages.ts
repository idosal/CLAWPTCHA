import type { ClientQuestion } from "../quiz/schema";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const STYLE = `
:root{
  --bg:#0b0d12; --bg2:#0e1118; --card:#141924; --card-top:#18202e;
  --line:#232c3b; --line-soft:#1b2230;
  --ink:#e9eef6; --ink-dim:#9aa7ba; --ink-faint:#6b7688;
  --brand:#ff6a45; --brand-2:#ff9a6b;
  --ok:#43d69a; --warn:#ffb44d; --crit:#ff5d5d;
  --focus:#ff6a45;
  --radius:18px; --shadow:0 24px 60px -24px rgba(0,0,0,.75), 0 2px 0 0 rgba(255,255,255,.03) inset;
  --mono:ui-monospace,"SF Mono","JetBrains Mono",Menlo,Consolas,monospace;
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
}
@media (prefers-color-scheme:light){
  :root{
    --bg:#f4f5f8; --bg2:#eef0f4; --card:#ffffff; --card-top:#ffffff;
    --line:#e5e8ee; --line-soft:#eef0f4;
    --ink:#161a22; --ink-dim:#5a6473; --ink-faint:#8b95a5;
    --shadow:0 20px 50px -28px rgba(20,30,50,.35), 0 1px 0 0 rgba(0,0,0,.02) inset;
  }
}
*{box-sizing:border-box}
html,body{margin:0}
body{
  font:400 16px/1.6 var(--sans); color:var(--ink);
  min-height:100vh; display:grid; place-items:center; padding:28px 18px;
  background:
    radial-gradient(60% 55% at 50% -8%, rgba(255,106,69,.16), transparent 62%),
    radial-gradient(circle, rgba(255,255,255,.028) 1px, transparent 1.4px) 0 0/22px 22px,
    linear-gradient(180deg, var(--bg2), var(--bg));
  background-attachment:fixed;
}
.wrap{width:100%; max-width:600px}
.card{
  position:relative; background:linear-gradient(180deg,var(--card-top),var(--card));
  border:1px solid var(--line); border-radius:var(--radius);
  box-shadow:var(--shadow); padding:30px 30px 26px;
  animation:pop .5s cubic-bezier(.2,.8,.2,1) both;
}
.card::before{ /* hairline coral top accent */
  content:""; position:absolute; inset:0 0 auto 0; height:2px; border-radius:var(--radius) var(--radius) 0 0;
  background:linear-gradient(90deg,transparent,var(--brand),transparent); opacity:.7;
}
.brand{display:flex; align-items:center; gap:11px; margin-bottom:22px}
.mark{
  width:38px; height:38px; display:grid; place-items:center; font-size:20px; border-radius:11px;
  background:radial-gradient(120% 120% at 30% 20%, rgba(255,154,107,.35), rgba(255,106,69,.12));
  border:1px solid rgba(255,106,69,.4); box-shadow:0 0 22px -6px rgba(255,106,69,.6);
}
.brand b{font-weight:750; letter-spacing:-.2px}
.brand .tag{
  margin-left:auto; font:600 10.5px/1 var(--mono); letter-spacing:.14em; text-transform:uppercase;
  color:var(--ink-faint); border:1px solid var(--line); padding:6px 9px; border-radius:999px;
}
.eyebrow{font:600 11px/1 var(--mono); letter-spacing:.16em; text-transform:uppercase; color:var(--brand); margin:0 0 10px}
h1{font-size:26px; line-height:1.2; letter-spacing:-.4px; font-weight:760; margin:0 0 12px}
.qh{font-size:21px; line-height:1.35; letter-spacing:-.3px; font-weight:680; margin:0 0 20px}
p{margin:0 0 14px; color:var(--ink)}
.dim{color:var(--ink-dim)}
.faint{color:var(--ink-faint); font-size:13.5px; line-height:1.55}
.facts{list-style:none; margin:0 0 20px; padding:0; display:grid; gap:11px}
.facts li{display:flex; gap:11px; align-items:flex-start; color:var(--ink-dim); font-size:14.5px}
.facts .b{color:var(--brand); flex:none; margin-top:1px}
.facts b{color:var(--ink); font-weight:640}

/* meta row: progress + timer */
.meta{display:flex; align-items:center; justify-content:space-between; margin-bottom:14px}
.step{font:600 11px/1 var(--mono); letter-spacing:.14em; text-transform:uppercase; color:var(--ink-faint)}
.step em{color:var(--brand); font-style:normal}
.timer{
  display:inline-flex; align-items:baseline; gap:2px; font:650 15px/1 var(--mono);
  color:var(--ink-dim); padding:6px 10px; border:1px solid var(--line); border-radius:999px;
  font-variant-numeric:tabular-nums; transition:color .3s,border-color .3s,background .3s;
}
.timer .u{font-size:11px; color:var(--ink-faint)}
.timer.warn{color:var(--warn); border-color:rgba(255,180,77,.4)}
.timer.crit{color:#fff; background:var(--crit); border-color:var(--crit); animation:pulse 1s infinite}
.tbar{height:5px; border-radius:999px; background:var(--line-soft); overflow:hidden; margin:2px 0 22px}
.tbar i{display:block; height:100%; width:100%; border-radius:999px; background:var(--ok); transition:width .25s linear, background .3s}
.tbar i.warn{background:var(--warn)} .tbar i.crit{background:var(--crit)}

/* options */
.opts{display:grid; gap:10px; margin:0 0 22px}
.opt{
  position:relative; display:flex; align-items:center; gap:13px; cursor:pointer;
  padding:15px 16px; border:1px solid var(--line); border-radius:13px; background:rgba(255,255,255,.008);
  transition:border-color .16s, background .16s, transform .08s; min-height:44px;
}
.opt:hover{border-color:var(--brand); background:rgba(255,106,69,.06)}
.opt:active{transform:translateY(1px)}
.opt input{position:absolute; opacity:0; width:0; height:0}
.mk{flex:none; width:21px; height:21px; border:2px solid var(--line); display:grid; place-items:center; transition:.16s}
.opt input[type=radio]~.mk{border-radius:50%}
.opt input[type=checkbox]~.mk{border-radius:6px}
.mk::after{content:""; width:9px; height:9px; border-radius:inherit; background:var(--brand); transform:scale(0); transition:transform .16s}
.opt:has(input:checked){border-color:var(--brand); background:rgba(255,106,69,.11)}
.opt:has(input:checked) .mk{border-color:var(--brand)}
.opt:has(input:checked) .mk::after{transform:scale(1)}
.opt:has(input:focus-visible){outline:2px solid var(--focus); outline-offset:2px}
.opt .t{font-size:15px; color:var(--ink)}

.btn{
  width:100%; font:650 15.5px/1 var(--sans); letter-spacing:.1px; color:#2a0e06;
  padding:15px 18px; border:0; border-radius:13px; cursor:pointer;
  background:linear-gradient(180deg,var(--brand-2),var(--brand));
  box-shadow:0 10px 24px -10px rgba(255,106,69,.7); transition:transform .08s, box-shadow .2s, filter .2s;
}
.btn:hover{filter:brightness(1.05); box-shadow:0 14px 30px -10px rgba(255,106,69,.85)}
.btn:active{transform:translateY(1px)}
.cf-turnstile{margin:0 0 16px; min-height:0}

/* result */
.badge{
  width:76px; height:76px; margin:4px auto 20px; border-radius:22px; display:grid; place-items:center; font-size:38px;
  animation:pop .5s cubic-bezier(.2,.8,.2,1) both .05s;
}
.badge.ok{background:radial-gradient(120% 120% at 30% 20%,rgba(67,214,154,.35),rgba(67,214,154,.1)); border:1px solid rgba(67,214,154,.5); box-shadow:0 0 40px -8px rgba(67,214,154,.55)}
.badge.no{background:radial-gradient(120% 120% at 30% 20%,rgba(255,180,77,.3),rgba(255,180,77,.08)); border:1px solid rgba(255,180,77,.45); box-shadow:0 0 40px -10px rgba(255,180,77,.4)}
.center{text-align:center}
.score{font:750 40px/1 var(--sans); letter-spacing:-1px; margin:6px 0 4px}
.score .of{color:var(--ink-faint); font-weight:600; font-size:22px}
.score.ok{color:var(--ok)} .score.no{color:var(--warn)}

.reveal{animation:rise .5s cubic-bezier(.2,.8,.2,1) both}
.card > .reveal:nth-child(1){animation-delay:.04s}
.card > .reveal:nth-child(2){animation-delay:.09s}
.card > .reveal:nth-child(3){animation-delay:.14s}
.card > .reveal:nth-child(4){animation-delay:.19s}
.card > .reveal:nth-child(5){animation-delay:.24s}
.card > .reveal:nth-child(6){animation-delay:.29s}
@keyframes pop{from{opacity:0; transform:translateY(10px) scale(.985)} to{opacity:1; transform:none}}
@keyframes rise{from{opacity:0; transform:translateY(9px)} to{opacity:1; transform:none}}
@keyframes pulse{50%{box-shadow:0 0 0 6px rgba(255,93,93,.22)}}
@media (prefers-reduced-motion:reduce){*{animation:none!important; transition:none!important}}
`;

function layout(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark light">
<title>${esc(title)} — Clawptcha</title>
<style>${STYLE}</style></head>
<body><main class="wrap">${body}</main></body></html>`;
}

const brand = (tag: string) =>
  `<div class="brand reveal"><span class="mark">🦞</span><b>Clawptcha</b><span class="tag">${esc(tag)}</span></div>`;

export function startPage(prRef: string, turnstileSiteKey: string, challengeId: string): string {
  return layout("Challenge", `
<div class="card">
  ${brand("comprehension check")}
  <p class="eyebrow reveal">Prove you get it</p>
  <h1 class="reveal">A quick check on <span style="color:var(--brand)">${esc(prRef)}</span></h1>
  <p class="dim reveal">Four short questions about <b style="color:var(--ink)">what your change does</b> — its purpose and effect. Not how it's coded.</p>
  <ul class="facts reveal">
    <li><span class="b">→</span><span>One at a time, <b>90 seconds each</b>. No going back.</span></li>
    <li><span class="b">→</span><span>Pass and we post a public note that <b>you understand this change</b>.</span></li>
    <li><span class="b">→</span><span class="faint">We record only summary timing &amp; interaction stats — never keystrokes or content — and share them with maintainers.</span></li>
  </ul>
  <form class="reveal" method="POST" action="/challenge/${esc(challengeId)}/start">
    <div class="cf-turnstile" data-sitekey="${esc(turnstileSiteKey)}"></div>
    <button class="btn" type="submit">Start the check</button>
  </form>
</div>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>`);
}

export function questionPage(
  challengeId: string, index: number, total: number, q: ClientQuestion, timeLimitMs: number
): string {
  const inputType = q.multiSelect ? "checkbox" : "radio";
  const options = q.options
    .map(
      (opt, i) =>
        `<label class="opt"><input type="${inputType}" name="answer" value="${i}"><span class="mk"></span><span class="t">${esc(opt)}</span></label>`
    )
    .join("");
  return layout(`Question ${index + 1}`, `
<div class="card">
  ${brand("challenge")}
  <div class="meta reveal">
    <span class="step">Question <em>${index + 1}</em> / ${total}</span>
    <span class="timer" id="timer" aria-live="off"><span id="tnum">${Math.ceil(timeLimitMs / 1000)}</span><span class="u">s</span></span>
  </div>
  <div class="tbar reveal"><i id="tbar"></i></div>
  <h2 class="qh reveal">${esc(q.prompt)}</h2>
  ${q.multiSelect ? '<p class="faint reveal" style="margin-top:-10px">Select all that apply.</p>' : ""}
  <form class="reveal" method="POST" action="/challenge/${esc(challengeId)}/answer" id="f">
    <div class="opts">${options}</div>
    <input type="hidden" name="qi" value="${index}">
    <input type="hidden" name="telemetry" id="telemetry">
    <button class="btn" type="submit">Submit answer</button>
  </form>
</div>
<script>
(function () {
  var LIMIT = ${timeLimitMs};
  var deadline = Date.now() + LIMIT;
  var t = { start: Date.now(), changes: 0, dist: 0, samples: 0, focusLoss: 0,
            webdriver: !!navigator.webdriver, lx: null, ly: null };
  document.addEventListener("pointermove", function (e) {
    if (t.lx !== null) t.dist += Math.hypot(e.clientX - t.lx, e.clientY - t.ly);
    t.lx = e.clientX; t.ly = e.clientY; t.samples++;
  });
  document.querySelectorAll("input[name=answer]").forEach(function (el) {
    el.addEventListener("change", function () { t.changes++; });
  });
  window.addEventListener("blur", function () { t.focusLoss++; });
  var form = document.getElementById("f");
  form.addEventListener("submit", function () {
    document.getElementById("telemetry").value = JSON.stringify({
      elapsedMs: Date.now() - t.start, answerChanges: t.changes,
      pointerDistancePx: Math.round(t.dist), pointerSamples: t.samples,
      focusLossCount: t.focusLoss, webdriver: t.webdriver
    });
  });
  var timer = document.getElementById("timer");
  var tnum = document.getElementById("tnum");
  var tbar = document.getElementById("tbar");
  (function tick() {
    var left = Math.max(0, deadline - Date.now());
    var secs = Math.ceil(left / 1000);
    tnum.textContent = secs;
    tbar.style.width = (left / LIMIT * 100) + "%";
    var warn = secs <= 30, crit = secs <= 10;
    timer.className = "timer" + (crit ? " crit" : warn ? " warn" : "");
    tbar.className = crit ? "crit" : warn ? "warn" : "";
    if (left <= 0) { form.requestSubmit(); return; }
    setTimeout(tick, 250);
  })();
})();
</script>`);
}

export function resultPage(passed: boolean, score: number, total: number, message: string): string {
  return layout(passed ? "Passed!" : "Not passed", `
<div class="card center">
  ${brand(passed ? "verified" : "not passed")}
  <div class="badge ${passed ? "ok" : "no"} reveal">${passed ? "✓" : "↻"}</div>
  <p class="eyebrow reveal" style="color:${passed ? "var(--ok)" : "var(--warn)"}">${passed ? "You're verified" : "Not this time"}</p>
  <div class="score ${passed ? "ok" : "no"} reveal">${score}<span class="of">/${total}</span></div>
  <p class="dim reveal">${esc(message)}</p>
</div>`);
}

export function errorPage(title: string, message: string): string {
  return layout(title, `
<div class="card">
  ${brand("clawptcha")}
  <h1 class="reveal">${esc(title)}</h1>
  <p class="dim reveal">${esc(message)}</p>
</div>`);
}
