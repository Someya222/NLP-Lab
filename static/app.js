"use strict";
/* =====================================================================
   NLP Lab - Journey of a Sentence
   1. helpers, sound, confetti      4. Word Galaxy tab + Vector Math Lab
   2. Galaxy canvas class           5. Odd One Out game
   3. Journey (7 NLP stages)        6. boot
   ===================================================================== */

/* ---------------------------------------------------------------- 1. helpers */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function api(url, opts) {
  const r = await fetch(url, opts);
  let j = {};
  try { j = await r.json(); } catch (e) { /* ignore */ }
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 3200);
}
function showModal(html) { $("#modal").innerHTML = html; $("#modal").classList.add("show"); }
function hideModal() { $("#modal").classList.remove("show"); $("#modal").innerHTML = ""; }
function bump(el) { el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); }
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/* ---- sound (synthesised in the browser, no audio files) ---- */
let actx = null, muted = false;
try { muted = localStorage.getItem("nl_muted") === "1"; } catch (e) { /* ignore */ }
function unlock() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!actx && AC) actx = new AC();
  if (actx && actx.state === "suspended") actx.resume();
}
function tone(freq, t0, dur, type, vol, freq2) {
  if (muted || !actx) return;
  const t = actx.currentTime + t0, o = actx.createOscillator(), g = actx.createGain();
  o.type = type || "sine";
  o.frequency.setValueAtTime(freq, t);
  if (freq2) o.frequency.exponentialRampToValueAtTime(freq2, t + dur);
  g.gain.setValueAtTime(vol || 0.12, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + dur + 0.05);
}
const sfx = {
  pop(f) { f = f || 520; tone(f, 0, .12, "triangle", .13, f * 1.5); },
  tick() { tone(1100, 0, .05, "square", .04); },
  beep() { tone(440, 0, .15, "square", .07); },
  go() { tone(880, 0, .35, "square", .09); },
  whoosh() { tone(900, 0, .35, "sawtooth", .05, 120); },
  step(p) { tone(180 + p * 720, 0, .16, "sine", .13); },
  ok() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * .09, .22, "triangle", .16)); },
  bad() { tone(220, 0, .4, "sawtooth", .1, 90); },
  win() { [523, 659, 784, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * .12, .25, "triangle", .18)); },
  over() { [392, 349, 330, 262].forEach((f, i) => tone(f, i * .18, .3, "triangle", .16)); }
};
function syncMute() { $("#mute").innerHTML = muted ? "&#128263;" : "&#128266;"; }
$("#mute").onclick = () => {
  muted = !muted; syncMute(); unlock();
  try { localStorage.setItem("nl_muted", muted ? "1" : "0"); } catch (e) { /* ignore */ }
};
syncMute();
document.addEventListener("pointerdown", unlock);

/* ---- confetti ---- */
const fx = $("#fx"), fctx = fx.getContext("2d");
let parts = [], fxRun = false;
function sizeFx() { fx.width = innerWidth; fx.height = innerHeight; }
addEventListener("resize", sizeFx); sizeFx();
function confetti(n) {
  const cols = ["#5b4cdb", "#e0457b", "#ffc83d", "#1a9a4a", "#3fb6ff"];
  for (let i = 0; i < (n || 100); i++) {
    parts.push({ x: innerWidth / 2, y: innerHeight * 0.4, vx: (Math.random() - .5) * 16, vy: Math.random() * -13 - 3,
      s: 6 + Math.random() * 7, c: cols[Math.floor(Math.random() * cols.length)], r: Math.random() * 6.28,
      vr: (Math.random() - .5) * .35, life: 80 + Math.random() * 60 });
  }
  if (!fxRun) { fxRun = true; requestAnimationFrame(stepFx); }
}
function stepFx() {
  fctx.clearRect(0, 0, fx.width, fx.height);
  parts = parts.filter(p => p.life > 0 && p.y < innerHeight + 30);
  parts.forEach(p => {
    p.vy += 0.38; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life--;
    fctx.save(); fctx.translate(p.x, p.y); fctx.rotate(p.r);
    fctx.fillStyle = p.c; fctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6); fctx.restore();
  });
  if (parts.length) requestAnimationFrame(stepFx); else fxRun = false;
}

