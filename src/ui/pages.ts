import type { ClientQuestion } from "../quiz/schema";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const HONEYPOT_FIELD_NAME = "contact_url";

const questionMeta: Record<ClientQuestion["type"], { label: string; hint: string }> = {
  consequence_mcq: {
    label: "Consequence check",
    hint: "Choose the outcome that follows from the PR.",
  },
  blast_radius_multi: {
    label: "Blast radius",
    hint: "Select every affected area.",
  },
  false_claim: {
    label: "False claim",
    hint: "Pick the statement that misrepresents the change.",
  },
};

const choiceLabels = ["A", "B", "C", "D"] as const;

const STYLE = `
:root{
  color-scheme:light dark;
  --bg:#f6f7f8;
  --bg:oklch(0.972 0.004 245);
  --canvas:#ffffff;
  --canvas:oklch(1 0 0);
  --panel:#fbfcfd;
  --panel:oklch(0.99 0.003 245);
  --panel-2:#f1f4f6;
  --panel-2:oklch(0.955 0.007 245);
  --bar:#11161d;
  --bar:oklch(0.19 0.022 245);
  --bar-2:#171e27;
  --bar-2:oklch(0.235 0.026 245);
  --ink:#141820;
  --ink:oklch(0.22 0.02 245);
  --ink-dim:#4f5968;
  --ink-dim:oklch(0.45 0.025 245);
  --ink-faint:#6d7786;
  --ink-faint:oklch(0.53 0.022 245);
  --ink-on-dark:#f4f7fa;
  --ink-on-dark:oklch(0.965 0.006 245);
  --ink-dark-dim:#b8c2cf;
  --ink-dark-dim:oklch(0.79 0.024 245);
  --line:#dfe4ea;
  --line:oklch(0.9 0.009 245);
  --line-strong:#c6ced8;
  --line-strong:oklch(0.82 0.015 245);
  --brand:#ff5f3f;
  --brand:oklch(0.69 0.2 35);
  --brand-soft:#ffe1d9;
  --brand-soft:oklch(0.91 0.055 35);
  --brand-ink:#361004;
  --brand-ink:oklch(0.21 0.067 35);
  --accent:#b43a20;
  --accent:oklch(0.48 0.155 35);
  --ok:#21a66a;
  --ok:oklch(0.63 0.16 157);
  --ok-soft:#ddf7ea;
  --ok-soft:oklch(0.94 0.046 157);
  --warn:#b56d00;
  --warn:oklch(0.58 0.13 68);
  --warn-soft:#fff1d3;
  --warn-soft:oklch(0.94 0.06 78);
  --crit:#d93636;
  --crit:oklch(0.58 0.2 25);
  --crit-soft:#ffe0df;
  --crit-soft:oklch(0.92 0.06 24);
  --info:#4169a8;
  --info:oklch(0.52 0.105 255);
  --info-soft:#e4ecfb;
  --info-soft:oklch(0.93 0.035 255);
  --focus:#ff8a70;
  --focus:oklch(0.78 0.14 35);
  --radius:16px;
  --radius-sm:10px;
  --ease:cubic-bezier(.22,1,.36,1);
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  --mono:ui-monospace,"SF Mono","JetBrains Mono",Menlo,Consolas,monospace;
}
@media (prefers-color-scheme:dark){
  :root{
    --bg:#0e1116;
    --bg:oklch(0.16 0.018 245);
    --canvas:#151a22;
    --canvas:oklch(0.22 0.022 245);
    --panel:#181f28;
    --panel:oklch(0.25 0.025 245);
    --panel-2:#202936;
    --panel-2:oklch(0.31 0.028 245);
    --ink:#f2f5f8;
    --ink:oklch(0.955 0.006 245);
    --ink-dim:#c2cbd6;
    --ink-dim:oklch(0.81 0.02 245);
    --ink-faint:#8f9bad;
    --ink-faint:oklch(0.66 0.025 245);
    --line:#303b49;
    --line:oklch(0.37 0.026 245);
    --line-strong:#4a5869;
    --line-strong:oklch(0.48 0.03 245);
    --brand-soft:#3a211d;
    --brand-soft:oklch(0.29 0.055 35);
    --accent:#ff9a84;
    --accent:oklch(0.79 0.125 35);
    --ok-soft:#19362a;
    --warn-soft:#3a2f18;
    --crit-soft:#3a2022;
    --info-soft:#1d2b42;
  }
}
*{box-sizing:border-box}
html,body{margin:0}
body{
  min-height:100vh;
  margin:0;
  padding:24px;
  background:var(--bg);
  color:var(--ink);
  font:400 1rem/1.55 var(--sans);
  font-kerning:normal;
}
a{color:inherit}
button,input{font:inherit}
.wrap{width:100%; max-width:1180px; margin:auto}

.site-body{
  padding:0;
  overflow-x:hidden;
  background:#f3f7f5;
  color:#101816;
}
.site-page{
  min-height:100vh;
  overflow-x:hidden;
  color:#101816;
  font:400 1rem/1.55 var(--sans);
}
.claw-shell{
  min-height:100vh;
  overflow-x:hidden;
  background:#f3f7f5;
  color:#101816;
}
.claw-shell *{
  min-width:0;
  max-width:100%;
}
.claw-top{
  width:min(1120px,calc(100% - 40px));
  min-height:66px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:18px;
  margin:0 auto;
  border-bottom:2px solid #101816;
}
.claw-brand{
  display:inline-flex;
  align-items:center;
  gap:10px;
  color:#101816;
  font-weight:850;
  text-decoration:none;
}
.claw-mark{
  width:34px;
  height:34px;
  display:grid;
  place-items:center;
  border:2px solid #101816;
  border-radius:8px;
  background:#ff6f4d;
  box-shadow:5px 5px 0 #d8f35f;
  color:#101816;
  font:900 .92rem/1 var(--mono);
}
.claw-links{
  display:flex;
  gap:18px;
  color:#293834;
  font-size:.94rem;
  font-weight:750;
}
.claw-links a{text-decoration:none}
.claw-links a:hover{text-decoration:underline}
.claw-hero{
  width:min(1120px,calc(100% - 40px));
  display:grid;
  grid-template-columns:minmax(0,1fr) minmax(340px,430px);
  gap:40px;
  align-items:center;
  margin:0 auto;
  padding:44px 0 34px;
}
.claw-copy{min-width:0}
.claw-kicker{
  display:inline-flex;
  align-items:center;
  gap:10px;
  margin:0 0 16px;
  color:#5e3c76;
  font:850 .94rem/1.25 var(--sans);
}
.claw-kicker::before{
  content:"";
  width:10px;
  height:10px;
  border-radius:999px;
  background:#5e3c76;
}
.claw-copy h1{
  max-width:9ch;
  margin:0;
  color:#101816;
  font-size:clamp(3.4rem,7vw,5.9rem);
  line-height:.9;
  font-weight:900;
  letter-spacing:0;
  text-wrap:balance;
}
.claw-lead{
  max-width:48ch;
  margin:18px 0 0;
  color:#2f403b;
  font-size:1.22rem;
  line-height:1.42;
}
.claw-lead b{
  color:#101816;
  font-weight:850;
}
.claw-actions{
  display:flex;
  flex-wrap:wrap;
  gap:10px;
  margin-top:24px;
}
.claw-button{
  min-height:44px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  border:2px solid #101816;
  border-radius:7px;
  padding:0 16px;
  background:#fffdfa;
  color:#101816;
  font-weight:850;
  text-decoration:none;
  box-shadow:3px 3px 0 #101816;
}
.claw-button.primary{
  background:#101816;
  color:#fffdfa;
  box-shadow:3px 3px 0 #d8f35f;
}
@media (hover:hover) and (pointer:fine){
  .claw-button:hover{transform:translateY(-1px)}
}
.claw-button:active{transform:translateY(1px); box-shadow:1px 1px 0 #101816}
.claw-button.primary:active{box-shadow:1px 1px 0 #d8f35f}
.claw-button:focus-visible,.claw-links a:focus-visible{
  outline:3px solid #5e3c76;
  outline-offset:3px;
}
.policy-receipt{
  position:relative;
  min-width:0;
  padding:0;
  border:2px solid #101816;
  border-radius:10px;
  background:#fffdfa;
  box-shadow:10px 10px 0 #d8f35f;
  overflow:hidden;
}
.policy-receipt::before{
  content:"Required";
  position:absolute;
  top:14px;
  right:16px;
  border:1px solid #101816;
  border-radius:999px;
  padding:5px 9px;
  color:#101816;
  background:#d8f35f;
  font:850 .72rem/1 var(--sans);
  text-transform:uppercase;
}
.receipt-head{
  display:flex;
  align-items:flex-start;
  gap:12px;
  padding:14px 120px 14px 16px;
  border-bottom:2px solid #101816;
}
.receipt-dot{
  width:26px;
  height:26px;
  flex:none;
  display:grid;
  place-items:center;
  border-radius:999px;
  border:2px solid #101816;
  background:#d8f35f;
  color:#101816;
  font:900 .9rem/1 var(--sans);
}
.receipt-head strong{
  display:block;
  font-size:1rem;
  line-height:1.15;
}
.receipt-head span:not(.receipt-dot){
  display:block;
  margin-top:3px;
  color:#455852;
  font-size:.86rem;
  font-weight:650;
}
.receipt-title{
  max-width:11em;
  margin:18px 16px 14px;
  color:#101816;
  font-size:1.65rem;
  line-height:1.05;
  font-weight:900;
  letter-spacing:0;
}
.receipt-lines{
  display:grid;
  margin:0 16px;
  border:1px solid #101816;
  border-radius:7px;
  overflow:hidden;
}
.receipt-line{
  display:grid;
  grid-template-columns:96px minmax(0,1fr);
  gap:12px;
  padding:10px 12px;
  border-top:1px solid #101816;
  background:#f3f7f5;
}
.receipt-line:first-child{border-top:0}
.receipt-line b{
  color:#5e3c76;
  font:900 .78rem/1.25 var(--mono);
  text-transform:uppercase;
}
.receipt-line span{
  color:#101816;
  font-weight:740;
}
.receipt-foot{
  display:flex;
  align-items:center;
  gap:8px;
  margin:14px 16px 16px;
  color:#2f403b;
  font-weight:700;
}
.receipt-foot::before{
  content:"";
  width:12px;
  height:12px;
  flex:none;
  border:2px solid #101816;
  border-radius:999px;
  background:#d8f35f;
}
.policy-strip{
  width:min(1120px,calc(100% - 40px));
  display:grid;
  grid-template-columns:repeat(4,minmax(0,1fr));
  margin:0 auto 44px;
  border:2px solid #101816;
  border-radius:10px;
  overflow:hidden;
  background:#fffdfa;
}
.policy-chip{
  min-width:0;
  padding:16px;
  border-left:2px solid #101816;
}
.policy-chip:first-child{border-left:0}
.policy-chip b{
  display:block;
  color:#101816;
  font-size:1rem;
  line-height:1.2;
}
.policy-chip span{
  display:block;
  margin-top:5px;
  color:#455852;
  font-size:.92rem;
  line-height:1.35;
}
.claw-section{
  width:min(1120px,calc(100% - 40px));
  display:grid;
  grid-template-columns:minmax(0,.75fr) minmax(280px,.42fr);
  gap:34px;
  align-items:start;
  margin:0 auto;
  padding:38px 0;
  border-top:2px solid #101816;
}
.claw-section h2{
  max-width:16ch;
  margin:0;
  color:#101816;
  font-size:2.35rem;
  line-height:1.02;
  font-weight:900;
  letter-spacing:0;
  text-wrap:balance;
}
.claw-section p{
  max-width:62ch;
  margin:12px 0 0;
  color:#2f403b;
  font-size:1.04rem;
}
.install-ticket{
  display:grid;
  gap:12px;
  padding:16px;
  border:2px solid #101816;
  border-radius:10px;
  background:#fffdfa;
  box-shadow:6px 6px 0 #ff6f4d;
}
.install-ticket h3{
  margin:0;
  color:#101816;
  font-size:1.1rem;
}
.install-ticket code{
  display:block;
  overflow:auto;
  padding:12px;
  border-radius:7px;
  background:#101816;
  color:#d8f35f;
  font:750 .88rem/1.45 var(--mono);
}
.install-ticket p{
  margin:0;
  color:#455852;
  font-size:.95rem;
}
.install-mode{
  display:grid;
  gap:3px;
  padding:10px 0;
  border-top:1px solid #101816;
}
.install-mode b{
  color:#101816;
  font-size:.98rem;
}
.install-mode span{
  color:#455852;
  font-size:.92rem;
  line-height:1.35;
}
.claw-footer{
  width:min(1120px,calc(100% - 40px));
  display:flex;
  justify-content:space-between;
  gap:16px;
  margin:0 auto;
  padding:22px 0 34px;
  border-top:2px solid #101816;
  color:#455852;
  font-size:.94rem;
}
@media (max-width:860px){
  .claw-hero,.claw-section{
    grid-template-columns:1fr;
  }
  .policy-strip{
    grid-template-columns:repeat(2,minmax(0,1fr));
  }
  .policy-chip:nth-child(3){
    border-left:0;
    border-top:2px solid #101816;
  }
  .policy-chip:nth-child(4){
    border-top:2px solid #101816;
  }
}
@media (max-width:560px){
  .claw-shell{padding-right:24px}
  .claw-top,.claw-hero,.policy-strip,.claw-section,.claw-footer{
    width:auto;
    max-width:none;
    margin-left:16px;
    margin-right:0;
  }
  .claw-top{min-height:62px}
  .claw-links{display:none}
  .claw-hero{
    gap:28px;
    padding:30px 0 28px;
  }
  .claw-copy h1{
    width:100%;
    max-width:100%;
    font-size:3rem;
    overflow-wrap:anywhere;
  }
  .claw-lead{
    width:100%;
    max-width:100%;
    font-size:1rem;
    overflow-wrap:anywhere;
  }
  .claw-kicker{
    gap:8px;
    font-size:.9rem;
  }
  .claw-kicker::before{
    width:9px;
    height:9px;
  }
  .claw-actions{
    display:grid;
    width:320px;
    max-width:calc(100vw - 56px);
  }
  .claw-button{
    width:100%;
    max-width:100%;
  }
  .policy-receipt{
    width:320px;
    max-width:calc(100vw - 56px);
    padding:0;
    box-shadow:none;
  }
  .policy-receipt::before{
    top:14px;
    right:14px;
    bottom:auto;
    transform:none;
  }
  .receipt-head{
    padding-right:108px;
  }
  .receipt-title{font-size:1.55rem}
  .receipt-line{
    grid-template-columns:1fr;
    gap:4px;
  }
  .receipt-line span,
  .receipt-foot,
  .policy-chip span,
  .claw-section p,
  .install-ticket p{
    overflow-wrap:anywhere;
  }
  .policy-strip{
    grid-template-columns:1fr;
    margin-bottom:30px;
  }
  .policy-chip{
    border-left:0;
    border-top:2px solid #101816;
    padding:14px;
  }
  .policy-chip:first-child{border-top:0}
  .claw-section{
    gap:18px;
    padding:30px 0;
  }
  .claw-section h2{font-size:2rem}
  .install-ticket code{
    white-space:pre-wrap;
    overflow-wrap:anywhere;
  }
  .claw-footer{flex-direction:column}
}
.app{
  min-height:700px;
  overflow:hidden;
  border:1px solid var(--line);
  border-radius:var(--radius);
  background:var(--canvas);
}
.commandbar{
  min-height:72px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:18px;
  padding:14px 20px;
  background:linear-gradient(180deg,var(--bar-2),var(--bar));
  color:var(--ink-on-dark);
}
.brand-lockup,.command-context,.command-meta{
  display:flex;
  align-items:center;
  min-width:0;
}
.brand-lockup{gap:12px}
.mark{
  width:36px;
  height:36px;
  flex:none;
  display:grid;
  place-items:center;
  border-radius:10px;
  background:var(--brand);
  color:var(--brand-ink);
  font-weight:850;
  line-height:1;
}
.brand-name{
  font-size:1.08rem;
  font-weight:780;
  letter-spacing:0;
}
.command-context{
  flex:1;
  gap:14px;
  color:var(--ink-dark-dim);
}
.command-sep{
  width:1px;
  height:28px;
  background:color-mix(in oklch,var(--ink-on-dark) 16%,transparent);
}
.command-title{
  color:var(--ink-on-dark);
  font-weight:650;
  white-space:nowrap;
}
.command-ref{
  min-width:0;
  overflow:hidden;
  color:var(--ink-dark-dim);
  font:650 .9rem/1.2 var(--mono);
  text-overflow:ellipsis;
  white-space:nowrap;
}
.command-meta{
  gap:12px;
  color:var(--ink-dark-dim);
  font-size:.94rem;
}
.command-pill{
  display:inline-flex;
  align-items:center;
  gap:8px;
  min-height:34px;
  padding:0 11px;
  border:1px solid color-mix(in oklch,var(--ink-on-dark) 18%,transparent);
  border-radius:999px;
  color:var(--ink-on-dark);
  background:color-mix(in oklch,var(--ink-on-dark) 4%,transparent);
  white-space:nowrap;
}
.seal{
  width:18px;
  height:18px;
  flex:none;
  border:1.5px solid currentColor;
  border-radius:6px 6px 8px 8px;
  display:inline-grid;
  place-items:center;
  font-size:.74rem;
  line-height:1;
}
.console{
  display:grid;
  grid-template-columns:minmax(0,1fr) 360px;
  min-height:628px;
}
.workspace{
  min-width:0;
  display:flex;
  flex-direction:column;
  padding:42px 44px 0;
}
.context-panel{
  display:flex;
  flex-direction:column;
  gap:18px;
  padding:34px 28px;
  border-left:1px solid var(--line);
  background:var(--panel);
}
.prelude{
  max-width:760px;
  margin:auto 0;
  padding-bottom:44px;
}
.kicker-row{
  display:flex;
  align-items:center;
  flex-wrap:wrap;
  gap:10px;
  margin-bottom:20px;
}
.pill{
  display:inline-flex;
  align-items:center;
  min-height:30px;
  padding:0 11px;
  border-radius:999px;
  background:var(--brand-soft);
  color:var(--accent);
  font-weight:750;
}
.ref{
  overflow-wrap:anywhere;
  color:var(--ink-dim);
  font:650 .9rem/1.3 var(--mono);
}
h1,h2,h3,p{margin:0}
h1{
  max-width:13em;
  font-size:2.45rem;
  line-height:1.08;
  font-weight:790;
  letter-spacing:0;
  text-wrap:balance;
}
.lead{
  max-width:65ch;
  margin-top:18px;
  color:var(--ink-dim);
  font-size:1.04rem;
  text-wrap:pretty;
}
.lead b{color:var(--ink); font-weight:730}
.rail{
  display:grid;
  grid-template-columns:repeat(var(--steps),1fr);
  gap:0;
  position:relative;
  margin:0 0 30px;
  padding:0;
  list-style:none;
}
.rail::before,.rail::after{
  content:"";
  position:absolute;
  left:14px;
  right:14px;
  top:14px;
  height:3px;
  border-radius:999px;
}
.rail::before{background:var(--line)}
.rail::after{
  right:auto;
  width:calc(100% - 28px);
  background:var(--brand);
  transform:scaleX(var(--rail-scale));
  transform-origin:left center;
  transition:transform .25s linear;
}
.rail li{
  position:relative;
  display:flex;
  flex-direction:column;
  align-items:center;
  gap:8px;
  color:var(--ink-faint);
  font-size:.84rem;
  font-weight:650;
}
.rail b{
  z-index:1;
  width:30px;
  height:30px;
  display:grid;
  place-items:center;
  border:1px solid var(--line-strong);
  border-radius:999px;
  background:var(--canvas);
  color:var(--ink-faint);
  font:800 .8rem/1 var(--mono);
}
.rail li.done b{
  border-color:color-mix(in oklch,var(--ok) 55%,var(--line));
  background:var(--ok-soft);
  color:var(--ok);
}
.rail li.active{color:var(--ink)}
.rail li.active b{
  border-color:var(--brand);
  background:var(--brand);
  color:var(--brand-ink);
}
.question-top{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:18px;
  margin-bottom:18px;
}
.step{
  color:var(--ink-dim);
  font-weight:750;
}
.step em{
  color:var(--accent);
  font-style:normal;
}
.timer{
  flex:none;
  min-width:86px;
  display:inline-flex;
  justify-content:center;
  align-items:baseline;
  gap:3px;
  padding:9px 13px;
  border:1px solid var(--line-strong);
  border-radius:999px;
  background:var(--panel);
  color:var(--ink);
  font:800 1rem/1 var(--mono);
  font-variant-numeric:tabular-nums;
  transition:color .2s var(--ease),border-color .2s var(--ease),background .2s var(--ease);
}
.timer .u{color:var(--ink-faint); font-size:.76rem}
.timer.warn{
  border-color:color-mix(in oklch,var(--warn) 55%,var(--line));
  background:var(--warn-soft);
  color:var(--warn);
}
.timer.crit{
  border-color:var(--crit);
  background:var(--crit);
  color:white;
}
.timer.crit .u{color:color-mix(in oklch,white 76%,var(--crit))}
.question-type{
  margin-bottom:12px;
  color:var(--accent);
  font-weight:770;
}
.qh{
  max-width:28em;
  color:var(--ink);
  font-size:1.75rem;
  line-height:1.2;
  font-weight:780;
  letter-spacing:0;
  text-wrap:balance;
}
.hint{
  max-width:68ch;
  margin-top:13px;
  color:var(--ink-dim);
  font-size:.98rem;
  text-wrap:pretty;
}
.answer-form{
  display:flex;
  flex:1;
  flex-direction:column;
  position:relative;
  margin-top:30px;
}
.opts{
  display:grid;
  gap:12px;
  margin:0;
  padding:0 0 26px;
  border:0;
}
.sr-only{
  position:absolute;
  width:1px;
  height:1px;
  overflow:hidden;
  clip:rect(0,0,0,0);
  white-space:nowrap;
}
.honeypot-field{
  position:absolute;
  left:-10000px;
  top:auto;
  width:1px;
  height:1px;
  overflow:hidden;
  opacity:0;
  pointer-events:none;
}
.honeypot-field input{
  width:1px;
  height:1px;
}
.opt{
  position:relative;
  display:grid;
  grid-template-columns:38px minmax(0,1fr);
  gap:15px;
  align-items:center;
  min-height:64px;
  padding:13px 16px;
  border:1px solid var(--line);
  border-radius:var(--radius-sm);
  background:var(--canvas);
  color:var(--ink);
  cursor:pointer;
  transition:border-color .16s var(--ease),background .16s var(--ease),transform .1s var(--ease);
}
@media (hover:hover){
  .opt:hover{
    border-color:color-mix(in oklch,var(--brand) 55%,var(--line-strong));
    background:color-mix(in oklch,var(--brand-soft) 45%,var(--canvas));
  }
}
.opt:active{transform:translateY(1px)}
.opt input{
  position:absolute;
  opacity:0;
  width:0;
  height:0;
}
.choice-letter{
  width:34px;
  height:34px;
  display:grid;
  place-items:center;
  border:1px solid var(--line-strong);
  border-radius:9px;
  color:var(--ink-dim);
  background:var(--panel);
  font:800 .86rem/1 var(--mono);
}
.opt input[type=radio]~.choice-letter{border-radius:999px}
.opt:has(input:checked){
  border-color:var(--brand);
  background:color-mix(in oklch,var(--brand-soft) 64%,var(--canvas));
}
.opt:has(input:checked) .choice-letter{
  border-color:var(--brand);
  background:var(--brand);
  color:var(--brand-ink);
}
.opt .t{
  min-width:0;
  overflow-wrap:anywhere;
  font-size:1rem;
}
.actionbar{
  position:sticky;
  bottom:0;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:18px;
  margin:0 -44px;
  padding:18px 44px;
  border-top:1px solid var(--line);
  background:color-mix(in oklch,var(--canvas) 96%,transparent);
}
.choice-status{
  min-width:0;
  color:var(--ink-faint);
  font-size:.92rem;
}
.action-group{
  display:flex;
  align-items:center;
  gap:12px;
}
.btn,.btn-secondary{
  min-height:48px;
  border-radius:var(--radius-sm);
  cursor:pointer;
  font-weight:760;
  transition:transform .12s var(--ease),filter .18s var(--ease),background .18s var(--ease),border-color .18s var(--ease),opacity .18s var(--ease);
}
.btn{
  min-width:190px;
  border:0;
  padding:0 20px;
  background:var(--brand);
  color:var(--brand-ink);
  box-shadow:0 6px 8px -7px color-mix(in oklch,var(--brand) 80%,black);
}
.btn-secondary{
  border:1px solid var(--line-strong);
  padding:0 16px;
  background:var(--canvas);
  color:var(--ink);
}
@media (hover:hover){
  .btn:hover{filter:brightness(1.04)}
  .btn-secondary:hover{border-color:var(--ink-faint); background:var(--panel-2)}
}
.btn:active,.btn-secondary:active{transform:translateY(1px)}
.btn:disabled{
  cursor:not-allowed;
  opacity:.48;
  filter:saturate(.75);
}
.btn:focus-visible,.btn-secondary:focus-visible,.opt:has(input:focus-visible){
  outline:3px solid var(--focus);
  outline-offset:3px;
}
.start-actions{
  display:flex;
  flex-wrap:wrap;
  position:relative;
  gap:12px;
  margin-top:30px;
}
.turnstile-box{
  position:relative;
  min-height:76px;
  min-width:min(100%,320px);
  display:flex;
  align-items:center;
  justify-content:center;
  padding:10px;
  border:1px solid var(--line);
  border-radius:var(--radius-sm);
  background:var(--panel);
}
.cf-turnstile{
  position:relative;
  z-index:1;
  min-height:0;
}
.turnstile-fallback{
  position:absolute;
  inset:0;
  display:grid;
  place-items:center;
  padding:12px;
  color:var(--ink-faint);
  font-size:.9rem;
  text-align:center;
}
.turnstile-box:has(.cf-turnstile iframe) .turnstile-fallback{display:none}
.privacy-note{
  display:grid;
  gap:10px;
  max-width:68ch;
  margin-top:20px;
  padding:14px 15px;
  border:1px solid var(--line);
  border-radius:var(--radius-sm);
  background:var(--panel);
  color:var(--ink-dim);
  font-size:.94rem;
}
.privacy-note b{
  display:block;
  color:var(--ink);
  font-weight:760;
}
.privacy-note a{
  color:var(--accent);
  font-weight:720;
}
.consent-check{
  display:grid;
  grid-template-columns:22px minmax(0,1fr);
  gap:10px;
  align-items:start;
  min-width:min(100%,520px);
  padding:13px 14px;
  border:1px solid var(--line);
  border-radius:var(--radius-sm);
  background:var(--canvas);
  color:var(--ink-dim);
  cursor:pointer;
}
.consent-check input{
  width:18px;
  height:18px;
  margin:2px 0 0;
  accent-color:var(--brand);
}
.consent-check span{
  overflow-wrap:anywhere;
}
.consent-check strong{
  display:block;
  color:var(--ink);
  font-weight:760;
}
.consent-check small{
  display:block;
  margin-top:3px;
  color:var(--ink-faint);
  font-size:.86rem;
  line-height:1.38;
}
.consent-check:has(input:focus-visible){
  outline:3px solid var(--focus);
  outline-offset:3px;
}
.form-error{
  width:100%;
  max-width:68ch;
  padding:11px 13px;
  border:1px solid color-mix(in oklch,var(--warn) 50%,var(--line));
  border-radius:var(--radius-sm);
  background:var(--warn-soft);
  color:var(--warn);
  font-size:.92rem;
  font-weight:690;
}
.context-tabs{
  display:flex;
  align-items:center;
  gap:18px;
  border-bottom:1px solid var(--line);
}
.context-tab{
  padding:0 0 10px;
  border-bottom:2px solid transparent;
  color:var(--ink-dim);
  font-weight:680;
}
.context-tab.active{
  border-color:var(--brand);
  color:var(--ink);
}
.context-section{
  display:grid;
  gap:12px;
}
.context-section h2,.context-section h3{
  color:var(--ink);
  font-size:1rem;
  font-weight:780;
}
.info-list{
  display:grid;
  gap:10px;
}
.info-item{
  display:grid;
  grid-template-columns:28px minmax(0,1fr);
  gap:10px;
  align-items:start;
  color:var(--ink-dim);
  font-size:.94rem;
}
.info-icon{
  width:28px;
  height:28px;
  display:grid;
  place-items:center;
  border:1px solid var(--line);
  border-radius:9px;
  background:var(--canvas);
  color:var(--accent);
  font:800 .78rem/1 var(--mono);
}
.info-item b{
  display:block;
  color:var(--ink);
  font-weight:730;
}
.state-card,.metric{
  border:1px solid var(--line);
  border-radius:var(--radius-sm);
  background:var(--canvas);
}
.state-card{
  display:grid;
  gap:12px;
  padding:15px;
}
.state-card p{
  color:var(--ink-dim);
  font-size:.94rem;
  text-wrap:pretty;
}
.status-strip{
  display:flex;
  align-items:center;
  gap:12px;
  min-height:54px;
  padding:12px 14px;
  border:1px solid var(--line);
  border-radius:var(--radius-sm);
  background:var(--canvas);
  color:var(--ink);
}
.status-strip.ok{border-color:color-mix(in oklch,var(--ok) 45%,var(--line)); background:var(--ok-soft)}
.status-strip.warn{border-color:color-mix(in oklch,var(--warn) 45%,var(--line)); background:var(--warn-soft)}
.status-strip.crit{border-color:color-mix(in oklch,var(--crit) 45%,var(--line)); background:var(--crit-soft)}
.status-strip.info{border-color:color-mix(in oklch,var(--info) 45%,var(--line)); background:var(--info-soft)}
.status-dot{
  width:28px;
  height:28px;
  flex:none;
  display:grid;
  place-items:center;
  border-radius:999px;
  background:var(--canvas);
  color:currentColor;
  font-weight:850;
}
.status-strip.ok .status-dot{color:var(--ok)}
.status-strip.warn .status-dot{color:var(--warn)}
.status-strip.crit .status-dot{color:var(--crit)}
.status-strip.info .status-dot{color:var(--info)}
.status-copy{
  min-width:0;
  display:grid;
  gap:2px;
}
.status-copy b{font-weight:760}
.status-copy span{color:var(--ink-dim); font-size:.88rem}
.metric{
  display:grid;
  gap:4px;
  padding:14px;
}
.metric .k{
  color:var(--ink-faint);
  font-size:.82rem;
}
.metric .v{
  color:var(--ink);
  font-weight:780;
}
.result-layout,.status-layout{
  display:grid;
  grid-template-columns:minmax(0,1fr) 340px;
  min-height:628px;
}
.result-main,.status-main{
  display:grid;
  align-content:center;
  padding:56px 54px;
}
.result-panel,.status-panel{
  max-width:620px;
}
.badge{
  width:72px;
  height:72px;
  margin-bottom:22px;
  display:grid;
  place-items:center;
  border-radius:16px;
  font-size:2rem;
  font-weight:850;
}
.badge.ok{
  border:1px solid color-mix(in oklch,var(--ok) 58%,var(--line));
  background:var(--ok-soft);
  color:var(--ok);
}
.badge.no,.badge.warn{
  border:1px solid color-mix(in oklch,var(--warn) 58%,var(--line));
  background:var(--warn-soft);
  color:var(--warn);
}
.badge.crit{
  border:1px solid color-mix(in oklch,var(--crit) 58%,var(--line));
  background:var(--crit-soft);
  color:var(--crit);
}
.badge.info{
  border:1px solid color-mix(in oklch,var(--info) 58%,var(--line));
  background:var(--info-soft);
  color:var(--info);
}
.result-label,.status-label{
  margin-bottom:10px;
  color:var(--accent);
  font-weight:760;
}
.score{
  margin:22px 0 16px;
  color:var(--ink);
  font:850 3rem/1 var(--sans);
  font-variant-numeric:tabular-nums;
}
.score .of{
  color:var(--ink-faint);
  font-size:1.35rem;
  font-weight:720;
}
.result-copy,.status-copy-large{
  max-width:62ch;
  color:var(--ink-dim);
  font-size:1.02rem;
  text-wrap:pretty;
}
.result-side,.status-side{
  display:flex;
  flex-direction:column;
  gap:16px;
  padding:34px 28px;
  border-left:1px solid var(--line);
  background:var(--panel);
}
@keyframes settle{from{opacity:.001; transform:translateY(6px)} to{opacity:1; transform:none}}
.app{animation:settle .22s var(--ease) both}
@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{
    animation-duration:.001ms!important;
    animation-iteration-count:1!important;
    scroll-behavior:auto!important;
    transition:none!important;
  }
}
@media (max-width:940px){
  body{padding:14px}
  .home-nav,.home-hero,.home-section{
    width:auto;
    margin-left:24px;
    margin-right:24px;
  }
  .home-hero{
    min-height:auto;
    grid-template-columns:1fr;
    gap:24px;
    padding:34px 0 56px;
  }
  .home-hero-copy{
    width:100%;
    max-width:100%;
  }
  .home-deck{
    width:100%;
    max-width:100%;
    overflow-wrap:anywhere;
    word-break:break-word;
    white-space:normal;
  }
  .home-deck b{
    overflow-wrap:anywhere;
    word-break:break-word;
  }
  .home-hero h1{font-size:4.4rem}
  .hero-visual{
    position:relative;
    right:auto;
    top:auto;
    width:100%;
    min-width:0;
    margin-top:0;
  }
  .governance-board{
    max-width:680px;
  }
  .board-title p{
    display:none;
  }
  .policy-rail{
    grid-template-columns:repeat(3,minmax(0,1fr));
    padding:0;
  }
  .policy-row{
    grid-template-columns:1fr;
    gap:6px;
    min-width:0;
    padding-top:12px;
    padding-bottom:12px;
    border-right:1px solid rgba(255,255,255,.09);
  }
  .policy-row:last-child{border-right:0}
  .policy-row::before{display:none}
  .policy-key{
    padding-left:0;
    font-size:.64rem;
  }
  .policy-value strong{
    font-size:.82rem;
    line-height:1.15;
  }
  .policy-value span{
    display:none;
  }
  .board-code{
    display:none;
  }
  .board-outcome{
    align-items:center;
    flex-direction:row;
  }
  .home-statbar{
    margin-top:0;
    grid-template-columns:1fr;
  }
  .home-section{padding:68px 0}
  .home-section h2{font-size:2.55rem}
  .home-section.narrow,.install-layout{
    grid-template-columns:1fr;
  }
  .feature-grid{
    grid-template-columns:1fr;
  }
  .commandbar{
    align-items:flex-start;
    flex-direction:column;
    gap:12px;
  }
  .command-context{
    width:100%;
    flex-wrap:wrap;
  }
  .command-meta{flex-wrap:wrap}
  .console,.result-layout,.status-layout{grid-template-columns:1fr; min-height:0}
  .workspace{padding:32px 24px 0}
  .context-panel,.result-side,.status-side{
    border-left:0;
    border-top:1px solid var(--line);
    padding:24px;
  }
  .actionbar{
    margin:0 -24px;
    padding:16px 24px;
  }
  h1{font-size:2.05rem}
  .qh{font-size:1.45rem}
}
@media (max-width:560px){
  .home-nav{
    align-items:flex-start;
    flex-direction:column;
    gap:14px;
    padding:14px 0 10px;
  }
  .home-nav,.home-hero,.home-section{
    width:calc(100vw - 48px);
    max-width:calc(100vw - 48px);
    margin-left:24px;
    margin-right:0;
  }
  .home-links{
    width:100%;
    flex-wrap:wrap;
    gap:10px;
  }
  .home-hero h1{font-size:3.1rem}
  .home-deck{font-size:1.04rem}
  .home-hero-copy,.home-deck,.hero-visual,.governance-board{
    width:100%;
    max-width:100%;
  }
  .home-hero{
    gap:14px;
    padding:12px 0 8px;
  }
  .home-hero-copy{
    padding-top:0;
    padding-bottom:0;
  }
  .home-actions{display:grid; width:100%}
  .home-cta,.home-secondary{width:100%}
  .hero-visual{
    margin-top:0;
  }
  .governance-board{
    box-shadow:5px 5px 0 #d7ec6d;
    box-shadow:5px 5px 0 oklch(0.88 0.15 112);
  }
  .board-top,.board-title,.policy-row,.board-code,.board-outcome{
    padding-left:14px;
    padding-right:14px;
  }
  .board-top{
    padding-top:12px;
    padding-bottom:12px;
  }
  .board-state{
    font-size:.72rem;
  }
  .board-state::before{
    width:7px;
    height:7px;
  }
  .board-title{
    padding-top:14px;
    padding-bottom:12px;
  }
  .board-title h2{
    font-size:1.08rem;
  }
  .board-title p{
    display:none;
  }
  .policy-rail{
    grid-template-columns:repeat(3,minmax(0,1fr));
    padding:0;
  }
  .policy-row{
    grid-template-columns:1fr;
    gap:6px;
    min-width:0;
    padding-top:11px;
    padding-bottom:11px;
    border-right:1px solid rgba(255,255,255,.09);
  }
  .policy-row:last-child{border-right:0}
  .policy-row::before{display:none}
  .policy-key{
    padding-left:0;
    font-size:.6rem;
  }
  .policy-value strong{
    font-size:.76rem;
    line-height:1.15;
  }
  .policy-value span{
    display:none;
  }
  .board-code{
    display:none;
  }
  .board-outcome{
    align-items:center;
    flex-direction:row;
    padding-top:12px;
    padding-bottom:12px;
  }
  .home-hero + .home-section{
    padding-top:34px;
  }
  .home-section h2{font-size:2.12rem}
  .site-footer .home-section{flex-direction:column}
  .brand-name{font-size:1rem}
  .command-sep{display:none}
  .command-pill{min-height:30px}
  .workspace{padding:26px 18px 0}
  .prelude{padding-bottom:28px}
  .rail li span{display:none}
  .rail{margin-bottom:24px}
  .question-top{
    align-items:flex-start;
    flex-direction:column;
  }
  .timer{min-width:80px}
  h1{font-size:1.78rem}
  .qh{font-size:1.28rem}
  .opt{
    grid-template-columns:32px minmax(0,1fr);
    padding:12px;
  }
  .choice-letter{
    width:30px;
    height:30px;
  }
  .actionbar{
    align-items:stretch;
    flex-direction:column;
    margin:0 -18px;
    padding:14px 18px;
  }
  .action-group{
    display:grid;
    grid-template-columns:1fr;
  }
  .btn,.btn-secondary{width:100%; min-width:0}
  .result-main,.status-main{padding:38px 24px}
}

/* Public site override: keep the first viewport quiet and GitHub-native. */
.site-body{
  padding:0;
  background:#f6f8fa;
  color:#24292f;
  overflow-x:hidden;
}
.site-page{
  min-height:100vh;
  overflow:hidden;
  overflow-x:hidden;
  color:#24292f;
  font:400 1rem/1.5 var(--sans);
}
.home-shell{
  min-height:100vh;
  overflow:hidden;
  overflow-x:hidden;
  background:#f6f8fa;
}
.home-shell::before{display:none}
.home-nav,.home-hero,.home-section{
  position:relative;
  z-index:1;
  width:min(1120px,calc(100% - 48px));
  margin:0 auto;
}
.home-nav{
  min-height:72px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:24px;
  border-bottom:1px solid #d0d7de;
}
.home-logo{
  display:inline-flex;
  align-items:center;
  gap:10px;
  color:#24292f;
  font-weight:800;
  text-decoration:none;
}
.home-mark{
  width:34px;
  height:34px;
  display:grid;
  place-items:center;
  border:1px solid #8c959f;
  border-radius:8px;
  background:#ff744f;
  color:#24292f;
  box-shadow:5px 5px 0 #d9f76a;
  font:900 1rem/1 var(--mono);
}
.home-links{
  display:flex;
  align-items:center;
  gap:20px;
  color:#57606a;
  font-size:.95rem;
  font-weight:650;
}
.home-links a{text-decoration:none}
.home-links a:hover{text-decoration:underline}
.home-hero{
  min-height:calc(100vh - 72px);
  display:grid;
  grid-template-columns:minmax(0,1fr) minmax(320px,440px);
  align-items:center;
  gap:clamp(48px,8vw,96px);
  padding:64px 0 88px;
}
.home-hero::after{display:none!important}
.home-hero-copy{
  max-width:690px;
  padding:0;
}
.home-kicker{
  display:block;
  margin:0 0 16px;
  color:#57606a;
  font:700 .86rem/1.2 var(--mono);
  text-transform:uppercase;
}
.home-kicker::before{display:none}
.home-hero h1{
  max-width:8em;
  color:#24292f;
  font-size:clamp(3.35rem,6.2vw,5.35rem);
  line-height:.92;
  font-weight:850;
  letter-spacing:0;
  text-wrap:balance;
}
.home-deck{
  max-width:46rem;
  margin-top:24px;
  color:#57606a;
  font-size:clamp(1.18rem,2vw,1.5rem);
  line-height:1.4;
  text-wrap:pretty;
}
.home-deck b{
  color:#24292f;
  font-weight:760;
}
.home-actions{
  display:flex;
  flex-wrap:wrap;
  gap:12px;
  margin-top:32px;
}
.home-cta,.home-secondary{
  min-height:44px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  border-radius:6px;
  padding:0 16px;
  font-weight:720;
  text-decoration:none;
  transition:transform .14s var(--ease), background-color .14s var(--ease), border-color .14s var(--ease);
}
.home-cta{
  border:1px solid #1f883d;
  background:#1f883d;
  color:#fff;
}
.home-secondary{
  border:1px solid #d0d7de;
  background:#fff;
  color:#24292f;
}
@media (hover:hover) and (pointer:fine){
  .home-cta:hover,.home-secondary:hover{transform:translateY(-1px)}
  .home-cta:hover{background:#1a7f37}
  .home-secondary:hover{border-color:#8c959f}
}
.home-cta:focus-visible,.home-secondary:focus-visible,.home-links a:focus-visible{
  outline:3px solid #0969da;
  outline-offset:3px;
}
.hero-visual{
  width:100%;
  min-width:0;
  display:flex;
  justify-content:center;
}
.check-card{
  position:relative;
  width:min(100%,440px);
  overflow:hidden;
  border:1px solid #d0d7de;
  border-radius:8px;
  background:#fff;
  box-shadow:8px 8px 0 #d9f76a,0 18px 50px rgba(31,35,40,.11);
}
.check-card::after{
  content:"";
  position:absolute;
  right:18px;
  bottom:18px;
  width:56px;
  height:56px;
  border:2px solid #ff744f;
  border-radius:14px;
  opacity:.16;
  transform:rotate(-8deg);
}
.check-top{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:14px;
  padding:14px 16px;
  border-bottom:1px solid #d8dee4;
  color:#57606a;
  font-size:.92rem;
}
.check-app{
  display:flex;
  align-items:center;
  gap:10px;
  min-width:0;
  color:#24292f;
  font-weight:720;
}
.check-mark{
  width:26px;
  height:26px;
  display:grid;
  place-items:center;
  border-radius:7px;
  background:#ff744f;
  color:#24292f;
  font:900 .78rem/1 var(--mono);
}
.check-status{
  display:flex;
  align-items:center;
  gap:7px;
  white-space:nowrap;
}
.check-status::before{
  content:"";
  width:9px;
  height:9px;
  border-radius:999px;
  background:#bf8700;
}
.check-body{
  padding:28px 24px 26px;
}
.check-body h2{
  max-width:10em;
  color:#24292f;
  font-size:1.8rem;
  line-height:1.08;
  font-weight:780;
  letter-spacing:0;
}
.check-body p{
  max-width:30ch;
  margin-top:10px;
  color:#57606a;
  font-size:1rem;
}
.check-rule{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:16px;
  margin:0 24px 24px;
  padding:13px 14px;
  border:1px solid #d8dee4;
  border-radius:6px;
  background:#f6f8fa;
  color:#57606a;
  font:650 .9rem/1.25 var(--mono);
}
.check-rule b{
  color:#24292f;
  font-weight:760;
}
.check-foot{
  display:flex;
  align-items:center;
  gap:10px;
  padding:14px 16px;
  border-top:1px solid #d8dee4;
  background:#f6f8fa;
  color:#57606a;
  font-size:.94rem;
}
.check-foot::before{
  content:"";
  width:12px;
  height:12px;
  border-radius:999px;
  background:#d9f76a;
  box-shadow:inset 0 0 0 3px #1f883d;
}
.home-section{
  padding:96px 0;
}
.home-section.narrow{
  display:grid;
  grid-template-columns:minmax(0,.82fr) minmax(280px,.5fr);
  gap:56px;
  align-items:start;
}
.section-label{
  margin-bottom:14px;
  color:#0969da;
  font:720 .82rem/1.2 var(--mono);
  text-transform:uppercase;
}
.home-section h2{
  max-width:13em;
  color:#24292f;
  font-size:clamp(2.1rem,4vw,3.7rem);
  line-height:1;
  font-weight:800;
  letter-spacing:0;
  text-wrap:balance;
}
.home-copy{
  max-width:62ch;
  margin-top:18px;
  color:#57606a;
  font-size:1.08rem;
}
.value-panel{
  display:grid;
  gap:14px;
  padding:22px;
  border:1px solid #d0d7de;
  border-radius:8px;
  background:#fff;
  box-shadow:inset 3px 0 0 #ff744f;
}
.value-panel h3{
  color:#24292f;
  font-size:1.05rem;
}
.value-panel p,.value-panel li{color:#57606a}
.value-panel ul{
  display:grid;
  gap:10px;
  margin:0;
  padding-left:1.1rem;
}
.flow-list{
  display:grid;
  gap:0;
  border:1px solid #d0d7de;
  border-radius:8px;
  background:#fff;
}
.flow-item{
  display:grid;
  grid-template-columns:42px minmax(0,1fr);
  gap:14px;
  padding:18px;
  border-top:1px solid #d8dee4;
}
.flow-item:first-child{border-top:0}
.flow-item b:first-child{
  width:34px;
  height:34px;
  display:grid;
  place-items:center;
  border-radius:999px;
  background:#f6f8fa;
  color:#0969da;
  font:760 .78rem/1 var(--mono);
}
.flow-item h3{
  color:#24292f;
  font-size:1rem;
  font-weight:760;
}
.flow-item p{
  margin-top:3px;
  color:#57606a;
}
.feature-band{
  background:#24292f;
  color:#f6f8fa;
}
.feature-band .home-section h2,
.feature-band .section-label{color:#f6f8fa}
.feature-band .home-copy{color:#afb8c1}
.feature-grid{
  display:grid;
  grid-template-columns:repeat(3,minmax(0,1fr));
  gap:1px;
  margin-top:34px;
  border:1px solid rgba(255,255,255,.14);
  border-radius:8px;
  overflow:hidden;
  background:rgba(255,255,255,.14);
}
.home-feature{
  min-height:168px;
  display:grid;
  align-content:space-between;
  gap:22px;
  padding:20px;
  border:0;
  border-radius:0;
  background:#2d333b;
}
.home-feature .tag{
  width:32px;
  height:32px;
  display:grid;
  place-items:center;
  border-radius:6px;
  background:#d9f76a;
  color:#24292f;
  font:800 .76rem/1 var(--mono);
}
.home-feature h3{
  color:#fff;
  font-size:1rem;
  font-weight:760;
}
.home-feature p{
  margin-top:6px;
  color:#afb8c1;
}
.install-band{
  background:#fff;
}
.install-layout{
  display:grid;
  grid-template-columns:minmax(0,.9fr) minmax(300px,.46fr);
  gap:48px;
  align-items:start;
}
.setup-list{
  display:grid;
  gap:14px;
  margin-top:28px;
}
.setup-step{
  display:grid;
  grid-template-columns:34px minmax(0,1fr);
  gap:12px;
}
.setup-step b:first-child{
  width:34px;
  height:34px;
  display:grid;
  place-items:center;
  border:1px solid #d0d7de;
  border-radius:7px;
  color:#0969da;
  font:760 .78rem/1 var(--mono);
}
.setup-step h3{
  color:#24292f;
  font-size:1rem;
  font-weight:760;
}
.setup-step p{
  margin-top:3px;
  color:#57606a;
}
.install-box{
  display:grid;
  gap:14px;
  padding:22px;
  border:1px solid #d0d7de;
  border-radius:8px;
  background:#f6f8fa;
  color:#24292f;
}
.install-box .home-cta{width:100%}
.install-box code{
  display:block;
  overflow:auto;
  padding:14px;
  border-radius:6px;
  background:#24292f;
  color:#d9f76a;
  font:650 .9rem/1.5 var(--mono);
}
.install-box p{color:#57606a}
.site-footer{
  padding:28px 0 40px;
  border-top:1px solid #d0d7de;
  color:#57606a;
}
.site-footer .home-section{
  display:flex;
  justify-content:space-between;
  gap:18px;
  padding:0;
}
@media (max-width:940px){
  .home-nav,.home-hero,.home-section{
    width:min(100% - 40px,720px);
    margin-left:auto;
    margin-right:auto;
  }
  .home-hero{
    min-height:auto;
    grid-template-columns:1fr;
    gap:34px;
    padding:56px 0 72px;
  }
  .home-hero-copy{max-width:100%}
  .home-deck{max-width:42rem}
  .hero-visual{max-width:520px}
  .home-section.narrow,.install-layout{grid-template-columns:1fr}
  .feature-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media (max-width:560px){
  .home-nav{
    min-height:64px;
    align-items:center;
    flex-direction:row;
    padding:0;
  }
  .home-nav,.home-hero,.home-section{
    width:auto;
    max-width:none;
    margin-left:16px;
    margin-right:16px;
  }
  .home-links{gap:12px; font-size:.9rem}
  .home-links a:nth-child(2){display:none}
  .home-mark{
    width:32px;
    height:32px;
    box-shadow:4px 4px 0 #d9f76a;
  }
  .home-hero{
    gap:28px;
    padding:44px 0 60px;
  }
  .home-hero h1{
    max-width:100%;
    font-size:2.9rem;
    overflow-wrap:break-word;
  }
  .home-deck{
    max-width:100%;
    font-size:1.02rem;
    overflow-wrap:break-word;
  }
  .home-actions{display:grid; width:100%}
  .home-cta,.home-secondary{width:100%}
  .hero-visual{
    max-width:100%;
  }
  .check-card{
    width:calc(100% - 6px);
    box-shadow:6px 6px 0 #d9f76a,0 14px 38px rgba(31,35,40,.1);
  }
  .check-top{
    align-items:flex-start;
    flex-direction:column;
    gap:8px;
  }
  .check-status{white-space:normal}
  .check-body{padding:24px 18px 22px}
  .check-body h2{font-size:1.45rem}
  .check-rule{
    align-items:flex-start;
    flex-direction:column;
    gap:6px;
    margin:0 18px 18px;
  }
  .home-section{padding:68px 0}
  .feature-grid{grid-template-columns:1fr}
  .site-footer .home-section{flex-direction:column}
}

/* Public repo-page direction. Scoped to avoid the older experimental home styles. */
.gh-shell{
  min-height:100vh;
  overflow-x:hidden;
  background:#f6f8fa;
  color:#24292f;
}
.gh-header{
  width:min(1120px,calc(100% - 40px));
  min-height:64px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:16px;
  margin:0 auto;
  border-bottom:1px solid #d8dee4;
}
.gh-brand{
  display:inline-flex;
  align-items:center;
  gap:10px;
  color:#24292f;
  font-weight:760;
  text-decoration:none;
}
.gh-mark{
  width:32px;
  height:32px;
  display:grid;
  place-items:center;
  border:1px solid #8c959f;
  border-radius:7px;
  background:#ff744f;
  color:#24292f;
  box-shadow:4px 4px 0 #d9f76a;
  font:900 .9rem/1 var(--mono);
}
.gh-links{
  display:flex;
  gap:18px;
  color:#57606a;
  font-size:.94rem;
  font-weight:620;
}
.gh-links a{text-decoration:none}
.gh-links a:hover{text-decoration:underline}
.gh-page{
  width:min(1120px,calc(100% - 40px));
  display:grid;
  grid-template-columns:minmax(0,1fr) 318px;
  gap:24px;
  align-items:start;
  margin:0 auto;
  padding:22px 0 48px;
}
.gh-main{
  display:grid;
  gap:18px;
  min-width:0;
}
.gh-repo-line{
  display:flex;
  align-items:center;
  flex-wrap:wrap;
  gap:8px;
  min-width:0;
  color:#57606a;
  font-size:.95rem;
}
.gh-repo-line strong{
  color:#0969da;
  font-weight:680;
}
.gh-chip{
  min-height:24px;
  display:inline-flex;
  align-items:center;
  padding:0 8px;
  border:1px solid #d0d7de;
  border-radius:999px;
  background:#fff;
  color:#57606a;
  font-size:.78rem;
  font-weight:620;
}
.gh-hero{
  display:grid;
  gap:14px;
  padding:20px 0 8px;
}
.gh-kicker{
  margin:0;
  color:#6e7781;
  font:700 .78rem/1.2 var(--mono);
  text-transform:uppercase;
}
.gh-hero h1{
  max-width:13ch;
  margin:0;
  color:#24292f;
  font-size:clamp(2.7rem,5vw,4.25rem);
  line-height:.98;
  font-weight:820;
  letter-spacing:0;
  text-wrap:balance;
}
.gh-lead{
  max-width:58ch;
  margin:0;
  color:#57606a;
  font-size:1.18rem;
  line-height:1.42;
}
.gh-lead b{
  color:#24292f;
  font-weight:760;
}
.gh-actions{
  display:flex;
  flex-wrap:wrap;
  gap:10px;
  margin-top:4px;
}
.gh-button{
  min-height:40px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  border:1px solid #d0d7de;
  border-radius:6px;
  padding:0 14px;
  background:#fff;
  color:#24292f;
  font-weight:680;
  text-decoration:none;
}
.gh-button.primary{
  border-color:#1f883d;
  background:#1f883d;
  color:#fff;
}
.gh-button:hover{border-color:#8c959f}
.gh-button.primary:hover{background:#1a7f37}
.gh-button:focus-visible,.gh-links a:focus-visible{
  outline:3px solid #0969da;
  outline-offset:3px;
}
.gh-check{
  overflow:hidden;
  border:1px solid #d0d7de;
  border-radius:6px;
  background:#fff;
}
.gh-check-head{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  padding:12px 14px;
  border-bottom:1px solid #d8dee4;
  background:#f6f8fa;
  color:#57606a;
  font-size:.92rem;
}
.gh-check-head strong{
  color:#24292f;
  font-weight:720;
}
.gh-status{
  display:inline-flex;
  align-items:center;
  gap:7px;
  color:#57606a;
  white-space:nowrap;
}
.gh-status::before{
  content:"";
  width:8px;
  height:8px;
  border-radius:999px;
  background:#bf8700;
}
.gh-check-body{
  display:grid;
  gap:12px;
  padding:16px 14px 14px;
}
.gh-check-title{
  margin:0;
  color:#24292f;
  font-size:1.18rem;
  line-height:1.25;
  font-weight:760;
}
.gh-note{
  margin:0;
  color:#57606a;
}
.gh-rule{
  display:grid;
  grid-template-columns:136px minmax(0,1fr);
  gap:12px;
  align-items:start;
  padding:12px;
  border:1px solid #d8dee4;
  border-radius:6px;
  background:#f6f8fa;
}
.gh-rule code{
  color:#24292f;
  font:700 .88rem/1.35 var(--mono);
}
.gh-rule span{
  color:#57606a;
}
.gh-check-foot{
  display:flex;
  align-items:center;
  gap:8px;
  padding-top:2px;
  color:#57606a;
  font-size:.94rem;
}
.gh-check-foot::before{
  content:"";
  width:10px;
  height:10px;
  flex:none;
  border-radius:999px;
  background:#d9f76a;
  box-shadow:inset 0 0 0 3px #1f883d;
}
.gh-section{
  display:grid;
  gap:12px;
  padding-top:18px;
}
.gh-section h2{
  margin:0;
  color:#24292f;
  font-size:1.45rem;
  line-height:1.18;
  font-weight:760;
  letter-spacing:0;
}
.gh-section p{
  max-width:66ch;
  margin:0;
  color:#57606a;
}
.gh-table{
  overflow:hidden;
  border:1px solid #d0d7de;
  border-radius:6px;
  background:#fff;
}
.gh-row{
  display:grid;
  grid-template-columns:142px minmax(0,1fr);
  gap:14px;
  padding:12px 14px;
  border-top:1px solid #d8dee4;
}
.gh-row:first-child{border-top:0}
.gh-row b{
  color:#24292f;
  font-weight:720;
}
.gh-row span{
  color:#57606a;
}
.gh-sidebar{
  position:sticky;
  top:18px;
  display:grid;
  gap:14px;
}
.gh-sidebox{
  display:grid;
  gap:12px;
  padding:14px;
  border:1px solid #d0d7de;
  border-radius:6px;
  background:#fff;
}
.gh-sidebox h2{
  margin:0;
  color:#24292f;
  font-size:1rem;
  font-weight:760;
}
.gh-sidebox p{
  margin:0;
  color:#57606a;
  font-size:.94rem;
}
.gh-code{
  display:block;
  overflow:auto;
  padding:10px;
  border-radius:6px;
  background:#24292f;
  color:#d9f76a;
  font:650 .82rem/1.45 var(--mono);
}
.gh-side-list{
  display:grid;
  gap:8px;
  margin:0;
  padding:0;
  list-style:none;
  color:#57606a;
  font-size:.94rem;
}
.gh-side-list li{
  display:grid;
  grid-template-columns:18px minmax(0,1fr);
  gap:8px;
}
.gh-side-list li::before{
  content:"✓";
  color:#1f883d;
  font-weight:760;
}
.gh-footer{
  width:min(1120px,calc(100% - 40px));
  display:flex;
  justify-content:space-between;
  gap:16px;
  margin:0 auto;
  padding:20px 0 32px;
  border-top:1px solid #d8dee4;
  color:#57606a;
  font-size:.92rem;
}
@media (max-width:860px){
  .gh-page{
    grid-template-columns:1fr;
    gap:18px;
  }
  .gh-sidebar{position:static}
}
@media (max-width:560px){
  .gh-header,.gh-page,.gh-footer{
    width:calc(100% - 32px);
    max-width:calc(100% - 32px);
  }
  .gh-shell{
    max-width:100vw;
  }
  .gh-shell *{
    max-width:100%;
  }
  .gh-header{
    min-height:58px;
  }
  .gh-links{
    gap:12px;
    font-size:.9rem;
  }
  .gh-links a:nth-child(2){display:none}
  .gh-page{
    padding-top:18px;
    overflow:hidden;
  }
  .gh-main,
  .gh-hero,
  .gh-check,
  .gh-section,
  .gh-sidebar,
  .gh-sidebox{
    min-width:0;
    width:calc(100vw - 32px);
    max-width:calc(100vw - 32px);
  }
  .gh-hero{
    padding-top:8px;
  }
  .gh-hero h1{
    max-width:100%;
    font-size:2.6rem;
    overflow-wrap:break-word;
  }
  .gh-lead{
    width:calc(100vw - 32px);
    max-width:calc(100vw - 32px);
    font-size:1.03rem;
    overflow-wrap:anywhere;
  }
  .gh-code,
  .gh-rule code,
  .gh-sidebox code{
    white-space:pre-wrap;
    overflow-wrap:anywhere;
  }
  .gh-actions{
    display:grid;
  }
  .gh-button{
    width:100%;
  }
  .gh-check-head{
    align-items:flex-start;
    flex-direction:column;
    gap:6px;
  }
  .gh-status{white-space:normal}
  .gh-note,
  .gh-rule span,
  .gh-check-foot,
  .gh-row span,
  .gh-sidebox p,
  .gh-side-list li{
    min-width:0;
    overflow-wrap:anywhere;
  }
  .gh-check-foot{
    align-items:flex-start;
  }
  .gh-rule,.gh-row{
    grid-template-columns:1fr;
    gap:6px;
  }
  .gh-footer{
    flex-direction:column;
  }
  .gh-repo-line{
    align-items:flex-start;
    flex-direction:column;
  }
  .gh-chip:nth-of-type(2){
    display:none;
  }
}

/* CLAWPTCHA public site: maintainer-native, but not a GitHub skin. */
.claw-shell{
  min-height:100vh;
  overflow-x:hidden;
  background:#f3f7f5;
  color:#101816;
}
.claw-shell *{
  max-width:100%;
  min-width:0;
}
.claw-top{
  width:min(1120px,calc(100% - 40px));
  min-height:66px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:18px;
  margin:0 auto;
  border-bottom:2px solid #101816;
}
.claw-brand{
  display:inline-flex;
  align-items:center;
  gap:10px;
  color:#101816;
  font-weight:850;
  text-decoration:none;
}
.claw-mark{
  width:34px;
  height:34px;
  display:grid;
  place-items:center;
  border:2px solid #101816;
  border-radius:8px;
  background:#ff6f4d;
  box-shadow:5px 5px 0 #d8f35f;
  color:#101816;
  font:900 .92rem/1 var(--mono);
}
.claw-links{
  display:flex;
  gap:18px;
  color:#293834;
  font-size:.94rem;
  font-weight:750;
}
.claw-links a{text-decoration:none}
.claw-links a:hover{text-decoration:underline}
.claw-hero{
  width:min(1120px,calc(100% - 40px));
  display:grid;
  grid-template-columns:minmax(0,1fr) minmax(340px,430px);
  gap:40px;
  align-items:center;
  margin:0 auto;
  padding:44px 0 34px;
}
.claw-copy{min-width:0}
.claw-kicker{
  display:inline-flex;
  align-items:center;
  gap:10px;
  margin:0 0 16px;
  color:#5e3c76;
  font:850 .94rem/1.25 var(--sans);
}
.claw-kicker::before{
  content:"";
  width:10px;
  height:10px;
  border-radius:999px;
  background:#5e3c76;
}
.claw-copy h1{
  max-width:9ch;
  margin:0;
  color:#101816;
  font-size:clamp(3.4rem,7vw,5.9rem);
  line-height:.9;
  font-weight:900;
  letter-spacing:0;
  text-wrap:balance;
}
.claw-lead{
  max-width:48ch;
  margin:18px 0 0;
  color:#2f403b;
  font-size:1.22rem;
  line-height:1.42;
}
.claw-lead b{
  color:#101816;
  font-weight:850;
}
.claw-actions{
  display:flex;
  flex-wrap:wrap;
  gap:10px;
  margin-top:24px;
}
.claw-button{
  min-height:44px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  border:2px solid #101816;
  border-radius:7px;
  padding:0 16px;
  background:#fffdfa;
  color:#101816;
  font-weight:850;
  text-decoration:none;
  box-shadow:3px 3px 0 #101816;
}
.claw-button.primary{
  background:#101816;
  color:#fffdfa;
  box-shadow:3px 3px 0 #d8f35f;
}
.claw-button:hover{transform:translateY(-1px)}
.claw-button:active{transform:translateY(1px); box-shadow:1px 1px 0 #101816}
.claw-button.primary:active{box-shadow:1px 1px 0 #d8f35f}
.claw-button:focus-visible,.claw-links a:focus-visible{
  outline:3px solid #5e3c76;
  outline-offset:3px;
}
.policy-receipt{
  position:relative;
  min-width:0;
  padding:0;
  border:2px solid #101816;
  border-radius:10px;
  background:#fffdfa;
  box-shadow:10px 10px 0 #d8f35f;
  overflow:hidden;
}
.policy-receipt::before{
  content:"Required";
  position:absolute;
  top:14px;
  right:16px;
  border:1px solid #101816;
  border-radius:999px;
  padding:5px 9px;
  color:#101816;
  background:#d8f35f;
  font:850 .72rem/1 var(--sans);
  text-transform:uppercase;
}
.receipt-head{
  display:flex;
  align-items:flex-start;
  gap:12px;
  padding:14px 120px 14px 16px;
  border-bottom:2px solid #101816;
}
.receipt-dot{
  width:26px;
  height:26px;
  flex:none;
  display:grid;
  place-items:center;
  border-radius:999px;
  border:2px solid #101816;
  background:#d8f35f;
  color:#101816;
  font:900 .9rem/1 var(--sans);
}
.receipt-head strong{
  display:block;
  font-size:1rem;
  line-height:1.15;
}
.receipt-head span:not(.receipt-dot){
  display:block;
  margin-top:3px;
  color:#455852;
  font-size:.86rem;
  font-weight:650;
}
.receipt-title{
  max-width:11em;
  margin:18px 16px 14px;
  color:#101816;
  font-size:1.65rem;
  line-height:1.05;
  font-weight:900;
  letter-spacing:0;
}
.receipt-lines{
  display:grid;
  margin:0 16px;
  border:1px solid #101816;
  border-radius:7px;
  overflow:hidden;
}
.receipt-line{
  display:grid;
  grid-template-columns:96px minmax(0,1fr);
  gap:12px;
  padding:10px 12px;
  border-top:1px solid #101816;
  background:#f3f7f5;
}
.receipt-line:first-child{border-top:0}
.receipt-line b{
  color:#5e3c76;
  font:900 .78rem/1.25 var(--mono);
  text-transform:uppercase;
}
.receipt-line span{
  color:#101816;
  font-weight:740;
}
.receipt-foot{
  display:flex;
  align-items:center;
  gap:8px;
  margin:14px 16px 16px;
  color:#2f403b;
  font-weight:700;
}
.receipt-foot::before{
  content:"";
  width:12px;
  height:12px;
  flex:none;
  border:2px solid #101816;
  border-radius:999px;
  background:#d8f35f;
}
.policy-strip{
  width:min(1120px,calc(100% - 40px));
  display:grid;
  grid-template-columns:repeat(4,minmax(0,1fr));
  margin:0 auto 44px;
  border:2px solid #101816;
  border-radius:10px;
  overflow:hidden;
  background:#fffdfa;
}
.policy-chip{
  min-width:0;
  padding:16px;
  border-left:2px solid #101816;
}
.policy-chip:first-child{border-left:0}
.policy-chip b{
  display:block;
  color:#101816;
  font-size:1rem;
  line-height:1.2;
}
.policy-chip span{
  display:block;
  margin-top:5px;
  color:#455852;
  font-size:.92rem;
  line-height:1.35;
}
.claw-section{
  width:min(1120px,calc(100% - 40px));
  display:grid;
  grid-template-columns:minmax(0,.75fr) minmax(280px,.42fr);
  gap:34px;
  align-items:start;
  margin:0 auto;
  padding:38px 0;
  border-top:2px solid #101816;
}
.claw-section h2{
  max-width:16ch;
  margin:0;
  color:#101816;
  font-size:2.35rem;
  line-height:1.02;
  font-weight:900;
  letter-spacing:0;
  text-wrap:balance;
}
.claw-section p{
  max-width:62ch;
  margin:12px 0 0;
  color:#2f403b;
  font-size:1.04rem;
}
.install-ticket{
  display:grid;
  gap:12px;
  padding:16px;
  border:2px solid #101816;
  border-radius:10px;
  background:#fffdfa;
  box-shadow:6px 6px 0 #ff6f4d;
}
.install-ticket h3{
  margin:0;
  color:#101816;
  font-size:1.1rem;
}
.install-ticket code{
  display:block;
  overflow:auto;
  padding:12px;
  border-radius:7px;
  background:#101816;
  color:#d8f35f;
  font:750 .88rem/1.45 var(--mono);
}
.install-ticket p{
  margin:0;
  color:#455852;
  font-size:.95rem;
}
.install-mode{
  display:grid;
  gap:3px;
  padding:10px 0;
  border-top:1px solid #101816;
}
.install-mode b{
  color:#101816;
  font-size:.98rem;
}
.install-mode span{
  color:#455852;
  font-size:.92rem;
  line-height:1.35;
}
.claw-footer{
  width:min(1120px,calc(100% - 40px));
  display:flex;
  justify-content:space-between;
  gap:16px;
  margin:0 auto;
  padding:22px 0 34px;
  border-top:2px solid #101816;
  color:#455852;
  font-size:.94rem;
}
@media (max-width:860px){
  .claw-hero,.claw-section{
    grid-template-columns:1fr;
  }
  .policy-strip{
    grid-template-columns:repeat(2,minmax(0,1fr));
  }
  .policy-chip:nth-child(3){
    border-left:0;
    border-top:2px solid #101816;
  }
  .policy-chip:nth-child(4){
    border-top:2px solid #101816;
  }
}
@media (max-width:560px){
  .claw-shell{
    padding-right:24px;
  }
  .claw-top,.claw-hero,.policy-strip,.claw-section,.claw-footer{
    width:auto!important;
    max-width:none!important;
    margin-left:16px;
    margin-right:0;
  }
  .claw-top{
    min-height:62px;
  }
  .claw-links{
    display:none;
  }
  .claw-hero{
    gap:28px;
    padding:30px 0 28px;
  }
  .claw-copy h1{
    width:100%;
    max-width:100%;
    font-size:3rem;
    overflow-wrap:anywhere;
  }
  .claw-lead{
    width:100%;
    max-width:100%;
    font-size:1rem;
    overflow-wrap:anywhere;
  }
  .claw-kicker{
    gap:8px;
    font-size:.9rem;
  }
  .claw-kicker::before{
    width:9px;
    height:9px;
  }
  .claw-actions{
    display:grid;
    width:320px!important;
    max-width:calc(100vw - 56px)!important;
  }
  .claw-button{
    width:100%;
    max-width:100%;
  }
  .policy-receipt{
    width:320px!important;
    max-width:calc(100vw - 56px)!important;
    padding:0;
    box-shadow:none;
  }
  .policy-receipt::before{
    top:14px;
    right:14px;
    bottom:auto;
    transform:none;
  }
  .receipt-head{
    padding-right:108px;
  }
  .receipt-title{
    font-size:1.55rem;
  }
  .receipt-line{
    grid-template-columns:1fr;
    gap:4px;
  }
  .receipt-line span,
  .receipt-foot,
  .policy-chip span,
  .claw-section p,
  .install-ticket p{
    overflow-wrap:anywhere;
  }
  .policy-strip{
    grid-template-columns:1fr;
    margin-bottom:30px;
  }
  .policy-chip{
    border-left:0;
    border-top:2px solid #101816;
    padding:14px;
  }
  .policy-chip:first-child{border-top:0}
  .claw-section{
    gap:18px;
    padding:30px 0;
  }
  .claw-section h2{
    font-size:2rem;
  }
  .install-ticket code{
    white-space:pre-wrap;
    overflow-wrap:anywhere;
  }
  .claw-footer{
    flex-direction:column;
  }
}

/* Hero artifact: recognizable as a GitHub Actions/check-run report. */
.policy-receipt{
  border:1px solid #d0d7de;
  border-radius:8px;
  background:#ffffff;
  box-shadow:8px 8px 0 #d8f35f;
}
.policy-receipt::before{
  content:"Required";
  top:13px;
  right:14px;
  border:1px solid #d4a72c;
  background:#fff8c5;
  color:#7d4e00;
  font:750 .68rem/1 var(--sans);
}
.receipt-head{
  align-items:center;
  gap:10px;
  padding:12px 108px 12px 14px;
  border-bottom:1px solid #d0d7de;
  background:#f6f8fa;
}
.receipt-dot{
  width:20px;
  height:20px;
  border:0;
  background:#bf8700;
  color:#ffffff;
  font:900 .76rem/1 var(--sans);
}
.receipt-head strong{
  font-size:.95rem;
}
.receipt-head span:not(.receipt-dot){
  margin-top:1px;
  color:#57606a;
  font-size:.82rem;
  font-weight:600;
}
.receipt-title{
  max-width:none;
  margin:16px 16px 10px;
  font-size:1.25rem;
  line-height:1.15;
  font-weight:800;
}
.receipt-lines{
  margin:0 16px;
  border:1px solid #d0d7de;
  border-radius:6px;
  background:#ffffff;
}
.receipt-line{
  grid-template-columns:24px minmax(0,1fr);
  align-items:start;
  gap:10px;
  padding:11px 12px;
  border-top:1px solid #d8dee4;
  background:#ffffff;
}
.receipt-line b{
  width:18px;
  height:18px;
  display:grid;
  place-items:center;
  border:1px solid #d0d7de;
  border-radius:999px;
  background:#f6f8fa;
  color:#57606a;
  font:800 .68rem/1 var(--sans);
  text-transform:none;
}
.receipt-line:nth-child(1) b{
  border-color:#4ac26b;
  background:#dafbe1;
  color:#1a7f37;
}
.receipt-line:nth-child(2) b,
.receipt-line:nth-child(3) b{
  border-color:#d4a72c;
  background:#fff8c5;
  color:#7d4e00;
}
.receipt-line:nth-child(4) b{
  border-color:#54aeff;
  background:#ddf4ff;
  color:#0969da;
}
.receipt-line span{
  display:grid;
  gap:2px;
  color:#24292f;
  font-weight:700;
}
.receipt-line small{
  color:#57606a;
  font-size:.82rem;
  font-weight:550;
  line-height:1.35;
}
.receipt-foot{
  margin:12px 16px 16px;
  padding:10px 11px;
  border:1px solid #d0d7de;
  border-radius:6px;
  background:#f6f8fa;
  color:#57606a;
  font-size:.9rem;
  font-weight:650;
}
.receipt-foot::before{
  width:10px;
  height:10px;
  border:0;
  background:#bf8700;
}
@media (max-width:560px){
  .policy-receipt{
    width:320px!important;
    max-width:calc(100vw - 56px)!important;
  }
  .policy-receipt::before{
    top:13px;
    right:12px;
  }
  .receipt-head{
    padding:12px 96px 12px 14px;
  }
  .receipt-title{
    font-size:1.2rem;
  }
  .receipt-line{
    grid-template-columns:24px minmax(0,1fr);
    gap:10px;
  }
}
@media (prefers-color-scheme:dark){
  .site-body,
  .site-page,
  .claw-shell{
    background:#101612;
    color:#f1f7f3;
  }
  .claw-top,
  .claw-section,
  .claw-footer{
    border-color:#d8f35f;
  }
  .claw-brand,
  .claw-copy h1,
  .claw-lead b,
  .policy-chip b,
  .claw-section h2,
  .install-ticket h3,
  .install-mode b{
    color:#f7fff9;
  }
  .claw-mark{
    border-color:#f7fff9;
    background:#ff7a59;
    color:#101612;
    box-shadow:5px 5px 0 #d8f35f;
  }
  .claw-links,
  .claw-lead,
  .policy-chip span,
  .claw-section p,
  .install-ticket p,
  .install-mode span,
  .claw-footer{
    color:#bfd0c6;
  }
  .claw-kicker{
    color:#d8a7ff;
  }
  .claw-kicker::before{
    background:#d8a7ff;
  }
  .claw-button{
    border-color:#f7fff9;
    background:#19231f;
    color:#f7fff9;
    box-shadow:3px 3px 0 #ff7a59;
  }
  .claw-button.primary{
    background:#d8f35f;
    color:#101612;
    box-shadow:3px 3px 0 #ff7a59;
  }
  .claw-button:active{
    box-shadow:1px 1px 0 #ff7a59;
  }
  .claw-button.primary:active{
    box-shadow:1px 1px 0 #ff7a59;
  }
  .claw-button:focus-visible,
  .claw-links a:focus-visible{
    outline-color:#d8a7ff;
  }
  .policy-strip,
  .install-ticket{
    border-color:#d8f35f;
    background:#151f1b;
  }
  .policy-chip{
    border-color:#d8f35f;
  }
  .install-ticket{
    box-shadow:6px 6px 0 #ff7a59;
  }
  .install-ticket code{
    background:#050907;
    color:#d8f35f;
  }
  .install-mode{
    border-color:#3c4f44;
  }
  .policy-receipt{
    border-color:#30363d;
    background:#0d1117;
    box-shadow:8px 8px 0 #d8f35f;
  }
  .policy-receipt::before{
    border-color:#9e6a03;
    background:#3b2e12;
    color:#f2cc60;
  }
  .receipt-head{
    border-color:#30363d;
    background:#161b22;
  }
  .receipt-dot{
    background:#d29922;
    color:#0d1117;
  }
  .receipt-head strong,
  .receipt-title,
  .receipt-line span{
    color:#f0f6fc;
  }
  .receipt-head span:not(.receipt-dot),
  .receipt-line small,
  .receipt-foot{
    color:#9aa7b2;
  }
  .receipt-lines,
  .receipt-foot{
    border-color:#30363d;
    background:#0d1117;
  }
  .receipt-line{
    border-color:#30363d;
    background:#0d1117;
  }
  .receipt-line b{
    border-color:#30363d;
    background:#161b22;
    color:#9aa7b2;
  }
  .receipt-line:nth-child(1) b{
    border-color:#2ea043;
    background:#12351f;
    color:#56d364;
  }
  .receipt-line:nth-child(2) b,
  .receipt-line:nth-child(3) b{
    border-color:#9e6a03;
    background:#3b2e12;
    color:#f2cc60;
  }
  .receipt-line:nth-child(4) b{
    border-color:#1f6feb;
    background:#10233f;
    color:#79c0ff;
  }
  .receipt-foot{
    background:#161b22;
  }
  .receipt-foot::before{
    background:#d29922;
  }
}

/* Public homepage craft pass: maintainers' infrastructure, with one weird accent. */
.claw-hero{
  gap:56px;
  padding:52px 0 38px;
}
.claw-lead{
  max-width:45ch;
  line-height:1.45;
}
.policy-receipt{
  border-color:#d0d7de;
  box-shadow:0 18px 36px rgba(16,24,22,.12), 6px 6px 0 #d8f35f;
  transform:rotate(.35deg);
}
.policy-receipt::before{
  content:"Action required";
  border-color:#d4a72c;
  background:#fff8c5;
  color:#7d4e00;
  text-transform:none;
}
.receipt-title{
  margin-bottom:12px;
}
.receipt-line small{
  max-width:33ch;
}
.receipt-foot{
  margin-top:12px;
}
.policy-strip{
  counter-reset:policy-step;
  border:1px solid #ccd8d1;
  border-radius:8px;
  background:#fffdfa;
  box-shadow:0 1px 0 rgba(16,24,22,.06);
}
.policy-chip{
  position:relative;
  counter-increment:policy-step;
  padding:14px 14px 14px 44px;
  border-left:1px solid #ccd8d1;
}
.policy-chip::before{
  content:counter(policy-step);
  position:absolute;
  top:14px;
  left:14px;
  width:20px;
  height:20px;
  display:grid;
  place-items:center;
  border:1px solid #b9c7bf;
  border-radius:999px;
  background:#eef6f1;
  color:#2f403b;
  font:850 .72rem/1 var(--sans);
}
.policy-chip b{
  font-size:.96rem;
}
.policy-chip span{
  font-size:.88rem;
}
.claw-section{
  padding-top:34px;
}
.install-ticket{
  border-color:#101816;
  box-shadow:5px 5px 0 #ff7a59;
}
.install-mode:first-of-type{
  border-top:0;
  padding-top:2px;
}
.docs-section{
  grid-template-columns:minmax(220px,.34fr) minmax(0,1fr);
  align-items:start;
}
.docs-intro{
  display:grid;
  align-content:start;
  gap:18px;
}
.docs-index{
  display:grid;
  gap:8px;
  padding:14px;
  border:1px solid #ccd8d1;
  border-radius:8px;
  background:#fffdfa;
  box-shadow:0 1px 0 rgba(16,24,22,.06);
}
.docs-index b{
  color:#101816;
  font-size:.9rem;
}
.docs-index a{
  color:#455852;
  font-size:.92rem;
  font-weight:650;
  text-decoration:none;
}
.docs-index a:hover{
  text-decoration:underline;
}
.docs-feature{
  min-width:0;
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:12px;
}
.docs-feature a{
  min-height:128px;
  display:grid;
  align-content:start;
  gap:8px;
  padding:16px;
  border:1px solid #ccd8d1;
  border-radius:8px;
  background:#fffdfa;
  color:#101816;
  text-decoration:none;
  box-shadow:0 1px 0 rgba(16,24,22,.06);
}
.docs-feature a.primary-doc{
  grid-column:1 / -1;
  min-height:0;
  border-color:#101816;
  background:#101816;
  color:#fffdfa;
}
.docs-feature b{
  font-size:1rem;
  line-height:1.2;
}
.docs-feature span{
  color:#455852;
  font-size:.93rem;
  line-height:1.42;
}
.docs-feature a.primary-doc span{
  color:#d5e4dc;
}
.docs-feature a:hover{
  transform:translateY(-1px);
  box-shadow:3px 3px 0 #d8f35f;
}
.claw-footer code{
  font-family:var(--mono);
}
@media (max-width:860px){
  .policy-chip,
  .policy-chip:nth-child(3),
  .policy-chip:nth-child(4){
    border-color:#ccd8d1;
  }
  .policy-chip:nth-child(3){
    border-left:0;
  }
}
@media (max-width:560px){
  .claw-hero{
    gap:22px;
    padding-top:28px;
  }
  .claw-actions,
  .policy-receipt{
    width:100%!important;
    max-width:100%!important;
  }
  .policy-receipt{
    transform:none;
    box-shadow:0 12px 24px rgba(16,24,22,.12), 4px 4px 0 #d8f35f;
  }
  .policy-strip{
    margin-bottom:30px;
  }
  .policy-chip{
    min-height:0;
    padding:12px 12px 12px 40px;
  }
  .policy-chip::before{
    top:12px;
    left:12px;
  }
  .claw-section{
    gap:22px;
  }
  .docs-section{
    gap:18px;
  }
  .docs-index,
  .docs-feature a{
    border-radius:7px;
  }
  .docs-feature{
    grid-template-columns:1fr;
  }
  .install-ticket{
    box-shadow:4px 4px 0 #ff7a59;
  }
}
@media (prefers-color-scheme:dark){
  .site-body,
  .site-page,
  .claw-shell{
    background:#101613;
    color:#eef6f1;
  }
  .claw-top,
  .claw-section,
  .claw-footer{
    border-color:#2c3a33;
  }
  .claw-brand,
  .claw-copy h1,
  .claw-lead b,
  .policy-chip b,
  .claw-section h2,
  .install-ticket h3,
  .install-mode b{
    color:#f5fbf7;
  }
  .claw-links,
  .claw-lead,
  .policy-chip span,
  .claw-section p,
  .install-ticket p,
  .install-mode span,
  .claw-footer{
    color:#b7c8be;
  }
  .claw-kicker{
    color:#c6a4df;
  }
  .claw-kicker::before{
    background:#c6a4df;
  }
  .claw-mark{
    border-color:#0b100e;
    background:#ff7a59;
    color:#0b100e;
    box-shadow:4px 4px 0 #d8f35f;
  }
  .claw-button{
    border-color:#5c6a62;
    background:#17211d;
    color:#f5fbf7;
    box-shadow:none;
  }
  .claw-button.primary{
    border-color:#d8f35f;
    background:#d8f35f;
    color:#101613;
    box-shadow:0 0 0 2px #101613, 0 0 0 4px #45533f;
  }
  .claw-button:active,
  .claw-button.primary:active{
    box-shadow:none;
  }
  .policy-strip,
  .install-ticket,
  .docs-index,
  .docs-feature a{
    border-color:#2c3a33;
    background:#151d1a;
    box-shadow:none;
  }
  .policy-chip,
  .policy-chip:nth-child(3),
  .policy-chip:nth-child(4){
    border-color:#2c3a33;
  }
  .policy-chip::before{
    border-color:#46564d;
    background:#202d27;
    color:#d8f35f;
  }
  .install-ticket code{
    background:#0a0f0d;
    color:#d8f35f;
  }
  .install-mode{
    border-color:#2c3a33;
  }
  .docs-index a,
  .docs-feature span{
    color:#b7c8be;
  }
  .docs-index b,
  .docs-feature b{
    color:#f5fbf7;
  }
  .docs-feature a.primary-doc{
    border-color:#d8f35f;
    background:#d8f35f;
    color:#101613;
  }
  .docs-feature a.primary-doc span{
    color:#344238;
  }
  .policy-receipt{
    border-color:#30363d;
    background:#0d1117;
    box-shadow:0 18px 36px rgba(0,0,0,.34), 5px 5px 0 #2d3b34;
  }
  .policy-receipt::before{
    border-color:#9e6a03;
    background:#3b2e12;
    color:#f2cc60;
  }
}
`;

