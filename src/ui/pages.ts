import type { ClientQuestion } from "../quiz/schema";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const HONEYPOT_FIELD_NAME = "contact_url";

export interface PageAction {
  label: string;
  href: string;
  primary?: boolean;
  external?: boolean;
  id?: string;
}

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
  --radius:12px;
  --radius-sm:8px;
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
.voucha-shell{
  min-height:100vh;
  overflow-x:hidden;
  background:#f3f7f5;
  color:#101816;
}
.voucha-shell *{
  min-width:0;
  max-width:100%;
}
.voucha-top{
  width:min(1120px,calc(100% - 40px));
  min-height:66px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:18px;
  margin:0 auto;
  border-bottom:2px solid #101816;
}
.voucha-brand{
  display:inline-flex;
  align-items:center;
  gap:10px;
  color:#101816;
  font-weight:850;
  text-decoration:none;
}
.voucha-mark{
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
.voucha-links{
  display:flex;
  align-items:center;
  gap:18px;
  color:#293834;
  font-size:.94rem;
  font-weight:750;
}
.voucha-links a{text-decoration:none}
.voucha-links a:not(.gh):hover{text-decoration:underline}
.voucha-links .gh{display:inline-flex;align-items:center;color:#101816}
.voucha-links .gh svg{width:22px;height:22px;display:block;fill:currentColor}
@media (hover:hover) and (pointer:fine){
  .voucha-links .gh:hover{opacity:.65}
}
.voucha-hero{
  width:min(1120px,calc(100% - 40px));
  display:grid;
  grid-template-columns:minmax(0,1fr) minmax(340px,430px);
  gap:40px;
  align-items:center;
  margin:0 auto;
  padding:44px 0 34px;
}
.voucha-copy{min-width:0}
.voucha-kicker{
  display:inline-flex;
  align-items:center;
  gap:10px;
  margin:0 0 16px;
  color:#5e3c76;
  font:850 .94rem/1.25 var(--sans);
}
.voucha-kicker::before{
  content:"";
  width:10px;
  height:10px;
  border-radius:999px;
  background:#5e3c76;
}
.voucha-copy h1{
  max-width:9ch;
  margin:0;
  color:#101816;
  font-size:clamp(3.4rem,7vw,5.9rem);
  line-height:.9;
  font-weight:900;
  letter-spacing:0;
  text-wrap:balance;
}
.voucha-lead{
  max-width:48ch;
  margin:18px 0 0;
  color:#2f403b;
  font-size:1.22rem;
  line-height:1.42;
}
.voucha-lead b{
  color:#101816;
  font-weight:850;
}
.voucha-actions{
  display:flex;
  flex-wrap:wrap;
  gap:10px;
  margin-top:24px;
}
.voucha-button{
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
.voucha-button.primary{
  background:#101816;
  color:#fffdfa;
  box-shadow:3px 3px 0 #d8f35f;
}
@media (hover:hover) and (pointer:fine){
  .voucha-button:hover{transform:translateY(-1px)}
}
.voucha-button:active{transform:translateY(1px); box-shadow:1px 1px 0 #101816}
.voucha-button.primary:active{box-shadow:1px 1px 0 #d8f35f}
.voucha-button:focus-visible,.voucha-links a:focus-visible{
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
.voucha-section{
  width:min(1120px,calc(100% - 40px));
  display:grid;
  grid-template-columns:minmax(0,.75fr) minmax(280px,.42fr);
  gap:34px;
  align-items:start;
  margin:0 auto;
  padding:38px 0;
  border-top:2px solid #101816;
}
.voucha-section h2{
  max-width:16ch;
  margin:0;
  color:#101816;
  font-size:2.35rem;
  line-height:1.02;
  font-weight:900;
  letter-spacing:0;
  text-wrap:balance;
}
.voucha-section p{
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
.voucha-footer{
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
  .voucha-hero,.voucha-section{
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
  .voucha-shell{padding-right:24px}
  .voucha-top,.voucha-hero,.policy-strip,.voucha-section,.voucha-footer{
    width:auto;
    max-width:none;
    margin-left:16px;
    margin-right:0;
  }
  .voucha-top{min-height:62px}
  .voucha-links{display:none}
  .voucha-hero{
    gap:28px;
    padding:30px 0 28px;
  }
  .voucha-copy h1{
    width:100%;
    max-width:100%;
    font-size:3rem;
    overflow-wrap:anywhere;
  }
  .voucha-lead{
    width:100%;
    max-width:100%;
    font-size:1rem;
    overflow-wrap:anywhere;
  }
  .voucha-kicker{
    gap:8px;
    font-size:.9rem;
  }
  .voucha-kicker::before{
    width:9px;
    height:9px;
  }
  .voucha-actions{
    display:grid;
    width:320px;
    max-width:calc(100vw - 56px);
  }
  .voucha-button{
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
  .voucha-section p,
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
  .voucha-section{
    gap:18px;
    padding:30px 0;
  }
  .voucha-section h2{font-size:2rem}
  .install-ticket code{
    white-space:pre-wrap;
    overflow-wrap:anywhere;
  }
  .voucha-footer{flex-direction:column}
}
.app{
  min-height:min(760px,calc(100vh - 48px));
  overflow:hidden;
  border:1px solid var(--line);
  border-radius:var(--radius);
  background:var(--canvas);
  box-shadow:0 24px 70px -56px rgba(0,0,0,.55);
}
.commandbar{
  min-height:64px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:18px;
  padding:13px 18px;
  border-bottom:1px solid var(--line);
  background:var(--canvas);
  color:var(--ink);
}
.brand-lockup,.command-context,.command-meta{
  display:flex;
  align-items:center;
  min-width:0;
}
.brand-lockup{gap:12px}
.mark{
  width:34px;
  height:34px;
  flex:none;
  display:grid;
  place-items:center;
  border:1px solid var(--line-strong);
  border-radius:8px;
  background:var(--ink);
  color:var(--canvas);
  font-weight:850;
  line-height:1;
}
.brand-name{
  font-size:1rem;
  font-weight:780;
  letter-spacing:0;
}
.command-context{
  flex:1;
  gap:14px;
  color:var(--ink-dim);
}
.command-sep{
  width:1px;
  height:28px;
  background:var(--line);
}
.command-title{
  color:var(--ink);
  font-weight:650;
  white-space:nowrap;
}
.command-ref{
  min-width:0;
  overflow:hidden;
  color:var(--ink-faint);
  font:650 .9rem/1.2 var(--mono);
  text-overflow:ellipsis;
  white-space:nowrap;
}
.command-meta{
  gap:12px;
  color:var(--ink-dim);
  font-size:.94rem;
}
.command-pill{
  display:inline-flex;
  align-items:center;
  gap:8px;
  min-height:32px;
  padding:0 10px;
  border:1px solid var(--line);
  border-radius:999px;
  color:var(--ink-dim);
  background:var(--panel);
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
  grid-template-columns:minmax(0,1fr) 344px;
  min-height:calc(min(760px,100vh - 48px) - 64px);
}
.workspace{
  min-width:0;
  display:flex;
  flex-direction:column;
  padding:38px 44px 0;
}
.context-panel{
  display:flex;
  flex-direction:column;
  gap:24px;
  padding:32px 28px;
  border-left:1px solid var(--line);
  background:var(--panel);
}
.prelude{
  max-width:760px;
  margin:auto 0;
  padding-bottom:40px;
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
  min-height:28px;
  padding:0 10px;
  border-radius:999px;
  background:var(--brand-soft);
  color:var(--accent);
  font-size:.9rem;
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
  font-size:2.34rem;
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
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-height:48px;
  border-radius:var(--radius-sm);
  cursor:pointer;
  font-weight:760;
  text-align:center;
  text-decoration:none;
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
.btn:disabled,.btn-secondary:disabled{
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
.result-actions,.status-actions{
  display:flex;
  flex-wrap:wrap;
  gap:12px;
  margin-top:28px;
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
  padding:0;
  border:0;
  border-radius:0;
  background:transparent;
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
.inline-note{
  max-width:65ch;
  margin-top:22px;
  padding-top:14px;
  border-top:1px solid var(--line);
  color:var(--ink-dim);
  font-size:.96rem;
}
.inline-note b{
  display:block;
  color:var(--ink);
  font-weight:760;
}
.terms-stack{
  display:grid;
  gap:12px;
  min-width:min(100%,560px);
}
.data-line{
  max-width:60ch;
  color:var(--ink-faint);
  font-size:.9rem;
  line-height:1.42;
}
.data-line a,.inline-link{
  color:var(--accent);
  font-weight:740;
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
.command-card{
  display:grid;
  gap:5px;
  min-width:min(100%,520px);
  padding:13px 14px;
  border:1px solid var(--line);
  border-radius:var(--radius-sm);
  background:var(--canvas);
  color:var(--ink-dim);
}
.command-card strong{
  display:block;
  color:var(--ink);
  font-weight:760;
}
.command-card code{
  display:block;
  max-width:100%;
  margin-top:4px;
  color:var(--ink);
  font:750 .92rem/1.45 var(--mono);
  overflow-wrap:anywhere;
  word-break:break-word;
}
.command-row{
  display:grid;
  grid-template-columns:minmax(0,1fr) auto;
  align-items:center;
  gap:10px;
  margin-top:4px;
  max-width:100%;
}
.command-row code{
  min-width:0;
  margin-top:0;
  overflow-x:auto;
  overflow-y:hidden;
  white-space:pre;
  overflow-wrap:normal;
  word-break:normal;
}
.command-copy-button{
  width:auto;
  min-width:0;
  min-height:34px;
  padding:0 10px;
  font-size:.84rem;
  white-space:nowrap;
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
.start-progress{
  width:100%;
  max-width:640px;
  display:grid;
  gap:12px;
  padding:13px 14px;
  border:1px solid var(--line);
  border-radius:var(--radius-sm);
  background:var(--panel);
  color:var(--ink-dim);
}
.start-progress[hidden]{display:none}
.start-progress strong{
  display:block;
  color:var(--ink);
  font-weight:760;
}
.start-progress p{
  margin:0;
  font-size:.92rem;
  line-height:1.42;
}
.start-progress ol{
  display:grid;
  gap:8px;
  margin:0;
  padding:0;
  list-style:none;
}
.start-progress li{
  display:flex;
  align-items:center;
  gap:9px;
  min-width:0;
  color:var(--ink-faint);
  font-size:.9rem;
}
.start-progress li::before{
  content:"";
  width:10px;
  height:10px;
  flex:0 0 auto;
  border:2px solid var(--line-strong);
  border-radius:999px;
  background:var(--canvas);
}
.start-progress li.active{
  color:var(--ink);
  font-weight:690;
}
.start-progress li.active::before{
  border-color:var(--brand);
  background:var(--brand);
  box-shadow:0 0 0 4px color-mix(in oklch,var(--brand-soft) 85%,transparent);
}
.start-progress li.done{
  color:var(--ink-dim);
}
.start-progress li.done::before{
  border-color:var(--ok);
  background:var(--ok);
}
.context-tabs{
  display:none;
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
  gap:11px;
  padding-bottom:22px;
  border-bottom:1px solid var(--line);
}
.context-section:last-child{border-bottom:0; padding-bottom:0}
.context-section h2,.context-section h3{
  color:var(--ink);
  font-size:1rem;
  font-weight:780;
}
.side-kicker{
  color:var(--ink-faint);
  font-size:.78rem;
  font-weight:780;
  text-transform:uppercase;
}
.info-list{
  display:grid;
  gap:11px;
}
.info-item{
  display:grid;
  grid-template-columns:26px minmax(0,1fr);
  gap:10px;
  align-items:start;
  color:var(--ink-dim);
  font-size:.94rem;
}
.info-icon{
  width:26px;
  height:26px;
  display:grid;
  place-items:center;
  border:1px solid var(--line);
  border-radius:7px;
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
.plain-list{
  display:grid;
  gap:9px;
  margin:0;
  padding:0;
  color:var(--ink-dim);
  font-size:.94rem;
  list-style:none;
}
.plain-list li{
  position:relative;
  padding-left:17px;
}
.plain-list li::before{
  content:"";
  position:absolute;
  left:0;
  top:.68em;
  width:6px;
  height:6px;
  border-radius:999px;
  background:var(--accent);
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

/* Challenge flow craft pass: compact PR-native task runner. */
body:not(.site-body){
  color-scheme:light;
  --bg:#f6f8fa;
  --canvas:#ffffff;
  --panel:#f6f8fa;
  --panel-2:#f1f4f8;
  --ink:#24292f;
  --ink-dim:#57606a;
  --ink-faint:#6e7781;
  --line:#d0d7de;
  --line-strong:#8c959f;
  --brand:#0969da;
  --brand-soft:#ddf4ff;
  --brand-ink:#ffffff;
  --accent:#0969da;
  --ok:#1a7f37;
  --ok-soft:#dafbe1;
  --warn:#9a6700;
  --warn-soft:#fff8c5;
  --crit:#cf222e;
  --crit-soft:#ffebe9;
  --info:#0969da;
  --info-soft:#ddf4ff;
  --focus:#0969da;
  padding:24px;
  background:var(--bg);
  color:var(--ink);
  font-size:15px;
  line-height:1.5;
}
body:not(.site-body) .wrap{
  max-width:1120px;
}
body:not(.site-body) .app{
  min-height:auto;
  overflow:hidden;
  border:1px solid var(--line);
  border-radius:8px;
  background:var(--canvas);
  box-shadow:none;
}
body:not(.site-body) .commandbar{
  min-height:56px;
  gap:14px;
  padding:12px 16px;
  border-bottom:1px solid var(--line);
  background:#ffffff;
}
body:not(.site-body) .brand-lockup{gap:9px}
body:not(.site-body) .mark{
  width:28px;
  height:28px;
  border-color:#0b100e;
  border-radius:6px;
  background:#ff7a59;
  color:#0b100e;
  font-size:.82rem;
  box-shadow:none;
}
body:not(.site-body) .brand-name{
  font-size:.92rem;
  font-weight:700;
}
body:not(.site-body) .command-context{
  gap:10px;
  font-size:.92rem;
}
body:not(.site-body) .command-sep{
  height:22px;
}
body:not(.site-body) .command-title{
  font-weight:600;
}
body:not(.site-body) .command-ref{
  color:var(--ink-dim);
  font-size:.84rem;
  font-weight:500;
}
body:not(.site-body) .command-meta{
  gap:8px;
}
body:not(.site-body) .command-pill{
  min-height:28px;
  padding:0 9px;
  border-radius:999px;
  background:#f6f8fa;
  color:var(--ink-dim);
  font-size:.86rem;
  font-weight:500;
}
body:not(.site-body) .seal{
  width:16px;
  height:16px;
  border-radius:999px;
  font-size:.65rem;
}
body:not(.site-body) .console,
body:not(.site-body) .result-layout,
body:not(.site-body) .status-layout{
  grid-template-columns:minmax(0,1fr) 300px;
  min-height:0;
}
body:not(.site-body) .workspace,
body:not(.site-body) .result-main,
body:not(.site-body) .status-main{
  padding:28px 32px 32px;
}
body:not(.site-body) .workspace{
  display:block;
}
body:not(.site-body) .context-panel,
body:not(.site-body) .result-side,
body:not(.site-body) .status-side{
  gap:0;
  padding:24px;
  border-left:1px solid var(--line);
  background:#f6f8fa;
}
body:not(.site-body) .prelude{
  max-width:680px;
  margin:0;
  padding:0;
}
body:not(.site-body) .kicker-row{
  gap:8px;
  margin-bottom:10px;
}
body:not(.site-body) .pill{
  min-height:24px;
  padding:0 8px;
  border:1px solid var(--line);
  border-radius:999px;
  background:#f6f8fa;
  color:var(--ink-dim);
  font-size:.82rem;
  font-weight:600;
}
body:not(.site-body) .ref{
  color:var(--ink-dim);
  font-size:.86rem;
}
body:not(.site-body) h1{
  max-width:18em;
  font-size:1.55rem;
  line-height:1.25;
  font-weight:650;
}
body:not(.site-body) .lead{
  max-width:64ch;
  margin-top:8px;
  color:var(--ink-dim);
  font-size:.98rem;
}
body:not(.site-body) .rail{
  display:flex;
  gap:0;
  align-items:center;
  margin:0 0 26px;
}
body:not(.site-body) .rail::before,
body:not(.site-body) .rail::after{
  display:none;
}
body:not(.site-body) .rail li{
  display:flex;
  flex-direction:row;
  align-items:center;
  gap:7px;
  color:var(--ink-faint);
  font-size:.88rem;
  font-weight:500;
}
body:not(.site-body) .rail li + li::before{
  content:"/";
  margin:0 12px 0 10px;
  color:var(--line-strong);
}
body:not(.site-body) .rail b{
  width:22px;
  height:22px;
  border-radius:999px;
  background:#ffffff;
  color:var(--ink-faint);
  font-size:.72rem;
  font-weight:700;
}
body:not(.site-body) .rail li.done b{
  border-color:#2da44e;
  background:var(--ok-soft);
  color:var(--ok);
}
body:not(.site-body) .rail li.active{
  color:var(--ink);
  font-weight:600;
}
body:not(.site-body) .rail li.active b{
  border-color:var(--brand);
  background:var(--brand);
  color:#fff;
}
body:not(.site-body) .inline-note{
  max-width:64ch;
  margin-top:16px;
  padding:10px 12px;
  border:1px solid var(--line);
  border-radius:6px;
  background:#f6f8fa;
  color:var(--ink-dim);
  font-size:.92rem;
}
body:not(.site-body) .inline-note b{
  margin-bottom:2px;
  font-size:.92rem;
}
body:not(.site-body) .start-actions{
  display:grid;
  grid-template-columns:minmax(280px,360px) auto;
  align-items:end;
  gap:12px;
  margin-top:22px;
}
body:not(.site-body) .verify-actions{
  grid-template-columns:minmax(150px,1.2fr) repeat(3,minmax(112px,.9fr));
  align-items:start;
}
body:not(.site-body) .verify-actions > .btn,
body:not(.site-body) .verify-actions > .btn-secondary{
  width:100%;
  min-width:0;
}
body:not(.site-body) .start-actions .form-error,
body:not(.site-body) .start-actions .terms-stack,
body:not(.site-body) .start-actions .command-card,
body:not(.site-body) .start-actions .choice-status,
body:not(.site-body) .start-actions .start-progress{
  grid-column:1 / -1;
}
body:not(.site-body) .terms-stack{
  max-width:640px;
  min-width:0;
  gap:8px;
}
body:not(.site-body) .consent-check,
body:not(.site-body) .command-card{
  min-width:0;
  max-width:640px;
  padding:11px 12px;
  border-radius:6px;
  background:#fff;
}
body:not(.site-body) .consent-check input{
  accent-color:var(--brand);
}
body:not(.site-body) .consent-check strong,
body:not(.site-body) .command-card strong{
  font-size:.94rem;
  font-weight:600;
}
body:not(.site-body) .consent-check small,
body:not(.site-body) .command-card small{
  color:var(--ink-dim);
  font-size:.87rem;
}
body:not(.site-body) .command-card code{
  color:var(--ink);
  font-size:.9rem;
  font-weight:600;
}
body:not(.site-body) .command-copy-button{
  width:auto;
  min-width:76px;
  min-height:32px;
  padding:0 10px;
  font-size:.84rem;
}
body:not(.site-body) .data-line{
  max-width:64ch;
  color:var(--ink-dim);
  font-size:.88rem;
}
body:not(.site-body) .start-progress{
  max-width:640px;
  padding:11px 12px;
  border-radius:6px;
  background:#f6f8fa;
}
body:not(.site-body) .start-progress p,
body:not(.site-body) .start-progress li{
  font-size:.88rem;
}
body:not(.site-body) .data-line a,
body:not(.site-body) .inline-link{
  color:var(--brand);
  font-weight:600;
}
body:not(.site-body) .turnstile-box{
  min-width:0;
  width:320px;
  min-height:72px;
  padding:8px;
  border-radius:6px;
  background:#f6f8fa;
}
body:not(.site-body) .btn,
body:not(.site-body) .btn-secondary{
  min-height:40px;
  border-radius:6px;
  font-size:.94rem;
  font-weight:600;
}
body:not(.site-body) .btn{
  min-width:150px;
  padding:0 14px;
  background:var(--brand);
  color:#fff;
  box-shadow:none;
}
body:not(.site-body) .btn-secondary{
  border-color:var(--line);
  background:#fff;
  color:var(--ink);
}
@media (hover:hover){
  body:not(.site-body) .btn:hover{background:#0757b8; filter:none}
  body:not(.site-body) .btn-secondary:hover{border-color:var(--line-strong); background:#f6f8fa}
}
body:not(.site-body) .context-section{
  gap:8px;
  padding:0 0 18px;
  margin:0 0 18px;
  border-bottom:1px solid var(--line);
}
body:not(.site-body) .context-section:last-child{
  margin-bottom:0;
}
body:not(.site-body) .context-section h2,
body:not(.site-body) .context-section h3{
  font-size:.94rem;
  font-weight:600;
}
body:not(.site-body) .side-kicker{
  color:var(--ink-dim);
  font-size:.82rem;
  font-weight:500;
  text-transform:none;
}
body:not(.site-body) .info-list{
  gap:8px;
}
body:not(.site-body) .info-item{
  grid-template-columns:22px minmax(0,1fr);
  gap:8px;
  color:var(--ink-dim);
  font-size:.88rem;
}
body:not(.site-body) .info-icon{
  width:22px;
  height:22px;
  border-radius:999px;
  background:#fff;
  color:var(--ink-dim);
  font-size:.7rem;
}
body:not(.site-body) .info-item b{
  color:var(--ink);
  font-weight:600;
}
body:not(.site-body) .plain-list{
  gap:7px;
  color:var(--ink-dim);
  font-size:.88rem;
}
body:not(.site-body) .plain-list li{
  padding-left:14px;
}
body:not(.site-body) .plain-list li::before{
  top:.7em;
  width:4px;
  height:4px;
  background:var(--ink-faint);
}
body:not(.site-body) .question-top{
  margin-bottom:10px;
}
body:not(.site-body) .step,
body:not(.site-body) .question-type{
  color:var(--ink-dim);
  font-size:.9rem;
  font-weight:500;
}
body:not(.site-body) .step em{
  color:var(--ink);
  font-weight:600;
}
body:not(.site-body) .qh{
  max-width:34em;
  font-size:1.25rem;
  line-height:1.35;
  font-weight:650;
}
body:not(.site-body) .hint{
  max-width:68ch;
  margin-top:8px;
  color:var(--ink-dim);
  font-size:.92rem;
}
body:not(.site-body) .answer-form{
  margin-top:22px;
}
body:not(.site-body) .opts{
  gap:8px;
  padding-bottom:20px;
}
body:not(.site-body) .opt{
  grid-template-columns:30px minmax(0,1fr);
  gap:10px;
  min-height:48px;
  padding:10px 12px;
  border-radius:6px;
}
body:not(.site-body) .choice-letter{
  width:26px;
  height:26px;
  border-radius:6px;
  background:#f6f8fa;
  font-size:.74rem;
}
body:not(.site-body) .opt:has(input:checked){
  border-color:#0969da;
  background:#ddf4ff;
}
body:not(.site-body) .opt:has(input:checked) .choice-letter{
  border-color:#0969da;
  background:#0969da;
  color:#fff;
}
body:not(.site-body) .actionbar{
  margin:0 -32px -32px;
  padding:14px 32px;
  background:#f6f8fa;
}
body:not(.site-body) .timer{
  min-width:66px;
  min-height:28px;
  padding:0 9px;
  border-radius:999px;
  background:#f6f8fa;
  font-size:.88rem;
}
body:not(.site-body) .timer.crit{
  border-color:var(--crit);
  background:var(--crit-soft);
  color:var(--crit);
}
body:not(.site-body) .result-main,
body:not(.site-body) .status-main{
  align-content:start;
}
body:not(.site-body) .result-panel,
body:not(.site-body) .status-panel{
  max-width:680px;
}
body:not(.site-body) .badge{
  width:32px;
  height:32px;
  margin-bottom:12px;
  border-radius:999px;
  font-size:1rem;
}
body:not(.site-body) .result-label,
body:not(.site-body) .status-label{
  margin-bottom:6px;
  color:var(--ink-dim);
  font-size:.9rem;
  font-weight:600;
}
body:not(.site-body) .score{
  margin:14px 0 10px;
  font-size:2rem;
  font-weight:650;
}
body:not(.site-body) .score .of{
  color:var(--ink-dim);
  font-size:1rem;
  font-weight:500;
}
body:not(.site-body) .result-copy,
body:not(.site-body) .status-copy-large{
  max-width:64ch;
  color:var(--ink-dim);
  font-size:.98rem;
}
body:not(.site-body) .result-actions,
body:not(.site-body) .status-actions{
  gap:8px;
  margin-top:18px;
}
body:not(.site-body) .status-strip{
  min-height:0;
  align-items:flex-start;
  gap:10px;
  padding:10px 12px;
  border-radius:6px;
  background:#fff;
}
body:not(.site-body) .status-strip.ok{border-color:#2da44e; background:#dafbe1}
body:not(.site-body) .status-strip.warn{border-color:#d4a72c; background:#fff8c5}
body:not(.site-body) .status-strip.crit{border-color:#ff818266; background:#ffebe9}
body:not(.site-body) .status-strip.info{border-color:#54aeff66; background:#ddf4ff}
body:not(.site-body) .status-dot{
  width:20px;
  height:20px;
  margin-top:1px;
  background:transparent;
  font-size:.82rem;
}
body:not(.site-body) .status-copy b{
  font-size:.92rem;
  font-weight:600;
}
body:not(.site-body) .status-copy span{
  color:var(--ink-dim);
  font-size:.86rem;
}
body:not(.site-body) .state-card{
  gap:6px;
  padding:12px;
  border-radius:6px;
  background:#fff;
}
body:not(.site-body) .state-card h2{
  font-size:.95rem;
  font-weight:600;
}
body:not(.site-body) .state-card p{
  color:var(--ink-dim);
  font-size:.88rem;
}
@media (prefers-color-scheme:dark){
  body:not(.site-body){
    color-scheme:dark;
    --bg:#0d1117;
    --canvas:#161b22;
    --panel:#0f141b;
    --panel-2:#21262d;
    --ink:#f0f6fc;
    --ink-dim:#c9d1d9;
    --ink-faint:#8b949e;
    --line:#30363d;
    --line-strong:#484f58;
    --brand:#58a6ff;
    --brand-soft:#102a44;
    --brand-ink:#0d1117;
    --accent:#58a6ff;
    --ok:#56d364;
    --ok-soft:#12361f;
    --warn:#d29922;
    --warn-soft:#3a2b12;
    --crit:#ff7b72;
    --crit-soft:#3d171b;
    --info:#79c0ff;
    --info-soft:#102a44;
    --focus:#58a6ff;
  }
  body:not(.site-body) .app,
  body:not(.site-body) .commandbar,
  body:not(.site-body) .consent-check,
  body:not(.site-body) .command-card,
  body:not(.site-body) .state-card{
    background:var(--canvas);
  }
  body:not(.site-body) .command-pill,
  body:not(.site-body) .pill,
  body:not(.site-body) .inline-note,
  body:not(.site-body) .turnstile-box,
  body:not(.site-body) .actionbar,
  body:not(.site-body) .timer,
  body:not(.site-body) .choice-letter{
    background:var(--panel-2);
  }
  body:not(.site-body) .context-panel,
  body:not(.site-body) .result-side,
  body:not(.site-body) .status-side{
    background:var(--panel);
  }
  body:not(.site-body) .mark{
    border-color:#ff9b7f;
    background:#ff7a59;
    color:#0b100e;
  }
  body:not(.site-body) .btn{
    background:var(--brand);
    color:var(--brand-ink);
  }
  body:not(.site-body) .btn-secondary{
    border-color:var(--line-strong);
    background:var(--canvas);
    color:var(--ink);
  }
  @media (hover:hover){
    body:not(.site-body) .btn:hover{background:#79c0ff}
    body:not(.site-body) .btn-secondary:hover{border-color:#6e7681; background:var(--panel-2)}
  }
  body:not(.site-body) .rail b,
  body:not(.site-body) .info-icon{
    background:var(--canvas);
  }
  body:not(.site-body) .rail li.active b,
  body:not(.site-body) .opt:has(input:checked) .choice-letter{
    border-color:var(--brand);
    background:var(--brand);
    color:var(--brand-ink);
  }
  body:not(.site-body) .opt:has(input:checked){
    border-color:var(--brand);
    background:var(--brand-soft);
  }
  body:not(.site-body) .data-line a,
  body:not(.site-body) .inline-link{
    color:var(--brand);
  }
  body:not(.site-body) .status-strip{
    background:var(--canvas);
  }
  body:not(.site-body) .status-strip.ok{border-color:#2ea043; background:var(--ok-soft)}
  body:not(.site-body) .status-strip.warn{border-color:#9e6a03; background:var(--warn-soft)}
  body:not(.site-body) .status-strip.crit{border-color:#f85149; background:var(--crit-soft)}
  body:not(.site-body) .status-strip.info{border-color:#388bfd; background:var(--info-soft)}
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
  .command-copy-button.btn-secondary{width:auto; min-width:76px}
  .result-actions,.status-actions{display:grid; grid-template-columns:1fr}
  .result-main,.status-main{padding:38px 24px}
}

@media (max-width:940px){
  body:not(.site-body){
    padding:16px;
  }
  body:not(.site-body) .wrap{
    max-width:none;
  }
  body:not(.site-body) .app{
    width:100%;
  }
  body:not(.site-body) .commandbar{
    align-items:flex-start;
    flex-direction:column;
    gap:10px;
  }
  body:not(.site-body) .command-context{
    width:100%;
    flex-wrap:wrap;
    gap:8px;
  }
  body:not(.site-body) .command-meta{
    flex-wrap:wrap;
  }
  body:not(.site-body) .console,
  body:not(.site-body) .result-layout,
  body:not(.site-body) .status-layout{
    grid-template-columns:minmax(0,1fr);
  }
  body:not(.site-body) .workspace,
  body:not(.site-body) .result-main,
  body:not(.site-body) .status-main{
    padding:24px;
  }
  body:not(.site-body) .context-panel,
  body:not(.site-body) .result-side,
  body:not(.site-body) .status-side{
    border-left:0;
    border-top:1px solid var(--line);
    padding:20px 24px;
  }
  body:not(.site-body) .prelude,
  body:not(.site-body) .result-panel,
  body:not(.site-body) .status-panel{
    max-width:none;
  }
  body:not(.site-body) .start-actions{
    grid-template-columns:minmax(0,1fr);
    align-items:stretch;
  }
  body:not(.site-body) .turnstile-box{
    width:100%;
    max-width:320px;
  }
  body:not(.site-body) .btn,
  body:not(.site-body) .btn-secondary{
    width:100%;
    min-width:0;
  }
  body:not(.site-body) .actionbar{
    margin:0 -24px -24px;
    padding:14px 24px;
  }
}

@media (max-width:560px){
  body:not(.site-body){
    padding:12px;
  }
  body:not(.site-body) .commandbar{
    gap:8px;
    padding:12px;
  }
  body:not(.site-body) .brand-name{
    font-size:.94rem;
  }
  body:not(.site-body) .command-context{
    gap:6px 10px;
  }
  body:not(.site-body) .command-ref{
    width:100%;
  }
  body:not(.site-body) .command-meta{
    display:none;
  }
  body:not(.site-body) .workspace,
  body:not(.site-body) .result-main,
  body:not(.site-body) .status-main{
    padding:20px 16px;
  }
  body:not(.site-body) .context-panel,
  body:not(.site-body) .result-side,
  body:not(.site-body) .status-side{
    padding:16px;
  }
  body:not(.site-body) h1{
    font-size:1.38rem;
    line-height:1.28;
  }
  body:not(.site-body) .lead{
    font-size:.94rem;
  }
  body:not(.site-body) .rail{
    flex-wrap:wrap;
    margin-bottom:20px;
  }
  body:not(.site-body) .rail li span{
    display:inline;
  }
  body:not(.site-body) .rail li + li::before{
    margin:0 8px;
  }
  body:not(.site-body) .inline-note,
  body:not(.site-body) .consent-check,
  body:not(.site-body) .command-card,
  body:not(.site-body) .state-card,
  body:not(.site-body) .status-strip{
    border-radius:6px;
  }
  body:not(.site-body) .turnstile-box{
    max-width:100%;
  }
  body:not(.site-body) .actionbar{
    align-items:stretch;
    flex-direction:column;
    margin:0 -16px -20px;
    padding:12px 16px;
  }
  body:not(.site-body) .action-group,
  body:not(.site-body) .result-actions,
  body:not(.site-body) .status-actions{
    display:grid;
    grid-template-columns:1fr;
  }
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

/* VOUCHA public site: maintainer-native, but not a GitHub skin. */
.voucha-shell{
  min-height:100vh;
  overflow-x:hidden;
  background:#f3f7f5;
  color:#101816;
}
.voucha-shell *{
  max-width:100%;
  min-width:0;
}
.voucha-top{
  width:min(1120px,calc(100% - 40px));
  min-height:66px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:18px;
  margin:0 auto;
  border-bottom:2px solid #101816;
}
.voucha-brand{
  display:inline-flex;
  align-items:center;
  gap:10px;
  color:#101816;
  font-weight:850;
  text-decoration:none;
}
.voucha-mark{
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
.voucha-links{
  display:flex;
  align-items:center;
  gap:18px;
  color:#293834;
  font-size:.94rem;
  font-weight:750;
}
.voucha-links a{text-decoration:none}
.voucha-links a:not(.gh):hover{text-decoration:underline}
.voucha-links .gh{display:inline-flex;align-items:center;color:#101816}
.voucha-links .gh svg{width:22px;height:22px;display:block;fill:currentColor}
@media (hover:hover) and (pointer:fine){
  .voucha-links .gh:hover{opacity:.65}
}
.voucha-hero{
  width:min(1120px,calc(100% - 40px));
  display:grid;
  grid-template-columns:minmax(0,1fr) minmax(340px,430px);
  gap:40px;
  align-items:center;
  margin:0 auto;
  padding:44px 0 34px;
}
.voucha-copy{min-width:0}
.voucha-kicker{
  display:inline-flex;
  align-items:center;
  gap:10px;
  margin:0 0 16px;
  color:#5e3c76;
  font:850 .94rem/1.25 var(--sans);
}
.voucha-kicker::before{
  content:"";
  width:10px;
  height:10px;
  border-radius:999px;
  background:#5e3c76;
}
.voucha-copy h1{
  max-width:9ch;
  margin:0;
  color:#101816;
  font-size:clamp(3.4rem,7vw,5.9rem);
  line-height:.9;
  font-weight:900;
  letter-spacing:0;
  text-wrap:balance;
}
.voucha-lead{
  max-width:48ch;
  margin:18px 0 0;
  color:#2f403b;
  font-size:1.22rem;
  line-height:1.42;
}
.voucha-lead b{
  color:#101816;
  font-weight:850;
}
.voucha-actions{
  display:flex;
  flex-wrap:wrap;
  gap:10px;
  margin-top:24px;
}
.voucha-button{
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
.voucha-button.primary{
  background:#101816;
  color:#fffdfa;
  box-shadow:3px 3px 0 #d8f35f;
}
.voucha-button:hover{transform:translateY(-1px)}
.voucha-button:active{transform:translateY(1px); box-shadow:1px 1px 0 #101816}
.voucha-button.primary:active{box-shadow:1px 1px 0 #d8f35f}
.voucha-button:focus-visible,.voucha-links a:focus-visible{
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
.voucha-section{
  width:min(1120px,calc(100% - 40px));
  display:grid;
  grid-template-columns:minmax(0,.75fr) minmax(280px,.42fr);
  gap:34px;
  align-items:start;
  margin:0 auto;
  padding:38px 0;
  border-top:2px solid #101816;
}
.voucha-section h2{
  max-width:16ch;
  margin:0;
  color:#101816;
  font-size:2.35rem;
  line-height:1.02;
  font-weight:900;
  letter-spacing:0;
  text-wrap:balance;
}
.voucha-section p{
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
.voucha-footer{
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
  .voucha-hero,.voucha-section{
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
  .voucha-shell{
    padding-right:24px;
  }
  .voucha-top,.voucha-hero,.policy-strip,.voucha-section,.voucha-footer{
    width:auto!important;
    max-width:none!important;
    margin-left:16px;
    margin-right:0;
  }
  .voucha-top{
    min-height:62px;
  }
  .voucha-links{
    display:none;
  }
  .voucha-hero{
    gap:28px;
    padding:30px 0 28px;
  }
  .voucha-copy h1{
    width:100%;
    max-width:100%;
    font-size:3rem;
    overflow-wrap:anywhere;
  }
  .voucha-lead{
    width:100%;
    max-width:100%;
    font-size:1rem;
    overflow-wrap:anywhere;
  }
  .voucha-kicker{
    gap:8px;
    font-size:.9rem;
  }
  .voucha-kicker::before{
    width:9px;
    height:9px;
  }
  .voucha-actions{
    display:grid;
    width:320px!important;
    max-width:calc(100vw - 56px)!important;
  }
  .voucha-button{
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
  .voucha-section p,
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
  .voucha-section{
    gap:18px;
    padding:30px 0;
  }
  .voucha-section h2{
    font-size:2rem;
  }
  .install-ticket code{
    white-space:pre-wrap;
    overflow-wrap:anywhere;
  }
  .voucha-footer{
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
  .voucha-shell{
    background:#101612;
    color:#f1f7f3;
  }
  .voucha-top,
  .voucha-section,
  .voucha-footer{
    border-color:#d8f35f;
  }
  .voucha-brand,
  .voucha-copy h1,
  .voucha-lead b,
  .policy-chip b,
  .voucha-section h2,
  .install-ticket h3,
  .install-mode b{
    color:#f7fff9;
  }
  .voucha-mark{
    border-color:#f7fff9;
    background:#ff7a59;
    color:#101612;
    box-shadow:5px 5px 0 #d8f35f;
  }
  .voucha-links,
  .voucha-lead,
  .policy-chip span,
  .voucha-section p,
  .install-ticket p,
  .install-mode span,
  .voucha-footer{
    color:#bfd0c6;
  }
  .voucha-kicker{
    color:#d8a7ff;
  }
  .voucha-kicker::before{
    background:#d8a7ff;
  }
  .voucha-button{
    border-color:#f7fff9;
    background:#19231f;
    color:#f7fff9;
    box-shadow:3px 3px 0 #ff7a59;
  }
  .voucha-button.primary{
    background:#d8f35f;
    color:#101612;
    box-shadow:3px 3px 0 #ff7a59;
  }
  .voucha-button:active{
    box-shadow:1px 1px 0 #ff7a59;
  }
  .voucha-button.primary:active{
    box-shadow:1px 1px 0 #ff7a59;
  }
  .voucha-button:focus-visible,
  .voucha-links a:focus-visible{
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

/* Public homepage craft pass: maintainer infrastructure with restrained brand cues. */
.voucha-hero{
  gap:clamp(36px,6vw,72px);
  padding:50px 0 30px;
}
.voucha-lead{
  max-width:47ch;
  line-height:1.45;
}
.policy-receipt{
  justify-self:end;
  width:min(100%,398px);
  border-color:#d0d7de;
  box-shadow:0 14px 32px rgba(16,24,22,.11), 5px 5px 0 #d8f35f;
  transform:none;
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
  font-size:1.18rem;
}
.receipt-subtitle{
  max-width:34ch;
  margin:-5px 16px 14px;
  color:#57606a;
  font-size:.9rem;
  font-weight:600;
  line-height:1.38;
}
.receipt-line{
  padding:10px 12px;
}
.receipt-line:nth-child(1) b{
  border-color:#d4a72c;
  background:#fff8c5;
  color:#7d4e00;
}
.receipt-line:nth-child(2) b,
.receipt-line:nth-child(3) b{
  border-color:#54aeff;
  background:#ddf4ff;
  color:#0969da;
}
.receipt-line small{
  max-width:33ch;
}
.receipt-foot{
  margin-top:12px;
}
.policy-strip{
  counter-reset:policy-step;
  grid-template-columns:repeat(3,minmax(0,1fr));
  margin-bottom:36px;
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
.proof-note{
  display:inline-flex;
  align-items:center;
  gap:8px;
  margin-top:16px;
  color:#455852;
  font-size:.94rem;
  font-weight:700;
}
.proof-note::before{
  content:"";
  width:10px;
  height:10px;
  flex:none;
  border:2px solid #101816;
  border-radius:999px;
  background:#d8f35f;
  box-shadow:3px 0 0 #ff6f4d;
}
.voucha-section{
  grid-template-columns:minmax(0,.68fr) minmax(360px,.62fr);
  gap:clamp(32px,6vw,76px);
  padding:42px 0 36px;
}
.install-ticket{
  gap:14px;
  padding:0;
  border:0;
  background:transparent;
  box-shadow:none;
}
.install-ticket h3{
  font-size:1rem;
}
.install-options{
  display:grid;
  gap:12px;
}
.install-mode{
  gap:8px;
  padding:15px;
  border:1px solid #ccd8d1;
  border-radius:8px;
  background:#fffdfa;
}
.install-mode:first-of-type{
  border-top:1px solid #ccd8d1;
  padding-top:15px;
}
.install-mode span{
  max-width:44ch;
}
.install-mode .voucha-button{
  width:fit-content;
  margin-top:4px;
}
.install-note{
  max-width:46ch;
  color:#455852;
  font-size:.92rem!important;
}
.docs-section{
  grid-template-columns:minmax(0,1fr) auto;
  align-items:center;
  gap:24px;
}
.docs-section h2{
  max-width:none;
}
.docs-section p{
  max-width:58ch;
}
.docs-section .voucha-button{
  justify-self:end;
  white-space:nowrap;
}
.voucha-footer code{
  font-family:var(--mono);
}
@media (max-width:860px){
  .policy-chip,
  .policy-chip:nth-child(3),
  .policy-chip:nth-child(4){
    border-color:#ccd8d1;
  }
  .policy-strip{
    grid-template-columns:1fr;
  }
  .policy-chip{
    border-left:0;
    border-top:1px solid #ccd8d1;
  }
  .policy-chip:first-child{
    border-top:0;
  }
  .policy-chip:nth-child(3){
    border-left:0;
  }
  .voucha-section{
    grid-template-columns:1fr;
  }
  .docs-section{
    grid-template-columns:1fr;
  }
}
@media (max-width:560px){
  .voucha-hero{
    gap:22px;
    padding-top:28px;
  }
  .voucha-actions,
  .policy-receipt{
    width:100%!important;
    max-width:100%!important;
  }
  .policy-receipt{
    transform:none;
    box-shadow:0 10px 20px rgba(16,24,22,.1), 4px 4px 0 #d8f35f;
  }
  .receipt-subtitle{
    margin-top:-3px;
    font-size:.88rem;
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
  .voucha-section{
    gap:22px;
  }
  .docs-section{
    gap:18px;
    grid-template-columns:1fr;
  }
  .docs-section .voucha-button{
    justify-self:stretch;
  }
  .install-ticket{
    box-shadow:none;
  }
  .install-mode .voucha-button{
    width:100%;
  }
}
@media (prefers-color-scheme:dark){
  .site-body,
  .site-page,
  .voucha-shell{
    background:#101613;
    color:#eef6f1;
  }
  .voucha-top,
  .voucha-section,
  .voucha-footer{
    border-color:#2c3a33;
  }
  .voucha-brand,
  .voucha-copy h1,
  .voucha-lead b,
  .policy-chip b,
  .voucha-section h2,
  .install-ticket h3,
  .install-mode b{
    color:#f5fbf7;
  }
  .voucha-links,
  .voucha-lead,
  .policy-chip span,
  .voucha-section p,
  .install-ticket p,
  .install-mode span,
  .voucha-footer{
    color:#b7c8be;
  }
  .voucha-kicker{
    color:#c6a4df;
  }
  .voucha-kicker::before{
    background:#c6a4df;
  }
  .voucha-mark{
    border-color:#0b100e;
    background:#ff7a59;
    color:#0b100e;
    box-shadow:4px 4px 0 #d8f35f;
  }
  .voucha-button{
    border-color:#5c6a62;
    background:#17211d;
    color:#f5fbf7;
    box-shadow:none;
  }
  .voucha-button.primary{
    border-color:#d8f35f;
    background:#d8f35f;
    color:#101613;
    box-shadow:0 0 0 2px #101613, 0 0 0 4px #45533f;
  }
  .voucha-button:active,
  .voucha-button.primary:active{
    box-shadow:none;
  }
  .policy-strip,
  .install-mode{
    border-color:#2c3a33;
    background:#151d1a;
    box-shadow:none;
  }
  .install-ticket{
    background:transparent;
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
  .install-mode{
    border-color:#2c3a33;
  }
  .install-note{
    color:#b7c8be;
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
  .receipt-line:nth-child(1) b{
    border-color:#9e6a03;
    background:#3b2e12;
    color:#f2cc60;
  }
  .receipt-line:nth-child(2) b,
  .receipt-line:nth-child(3) b{
    border-color:#1f6feb;
    background:#10233f;
    color:#79c0ff;
  }
}
.brand-mark,
.voucha-mark{
  border:0;
  border-radius:0;
  background:transparent;
  box-shadow:none;
  color:inherit;
  padding:0;
  overflow:visible;
}
.brand-mark{
  width:34px;
  height:34px;
}
.voucha-mark{
  width:34px;
  height:34px;
  display:block;
}
.brand-mark img,
.voucha-mark img{
  width:100%;
  height:100%;
  display:block;
}
.brand-mark picture,
.voucha-mark picture{
  width:100%;
  height:100%;
  display:block;
}
.voucha-faq{
  width:min(1120px,calc(100% - 40px));
  margin:0 auto;
  padding:38px 0;
  border-top:2px solid #101816;
}
.voucha-faq h2{
  margin:0 0 22px;
  color:#101816;
  font-size:2.35rem;
  line-height:1.02;
  font-weight:900;
  text-wrap:balance;
}
.faq-list{
  display:grid;
  gap:12px;
}
.faq-item{
  border:2px solid #101816;
  border-radius:10px;
  background:#fffdfa;
  overflow:hidden;
}
.faq-item summary{
  position:relative;
  padding:16px 44px 16px 16px;
  color:#101816;
  font-size:1.08rem;
  font-weight:800;
  cursor:pointer;
  list-style:none;
}
.faq-item summary::-webkit-details-marker{display:none}
.faq-item summary::after{
  content:"+";
  position:absolute;
  top:16px;
  right:16px;
  color:#ff6f4d;
  font-size:1.35rem;
  font-weight:800;
  line-height:1.1;
}
.faq-item[open] summary::after{content:"\\2013"}
.faq-item p{
  margin:0;
  padding:0 16px 16px;
  max-width:70ch;
  color:#2f403b;
  font-size:1rem;
  line-height:1.5;
}
@media (max-width:560px){
  .voucha-faq{
    width:auto;
    max-width:none;
    margin-left:16px;
    margin-right:0;
  }
  .voucha-faq h2{font-size:2rem}
  .faq-item summary,
  .faq-item p{overflow-wrap:anywhere}
}
@media (prefers-color-scheme:dark){
  .voucha-faq{border-color:#d8f35f}
  .voucha-faq h2{color:#f7fff9}
  .faq-item{
    border-color:#d8f35f;
    background:#151f1b;
  }
  .faq-item summary{color:#f7fff9}
  .faq-item summary::after{color:#ff7a59}
  .faq-item p{color:#bfd0c6}
}
`;

interface SocialMeta {
  title: string;
  description: string;
  url: string;
  imageUrl: string;
  imageAlt: string;
}

interface LayoutOptions {
  bodyClass?: string;
  mainClass?: string;
  description?: string;
  social?: SocialMeta;
}

function brandLogo(): string {
  return `<picture><source media="(prefers-color-scheme: dark)" srcset="/voucha-logo-dark.svg"><img src="/voucha-logo.svg" alt=""></picture>`;
}

function layout(
  title: string,
  body: string,
  options: LayoutOptions = {}
): string {
  const bodyClass = options.bodyClass ? ` class="${esc(options.bodyClass)}"` : "";
  const mainClass = options.mainClass ?? "wrap";
  const description = options.description
    ? `<meta name="description" content="${esc(options.description)}">`
    : "";
  const social = options.social
    ? `<link rel="canonical" href="${esc(options.social.url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="VOUCHA">
<meta property="og:title" content="${esc(options.social.title)}">
<meta property="og:description" content="${esc(options.social.description)}">
<meta property="og:url" content="${esc(options.social.url)}">
<meta property="og:image" content="${esc(options.social.imageUrl)}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(options.social.imageAlt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(options.social.title)}">
<meta name="twitter:description" content="${esc(options.social.description)}">
<meta name="twitter:image" content="${esc(options.social.imageUrl)}">
<meta name="twitter:image:alt" content="${esc(options.social.imageAlt)}">`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
${description}
${social}
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="icon" type="image/svg+xml" href="/favicon-dark.svg" media="(prefers-color-scheme: dark)">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-dark-32x32.png" media="(prefers-color-scheme: dark)">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="apple-touch-icon" href="/apple-touch-icon-dark.png" media="(prefers-color-scheme: dark)">
<title>${esc(title)} — VOUCHA</title>
<style>${STYLE}</style></head>
<body${bodyClass}><main class="${mainClass}">${body}</main></body></html>`;
}

function commandBar(tag: string, prRef?: string, timerHtml = ""): string {
  return `<header class="commandbar">
  <div class="brand-lockup"><span class="mark brand-mark" aria-hidden="true">${brandLogo()}</span><span class="brand-name">VOUCHA</span></div>
  <div class="command-context">
    <span class="command-sep" aria-hidden="true"></span>
    <span class="command-title">${esc(tag)}</span>
    ${prRef ? `<span class="command-sep" aria-hidden="true"></span><span class="command-ref">${esc(prRef)}</span>` : ""}
  </div>
  <div class="command-meta">
    <span class="command-pill"><span class="seal" aria-hidden="true">✓</span>PR record</span>
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
    ["attest", "Record"],
  ] as const;
  const activeIndex = stages.findIndex(([id]) => id === stage);
  const items = stages.map(([id, label], i) => {
    const state = i < activeIndex ? "done" : id === stage ? "active" : "";
    const mark = i < activeIndex ? "✓" : String(i + 1);
    return `<li class="${state}"><b>${mark}</b><span>${label}</span></li>`;
  }).join("");
  return `<ol class="rail" style="--steps:3;--rail-scale:${activeIndex / 2}">${items}</ol>`;
}

function contextPanel(_prRef: string, variant: "verify" | "start" | "question"): string {
  const specs: Record<"verify" | "start" | "question", {
    heading: string;
    items: Array<[icon: string, label: string, detail: string]>;
    note: string;
  }> = {
    verify: {
      heading: "What to expect",
      items: [
        ["1", "Post the command", "As the author, in the PR thread."],
        ["2", "GitHub confirms it's you", "Authorship is checked from the comment."],
        ["3", "Then answer", "This tab continues on its own."],
      ],
      note: "VOUCHA records timing summaries for maintainers. No keystrokes, webcam, or screen recording.",
    },
    start: {
      heading: "What to expect",
      items: [
        ["PR", "From this PR", "Questions come from your actual diff."],
        ["60s", "Per question", "A 60-second timer, then it advances."],
        ["✓", "On finish", "Your result posts to the PR as a check."],
      ],
      note: "Your answers and timing summaries stay with maintainers. No keystrokes, webcam, or screen recording.",
    },
    question: {
      heading: "During the quiz",
      items: [
        ["60s", "Per question", "The timer runs; if it ends, the question is skipped."],
        ["→", "One at a time", "Answering moves you to the next question."],
        ["✓", "On finish", "Your result posts to the PR."],
      ],
      note: "Timing and pointer summaries stay with maintainers. Bot checks can stop the challenge.",
    },
  };
  const spec = specs[variant];
  const items = spec.items
    .map(([icon, label, detail]) =>
      `<div class="info-item"><span class="info-icon">${esc(icon)}</span><span><b>${esc(label)}</b>${esc(detail)}</span></div>`)
    .join("\n      ");
  return `<aside class="context-panel" aria-label="What to expect">
  <section class="context-section">
    <h2>${esc(spec.heading)}</h2>
    <div class="info-list">
      ${items}
    </div>
  </section>
  <section class="context-section">
    <p class="data-line">${esc(spec.note)} <a class="inline-link" href="/docs/privacy-data/" target="_blank" rel="noopener noreferrer">Read details</a></p>
  </section>
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

function actionLinks(actions: PageAction[], className: string): string {
  if (actions.length === 0) return "";
  const links = actions
    .map((action) => {
      const id = action.id ? ` id="${esc(action.id)}"` : "";
      const target = action.external ? ` target="_blank" rel="noopener noreferrer"` : "";
      const variant = action.primary ? "btn" : "btn-secondary";
      return `<a${id} class="${variant}" href="${esc(action.href)}"${target}>${esc(action.label)}</a>`;
    })
    .join("");
  return `<div class="${className}">${links}</div>`;
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

export function verificationPage(
  prRef: string,
  authorLogin: string,
  challengeId: string,
  verifyCode: string,
  prUrl: string
): string {
  const command = `/voucha verify ${verifyCode}`;
  const commandJson = JSON.stringify(command);
  const prUrlJson = JSON.stringify(prUrl);
  const statusUrlJson = JSON.stringify(`/challenge/${challengeId}/verify/status`);
  const challengeUrlJson = JSON.stringify(`/challenge/${challengeId}`);
  return layout("Verify author", `
<div class="app">
  ${commandBar("PR author check", prRef)}
  <div class="console">
    <section class="workspace" aria-labelledby="verify-title">
      ${stageRail("verify")}
      <div class="prelude">
        <p class="kicker-row"><span class="pill">Author verification</span><span class="ref">@${esc(authorLogin)}</span></p>
        <h1 id="verify-title">Verify from the PR.</h1>
        <p class="lead">Post the one-time command as @${esc(authorLogin)}. GitHub verifies authorship; this tab continues when the PR comment arrives.</p>
        <div class="inline-note">
          <b>The app never acts for you</b>
          <span>VOUCHA reads the PR comment webhook. It never receives a GitHub user token and cannot comment, approve, or answer on your behalf.</span>
        </div>
        <form class="start-actions verify-actions" method="POST" action="/challenge/${esc(challengeId)}/verify">
          <div class="command-card">
            <strong>One-time PR comment</strong>
            <div class="command-row"><code id="verifyCommand">${esc(command)}</code><button class="btn-secondary command-copy-button" type="button" id="copyCommandButton" aria-label="Copy verification command">Copy</button></div>
          </div>
          <button class="btn" type="button" id="copyOpenPr">Copy and open PR</button>
          <a class="btn-secondary" id="openPrLink" href="${esc(prUrl)}" target="_blank" rel="noopener noreferrer">Open PR</a>
          <button class="btn-secondary" type="submit">Check again</button>
          <p class="choice-status" id="verifyStatus" aria-live="polite">Waiting for your GitHub comment.</p>
        </form>
      </div>
    </section>
    ${contextPanel(prRef, "verify")}
  </div>
</div>
<script>
(function () {
  var commandText = ${commandJson};
  var prUrl = ${prUrlJson};
  var statusUrl = ${statusUrlJson};
  var challengeUrl = ${challengeUrlJson};
  var copyOpenButton = document.getElementById("copyOpenPr");
  var copyOnlyButton = document.getElementById("copyCommandButton");
  var openPrLink = document.getElementById("openPrLink");
  var command = document.getElementById("verifyCommand");
  var status = document.getElementById("verifyStatus");
  var pollTimer = null;
  function setStatus(text) {
    if (status) status.textContent = text;
  }
  function copyWithTextarea() {
    var textarea = document.createElement("textarea");
    textarea.value = commandText;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "0";
    textarea.style.width = "1px";
    textarea.style.height = "1px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    try {
      return document.execCommand("copy");
    } catch (e) {
      return false;
    } finally {
      document.body.removeChild(textarea);
    }
  }
  function copyCommand() {
    if (copyWithTextarea()) {
      return Promise.resolve();
    }
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(commandText);
    }
    return Promise.reject(new Error("Clipboard copy failed"));
  }
  function selectCommandText() {
    if (!command || !window.getSelection || !document.createRange) return;
    var range = document.createRange();
    range.selectNodeContents(command);
    var selection = window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    selection.addRange(range);
  }
  function restoreButton(button, label) {
    window.setTimeout(function () {
      button.disabled = false;
      button.textContent = label;
    }, 1800);
  }
  function openPr() {
    var opened = window.open(prUrl, "_blank", "noopener,noreferrer");
    if (!opened && openPrLink) {
      openPrLink.click();
    }
    return Boolean(opened);
  }
  function handleCopy(button, options) {
    if (!button) return;
    var label = button.textContent || "";
    button.disabled = true;
    setStatus("Copying the command...");
    copyCommand().then(function () {
      button.textContent = options.open ? "Copied - opening PR" : "Copied";
      if (options.open) {
        var opened = openPr();
        setStatus(opened
          ? "Command copied. Paste it as a PR comment; this page will continue automatically."
          : "Command copied. Use Open PR if the pull request did not open.");
      } else {
        setStatus("Command copied. Paste it as a PR comment on the PR.");
      }
      restoreButton(button, label);
    }).catch(function () {
      button.disabled = false;
      button.textContent = label;
      selectCommandText();
      setStatus("Copy failed. The command text is selected; copy it manually, then use Open PR.");
    });
    poll();
  }
  function poll() {
    fetch(statusUrl, {
      headers: { "accept": "application/json" },
      credentials: "same-origin",
      cache: "no-store"
    }).then(function (res) {
      if (!res.ok) return null;
      return res.json();
    }).then(function (data) {
      if (data && data.verified) {
        setStatus("Verified. Opening the challenge...");
        window.location.assign(challengeUrl);
        return;
      }
      if (!pollTimer) {
        pollTimer = window.setInterval(poll, 2000);
      }
    }).catch(function () {
      if (!pollTimer) {
        pollTimer = window.setInterval(poll, 3000);
      }
    });
  }
  poll();
  if (!command) return;
  if (copyOpenButton) {
    copyOpenButton.addEventListener("click", function () {
      handleCopy(copyOpenButton, { open: true });
    });
  }
  if (copyOnlyButton) {
    copyOnlyButton.addEventListener("click", function () {
      handleCopy(copyOnlyButton, { open: false });
    });
  }
})();
</script>`);
}

export function homePage(servedOrigin = "https://voucha.dev"): string {
  const INSTALL_URL = "https://github.com/apps/voucha-app/installations/new";
  const origin = (() => {
    try {
      return new URL(servedOrigin).origin;
    } catch {
      return "https://voucha.dev";
    }
  })();
  const socialDescription =
    "VOUCHA is free open-source GitHub PR governance for asking authors to prove they understand the change.";
  return layout("A policy layer for GitHub pull requests", `
<div class="voucha-shell">
  <nav class="voucha-top" aria-label="Primary">
    <a class="voucha-brand" href="/" aria-label="VOUCHA home"><span class="voucha-mark" aria-hidden="true">${brandLogo()}</span><span>VOUCHA</span></a>
    <div class="voucha-links">
      <a href="#install">Install</a>
      <a href="/docs/">Docs</a>
      <a class="gh" href="https://github.com/idosal/VOUCHA" target="_blank" rel="noopener noreferrer" aria-label="VOUCHA on GitHub" title="VOUCHA on GitHub"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg></a>
    </div>
  </nav>

  <section class="voucha-hero" aria-labelledby="home-title">
    <div class="voucha-copy">
      <p class="voucha-kicker">A policy layer for GitHub pull requests.</p>
      <h1 id="home-title">Say yes to <br>contributions.</h1>
      <p class="voucha-lead">You decide who's trusted and which changes need a closer look. VOUCHA allows contributors to prove their understanding and intent in an interactive app.</p>
      <div class="voucha-actions">
        <a class="voucha-button primary" href="${INSTALL_URL}" target="_blank" rel="noopener noreferrer">Install the app</a>
        <a class="voucha-button" href="#install">Self-host it</a>
        <a class="voucha-button" href="/docs/">Docs</a>
      </div>
      <p class="proof-note">Open source and free.</p>
    </div>

    <aside class="policy-receipt" aria-label="GitHub Actions policy report example">
      <div class="receipt-head"><span class="receipt-dot" aria-hidden="true">!</span><div><strong>VOUCHA check</strong><span>pull_request #482</span></div></div>
      <h2 class="receipt-title">Challenge required</h2>
      <p class="receipt-subtitle">The author explains the change before review.</p>
      <div class="receipt-lines">
        <div class="receipt-line"><b>!</b><span><strong>Reason</strong><small>new contributor, sensitive files changed</small></span></div>
        <div class="receipt-line"><b>→</b><span><strong>Challenge</strong><small>explain the change's intent and effects</small></span></div>
        <div class="receipt-line"><b>i</b><span><strong>Evidence</strong><small>signals recorded publicly for maintainer review</small></span></div>
      </div>
      <p class="receipt-foot">Pending maintainer approval.</p>
    </aside>
  </section>

  <section class="policy-strip" id="workflow" aria-label="VOUCHA workflow">
    <div class="policy-chip"><b>Screen the PR</b><span>file-path level trust, exemptions, sensitive paths, honeypots, quiet signals</span></div>
    <div class="policy-chip"><b>Challenge the unknowns</b><span>short configurable tests scoped to the diff</span></div>
    <div class="policy-chip"><b>Review the record</b><span>a reasoned check and risk report for maintainers</span></div>
  </section>

  <section class="voucha-section" aria-labelledby="install-title">
    <div>
      <h2 id="install-title">Install in a click, or run your own.</h2>
      <p>The hosted app is free and works on public repos: install it on GitHub and configure the policy for your repo. Teams that want more control or private repos can self-host the same setup.</p>
    </div>
    <aside class="install-ticket" id="install" aria-label="Install VOUCHA">
      <h3>Install path</h3>
      <div class="install-options">
        <div class="install-mode">
          <b>Install the hosted app</b>
          <span>Free, one-click, works on any public repo.</span>
          <a class="voucha-button primary" href="${INSTALL_URL}" target="_blank" rel="noopener noreferrer">Install on GitHub</a>
        </div>
        <div class="install-mode">
          <b>Self-host</b>
          <span>For private repos or full control: deploy the Worker to your own Cloudflare account and bring your own model. <code>npm run setup</code> wires the GitHub App, Turnstile, and secrets.</span>
          <a class="voucha-button" href="https://deploy.workers.cloudflare.com/?url=https://github.com/idosal/VOUCHA" target="_blank" rel="noopener noreferrer">Deploy to Cloudflare</a>
        </div>
      </div>
      <p class="install-note">Privacy, permissions, configuration, and verification details live in the docs.</p>
    </aside>
  </section>

  <section class="voucha-faq" aria-labelledby="faq-title">
    <h2 id="faq-title">Questions maintainers ask.</h2>
    <div class="faq-list">
      <details class="faq-item">
        <summary>How does it actually work?</summary>
        <p>A PR opens, the policy decides if a challenge is needed, and the author verifies they own the PR and answers a short quiz built from the diff. Pass posts a check and attestation; fail means a cooldown and a fresh quiz. <a class="inline-link" href="/docs/challenge-lifecycle/">See the challenge lifecycle</a>.</p>
      </details>
      <details class="faq-item">
        <summary>How does this fit with code review, CI, and branch protection?</summary>
        <p>Those check the <em>code</em> or route the PR; VOUCHA checks the <em>author</em>. CI asks whether it works, review whether it's good, VOUCHA whether the person submitting understands it. It runs before review, not instead of it.</p>
      </details>
      <details class="faq-item">
        <summary>Is this a quiz, or a governance layer?</summary>
        <p>A governance layer — one place to decide how much scrutiny a PR needs. Trust, exemptions, routing, and passive signals settle the coarse cases; the interactive challenge is the fine-grained last mile for the changes those can't.</p>
      </details>
      <details class="faq-item">
        <summary>Does it block merges?</summary>
        <p>Not by default — it posts a check and reports <code>neutral</code> on any failure, timeout, or outage, leaving enforcement to your branch-protection rules. Maintainers can optionally enable auto-close to close a PR that fails the challenge.</p>
      </details>
      <details class="faq-item">
        <summary>Isn't this gatekeeping contributors?</summary>
        <p>On the contrary. VOUCHA gives maintainers the confidence to say yes to contributions. AI-written code may be welcome by maintainers, but it allows them to ask that whoever submits can stand behind it.</p>
      </details>
    </div>
  </section>
</div>`, {
    bodyClass: "site-body",
    mainClass: "site-page",
    description: "VOUCHA is free open-source GitHub PR governance that complements code review, CI, tests, and branch protection with comprehension checks and trust exemptions.",
    social: {
      title: "VOUCHA — A policy layer for GitHub pull requests",
      description: socialDescription,
      url: origin,
      imageUrl: `${origin}/voucha-social-card.png`,
      imageAlt: "Screenshot of the VOUCHA landing page hero."
    }
  });
}

export function startPage(
  prRef: string, turnstileSiteKey: string, challengeId: string, honeypotEnabled = true,
  startError = ""
): string {
  return layout("Challenge", `
<div class="app">
  ${commandBar("PR author check", prRef)}
  <div class="console">
    <section class="workspace" aria-labelledby="challenge-title">
      ${stageRail("answer")}
      <div class="prelude">
        <p class="kicker-row"><span class="pill">PR challenge</span><span class="ref">${esc(prRef)}</span></p>
        <h1 id="challenge-title">Stand behind this PR.</h1>
        <p class="lead">Answer PR-specific questions about <b>intent, behavior, and blast radius</b>. Passing records that you understand the change.</p>
        <form class="start-actions" method="POST" action="/challenge/${esc(challengeId)}/start" id="startForm">
          ${honeypotField(honeypotEnabled)}
          ${startError ? `<p class="form-error" role="alert">${esc(startError)}</p>` : ""}
          <div class="terms-stack">
            <label class="consent-check">
              <input type="checkbox" name="terms_acceptance" value="accepted" required>
              <span><strong>I understand what will be posted.</strong><small>Generate a PR-specific quiz, post the result to the PR, and keep my answers plus summary signals for maintainers.</small></span>
            </label>
            <p class="data-line">Bot verification failures stop the challenge. Privacy and permission details live in the docs. <a href="/docs/privacy-data/" target="_blank" rel="noopener noreferrer">Read details</a>.</p>
          </div>
          <div class="turnstile-box" aria-label="Browser verification"><div class="cf-turnstile" data-sitekey="${esc(turnstileSiteKey)}" data-callback="vouchaTurnstileReady" data-expired-callback="vouchaTurnstileExpired" data-error-callback="vouchaTurnstileExpired" data-timeout-callback="vouchaTurnstileExpired"></div><span class="turnstile-fallback">Browser verification</span></div>
          <button class="btn" type="submit" id="startButton" disabled>Verifying browser...</button>
          <div class="start-progress" id="startProgress" role="status" aria-live="polite" hidden>
            <div><strong id="startProgressTitle">Preparing the quiz</strong><p id="startProgressMessage">This can take a moment while VOUCHA reads the PR and asks the model for questions.</p></div>
            <ol aria-label="Start progress">
              <li data-start-step="browser" class="active">Checking browser session</li>
              <li data-start-step="pr">Reading the pull request</li>
              <li data-start-step="quiz">Generating PR-specific questions</li>
            </ol>
          </div>
        </form>
      </div>
    </section>
    ${contextPanel(prRef, "start")}
  </div>
</div>
<script>
(function () {
  window.vouchaTurnstileVerified = false;
  window.vouchaTurnstileReady = function () {
    window.vouchaTurnstileVerified = true;
    var button = document.getElementById("startButton");
    if (!button || button.getAttribute("data-starting") === "true") return;
    button.disabled = false;
    button.textContent = "Begin challenge";
  };
  window.vouchaTurnstileExpired = function () {
    window.vouchaTurnstileVerified = false;
    var button = document.getElementById("startButton");
    if (!button || button.getAttribute("data-starting") === "true") return;
    button.disabled = true;
    button.textContent = "Verifying browser...";
  };
})();
</script>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
<script>
(function () {
  var form = document.getElementById("startForm");
  var button = document.getElementById("startButton");
  var progress = document.getElementById("startProgress");
  var title = document.getElementById("startProgressTitle");
  var message = document.getElementById("startProgressMessage");
  var steps = progress ? Array.prototype.slice.call(progress.querySelectorAll("[data-start-step]")) : [];
  if (!form || !button) return;
  function markStep(name) {
    steps.forEach(function (step) {
      var current = step.getAttribute("data-start-step") === name;
      step.classList.toggle("active", current);
      if (current) return;
      var order = ["browser", "pr", "quiz"];
      step.classList.toggle("done", order.indexOf(step.getAttribute("data-start-step")) < order.indexOf(name));
    });
  }
  function setProgress(nextTitle, nextMessage, step) {
    if (title) title.textContent = nextTitle;
    if (message) message.textContent = nextMessage;
    markStep(step);
  }
  form.addEventListener("submit", function (event) {
    if (!window.vouchaTurnstileVerified) {
      event.preventDefault();
      button.disabled = true;
      button.textContent = "Verifying browser...";
      return;
    }
    button.setAttribute("data-starting", "true");
    button.disabled = true;
    button.textContent = "Starting challenge...";
    if (progress) progress.hidden = false;
    setProgress("Checking browser session", "Cloudflare is verifying this browser before the quiz starts.", "browser");
    window.setTimeout(function () {
      setProgress("Reading the pull request", "VOUCHA is fetching the PR title, changed files, and diff from GitHub.", "pr");
    }, 1200);
    window.setTimeout(function () {
      setProgress("Generating the quiz", "The model is writing questions from this PR. First runs and larger diffs can take a little longer.", "quiz");
    }, 3200);
    window.setTimeout(function () {
      setProgress("Still generating", "Keep this tab open. If generation fails, the check will go neutral so the PR is not blocked.", "quiz");
    }, 10000);
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
  ${commandBar("PR author check", `Question ${index + 1} of ${total}`, timer)}
  <div class="console">
    <section class="workspace" aria-labelledby="question-title">
      ${progressRail(index, total)}
      <div class="question-top">
        <span class="step">Question <em>${index + 1}</em> of ${total}</span>
      </div>
      <p class="question-type">${esc(meta.label)}</p>
      <h1 class="qh" id="question-title">${esc(q.prompt)}</h1>
      <p class="hint">${esc(meta.hint)} Answer from the PR diff; correct answers are not sent to the browser.</p>
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

export function resultPage(
  passed: boolean,
  score: number,
  total: number,
  message: string,
  actions: PageAction[] = []
): string {
  const tone = passed ? "ok" : message.toLowerCase().includes("bot verification") ? "crit" : "warn";
  const title = passed ? "Passed" : tone === "crit" ? "Bot verification failed" : "Challenge not passed";
  return layout(passed ? "Passed" : "Not passed", `
<div class="app">
  ${commandBar("Challenge result")}
  <div class="result-layout">
    <section class="result-main" aria-labelledby="result-title">
      <div class="result-panel">
        <div class="badge ${tone}" aria-hidden="true">${passed ? "✓" : "!"}</div>
        <p class="result-label">Result</p>
        <h1 id="result-title">${title}</h1>
        <div class="score">${score}<span class="of">/${total}</span></div>
        <p class="result-copy">${esc(message)}</p>
        ${actionLinks(actions, "result-actions")}
      </div>
    </section>
    <aside class="result-side" aria-label="Result details">
      <div class="status-strip ${tone}">
        <span class="status-dot">${passed ? "✓" : "!"}</span>
        <span class="status-copy"><b>${passed ? "Passed" : tone === "crit" ? "Verification failed" : "Not passed"}</b><span>${score}/${total} correct</span></span>
      </div>
      <section class="state-card">
        <h2>What happens next</h2>
        <p>${passed
          ? "The PR receives a record that you understand this change. Maintainers still see summary risk signals."
          : tone === "crit"
            ? "The PR check stays failed. Repository policy controls manual review or auto-close."
            : "Retry timing is controlled by repository policy. A retry receives a fresh quiz when available."}</p>
      </section>
      <div class="status-strip info">
        <span class="status-dot">i</span>
        <span class="status-copy"><b>PR record</b><span>Detailed answers and summary signals stay with the PR record.</span></span>
      </div>
    </aside>
  </div>
</div>`);
}

export function errorPage(title: string, message: string, actions: PageAction[] = []): string {
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
        ${actionLinks(actions, "status-actions")}
      </div>
    </section>
    <aside class="status-side" aria-label="Status context">
      <div class="status-strip ${tone}">
        <span class="status-dot">${statusSymbol(tone)}</span>
        <span class="status-copy"><b>${esc(cleanTitle)}</b><span>Check the PR for the current gate state.</span></span>
      </div>
    </aside>
  </div>
</div>`);
}