/* ------------------------------------------------------------ 2. Galaxy class */
class Galaxy {
  constructor(canvas, data, opts) {
    this.c = canvas; this.ctx = canvas.getContext("2d"); this.d = data; this.n = data.words.length;
    this.opts = opts || {}; this.mode = "cluster"; this.hover = -1; this.pin = -1; this.focus = -1;
    this.marks = new Map(); this.tw = null; this.raf = 0; this.drag = null; this.W = 0; this.H = 0;
    this.sx = new Float32Array(this.n); this.sy = new Float32Array(this.n);
    this.view = { s: 1, ox: 0, oy: 0 }; this.base = 1;
    this.makeColors(); this.measure(); this.fitAll(0); this.bind();
    this.ro = new ResizeObserver(() => { this.measure(); this.requestDraw(); });
    this.ro.observe(canvas);
    this.requestDraw();
  }
  makeColors() {
    const d = this.d;
    this.cols = [];
    for (let i = 0; i < this.n; i++) {
      this.cols.push(this.mode === "sent"
        ? `hsl(${Math.round(d.sentiment[i] * 120)},85%,58%)`
        : `hsl(${Math.round((d.cluster[i] * 137.508) % 360)},78%,64%)`);
    }
  }
  setMode(m) { this.mode = m; this.makeColors(); this.requestDraw(); }
  measure() {
    const r = this.c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    const first = this.W === 0;
    this.W = Math.max(1, r.width); this.H = Math.max(1, r.height);
    this.c.width = Math.round(this.W * dpr); this.c.height = Math.round(this.H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (first) { this.base = Math.min(this.W, this.H) / 2 * 0.92; }
  }
  resize() { this.measure(); this.requestDraw(); }
  fitAll(ms) {
    this.base = Math.min(this.W, this.H) / 2 * 0.92;
    this.go({ s: this.base, ox: this.W / 2, oy: this.H / 2 }, ms);
  }
  fitTo(idxs, ms) {
    if (!idxs.length) return;
    const d = this.d; let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
    idxs.forEach(i => { x0 = Math.min(x0, d.x[i]); x1 = Math.max(x1, d.x[i]); y0 = Math.min(y0, d.y[i]); y1 = Math.max(y1, d.y[i]); });
    const pad = 0.14; x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
    const s = Math.min(Math.min(this.W / (x1 - x0), this.H / (y1 - y0)) * 0.92, this.base * 10);
    this.go({ s, ox: this.W / 2 - (x0 + x1) / 2 * s, oy: this.H / 2 - (y0 + y1) / 2 * s }, ms === undefined ? 800 : ms);
  }
  go(target, ms) {
    if (!ms) { this.view = target; this.tw = null; this.requestDraw(); return; }
    this.tw = { a: { ...this.view }, b: target, t0: performance.now(), ms };
    this.requestDraw();
  }
  addMark(i) { this.marks.set(i, performance.now()); this.requestDraw(); }
  clearMarks() { this.marks.clear(); this.requestDraw(); }
  setFocus(i) { this.focus = i; this.requestDraw(); }
  requestDraw() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      if (!this.c.isConnected) { this.ro.disconnect(); return; }
      this.draw();
      if (this.tw || this.marks.size) this.requestDraw();
    });
  }
  label(i, strong, col) {
    const ctx = this.ctx, t = this.d.words[i];
    ctx.font = (strong ? "600 14px" : "12px") + " 'Segoe UI', Arial, sans-serif";
    const w = ctx.measureText(t).width + 10;
    let x = this.sx[i] + 8; const y = this.sy[i] - 12;
    if (x + w > this.W - 2) x = this.sx[i] - w - 8;
    ctx.globalAlpha = 1; ctx.fillStyle = "rgba(5,8,30,.8)";
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y - 2, w, 20, 6); else ctx.rect(x, y - 2, w, 20); ctx.fill();
    ctx.fillStyle = col || "#fff"; ctx.fillText(t, x + 5, y + 13);
  }
  draw() {
    const now = performance.now(), ctx = this.ctx, d = this.d, W = this.W, H = this.H;
    if (this.tw) {
      const t = Math.min(1, (now - this.tw.t0) / this.tw.ms), e = 1 - Math.pow(1 - t, 3), a = this.tw.a, b = this.tw.b;
      this.view = { s: a.s + (b.s - a.s) * e, ox: a.ox + (b.ox - a.ox) * e, oy: a.oy + (b.oy - a.oy) * e };
      if (t >= 1) this.tw = null;
    }
    const { s, ox, oy } = this.view, zr = s / this.base;
    ctx.globalAlpha = 1; ctx.clearRect(0, 0, W, H);
    const g = ctx.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, "#1b2054"); g.addColorStop(1, "#070a22");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    const f = this.hover >= 0 ? this.hover : (this.pin >= 0 ? this.pin : this.focus);
    const act = new Set();
    if (f >= 0) { act.add(f); d.neighbors[f].forEach(j => act.add(j)); }
    this.marks.forEach((_, k) => act.add(k));
    const dim = act.size > 0, r = 1.5 + Math.min(2.8, Math.log2(zr + 1));

    for (let i = 0; i < this.n; i++) {
      const x = ox + d.x[i] * s, y = oy + d.y[i] * s;
      this.sx[i] = x; this.sy[i] = y;
      if (x < -10 || y < -10 || x > W + 10 || y > H + 10) continue;
      const on = act.has(i);
      ctx.globalAlpha = dim ? (on ? 1 : 0.2) : 0.85;
      ctx.fillStyle = this.cols[i];
      ctx.beginPath(); ctx.arc(x, y, on ? r + 1.6 : r, 0, 6.283); ctx.fill();
    }
    if (f >= 0) {
      ctx.globalAlpha = 0.4; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.2;
      d.neighbors[f].forEach(j => { ctx.beginPath(); ctx.moveTo(this.sx[f], this.sy[f]); ctx.lineTo(this.sx[j], this.sy[j]); ctx.stroke(); });
    }
    if (!dim) {
      const lim = zr >= 2.5 ? 700 : 30;
      ctx.globalAlpha = 0.55;
      for (let i = 0; i < Math.min(lim, this.n); i++) {
        if (this.sx[i] < 0 || this.sy[i] < 0 || this.sx[i] > W || this.sy[i] > H) continue;
        ctx.font = "11px 'Segoe UI', Arial, sans-serif"; ctx.fillStyle = "#fff";
        ctx.fillText(d.words[i], this.sx[i] + 5, this.sy[i] - 5);
      }
    }
    if (f >= 0) { d.neighbors[f].forEach(j => this.label(j, false)); this.label(f, true, "#ffd166"); }
    this.marks.forEach((t0, k) => {
      const age = now - t0, ring = 9 + 4 * Math.sin(age / 220) + (age < 600 ? (1 - age / 600) * 34 : 0);
      ctx.globalAlpha = 0.9; ctx.strokeStyle = "#ffd166"; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.arc(this.sx[k], this.sy[k], ring, 0, 6.283); ctx.stroke();
      this.label(k, true, "#ffd166");
    });
    ctx.globalAlpha = 1;
  }
  xy(e) { const r = this.c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  hit(x, y) {
    let best = -1, bd = 14 * 14;
    for (let i = 0; i < this.n; i++) { const dx = this.sx[i] - x, dy = this.sy[i] - y, dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; best = i; } }
    return best;
  }
  zoomAt(px, py, f) {
    const v = this.view, ns = Math.max(this.base * 0.7, Math.min(this.base * 60, v.s * f)), k = ns / v.s;
    this.tw = null; this.view = { s: ns, ox: px - (px - v.ox) * k, oy: py - (py - v.oy) * k }; this.requestDraw();
  }
  click(x, y) {
    const i = this.hit(x, y);
    this.pin = (i >= 0 && i !== this.pin) ? i : -1;
    if (this.opts.onPin) this.opts.onPin(this.pin);
    if (i >= 0) sfx.pop(300 + (i % 20) * 25);
    this.requestDraw();
  }
  bind() {
    const c = this.c;
    const start = (x, y) => { this.drag = { x, y, ox: this.view.ox, oy: this.view.oy, moved: false }; this.tw = null; };
    const move = (x, y) => {
      if (this.drag) {
        const dx = x - this.drag.x, dy = y - this.drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) this.drag.moved = true;
        if (this.drag.moved) { this.view = { s: this.view.s, ox: this.drag.ox + dx, oy: this.drag.oy + dy }; c.style.cursor = "grabbing"; this.requestDraw(); }
        return;
      }
      const i = this.hit(x, y);
      if (i !== this.hover) { this.hover = i; c.style.cursor = i >= 0 ? "pointer" : "grab"; if (this.opts.onHover) this.opts.onHover(i); this.requestDraw(); }
    };
    const end = (x, y) => { const d = this.drag; this.drag = null; c.style.cursor = "grab"; if (d && !d.moved) this.click(x, y); };
    c.addEventListener("mousedown", e => start(...this.xy(e)));
    c.addEventListener("mousemove", e => move(...this.xy(e)));
    addEventListener("mouseup", e => { if (this.drag) end(...this.xy(e)); });
    c.addEventListener("mouseleave", () => { if (!this.drag && this.hover >= 0) { this.hover = -1; if (this.opts.onHover) this.opts.onHover(-1); this.requestDraw(); } });
    c.addEventListener("wheel", e => { e.preventDefault(); const [x, y] = this.xy(e); this.zoomAt(x, y, Math.exp(-e.deltaY * 0.0016)); }, { passive: false });
    c.addEventListener("touchstart", e => { const t = e.touches[0]; start(...this.xy(t)); }, { passive: true });
    c.addEventListener("touchmove", e => { e.preventDefault(); const t = e.touches[0]; move(...this.xy(t)); }, { passive: false });
    c.addEventListener("touchend", e => { const t = e.changedTouches[0]; end(...this.xy(t)); });
  }
}