function layout(
  title: string,
  body: string,
  options: { bodyClass?: string; mainClass?: string; description?: string } = {}
): string {
  const bodyClass = options.bodyClass ? ` class="${esc(options.bodyClass)}"` : "";
  const mainClass = options.mainClass ?? "wrap";
  const description = options.description
    ? `<meta name="description" content="${esc(options.description)}">`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
${description}
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%23ff7a59'/%3E%3Cpath d='M38 20c-2-3-5-4-9-4-8 0-14 7-14 16s6 16 14 16c4 0 7-1 9-4l-5-6c-1 1-2 2-4 2-4 0-7-3-7-8s3-8 7-8c2 0 3 1 4 2z' fill='%230b100e'/%3E%3C/svg%3E">
<title>${esc(title)} — CLAWPTCHA</title>
<style>${STYLE}</style></head>
<body${bodyClass}><main class="${mainClass}">${body}</main></body></html>`;
}

function commandBar(tag: string, prRef?: string, timerHtml = ""): string {
  return `<header class="commandbar">
  <div class="brand-lockup"><span class="mark" aria-hidden="true">C</span><span class="brand-name">CLAWPTCHA</span></div>
  <div class="command-context">
    <span class="command-sep" aria-hidden="true"></span>
    <span class="command-title">${esc(tag)}</span>
    ${prRef ? `<span class="command-sep" aria-hidden="true"></span><span class="command-ref">${esc(prRef)}</span>` : ""}
  </div>
  <div class="command-meta">
    <span class="command-pill"><span class="seal" aria-hidden="true">✓</span>Summary telemetry only</span>
    ${timerHtml}
  </div>
</header>`;
}

function progressRail(index: number, total: number): string {
  const pct = total <= 1 ? 100 : Math.max(0, Math.min(100, (index / (total - 1)) * 100));
  const items = Array.from({ length: total }, (_, i) => {
    const state = i < index ? "done" : i === index ? "active" : "";
    const mark = i < index ? "✓" : String(i + 1);
    return `<li class="${state}"><b>${mark}</b><span>${i === index ? "Current" : `Question ${i + 1}`}</span></li>`;
  }).join("");
  return `<ol class="rail" style="--steps:${total};--rail-scale:${pct / 100}">${items}</ol>`;
}

function stageRail(stage: "verify" | "answer" | "attest"): string {
  const stages = [
    ["verify", "Verify"],
    ["answer", "Answer"],
    ["attest", "Attest"],
  ] as const;
  const activeIndex = stages.findIndex(([id]) => id === stage);
  const items = stages.map(([id, label], i) => {
    const state = i < activeIndex ? "done" : id === stage ? "active" : "";
    const mark = i < activeIndex ? "✓" : String(i + 1);
    return `<li class="${state}"><b>${mark}</b><span>${label}</span></li>`;
  }).join("");
  return `<ol class="rail" style="--steps:3;--rail-scale:${activeIndex / 2}">${items}</ol>`;
}

function contextPanel(prRef: string, variant: "start" | "question"): string {
  return `<aside class="context-panel" aria-label="Challenge context">
  <div class="context-tabs" aria-hidden="true">
    <span class="context-tab active">PR summary</span>
    <span class="context-tab">Policy</span>
  </div>
  <section class="context-section">
    <h2>${esc(prRef)}</h2>
    <div class="info-list">
      <div class="info-item"><span class="info-icon">4</span><span><b>Four questions</b>One at a time. No back navigation.</span></div>
      <div class="info-item"><span class="info-icon">90</span><span><b>Ninety seconds each</b>Expiration submits the current question as unanswered.</span></div>
      <div class="info-item"><span class="info-icon">A</span><span><b>Public attestation</b>Passing records that you understand the intent, behavior, and blast radius of this PR.</span></div>
    </div>
  </section>
  <section class="state-card">
    <h3>${variant === "start" ? "Privacy line" : "Answer what the PR does"}</h3>
    <p>${variant === "start"
      ? "CLAWPTCHA reports summary timing, interaction statistics, and passive canary signals to maintainers. It never records keystrokes, answer text, webcam data, or invasive browser data."
      : "The quiz tests intent, effects, and affected areas rather than line-by-line recall. Correct answers stay server-side."}</p>
  </section>
  <div class="status-strip info">
    <span class="status-dot">i</span>
    <span class="status-copy"><b>Telemetry informs review</b><span>It never auto-fails an otherwise correct quiz.</span></span>
  </div>
</aside>`;
}

function statusTone(title: string): "ok" | "warn" | "crit" | "info" {
  const text = title.toLowerCase();
  if (text.includes("passed")) return "ok";
  if (text.includes("awaiting") || text.includes("canceled")) return "info";
  if (text.includes("wrong") || text.includes("oauth") || text.includes("sign-in")) return "warn";
  if (text.includes("not found") || text.includes("cannot") || text.includes("error") || text.includes("went wrong")) return "crit";
  return "warn";
}

function statusSymbol(tone: "ok" | "warn" | "crit" | "info"): string {
  if (tone === "ok") return "✓";
  if (tone === "crit") return "!";
  if (tone === "info") return "i";
  return "!";
}

function honeypotField(enabled: boolean): string {
  if (!enabled) return "";
  return `
          <div class="honeypot-field" aria-hidden="true">
            <label>Leave this field blank
              <input type="text" name="${HONEYPOT_FIELD_NAME}" tabindex="-1" autocomplete="off">
            </label>
          </div>`;
}

export function homePage(servedOrigin = "https://clawptcha.idosalomon.workers.dev"): string {
  const servedHost = servedOrigin.replace(/^https?:\/\//, "");
  return layout("Say yes to contributions. No to slop", `
<div class="claw-shell">
  <nav class="claw-top" aria-label="Primary">
    <a class="claw-brand" href="/" aria-label="CLAWPTCHA home"><span class="claw-mark" aria-hidden="true">C</span><span>CLAWPTCHA</span></a>
    <div class="claw-links">
      <a href="#why">Why</a>
      <a href="#policy">Policy</a>
      <a href="/docs/">Docs</a>
      <a href="#install">Install</a>
    </div>
  </nav>

  <section class="claw-hero" aria-labelledby="home-title">
    <div class="claw-copy">
      <p class="claw-kicker">Free open-source PR governance for maintainers.</p>
      <h1 id="home-title">Proof before<br>review.</h1>
      <p class="claw-lead">Let good PRs through. Ask contextless changes to prove ownership first. CLAWPTCHA complements code review, CI, tests, and branch protection.<br><b>AI is welcome. Unowned diffs are not.</b></p>
      <div class="claw-actions">
        <a class="claw-button primary" href="#install">Use free managed service</a>
        <a class="claw-button" href="https://deploy.workers.cloudflare.com/?url=https://github.com/idosal/CLAWPTCHA" target="_blank" rel="noopener noreferrer">Self-deploy</a>
      </div>
    </div>

    <aside class="policy-receipt" aria-label="GitHub Actions policy report example">
      <div class="receipt-head"><span class="receipt-dot" aria-hidden="true">!</span><div><strong>CLAWPTCHA check</strong><span>pull_request #482</span></div></div>
      <h2 class="receipt-title">Policy check</h2>
      <div class="receipt-lines">
        <div class="receipt-line"><b>✓</b><span><strong>Policy loaded</strong><small>accountability, trust tiers, gates</small></span></div>
        <div class="receipt-line"><b>!</b><span><strong>Linked issue missing</strong><small>first-time contributor path</small></span></div>
        <div class="receipt-line"><b>!</b><span><strong>Proof required</strong><small>author explanation before review</small></span></div>
        <div class="receipt-line"><b>i</b><span><strong>Signals recorded</strong><small>honeypots stay report-only</small></span></div>
      </div>
      <p class="receipt-foot">Check run posted to the PR.</p>
    </aside>
  </section>

  <section class="policy-strip" id="policy" aria-label="CLAWPTCHA workflow">
    <div class="policy-chip"><b>Read repo policy</b><span>accountability, gates, exemptions</span></div>
    <div class="policy-chip"><b>Trust context</b><span>teams, roles, prior PRs</span></div>
    <div class="policy-chip"><b>Scope the gate</b><span>drafts, files, and size</span></div>
    <div class="policy-chip"><b>Post check run</b><span>status, annotations, signals</span></div>
  </section>

  <section class="claw-section" id="why">
    <div>
      <h2>Keep maintainers in control.</h2>
      <p>CLAWPTCHA is a free open-source PR governance layer that fits alongside existing maintainer workflows. You choose the directories, draft behavior, contributor trust tiers, and accountability checks that should trigger proof. Honeypot and canary signals stay report-only. The default is fail-open.</p>
    </div>
    <aside class="install-ticket" id="install" aria-label="Install CLAWPTCHA">
      <h3>Install path</h3>
      <div class="install-mode"><b>Free managed</b><span>Hosted CLAWPTCHA is free for open-source repos. Install the managed GitHub App; keep policy in your repo.</span></div>
      <div class="install-mode"><b>Self-deploy</b><span>Run the open-source Worker, D1, GitHub App, and model provider in your own Cloudflare account.</span></div>
      <p>Privacy: the managed service is for installed public repositories; it stores public PR challenge state, contributor-accepted answers, and summary signals.</p>
      <p>Team exemptions require GitHub Members read permission; leave them unset if you do not want team lookups.</p>
      <a class="claw-button primary" href="https://deploy.workers.cloudflare.com/?url=https://github.com/idosal/CLAWPTCHA" target="_blank" rel="noopener noreferrer">Deploy to Cloudflare</a>
      <p>Self-deploy CLI:</p>
      <code>npx wrangler login &amp;&amp; npm run setup</code>
      <p>Managed service: <strong>${esc(servedHost)}</strong></p>
      <p>Policy stays with the repo. Review stays with maintainers.</p>
    </aside>
  </section>

  <section class="claw-section docs-section" id="docs" aria-labelledby="docs-title">
    <div class="docs-intro">
      <div>
        <h2 id="docs-title">Docs built for operators.</h2>
        <p>The documentation now lives in a Starlight docs site with sidebar navigation, generated routes, anchored headings, tables, and code examples. Start with why the gate exists, roll out a first policy, then use the operator guides for issue triage, accountability, trust tiers, draft and path scope, passive signals, common practices, and configuration.</p>
      </div>
      <nav class="docs-index" aria-label="Documentation sections">
        <b>Documentation</b>
        <a href="/docs/">Overview</a>
        <a href="/docs/why-clawptcha/">Why use it</a>
        <a href="/docs/getting-started/">Getting started</a>
        <a href="/docs/deployment/">Deployment</a>
        <a href="/docs/policy/">Policy evaluation</a>
        <a href="/docs/issue-triage/">Issue-backed triage</a>
        <a href="/docs/passive-signals/">Passive signals</a>
        <a href="/docs/challenge-lifecycle/">Challenge lifecycle</a>
        <a href="/docs/common-practices/">Common practices</a>
        <a href="/docs/verification/">Verification checklist</a>
        <a href="/docs/privacy-data/">Privacy and data</a>
        <a href="/docs/configuration/">Configuration</a>
      </nav>
    </div>
    <div class="docs-feature" aria-label="CLAWPTCHA documentation">
      <a class="primary-doc" href="/docs/">
        <b>Open the Starlight docs</b>
        <span>Read the full CLAWPTCHA operating model in the dedicated docs framework.</span>
      </a>
      <a href="/docs/why-clawptcha/">
        <b>Why use it</b>
        <span>When CLAWPTCHA belongs alongside code review, CI, tests, branch protection, and existing maintainer workflows.</span>
      </a>
      <a href="/docs/getting-started/">
        <b>Getting started</b>
        <span>Add the first policy file, test expected scenarios, and tighten only the paths that need it.</span>
      </a>
      <a href="/docs/deployment/">
        <b>Deployment</b>
        <span>Choose managed service or self-deploy, then configure GitHub App, Turnstile, model provider, and Flue.</span>
      </a>
      <a href="/docs/policy/">
        <b>Policy evaluation</b>
        <span>Merge-target config, accountability preflight, trust tiers, exemptions, malformed-field fallback, and fail-open behavior.</span>
      </a>
      <a href="/docs/issue-triage/">
        <b>Issue-backed triage</b>
        <span>How linked issues, trusted labels, assignees, and semantic match exempt planned work.</span>
      </a>
      <a href="/docs/passive-signals/">
        <b>Passive signals</b>
        <span>Honeypot fields, code canaries, added-line matching, and report-only review evidence.</span>
      </a>
      <a href="/docs/common-practices/">
        <b>Common practices</b>
        <span>Rollout guidance for trust tiers, honeypot files, issue-backed triage, path rules, drafts, and output volume.</span>
      </a>
      <a href="/docs/verification/">
        <b>Verification checklist</b>
        <span>Smoke-test real repository scenarios, failure drills, and rollout evidence before relying on the check.</span>
      </a>
      <a href="/docs/privacy-data/">
        <b>Privacy and data</b>
        <span>What managed CLAWPTCHA stores, what stays transient, and what contributors accept before a challenge starts.</span>
      </a>
      <a href="/docs/configuration/">
        <b>Configuration</b>
        <span>The current policy surface for accountability, gates, trust tiers, file scope, drafts, signals, approval, retries, and investigation.</span>
      </a>
    </div>
  </section>

  <footer class="claw-footer">
    <span>Free open-source maintainer infra with a weird little gate.</span>
    <span>Free managed or self-deploy.</span>
  </footer>
</div>`, {
    bodyClass: "site-body",
    mainClass: "site-page",
    description: "CLAWPTCHA is free open-source GitHub PR governance that complements code review, CI, tests, and branch protection with accountability checks and trust exemptions."
  });
}

export function startPage(
  prRef: string, turnstileSiteKey: string, challengeId: string, honeypotEnabled = true,
  startError = ""
): string {
  return layout("Challenge", `
<div class="app">
  ${commandBar("Comprehension gate", prRef)}
  <div class="console">
    <section class="workspace" aria-labelledby="challenge-title">
      ${stageRail("verify")}
      <div class="prelude">
        <p class="kicker-row"><span class="pill">PR challenge</span><span class="ref">${esc(prRef)}</span></p>
        <h1 id="challenge-title">Show you understand this change before it merges.</h1>
        <p class="lead">CLAWPTCHA asks PR-specific questions about <b>intent, behavior, and blast radius</b>. It does not prove you are human. It records that you stood behind the change.</p>
        <div class="privacy-note">
          <p><b>Privacy posture</b>Managed CLAWPTCHA is for installed public repositories. Its PR check is part of the same public contribution surface as CI, review gates, and the pull request itself; detailed answers and summary signals are stored for maintainer review. Raw diffs are read transiently, and no keystrokes or answer text are recorded.</p>
          <p><a href="/docs/privacy-data/" target="_blank" rel="noopener noreferrer">Read the data note</a></p>
        </div>
        <form class="start-actions" method="POST" action="/challenge/${esc(challengeId)}/start" id="startForm">
          ${honeypotField(honeypotEnabled)}
          ${startError ? `<p class="form-error" role="alert">${esc(startError)}</p>` : ""}
          <label class="consent-check">
            <input type="checkbox" name="terms_acceptance" value="accepted" required>
            <span><strong>I accept the challenge terms.</strong><small>Use this repository and PR context to generate the quiz, post the outcome on the PR like other review gates, and store my answers plus summary signals for the PR's maintainers.</small></span>
          </label>
          <div class="turnstile-box"><div class="cf-turnstile" data-sitekey="${esc(turnstileSiteKey)}"></div><span class="turnstile-fallback">Turnstile check</span></div>
          <button class="btn" type="submit" id="startButton">Begin challenge</button>
        </form>
      </div>
    </section>
    ${contextPanel(prRef, "start")}
  </div>
</div>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
<script>
(function () {
  var form = document.getElementById("startForm");
  var button = document.getElementById("startButton");
  if (!form || !button) return;
  form.addEventListener("submit", function () {
    button.disabled = true;
    button.textContent = "Starting challenge...";
  });
})();
</script>`);
}

export function questionPage(
  challengeId: string, index: number, total: number, q: ClientQuestion, timeLimitMs: number,
  honeypotEnabled = true
): string {
  const inputType = q.multiSelect ? "checkbox" : "radio";
  const meta = questionMeta[q.type];
  const options = q.options
    .map(
      (opt, i) =>
        `<label class="opt"><input type="${inputType}" name="answer" value="${i}"><span class="choice-letter" aria-hidden="true">${choiceLabels[i] ?? i + 1}</span><span class="t">${esc(opt)}</span></label>`
    )
    .join("");
  const timer = `<span class="command-pill timer" id="timer" role="timer" aria-live="off"><span id="tnum">${Math.ceil(timeLimitMs / 1000)}</span><span class="u">s</span></span>`;
  return layout(`Question ${index + 1}`, `
<div class="app">
  ${commandBar("Comprehension gate", `Question ${index + 1} of ${total}`, timer)}
  <div class="console">
    <section class="workspace" aria-labelledby="question-title">
      ${progressRail(index, total)}
      <div class="question-top">
        <span class="step">Question <em>${index + 1}</em> of ${total}</span>
      </div>
      <p class="question-type">${esc(meta.label)}</p>
      <h1 class="qh" id="question-title">${esc(q.prompt)}</h1>
      <p class="hint">${esc(meta.hint)} Correct answers are never sent to the browser.</p>
      <form class="answer-form" method="POST" action="/challenge/${esc(challengeId)}/answer" id="f" data-answer-form>
        ${honeypotField(honeypotEnabled)}
        <fieldset class="opts">
          <legend class="sr-only">Answer choices</legend>
          ${options}
        </fieldset>
        <input type="hidden" name="qi" value="${index}">
        <input type="hidden" name="telemetry" id="telemetry">
        <div class="actionbar">
          <p class="choice-status" id="choiceStatus" aria-live="polite">Select an answer to continue.</p>
          <div class="action-group">
            <button class="btn-secondary" type="submit" name="skip" value="1" id="skipButton">Skip question</button>
            <button class="btn" type="submit" id="submitButton" data-submit disabled>Submit answer</button>
          </div>
        </div>
      </form>
    </section>
    ${contextPanel("Challenge context", "question")}
  </div>
</div>
<script>
(function () {
  var LIMIT = ${timeLimitMs};
  var deadline = Date.now() + LIMIT;
  var forceSubmit = false;
  var t = { start: Date.now(), changes: 0, dist: 0, samples: 0, focusLoss: 0,
            webdriver: !!navigator.webdriver, lx: null, ly: null };
  document.addEventListener("pointermove", function (e) {
    if (t.lx !== null) t.dist += Math.hypot(e.clientX - t.lx, e.clientY - t.ly);
    t.lx = e.clientX; t.ly = e.clientY; t.samples++;
  });
  var form = document.getElementById("f");
  var submit = document.getElementById("submitButton");
  var skip = document.getElementById("skipButton");
  var status = document.getElementById("choiceStatus");
  var inputs = Array.prototype.slice.call(document.querySelectorAll("input[name=answer]"));
  function checkedCount() {
    return inputs.filter(function (el) { return el.checked; }).length;
  }
  function updateChoiceStatus() {
    var count = checkedCount();
    if (submit) submit.disabled = count === 0;
    if (!status) return;
    if (count === 0) status.textContent = "Select an answer to continue.";
    else if (${q.multiSelect ? "true" : "false"}) status.textContent = count + " selected. Submit when your set is complete.";
    else status.textContent = "Answer selected. Submit when ready.";
  }
  inputs.forEach(function (el) {
    el.addEventListener("change", function () { t.changes++; updateChoiceStatus(); });
  });
  updateChoiceStatus();
  window.addEventListener("blur", function () { t.focusLoss++; });
  form.addEventListener("submit", function (event) {
    var submitter = event.submitter;
    if (!forceSubmit && submitter !== skip && checkedCount() === 0) {
      event.preventDefault();
      updateChoiceStatus();
      return;
    }
    document.getElementById("telemetry").value = JSON.stringify({
      elapsedMs: Date.now() - t.start, answerChanges: t.changes,
      pointerDistancePx: Math.round(t.dist), pointerSamples: t.samples,
      focusLossCount: t.focusLoss, webdriver: t.webdriver
    });
    if (submitter && submitter !== skip) submitter.textContent = "Submitting...";
    if (submit) submit.disabled = true;
    if (skip) skip.disabled = true;
  });
  var timer = document.getElementById("timer");
  var tnum = document.getElementById("tnum");
  (function tick() {
    var left = Math.max(0, deadline - Date.now());
    var secs = Math.ceil(left / 1000);
    tnum.textContent = secs;
    var warn = secs <= 30, crit = secs <= 10;
    timer.className = "command-pill timer" + (crit ? " crit" : warn ? " warn" : "");
    if (status && crit && checkedCount() === 0) status.textContent = "Time is almost up. Choose an answer or skip.";
    if (left <= 0) {
      forceSubmit = true;
      if (status) status.textContent = "Time expired. Submitting this question as unanswered.";
      form.requestSubmit(skip);
      return;
    }
    setTimeout(tick, 250);
  })();
})();
</script>`);
}

export function resultPage(passed: boolean, score: number, total: number, message: string): string {
  const tone = passed ? "ok" : "warn";
  return layout(passed ? "Passed" : "Not passed", `
<div class="app">
  ${commandBar(passed ? "Attestation ready" : "Needs retry")}
  <div class="result-layout">
    <section class="result-main" aria-labelledby="result-title">
      <div class="result-panel">
        <div class="badge ${tone}" aria-hidden="true">${passed ? "✓" : "!"}</div>
        <p class="result-label">${passed ? "Comprehension attested" : "Threshold not met"}</p>
        <h1 id="result-title">${passed ? "The check is green." : "This attempt did not pass."}</h1>
        <div class="score">${score}<span class="of">/${total}</span></div>
        <p class="result-copy">${esc(message)}</p>
      </div>
    </section>
    <aside class="result-side" aria-label="Result details">
      <div class="status-strip ${tone}">
        <span class="status-dot">${passed ? "✓" : "!"}</span>
        <span class="status-copy"><b>${passed ? "Passed" : "Needs retry"}</b><span>${score}/${total} correct</span></span>
      </div>
      <section class="state-card">
        <h2>${passed ? "What happens next" : "Retry policy"}</h2>
        <p>${passed
          ? "The PR receives an attestation that you understand this change. Maintainers still see summary risk signals."
          : "Retry timing is controlled by the repository policy. A retry receives a fresh quiz."}</p>
      </section>
      <div class="status-strip info">
        <span class="status-dot">i</span>
        <span class="status-copy"><b>Summary telemetry only</b><span>No keystrokes or answer text are recorded.</span></span>
      </div>
    </aside>
  </div>
</div>`);
}

export function errorPage(title: string, message: string): string {
  const tone = statusTone(title);
  const cleanTitle = title.replace(/^✅\\s*/, "");
  return layout(cleanTitle, `
<div class="app">
  ${commandBar("Challenge status")}
  <div class="status-layout">
    <section class="status-main" aria-labelledby="status-title">
      <div class="status-panel">
        <div class="badge ${tone}" aria-hidden="true">${statusSymbol(tone)}</div>
        <p class="status-label">${tone === "ok" ? "Complete" : tone === "info" ? "Waiting" : tone === "crit" ? "Blocked" : "Needs attention"}</p>
        <h1 id="status-title">${esc(cleanTitle)}</h1>
        <p class="status-copy-large">${esc(message)}</p>
      </div>
    </section>
    <aside class="status-side" aria-label="Status context">
      <div class="status-strip ${tone}">
        <span class="status-dot">${statusSymbol(tone)}</span>
        <span class="status-copy"><b>${esc(cleanTitle)}</b><span>Check the PR for the current gate state.</span></span>
      </div>
      <section class="state-card">
        <h2>The CLAWPTCHA line</h2>
        <p>This challenge verifies comprehension of a PR. It does not prove humanness, and CLAWPTCHA-side failures should not block a merge.</p>
      </section>
      <div class="status-strip info">
        <span class="status-dot">i</span>
        <span class="status-copy"><b>Privacy-respecting telemetry</b><span>Timing and interaction summaries only.</span></span>
      </div>
    </aside>
  </div>
</div>`);
}