/* ------------------------------------------------------------ 3. Journey */
const STAGES = [
  { icon: "✂️", name: "Tokenize", exp: "Exp 1a" },
  { icon: "🧹", name: "Stop words", exp: "Exp 1b" },
  { icon: "🌱", name: "Stem & Lemma", exp: "Exp 2" },
  { icon: "🏷️", name: "POS & NER", exp: "" },
  { icon: "🎒", name: "BoW & TF-IDF", exp: "Exp 3-4" },
  { icon: "🌌", name: "Embeddings", exp: "" },
  { icon: "🧠", name: "LSTM reads", exp: "Exp 5, 7" }
];
const POS_COLORS = [["noun", "#3b82f6"], ["proper", "#6366f1"], ["verb", "#ef4444"], ["adj", "#10b981"], ["adv", "#f59e0b"],
  ["pron", "#a855f7"], ["det", "#94a3b8"], ["prep", "#14b8a6"], ["conj", "#f472b6"], ["num", "#84cc16"]];

let INFO = null, GAL = null;
const S = { analysis: null, sample: null, cur: -1, max: -1, auto: false, autoTok: 0, timers: [], meterTok: 0, meterDone: false,
  guess: null, youN: 0, you: 0, aiN: 0, ai: 0, busy: false, stageGal: null };

function later(fn, ms) { const t = setTimeout(fn, ms); S.timers.push(t); return t; }
function clearTimers() { S.timers.forEach(clearTimeout); S.timers = []; }

function barRows(items, hi) {
  const mx = Math.max(1, ...items.map(i => i[1]));
  return items.map(([w, c]) =>
    `<div class="brow ${hi && hi.has(w) ? "hi" : ""}"><span class="bw">${esc(w)}</span><span class="bt"><i data-w="${(c / mx * 100).toFixed(1)}"></i></span><span class="bn">${c}</span></div>`).join("");
}
function growBars(root) {
  requestAnimationFrame(() => requestAnimationFrame(() => $$(".bt i", root).forEach(i => { i.style.width = i.dataset.w + "%"; })));
}
function label3(p) { return p >= 0.6 ? "positive" : p <= 0.4 ? "negative" : "neutral"; }
function emojiFor(p) { return p < 0.2 ? "😠" : p < 0.4 ? "😕" : p < 0.6 ? "😐" : p < 0.8 ? "🙂" : "😍"; }

function setBusy(b) { S.busy = b; ["newBtn", "nextBtn", "customBtn"].forEach(id => { $("#" + id).disabled = b; }); }
function updateAutoBtn() { $("#autoBtn").innerHTML = S.auto ? "&#9208; Stop auto-play" : "&#9193; Auto-play"; }
function updateNextBtn() { $("#nextBtn").innerHTML = S.cur >= STAGES.length - 1 ? "&#127922; Next sentence" : "&#9654; Next Stage"; }
function updateTally() { $("#tally").innerHTML = `You ${S.you}/${S.youN} &middot; LSTM ${S.ai}/${S.aiN}`; }
function stopAuto() { S.auto = false; S.autoTok++; updateAutoBtn(); }

function typeSentence(text) {
  $("#sentence").innerHTML = text.split(" ").map((w, i) => `<span class="w" style="animation-delay:${i * 45}ms">${esc(w)}</span>`).join(" ");
}

async function newSentence(text) {
  setBusy(true);
  try {
    const d = text
      ? await api("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) })
      : await api("/api/sample");
    S.sample = d.sample; S.analysis = d.analysis; S.cur = -1; S.max = -1; S.guess = null;
    typeSentence(d.analysis.text); renderPipeline(); renderStage(-1); updateNextBtn(); sfx.pop(620);
  } catch (e) { toast("Error: " + e.message); } finally { setBusy(false); }
}

function renderPipeline() {
  $("#pipeline").innerHTML = STAGES.map((s, i) => {
    const cls = i === S.cur ? "cur" : (i <= S.max ? "done" : "");
    return `<div class="pill ${cls}" data-i="${i}">${s.icon} ${i + 1}. ${s.name}${s.exp ? `<small>${s.exp}</small>` : ""}</div>`;
  }).join("");
  $$(".pill").forEach(p => { p.onclick = () => { const i = +p.dataset.i; if (i <= S.max) { stopAuto(); goStage(i); } }; });
}

function goStage(i) { S.cur = i; S.max = Math.max(S.max, i); renderPipeline(); renderStage(i); updateNextBtn(); sfx.whoosh(); }
function nextStage() {
  if (S.cur >= STAGES.length - 1) newSentence(); else goStage(S.cur + 1);
}

function renderStage(i) {
  clearTimers(); S.meterTok++; S.meterDone = false;
  const el = $("#stage");
  el.classList.remove("enter"); void el.offsetWidth; el.classList.add("enter");
  el.innerHTML = stageHTML(i);
  growBars(el);
  if (i === 1) afterStop(el);
  if (i === 5) afterGalaxy(el);
  if (i === 6) afterLstm(el);
}

function stageHTML(i) {
  const a = S.analysis;
  if (i < 0) {
    return `<div class="intro"><div class="big">🧪</div><h3>Ready for the journey!</h3>
      <p class="hint">This sentence will travel through 7 NLP stages &ndash; from raw text to a sentiment prediction. Press <b>Next Stage</b> (or <b>Auto-play</b>).</p>
      <div class="steps">${STAGES.map((s, k) => `<span>${s.icon} ${k + 1}. ${s.name}</span>`).join("")}</div></div>`;
  }
  if (i === 0) {
    const mine = new Set(a.tokens.map(t => t.text.toLowerCase()));
    const nw = a.tokens.filter(t => t.kind === "word").length;
    return `<h3>Stage 1 · Tokenization <small>(Experiment 1a)</small></h3>
      <p class="hint">The sentence is cut into <b>tokens</b>: words, numbers and punctuation marks.</p>
      <div class="chips">${a.tokens.map((t, k) => `<span class="chip ${t.kind}" style="animation-delay:${k * 70}ms">${esc(t.text)}</span>`).join("")}</div>
      <p class="facts"><b>${a.tokens.length}</b> tokens &middot; ${nw} words &middot; ${a.n_stop} stop words &middot; ${a.n_punct} punctuation marks</p>
      <div class="bars"><h4>Word-frequency distribution of the whole sample document (${INFO.samples} sentences) &ndash; words from your sentence are pink</h4>${barRows(INFO.freq_all, mine)}</div>`;
  }
  if (i === 1) {
    const kept = a.tokens.filter(t => t.kind === "word").length;
    return `<h3>Stage 2 · Stop-word removal <small>(Experiment 1b)</small></h3>
      <p class="hint">Very common words (<i>the, is, and</i>) and punctuation carry little meaning. Watch them fall away!</p>
      <div class="chips" id="stopChips">${a.tokens.map((t, k) => `<span class="chip ${t.kind}" style="animation-delay:${k * 40}ms">${esc(t.text)}</span>`).join("")}</div>
      <p class="facts" id="stopFacts">Sorting ${a.tokens.length} tokens...</p>
      <div class="two">
        <div class="bars"><h4>Original text &ndash; top words</h4>${barRows(INFO.freq_all)}</div>
        <div class="bars"><h4>After stop-word removal</h4>${barRows(INFO.freq_clean)}</div>
      </div>
      <div class="note">Compare the two charts: before, the top spots are taken by <b>${esc(INFO.freq_all.slice(0, 4).map(x => x[0]).join(", "))}</b>; after removal the real content words show up.</div>
      <span id="keptN" data-n="${kept}" hidden></span>`;
  }
  if (i === 2) {
    const ns = a.rows.filter(r => r.stem !== r.word.toLowerCase()).length, nl = a.rows.filter(r => r.lemma !== r.word.toLowerCase()).length;
    return `<h3>Stage 3 · Stemming vs Lemmatization <small>(Experiment 2)</small></h3>
      <p class="hint">Reduce each remaining word to its base form in two different ways.</p>
      <table class="nlp"><tr><th>Word</th><th>Stem (Porter)</th><th>Lemma (WordNet)</th></tr>
      ${a.rows.map((r, k) => `<tr class="row" style="animation-delay:${k * 90}ms"><td>${esc(r.word)}</td>
        <td class="${r.stem !== r.word.toLowerCase() ? "diff" : ""}">${esc(r.stem)}</td>
        <td class="${r.lemma !== r.word.toLowerCase() ? "diff2" : ""}">${esc(r.lemma)}</td></tr>`).join("")}</table>
      <div class="note">The stemmer changed <b>${ns}</b> words and the lemmatizer <b>${nl}</b>. Stemming chops endings with rules (fast, but can create non-words like <i>movi</i>); lemmatization uses a dictionary and the part of speech, so it returns real words.</div>`;
  }
  if (i === 3) {
    const starts = {}; a.entities.forEach(e => { starts[e.start] = e; });
    const ptok = (t, j) => `<span class="ptok" style="animation-delay:${j * 70}ms"><span class="w">${esc(t.text)}</span><small class="p-${t.pos}">${t.pos === "punct" ? "·" : t.pos}</small></span>`;
    let html = "", k = 0;
    while (k < a.tokens.length) {
      const e = starts[k];
      if (e) { let inner = ""; for (let j = e.start; j < e.end; j++) inner += ptok(a.tokens[j], j); html += `<span class="ent"><span class="elabel">${esc(e.label)}</span>${inner}</span>`; k = e.end; }
      else { html += ptok(a.tokens[k], k); k++; }
    }
    const warn = !INFO.features.pos ? `<div class="note">The NLTK POS tagger data is not installed, so tags are unavailable. Run the app once with internet access.</div>` : "";
    return `<h3>Stage 4 · Part-of-speech tagging &amp; Named-entity recognition</h3>
      <p class="hint">Every token gets a grammatical role. Groups with a gold underline are <b>named entities</b> (people, places, organisations).</p>
      <div class="ptoks">${html}</div>
      <div class="legend">${POS_COLORS.map(([n, c]) => `<span><i style="background:${c}"></i>${n}</span>`).join("")}</div>
      <p class="facts">${a.entities.length ? `Found <b>${a.entities.length}</b> named ${a.entities.length === 1 ? "entity" : "entities"}: ${a.entities.map(e => `${esc(e.text)} (${esc(e.label)})`).join(", ")}` : "No named entities found in this sentence."}</p>${warn}`;
  }
  if (i === 4) {
    const tf = a.tfidf.slice(0, 8), mx = tf.length ? tf[0].tfidf : 1;
    return `<h3>Stage 5 · Bag-of-Words &amp; TF-IDF <small>(Experiments 3 &amp; 4)</small></h3>
      <div class="two">
        <div><h4>Bag of Words <small>(counts, order forgotten)</small></h4>
          <div class="bow">${a.bow.map((b, k) => `<span style="animation-delay:${k * 60}ms">${esc(b.word)}<b>${b.count}</b></span>`).join("")}</div>
          <p class="hint">This count list is the document vector of the sentence.</p></div>
        <div class="bars"><h4>TF-IDF scores &ndash; 🔑 marks the keywords</h4>
          ${tf.map(r => `<div class="brow ${r.keyword ? "key" : ""}"><span class="bw">${esc(r.word)}${r.keyword ? " 🔑" : ""}</span><span class="bt"><i data-w="${(r.tfidf / mx * 100).toFixed(1)}"></i></span><span class="bn">${r.tfidf.toFixed(3)}</span></div>`).join("")}</div>
      </div>
      <div class="note">TF-IDF = how often a word appears here &times; how <b>rare</b> it is in the ${INFO.samples}-sentence document. Rare words stand out as keywords.</div>
      ${a.similar.length ? `<div class="sim"><b>Most similar sentences</b> (cosine similarity of TF-IDF vectors):${a.similar.map(s => `<div><small>${(s.similarity * 100).toFixed(0)}%</small>${esc(s.text)}</div>`).join("")}</div>` : ""}`;
  }
  if (i === 5) {
    return `<h3>Stage 6 · Word embeddings <small>(Word2Vec, trained by us)</small></h3>
      <p class="hint">Each word becomes a list of 100 numbers and lands on the Word Galaxy &ndash; similar meanings sit close together. Drag, zoom, hover!</p>
      <canvas id="stageGalaxy" class="gcanvas small"></canvas>
      <div id="stageNb" class="ninfo">Watching the words fly in...</div>
      ${a.misses.length ? `<p class="hint">Not on the map (too rare): ${a.misses.map(esc).join(", ")}</p>` : ""}`;
  }
  /* stage 6: LSTM */
  const m = a.meter;
  return `<h3>Stage 7 · The LSTM reads the sentence <small>(Experiments 5 &amp; 7)</small></h3>
    <div class="lstm">
      <div id="guessBox">
        <p class="hint">Before the BiLSTM reads it &ndash; what do <b>you</b> think this review feels like?</p>
        <div class="guessrow"><button class="g-neg" data-g="negative">😠 Negative</button><button class="g-pos" data-g="positive">😍 Positive</button></div>
        <button class="alt" id="skipGuess">Just watch</button>
      </div>
      <div id="reader" class="hidden">
        <div class="emoji" id="mEmoji">😐</div>
        <div class="gauge"><div class="needle" id="needle"></div><span class="gl">negative</span><span class="gr">positive</span></div>
        <div class="mwords">${m.words.map((w, k) => `<div class="mw" id="mw${k}"><span class="w">${esc(w)}</span><div class="mbar"><i id="mb${k}"></i></div></div>`).join("")}</div>
        <div id="verdict"></div>
      </div>
    </div>`;
}

function afterStop(el) {
  later(() => {
    const falling = $$(".chip.stop, .chip.punct", el);
    falling.forEach((c, k) => {
      later(() => {
        c.classList.add("fall"); if (k % 2 === 0) sfx.tick();
        c.addEventListener("animationend", ev => { if (ev.animationName === "fall") c.classList.add("gone"); });
      }, k * 150);
    });
    later(() => {
      const n = +$("#keptN").dataset.n;
      $("#stopFacts").innerHTML = `Removed <b>${S.analysis.n_stop}</b> stop words and <b>${S.analysis.n_punct}</b> punctuation marks &rarr; <b>${n}</b> content words left.`;
      sfx.pop(700);
    }, falling.length * 150 + 800);
  }, 700);
}

function nbHTML(g, i) {
  const d = GAL;
  return `<b>${esc(d.words[i])}</b> &rarr; nearest words: ${d.neighbors[i].slice(0, 6).map(j => `<span class="nb">${esc(d.words[j])}</span>`).join("")}`;
}
function afterGalaxy(el) {
  const hits = S.analysis.hits, cv = $("#stageGalaxy");
  const g = new Galaxy(cv, GAL, { onHover: i => { if (i >= 0) $("#stageNb").innerHTML = nbHTML(g, i); } });
  S.stageGal = g;
  if (!hits.length) { $("#stageNb").textContent = "None of this sentence's words are on the map."; return; }
  const idxs = hits.map(h => h.idx);
  g.fitTo(idxs, 0);
  hits.forEach((h, k) => {
    later(() => { g.addMark(h.idx); g.setFocus(h.idx); $("#stageNb").innerHTML = nbHTML(g, h.idx); sfx.pop(380 + k * 55); }, 700 + k * 1000);
  });
}

function afterLstm(el) {
  $$("[data-g]", el).forEach(b => { b.onclick = () => { S.guess = b.dataset.g; sfx.pop(); startReader(); }; });
  $("#skipGuess").onclick = () => { S.guess = null; startReader(); };
  if (S.auto) { S.guess = null; later(startReader, 600); }
}

function startReader() {
  if (!$("#reader")) return;
  $("#guessBox").classList.add("hidden"); $("#reader").classList.remove("hidden");
  const m = S.analysis.meter, tok = ++S.meterTok, dt = m.words.length > 22 ? 260 : 400;
  (async () => {
    for (let k = 0; k < m.words.length; k++) {
      if (tok !== S.meterTok || !$("#needle")) return;
      const p = m.probs[k];
      $$(".mw.cur").forEach(x => x.classList.remove("cur"));
      const mw = $("#mw" + k); mw.classList.add("on", "cur");
      const bar = $("#mb" + k), h = Math.abs(p - 0.5) * 2 * 50;
      bar.style.background = p >= 0.5 ? "#1a9a4a" : "#d12c2c";
      if (p >= 0.5) bar.style.bottom = "50%"; else bar.style.top = "50%";
      requestAnimationFrame(() => { bar.style.height = Math.max(3, h) + "%"; });
      $("#needle").style.left = (p * 100) + "%";
      const em = $("#mEmoji"); em.textContent = emojiFor(p); em.classList.remove("boing"); void em.offsetWidth; em.classList.add("boing");
      sfx.step(p);
      await sleep(dt);
    }
    if (tok !== S.meterTok) return;
    showVerdict();
  })();
}

function showVerdict() {
  const m = S.analysis.meter, lab = S.sample.label, l3 = label3(m.final);
  $$(".mw.cur").forEach(x => x.classList.remove("cur"));
  let chips = `<span>🧠 LSTM: <b>${l3}</b></span>`;
  if (S.guess) chips = `<span>🧑 You: <b>${S.guess}</b></span>` + chips;
  if (lab) {
    chips += `<span>📝 Reviewer's real label: <b>${lab}</b></span>`;
    S.aiN++; if (m.label === lab) S.ai++;
    if (S.guess) { S.youN++; if (S.guess === lab) S.you++; }
    const lstmOk = m.label === lab, youOk = S.guess ? S.guess === lab : null;
    chips += lstmOk ? `<span class="ok">LSTM is right ✔</span>` : `<span class="no">LSTM missed this one ✘</span>`;
    if (youOk !== null) chips += youOk ? `<span class="ok">You are right ✔</span>` : `<span class="no">You missed ✘</span>`;
    if (lstmOk || youOk) { sfx.ok(); confetti(70); } else sfx.bad();
  } else if (S.guess) {
    chips += S.guess === m.label ? `<span class="ok">You and the LSTM agree ✔</span>` : `<span class="no">You and the LSTM disagree</span>`;
    sfx.ok();
  } else sfx.ok();
  updateTally();
  $("#verdict").innerHTML = `<div class="verdict"><div class="vbig ${l3 === "positive" ? "pos" : l3 === "negative" ? "neg" : ""}">${l3.toUpperCase()} · ${(Math.max(m.final, 1 - m.final) * 100).toFixed(0)}% sure</div>
    <p class="hint">Probability of "positive" after the last word: ${(m.final * 100).toFixed(1)}% &middot; between 40% and 60% counts as neutral</p>
    <div class="vrow">${chips}</div></div>`;
  S.meterDone = true;
}

async function autoPlay() {
  if (S.auto) { stopAuto(); return; }
  S.auto = true; const tok = ++S.autoTok; updateAutoBtn(); unlock();
  const alive = () => S.auto && tok === S.autoTok;
  const dur = [3800, 5200, 3600, 4200, 4800, 0, 0];
  while (alive()) {
    if (S.cur >= STAGES.length - 1) {
      while (alive() && !S.meterDone) await sleep(300);
      if (!alive()) break;
      await sleep(2600); if (!alive()) break;
      await newSentence(); await sleep(1200); continue;
    }
    goStage(S.cur + 1);
    const i = S.cur;
    if (i === 5) await sleep(2200 + S.analysis.hits.length * 1000);
    else if (i === 6) await sleep(800);
    else await sleep(dur[i]);
  }
}

$("#newBtn").onclick = () => { stopAuto(); newSentence(); };
$("#nextBtn").onclick = () => { stopAuto(); nextStage(); };
$("#autoBtn").onclick = autoPlay;
$("#customBtn").onclick = () => { const t = $("#customText").value.trim(); if (t) { stopAuto(); newSentence(t); } };
$("#customText").addEventListener("keydown", e => { if (e.key === "Enter") $("#customBtn").click(); });

/* ------------------------------------------------------ 4. Galaxy tab + maths */
let mainG = null;
function wordInfo(i) {
  if (i < 0) return "Hover over a dot...";
  const d = GAL, s = d.sentiment[i];
  return `<b>${esc(d.words[i])}</b> &middot; topic #${d.cluster[i]} &middot; LSTM sentiment ${(s * 100).toFixed(0)}% positive
    <span class="sentbar"><i style="left:${(s * 100).toFixed(0)}%"></i></span>
    <div class="ninfo">Nearest words in meaning: ${d.neighbors[i].map(j => `<span class="nb">${esc(d.words[j])}</span>`).join("")}</div>`;
}
function ensureGalaxy() {
  if (!GAL) return;
  if (!mainG) {
    mainG = new Galaxy($("#galaxyCanvas"), GAL, {
      onHover: i => { $("#gInfo").innerHTML = wordInfo(i >= 0 ? i : mainG.pin); },
      onPin: i => { $("#gInfo").innerHTML = wordInfo(i); }
    });
  } else mainG.resize();
}
$$("[data-color]").forEach(b => {
  b.onclick = () => { $$("[data-color]").forEach(x => x.classList.toggle("on", x === b)); if (mainG) mainG.setMode(b.dataset.color); sfx.pop(); };
});
$("#gZoomIn").onclick = () => { if (mainG) mainG.zoomAt(mainG.W / 2, mainG.H / 2, 1.6); };
$("#gZoomOut").onclick = () => { if (mainG) mainG.zoomAt(mainG.W / 2, mainG.H / 2, 1 / 1.6); };
$("#gReset").onclick = () => { if (mainG) { mainG.pin = -1; mainG.fitAll(600); } };

const PRESETS = [["king", "man", "woman"], ["paris", "france", "italy"], ["brother", "man", "woman"],
  ["delhi", "india", "france"], ["bigger", "big", "small"], ["walking", "walk", "swim"]];
function buildPresets() {
  $("#presets").innerHTML = PRESETS.map((p, i) => `<button data-p="${i}">${p[0]} − ${p[1]} + ${p[2]}</button>`).join("");
  $$("#presets button").forEach(b => { b.onclick = () => { $$("#presets button").forEach(x => x.classList.toggle("on", x === b)); runAnalogy(PRESETS[+b.dataset.p]); }; });
}
let vecAnim = 0;
async function runAnalogy([a, b, c]) {
  unlock(); sfx.whoosh();
  try {
    const r = await api(`/api/analogy?a=${a}&b=${b}&c=${c}`);
    $("#mathSpace").textContent = `· ${r.space} vectors`;
    $("#mathOut").innerHTML = `<div class="eq">${esc(a)} − ${esc(b)} + ${esc(c)} = <b>${esc(r.results[0].word)}</b></div>
      <div class="bars">${r.results.map((x, k) => `<div class="brow ${k === 0 ? "hi" : ""}"><span class="bw">${esc(x.word)}</span><span class="bt"><i data-w="${Math.max(2, x.score * 100).toFixed(1)}"></i></span><span class="bn">${x.score.toFixed(2)}</span></div>`).join("")}</div>
      <p class="hint">The vector from <b>${esc(b)}</b> to <b>${esc(a)}</b> is added to <b>${esc(c)}</b>; the closest word to the result wins (cosine similarity).</p>`;
    growBars($("#mathOut"));
    animateVec(r);
    later(() => sfx.ok(), 900);
  } catch (e) { toast(e.message); }
}
function animateVec(r) {
  cancelAnimationFrame(vecAnim);
  const cv = $("#vecCanvas"), ctx = cv.getContext("2d"), W = cv.width, H = cv.height, t0 = performance.now();
  const P = r.coords.map(([x, y]) => [W / 2 + x * (W / 2 - 70), H / 2 + y * (H / 2 - 50)]);
  const names = r.words, cols = ["#ff7aa8", "#7ab8ff", "#8be28b", "#ffd166"];
  function arrow(p, q, t, col, dash) {
    const x = p[0] + (q[0] - p[0]) * t, y = p[1] + (q[1] - p[1]) * t;
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 3; ctx.setLineDash(dash ? [6, 6] : []);
    ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(x, y); ctx.stroke(); ctx.setLineDash([]);
    if (t > 0.98 && !dash) {
      const ang = Math.atan2(q[1] - p[1], q[0] - p[0]);
      ctx.beginPath(); ctx.moveTo(q[0], q[1]);
      ctx.lineTo(q[0] - 12 * Math.cos(ang - 0.4), q[1] - 12 * Math.sin(ang - 0.4));
      ctx.lineTo(q[0] - 12 * Math.cos(ang + 0.4), q[1] - 12 * Math.sin(ang + 0.4)); ctx.fill();
    }
  }
  function frame(now) {
    const t = Math.min(1, (now - t0) / 1400);
    ctx.clearRect(0, 0, W, H);
    const g = ctx.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, W * 0.6); g.addColorStop(0, "#1b2054"); g.addColorStop(1, "#070a22");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    arrow(P[1], P[2], Math.min(1, t * 2), "rgba(255,255,255,.25)", true);
    arrow(P[0], P[3], Math.min(1, t * 2), "rgba(255,255,255,.25)", true);
    arrow(P[1], P[0], Math.min(1, t * 1.6), "#ff9f1c");
    arrow(P[2], P[3], Math.max(0, Math.min(1, (t - 0.35) * 1.6)), "#ff9f1c");
    P.forEach((p, k) => {
      ctx.fillStyle = cols[k]; ctx.beginPath(); ctx.arc(p[0], p[1], 7, 0, 6.283); ctx.fill();
      ctx.font = "600 15px 'Segoe UI', Arial"; ctx.fillStyle = "#fff"; ctx.fillText(names[k], p[0] + 11, p[1] - 9);
    });
    ctx.font = "12px 'Segoe UI', Arial"; ctx.fillStyle = "rgba(255,255,255,.6)";
    ctx.fillText("2-D view of the word vectors (PCA)", 10, H - 10);
    if (t < 1) vecAnim = requestAnimationFrame(frame);
  }
  vecAnim = requestAnimationFrame(frame);
}

/* ------------------------------------------------------ 5. Odd One Out */
const ROUNDS = 5, ROUND_TIME = 12;
const O = { state: "idle", round: 0, you: 0, ai: 0, streak: 0, best: 0, time: ROUND_TIME, timer: null, puzzle: null, results: [], tok: 0 };
try { O.best = parseInt(localStorage.getItem("nl_best_odd") || "0", 10) || 0; } catch (e) { /* ignore */ }
$("#oBest").textContent = O.best;

function oLevel() { const v = $("#oLevel").value; return v !== "auto" ? +v : (O.round <= 2 ? 1 : O.round <= 4 ? 2 : 3); }
function oControls() {
  const playing = ["countdown", "loading", "playing", "reveal", "paused"].includes(O.state);
  $("#oIdle").classList.toggle("hidden", playing); $("#oPlay").classList.toggle("hidden", !playing);
}
function oTimerBar() {
  $("#oTimerBar").style.width = (["idle", "over"].includes(O.state) ? 100 : O.time / ROUND_TIME * 100) + "%";
  $("#oTimerWrap").classList.toggle("low", O.state === "playing" && O.time <= 4);
}
async function oStart() {
  unlock(); const tok = ++O.tok;
  Object.assign(O, { state: "countdown", round: 0, you: 0, ai: 0, streak: 0, results: [] });
  $("#oYou").textContent = 0; $("#oAi").textContent = 0; $("#oStreak").textContent = 0; $("#oRound").textContent = "-";
  $("#oMsg").innerHTML = ""; $("#oWords").innerHTML = ""; oControls();
  for (const n of [3, 2, 1]) { if (tok !== O.tok) return; showModal(`<div class="bignum">${n}</div>`); sfx.beep(); await sleep(750); }
  if (tok !== O.tok) return;
  showModal(`<div class="bignum">GO!</div>`); sfx.go(); await sleep(450); hideModal();
  oBegin(tok);
}
async function oBegin(tok) {
  O.round++; O.state = "loading"; $("#oRound").textContent = O.round; bump($("#oRound")); $("#oMsg").innerHTML = ""; oControls();
  let p;
  try { p = await api("/api/odd?level=" + oLevel()); } catch (e) { toast("Error: " + e.message); O.state = "idle"; oControls(); return; }
  if (tok !== O.tok) return;
  O.puzzle = p; O.state = "playing"; O.time = ROUND_TIME;
  $("#oWords").innerHTML = p.words.map((w, i) => `<button class="wcard" data-i="${i}" style="animation-delay:${i * 90}ms">${esc(w)}<small>press ${i + 1}</small></button>`).join("");
  $$(".wcard").forEach(b => { b.onclick = () => oPick(+b.dataset.i); });
  $("#oTimerBar").style.transition = "none"; oTimerBar(); void $("#oTimerBar").offsetWidth; $("#oTimerBar").style.transition = "width 1s linear";
  oRunTimer(tok); sfx.pop(480);
}
function oRunTimer(tok) {
  clearInterval(O.timer);
  O.timer = setInterval(() => {
    if (tok !== O.tok) { clearInterval(O.timer); return; }
    O.time--; oTimerBar();
    if (O.time > 0 && O.time <= 3) sfx.tick();
    if (O.time <= 0) { clearInterval(O.timer); oPick(-1); }
  }, 1000);
  oTimerBar();
}
function oPick(i) {
  if (O.state !== "playing") return;
  clearInterval(O.timer); O.state = "reveal"; oControls(); oTimerBar();
  const p = O.puzzle, tok = O.tok, right = i === p.answer, aiRight = p.ai === p.answer;
  let pts = 0;
  if (right) { O.streak++; pts = 100 + O.time * 5 + (O.streak - 1) * 25; O.you += pts; } else O.streak = 0;
  if (aiRight) O.ai += 100;
  $("#oYou").textContent = O.you; $("#oAi").textContent = O.ai; $("#oStreak").textContent = O.streak;
  if (right) bump($("#oYou")); bump($("#oStreak"));
  const mx = Math.max(...p.scores.map(Math.abs), 0.01);
  $$(".wcard").forEach((b, k) => {
    b.disabled = true; b.classList.remove("right", "wrong");
    if (k === p.answer) b.classList.add("right"); else if (k === i) b.classList.add("wrong");
    const tags = []; if (k === i) tags.push("you"); if (k === p.ai) tags.push("🤖 AI");
    b.innerHTML = `${esc(p.words[k])}${tags.length ? `<span class="tag">${tags.join(" + ")}</span>` : ""}<span class="sb"><i style="width:${Math.max(4, p.scores[k] / mx * 100)}%"></i></span><small>avg similarity ${p.scores[k].toFixed(2)}</small>`;
  });
  const odd = p.words[p.answer];
  $("#oMsg").innerHTML = (i === -1 ? `<span class="lose">Time's up! The odd one was <u>${esc(odd)}</u></span>` : right ? `<span class="win">Correct! +${pts}</span>` : `<span class="lose">Not quite &ndash; the odd one was <u>${esc(odd)}</u></span>`)
    + `<span class="why">${aiRight ? "🤖 The AI found it too" : "🤖 The AI picked " + esc(p.words[p.ai]) + " and was wrong"}: the odd word has the lowest average cosine similarity to the others.</span>`;
  if (right) { sfx.ok(); confetti(60); } else sfx.bad();
  O.results.push({ words: p.words, answer: p.answer, pick: i, ai: p.ai });
  setTimeout(() => { if (tok !== O.tok || O.state !== "reveal") return; if (O.round >= ROUNDS) oOver(false); else oBegin(tok); }, 3300);
}
function oOver(early) {
  clearInterval(O.timer); O.tok++; O.state = "over"; oControls(); oTimerBar();
  const yc = O.results.filter(r => r.pick === r.answer).length, ac = O.results.filter(r => r.ai === r.answer).length;
  const record = O.you > O.best;
  if (record) { O.best = O.you; try { localStorage.setItem("nl_best_odd", String(O.best)); } catch (e) { /* ignore */ } $("#oBest").textContent = O.best; }
  const verdict = yc > ac ? "You beat the AI! 🏆" : yc === ac ? "It's a tie 🤝" : "The AI wins this time 🤖";
  const rows = O.results.map((r, k) => `<tr><td>${k + 1}</td><td>${r.words.map((w, j) => j === r.answer ? `<b>${esc(w)}</b>` : esc(w)).join(", ")}</td><td>${r.pick === r.answer ? "✔" : "✘"}</td><td>${r.ai === r.answer ? "✔" : "✘"}</td></tr>`).join("");
  showModal(`<div class="mcard c"><h2>${early ? "Game ended" : "Game over!"}</h2><div class="final">${O.you}</div>
    <div>${record && O.you > 0 ? "🎉 New high score!" : "Best: " + O.best}</div>
    <p><b>${verdict}</b><br>You: ${yc}/${O.results.length} correct &middot; 🤖 AI: ${ac}/${O.results.length}</p>
    <table><tr><th>#</th><th>Words (odd one in bold)</th><th>You</th><th>AI</th></tr>${rows}</table>
    <button class="big" id="oAgain">Play again</button><button class="alt" id="oClose">Close</button></div>`);
  $("#oAgain").onclick = () => { hideModal(); oStart(); };
  $("#oClose").onclick = () => { hideModal(); O.state = "idle"; oControls(); oTimerBar(); };
  if (record && O.you > 0) { sfx.win(); confetti(180); } else sfx.over();
}
function oPause() {
  if (O.state !== "playing") return;
  clearInterval(O.timer); O.state = "paused"; sfx.beep();
  showModal(`<div class="mcard c"><h2>Paused</h2><p>Round ${O.round} of ${ROUNDS} &middot; You ${O.you} &middot; AI ${O.ai}</p>
    <button class="big" id="oResume">Resume</button><button class="danger" id="oQuit">End Game</button></div>`);
  $("#oResume").onclick = oResume;
  $("#oQuit").onclick = () => { hideModal(); oOver(true); };
}
function oResume() { if (O.state !== "paused") return; hideModal(); O.state = "playing"; oRunTimer(O.tok); }
$("#oStart").onclick = oStart;
$("#oPause").onclick = oPause;
$("#oEnd").onclick = () => { if (O.state === "playing") oPause(); else if (O.state === "reveal") oOver(true); };

/* ------------------------------------------------------ keyboard, tabs, syllabus */
function showTab(name) {
  $$(".tabs button").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
  ["journey", "galaxy", "odd"].forEach(t => { $("#tab-" + t).hidden = t !== name; });
  if (name === "galaxy") { ensureGalaxy(); if (!$("#presets").children.length) buildPresets(); }
  sfx.pop(440);
}
$$(".tabs button").forEach(b => { b.onclick = () => showTab(b.dataset.tab); });
addEventListener("keydown", e => {
  if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) return;
  if (!$("#tab-odd").hidden) {
    if (e.key >= "1" && e.key <= "4" && O.state === "playing") oPick(+e.key - 1);
    if (e.key.toLowerCase() === "p") { O.state === "paused" ? oResume() : oPause(); }
  } else if (!$("#tab-journey").hidden && e.key === "ArrowRight" && !S.busy) { stopAuto(); nextStage(); }
});

$("#sylBtn").onclick = () => showModal(`<div class="mcard"><h2>Syllabus map</h2>
  <table><tr><th>Part of the app</th><th>NLP syllabus</th><th>Deep Learning syllabus</th></tr>
  <tr><td>1 Tokenize</td><td>Tokenization, Python libraries (NLTK) &ndash; Exp 1a word-frequency distribution</td><td>Text segmentation, tokenization</td></tr>
  <tr><td>2 Stop words</td><td>Stop-word removal &ndash; Exp 1b compare with original text</td><td>Pre-processing</td></tr>
  <tr><td>3 Stem &amp; Lemma</td><td>Stemming and lemmatization &ndash; Exp 2</td><td>Stemming</td></tr>
  <tr><td>4 POS &amp; NER</td><td>Part-of-speech tagging, named-entity recognition, phases of NLP</td><td>Parsing</td></tr>
  <tr><td>5 BoW &amp; TF-IDF</td><td>Bag-of-Words, document vectors, TF-IDF keywords &ndash; Exp 3 &amp; 4</td><td>Feature engineering for text</td></tr>
  <tr><td>6 Embeddings &amp; Galaxy</td><td>Word2Vec (skip-gram, trained by us), GloVe vector maths</td><td>Word embedding, pre-trained GloVe</td></tr>
  <tr><td>7 LSTM reads</td><td>RNN, LSTM, sentiment analysis &ndash; Exp 5 &amp; 7 (positive / neutral / negative)</td><td>Bidirectional LSTM, gated networks, forward propagation in time</td></tr>
  <tr><td>Odd One Out</td><td>Word similarity with embeddings (cosine)</td><td>Word embeddings</td></tr></table>
  <p class="hint">Model: ${INFO ? `Bidirectional LSTM (64 units) on frozen Word2Vec vectors &middot; ${INFO.vocab.toLocaleString()} words &middot; test accuracy ${(INFO.accuracy * 100).toFixed(2)}% on 25,000 unseen IMDB reviews` : ""}.
  "Neutral" means the model's positive probability is between 40% and 60%.</p>
  <div style="text-align:center"><button id="sylClose">Close</button></div></div>`);
document.addEventListener("click", e => { if (e.target.id === "sylClose" || e.target.id === "modal" && O.state !== "paused" && O.state !== "countdown" && !$("#oAgain")) hideModal(); });

/* ------------------------------------------------------ 6. boot */
async function boot() {
  try {
    INFO = await api("/api/info"); GAL = await api("/api/galaxy");
  } catch (e) { $("#badge").textContent = "Could not reach the server: " + e.message; return; }
  $("#badge").textContent = `BiLSTM · test accuracy ${(INFO.accuracy * 100).toFixed(2)}% · Word2Vec ${INFO.dim}-d · ${INFO.vocab.toLocaleString()} words`;
  updateTally(); updateAutoBtn(); oControls(); oTimerBar();
  if (!INFO.features.tokenize || !INFO.features.pos) toast("Some NLTK data is missing - connect to the internet and restart the app once.");
  newSentence();
}
boot();
