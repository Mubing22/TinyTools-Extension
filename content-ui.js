// 悬浮窗 + 两套自动化。
// 运行在隔离世界：能读写页面 DOM、能用 chrome.*，但拿不到页面的 JS 变量（不需要）。
'use strict';

const API_BASE = location.origin;   // 同源，避免 www / 无 www 或端口差异导致 CORS
const HMAC_KEY = 'idictation_2024';
const VIP_KEY = '__idictation_pro';

// ─────────────────────────── 设置 ───────────────────────────

const DEFAULTS = {
  vip: true,
  wordsAcc: 100,     // 词书目标正确率 %
  readAcc: 90,       // 阅读目标正确率 %
  minutesMin: 45,
  minutesMax: 55,
  batch: 8,
  highlights: 3
};

let S = { ...DEFAULTS };
let busy = null;      // 'words' | 'read' | null
let stopFlag = false;

async function loadSettings() {
  try {
    const got = await chrome.storage.local.get(DEFAULTS);
    S = { ...DEFAULTS, ...got };
  } catch (e) {}
}
function saveSettings() {
  try { chrome.storage.local.set(S); } catch (e) {}
}

// ─────────────────────────── 悬浮窗 ───────────────────────────

const host = document.createElement('div');
host.id = '__idictation_toolbox_host';
host.style.cssText = 'position:fixed;z-index:2147483000;right:0;bottom:0;width:0;height:0;';
const root = host.attachShadow({ mode: 'open' });

root.innerHTML = `
<style>
  :host { all: initial; }
  * { box-sizing: border-box; font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; }
  .fab {
    position: fixed; right: 16px; bottom: 16px; width: 34px; height: 34px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center; cursor: pointer; user-select: none;
    background: rgba(255, 255, 255, .72); border: 1px solid rgba(15, 23, 42, .10);
    color: #94a3b8; opacity: .5; -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
    box-shadow: 0 1px 4px rgba(15, 23, 42, .06);
    transition: opacity .18s ease, color .18s ease, border-color .18s ease, transform .18s ease;
  }
  .fab:hover { opacity: 1; color: #ff6a00; border-color: rgba(255, 106, 0, .35); transform: scale(1.06); }
  .fab.active { opacity: 1; color: #ff6a00; border-color: rgba(255, 106, 0, .45); }
  :host([data-dark="1"]) .fab {
    background: rgba(31, 41, 55, .72); border-color: rgba(255, 255, 255, .14); color: #94a3b8;
  }
  :host([data-dark="1"]) .fab:hover,
  :host([data-dark="1"]) .fab.active { color: #ff8a3d; border-color: rgba(255, 138, 61, .45); }
  .panel {
    position: fixed; right: 16px; bottom: 60px; width: 320px; max-height: 76vh;
    background: #fff; color: #1f2937; border-radius: 14px; overflow: hidden;
    box-shadow: 0 12px 36px rgba(15, 23, 42, .22); display: none; flex-direction: column;
    border: 1px solid rgba(15,23,42,.06);
  }
  .panel.open { display: flex; }
  header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 14px; background: linear-gradient(135deg, #ff6a00, #ff9500); color: #fff;
    font-size: 14px; font-weight: 600;
  }
  header .x { cursor: pointer; opacity: .85; font-size: 16px; line-height: 1; padding: 2px 4px; }
  .body { padding: 12px 14px 6px; overflow-y: auto; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .row + .row { margin-top: 8px; }
  .card { border: 1px solid #eef0f3; border-radius: 10px; padding: 10px 12px; margin-bottom: 10px; }
  .card .head { display: flex; align-items: center; justify-content: space-between; }
  .title { font-size: 13px; font-weight: 600; }
  .sub { font-size: 11px; color: #9aa3af; margin-top: 2px; }
  button.go {
    border: 0; border-radius: 8px; padding: 6px 14px; font-size: 12px; font-weight: 600; color: #fff;
    background: #ff6a00; cursor: pointer; min-width: 62px;
  }
  button.go.stop { background: #ef4444; }
  button.go:disabled { background: #d1d5db; cursor: not-allowed; }
  details { margin-top: 8px; }
  summary { font-size: 12px; color: #6b7280; cursor: pointer; outline: none; user-select: none; }
  .field { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 8px; font-size: 12px; color: #4b5563; }
  .field input[type=range] { flex: 1; accent-color: #ff6a00; }
  .field input[type=number] { width: 62px; padding: 3px 6px; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 12px; }
  .val { min-width: 44px; text-align: right; font-variant-numeric: tabular-nums; color: #ff6a00; font-weight: 600; }
  .switch { position: relative; width: 40px; height: 22px; flex: none; }
  .switch input { opacity: 0; width: 0; height: 0; }
  .slider { position: absolute; inset: 0; background: #d1d5db; border-radius: 999px; transition: .2s; cursor: pointer; }
  .slider:before { content: ""; position: absolute; width: 16px; height: 16px; left: 3px; top: 3px; background: #fff; border-radius: 50%; transition: .2s; }
  .switch input:checked + .slider { background: #22c55e; }
  .switch input:checked + .slider:before { transform: translateX(18px); }
  .log {
    margin: 0; padding: 8px 10px; background: #0f172a; color: #cbd5e1; font: 11px/1.55 ui-monospace, Menlo, monospace;
    border-radius: 10px; height: 108px; overflow-y: auto; white-space: pre-wrap; word-break: break-all;
  }
  .hint { font-size: 11px; color: #ef4444; margin-top: 8px; display: none; }
  .hint.show { display: block; }
  .dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #22c55e; margin-right: 5px; }
  .dot.off { background: #9ca3af; }
</style>

<div class="fab" id="fab" title="工具箱" role="button" aria-label="工具箱">
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor"
       stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
    <path d="M7 2.4v9.2M2.4 7h9.2"/>
  </svg>
</div>

<div class="panel" id="panel">
  <header>
    <span>爱听写工具箱</span>
    <span class="x" id="close">✕</span>
  </header>
  <div class="body">
    <div class="card">
      <div class="row">
        <div>
          <div class="title"><span class="dot" id="vipDot"></span>VIP 解锁</div>
          <div class="sub">本地显示 Pro，不改服务器</div>
        </div>
        <label class="switch"><input type="checkbox" id="vipToggle"><span class="slider"></span></label>
      </div>
    </div>

    <div class="card">
      <div class="head">
        <div>
          <div class="title">自动写词书</div>
          <div class="sub">看词选义，需先进入某个章节</div>
        </div>
        <button class="go" id="wordsGo">开始</button>
      </div>
      <details id="wordsFold">
        <summary>参数</summary>
        <div class="field"><span>正确率</span><input type="range" id="wordsAcc" min="50" max="100" step="1"><span class="val" id="wordsAccVal"></span></div>
      </details>
    </div>

    <div class="card">
      <div class="head">
        <div>
          <div class="title">自动写阅读真题</div>
          <div class="sub">接口作答，需先在真题页</div>
        </div>
        <button class="go" id="readGo">开始</button>
      </div>
      <details id="readFold">
        <summary>参数</summary>
        <div class="field"><span>正确率</span><input type="range" id="readAcc" min="0" max="100" step="1"><span class="val" id="readAccVal"></span></div>
        <div class="field"><span>用时(分)</span><input type="number" id="minMin" min="1" max="180"><span>-</span><input type="number" id="maxMin" min="1" max="180"></div>
        <div class="field"><span>每批题数</span><input type="number" id="batch" min="1" max="40"></div>
        <div class="field"><span>每篇划线</span><input type="number" id="highlights" min="0" max="10"></div>
      </details>
    </div>

    <div class="hint" id="hint"></div>
    <pre class="log" id="log"></pre>
  </div>
</div>
`;

document.documentElement.appendChild(host);

const $ = (id) => root.getElementById(id);

// ─────────────────────────── 日志 ───────────────────────────

const LOG_MAX = 200;
function log(msg) {
  const el = $('log');
  if (!el) return;
  const line = `[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${msg}`;
  el.textContent += (el.textContent ? '\n' : '') + line;
  const lines = el.textContent.split('\n');
  if (lines.length > LOG_MAX) el.textContent = lines.slice(-LOG_MAX).join('\n');
  el.scrollTop = el.scrollHeight;
}

// 技术细节只进 Console，面板只留用户看得懂的信息
function dbg(msg) {
  try { console.log('[爱听写工具箱]', msg); } catch (e) {}
}

function showHint(text, ms = 4200) {
  const el = $('hint');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(showHint._t);
  showHint._t = setTimeout(() => el.classList.remove('show'), ms);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─────────────────────────── UI 绑定 ───────────────────────────

$('fab').addEventListener('click', () => {
  const open = $('panel').classList.toggle('open');
  $('fab').classList.toggle('active', open);
});

// 跟随站点的深色模式
(function syncTheme() {
  const html = document.documentElement;
  const apply = () => host.setAttribute('data-dark', html.classList.contains('dark') ? '1' : '0');
  apply();
  try { new MutationObserver(apply).observe(html, { attributes: true, attributeFilter: ['class'] }); } catch (e) {}
})();
$('close').addEventListener('click', () => $('panel').classList.remove('open'));

function applyVipState() {
  try {
    localStorage.setItem(VIP_KEY, S.vip ? 'on' : 'off');
  } catch (e) {}
  $('vipToggle').checked = S.vip;
  $('vipDot').className = 'dot' + (S.vip ? '' : ' off');
}

$('vipToggle').addEventListener('change', (e) => {
  S.vip = e.target.checked;
  saveSettings();
  applyVipState();
  log(S.vip ? 'VIP 解锁：开' : 'VIP 解锁：关');
});

function bindRange(id, key, fmt) {
  const el = $(id);
  const out = $(id + 'Val');
  el.value = S[key];
  out.textContent = fmt(S[key]);
  el.addEventListener('input', () => {
    S[key] = Number(el.value);
    out.textContent = fmt(S[key]);
    saveSettings();
  });
}

function bindNumber(id, key) {
  const el = $(id);
  el.value = S[key];
  el.addEventListener('change', () => {
    const v = Number(el.value);
    if (Number.isFinite(v)) { S[key] = v; saveSettings(); }
  });
}

function refreshControls() {
  $('wordsAcc').value = S.wordsAcc;
  $('wordsAccVal').textContent = S.wordsAcc + '%';
  $('readAcc').value = S.readAcc;
  $('readAccVal').textContent = S.readAcc + '%';
  $('minMin').value = S.minutesMin;
  $('maxMin').value = S.minutesMax;
  $('batch').value = S.batch;
  $('highlights').value = S.highlights;
}

// ─────────────────── 词书：接口模式（主世界桥接来的词条列表） ───────────────────

let wordList = null;

window.addEventListener('message', (e) => {
  const d = e && e.data;
  if (!d || d.__idict !== 'wordlist' || !Array.isArray(d.ids) || !d.ids.length) return;
  wordList = d;
  try {
    dbg(`捕获词条列表：${d.ids.length} 条（章节 ${d.c_id}）`);
  } catch (err) {}
});

async function runWordsViaApi() {
  const ids = wordList.ids.slice();
  const acc = Math.max(0, Math.min(100, S.wordsAcc)) / 100;
  const sence = /[?&]source=review/.test(location.search) ? 2 : 1;
  const key = Date.now();

  // 按词条顺序提交（服务端有 last_id 之类的推进状态，乱序可能不被认作整章练习），
  // 只随机决定哪些位置答错。
  const wrongCount = Math.round(ids.length * (1 - acc));
  const wrong = new Set();
  while (wrong.size < wrongCount) wrong.add(Math.floor(Math.random() * ids.length));

  log(`开始作答：共 ${ids.length} 题`);
  dbg(`接口模式 | 目标正确率 ${S.wordsAcc}% | 故意错 ${wrongCount} 题 | sence=${sence}`);

  let done = 0;
  for (let i = 0; i < ids.length && !stopFlag; i++) {
    const type = wrong.has(i) ? 'fail' : 'success';
    const r = await api('/api/study/lexicon/v1/practice/result', {
      key,
      type,
      error_word: '',
      lexicon_id: ids[i],
      mode: 4,           // 看词选义
      sence,
      if_learned: type === 'success' ? 1 : 0
    });
    if (!r.json || r.json.status !== 0) {
      log(`第 ${i + 1} 题被拒绝：${String(r.text).slice(0, 100)}`);
      break;
    }
    done++;
    if (done % 10 === 0) log(`已提交 ${done}/${ids.length}`);
  }

  log(stopFlag ? `已停止（${done}/${ids.length}）` : `提交完成 ${done}/${ids.length}`);
  dbg(`接口模式结束 done=${done}/${ids.length}`);

  // 收尾结算：不调这个，服务端只记进度不写正确率（is_incomplete 一直为 true）
  if (done && !stopFlag) {
    try {
      const fin = await api('/api/study/lexicon/v1/chapter/list', {
        id: wordList.c_id,
        g_id: wordList.g_id,
        is_generate_stories: true,
        is_chapter_finished: true
      });
      const ch = (fin.json && fin.json.values && fin.json.values[0]) || null;
      dbg('结算返回：' + JSON.stringify(ch && {
        accuracy: ch.accuracy, is_practiced: ch.is_practiced, is_incomplete: ch.is_incomplete
      }));
      const finished = !!(ch && ch.is_practiced && !ch.is_incomplete);
      if (finished) {
        const accText = ch.accuracy == null ? '' : `（正确率 ${Number(ch.accuracy).toFixed(0)}%）`;
        log(`✅ 本章已完成${accText}`);
        showHint('已完成，刷新词书列表即可看到成绩。', 5000);
      } else {
        log('⚠️ 已提交，但系统还没标记完成');
        showHint('提交成功但未结算，退出章节重新进入后再试一次。', 6000);
      }
    } catch (e) {
      log('⚠️ 结算没有成功，请重试');
      dbg('结算异常：' + (e && e.message ? e.message : String(e)));
    }
  }
}

// ─────────────────── 词书：DOM 读取与打分（移植自 solve.mjs） ───────────────────

const squeeze = (s) => (s || '').replace(/[\s\u3000]+/g, '');

const vis = (e) => {
  const s = getComputedStyle(e);
  return s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) > 0.05;
};

function readWordState() {
  const T = squeeze;

  const m = document.body.innerText.match(/(\d+)\/(\d+)/);
  const prog = m ? m[0] : '';

  const cands = [];
  const all = document.querySelectorAll('p,div,span');
  for (let i = 0; i < all.length; i++) {
    const e = all[i];
    if (e.children.length) continue;
    const s = getComputedStyle(e);
    if (!(s.opacity === '0' || s.visibility === 'hidden' || s.display === 'none')) continue;
    const t = e.textContent.trim();
    if (!/^[a-z]{1,6}\.\s*[（(\u4e00-\u9fa5]/.test(t)) continue;
    if (t.length < 3 || t.length > 160) continue;
    cands.push(t);
  }
  const ans = cands.length ? cands[cands.length - 1] : '';

  const lines = document.body.innerText.split('\n').map((s) => s.trim()).filter(Boolean);
  let opts = [];
  for (let j = 0; j < lines.length; j++) {
    const mm = lines[j].match(/^快捷键：(\d)$/);
    if (mm && lines[j + 1]) {
      const pt = String(lines[j + 1]).trim();
      if (pt && pt !== '不知道' && !/^\//.test(pt)) opts.push({ n: parseInt(mm[1], 10), txt: pt });
    }
  }

  return { prog, ans, ansList: cands.slice(-6), opts };
}

function pickOption(answerText, options) {
  const body = squeeze(answerText).replace(/^[a-z]{1,6}\./, '');
  const senses = body.split(/[；;，,/、]/).map(squeeze).filter((x) => x.length >= 2);
  let bestIdx = -1;
  let bestScore = -1;
  for (const o of options) {
    if (o.n > 4) continue;
    const target = squeeze(o.txt);
    let score = 0;
    for (const sense of senses) {
      if (target.includes(sense)) score = Math.max(score, sense.length * 3);
      else {
        let hit = 0;
        for (const ch of sense) if (target.includes(ch)) hit++;
        score = Math.max(score, hit);
      }
    }
    if (score > bestScore) { bestScore = score; bestIdx = o.n; }
  }
  return { idx: bestIdx, score: bestScore };
}

// 定位选项：先滚动到视口内，再取中心坐标，并用 elementFromPoint 校验命中
function locateOption(text) {
  const want = squeeze(text);
  const cands = Array.from(document.querySelectorAll('div,span,p,a')).filter(
    (e) => e.children.length === 0 && vis(e) && squeeze(e.textContent) === want
  );
  for (let i = cands.length - 1; i >= 0; i--) {
    const el = cands[i];
    let r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;

    if (r.top < 4 || r.bottom > window.innerHeight - 4) {
      el.scrollIntoView({ block: 'center' });
      r = el.getBoundingClientRect();
    }
    if (!r.width || !r.height) continue;
    if (r.top < 0 || r.bottom > window.innerHeight) continue;

    const x = Math.round(r.left + r.width / 2);
    const y = Math.round(r.top + r.height / 2);
    const hit = document.elementFromPoint(x, y);
    return {
      x, y,
      hit: hit ? hit.tagName + '.' + String(hit.className || '').slice(0, 20) : 'null',
      inside: !!hit && (hit === el || el.contains(hit) || hit.contains(el))
    };
  }
  return null;
}

function clearOverlays() {
  const done = [];
  const clickByText = (txt) => {
    const btn = [].slice.call(document.querySelectorAll('button'))
      .filter((e) => e.textContent.trim() === txt)[0];
    if (btn) { btn.click(); done.push(txt); }
  };
  clickByText('继续听写');
  clickByText('不再提醒');
  clickByText('暂不');
  [].slice.call(document.querySelectorAll('button[aria-label]')).forEach((c) => {
    if ((c.getAttribute('aria-label') || '').indexOf('关闭') >= 0) c.click();
  });
  [].slice.call(document.querySelectorAll('.el-overlay')).forEach((o) => { o.style.display = 'none'; });
  return done.join(',') || '-';
}

function withTimeout(promise, ms, msg) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(msg)), ms))
  ]);
}

async function cdpClick(x, y) {
  let r;
  try {
    r = await withTimeout(
      chrome.runtime.sendMessage({ type: 'click', x, y }),
      8000,
      '后台无响应（8s 超时）。在扩展页点「重新加载」后刷新本页再试。'
    );
  } catch (e) {
    throw new Error(e && e.message ? e.message : String(e));
  }
  if (!r || !r.ok) throw new Error('点击失败：' + ((r && r.error) || '未知'));
}

async function runWords() {
  const acc = Math.max(0, Math.min(100, S.wordsAcc)) / 100;

  const first = readWordState();
  if (!first.prog) {
    showHint('当前页面不是词书答题页。请点「班级」→ 词书卡片 → 任意章节，停在一道题上再开始。');
    return;
  }

  // 有桥接来的词条列表，且数量与页面进度对得上，就走接口模式
  if (wordList && wordList.ids.length) {
    const total = Number((first.prog.split('/')[1] || 0));
    if (!total || total === wordList.ids.length) {
      await runWordsViaApi();
      return;
    }
    log('正在使用逐题模式…');
    dbg(`词条数(${wordList.ids.length})与本章(${total})不符，退回点击模式`);
  } else {
    log('正在使用逐题模式…');
    dbg('未捕获词条列表，退回点击模式（重进章节可启用快速模式）');
  }

  dbg(`清理浮层：${clearOverlays()}`);
  await sleep(800);

  let ok = 0, bad = 0, consecutiveFail = 0;

  for (let i = 0; i < 400 && !stopFlag; i++) {
    if (i % 20 === 0) clearOverlays();   // 每题都清太慢，按节奏清

    const st = readWordState();
    if (!st.prog) { await sleep(400); continue; }

    const [cur, total] = st.prog.split('/').map(Number);
    if (cur >= total) { log(`本章已完成 ${st.prog}`); break; }

    const candidates = st.ansList.length ? st.ansList : (st.ans ? [st.ans] : []);
    let best = null;
    for (const cand of candidates) {
      const r = pickOption(cand, st.opts);
      if (!best || r.score > best.score) best = { text: cand, ...r };
    }

    if (!best || best.idx < 0) {
      bad++; consecutiveFail++;
      dbg(`${st.prog} 没解析出可用释义`);
      if (consecutiveFail === 3) log('页面似乎没有响应，正在重试…');
      if (consecutiveFail > 20) { log('连续失败过多，停止'); break; }
      await sleep(500);
      continue;
    }

    // 目标正确率：按比例故意选错
    let finalIdx = best.idx;
    if (Math.random() > acc) {
      const others = st.opts.filter((o) => o.n <= 4 && o.n !== best.idx);
      if (others.length) finalIdx = others[Math.floor(Math.random() * others.length)].n;
    }

    const target = st.opts.find((o) => o.n === finalIdx);
    if (st.opts.length < 4 || !target) {
      bad++; consecutiveFail++;
      dbg(`${st.prog} 选项数量不足（${st.opts.length}）`);
      if (consecutiveFail > 25) { log('连续失败过多，停止'); break; }
      await sleep(400);
      continue;
    }

    const spot = locateOption(target.txt);
    if (!spot) {
      bad++; consecutiveFail++;
      dbg(`${st.prog} 找不到选项「${target.txt}」的可点击位置`);
      if (consecutiveFail === 3) log('找不到可点击的选项，正在重试…');
      if (consecutiveFail > 25) { log('连续失败过多，停止'); break; }
      await sleep(500);
      continue;
    }

    const before = st.prog;
    dbg(`${before} 点「${target.txt}」@(${spot.x},${spot.y}) 命中=${spot.hit}${spot.inside ? '' : ' [命中不一致]'}`);
    try {
      await cdpClick(spot.x, spot.y);
    } catch (e) {
      dbg('点击异常：' + String(e.message || e));
      log('⚠️ 作答被浏览器拒绝');
      showHint('如果有开发者工具开着本页，先关掉再试。');
      break;
    }

    let advanced = false;
    for (let k = 0; k < 50 && !stopFlag; k++) {
      await sleep(120);
      const next = readWordState();
      if (next && next.prog && next.prog !== before) { advanced = true; break; }
    }

    if (advanced) {
      ok++; consecutiveFail = 0;
      dbg(`${before} → ${target.txt}${finalIdx === best.idx ? '' : '（故意错）'}`);
      if (ok % 10 === 0) log(`进行中：已完成 ${ok} 题`);
    } else {
      const again = readWordState();
      if (again && again.ans !== st.ans) { ok++; consecutiveFail = 0; continue; }
      bad++; consecutiveFail++;
      dbg(`${before} 点击后未推进`);
      if (consecutiveFail === 3) log('作答没有生效，正在重试…');
      if (consecutiveFail > 25) { log('连续失败过多，停止'); break; }
      clearOverlays();
      await sleep(600);
    }
  }

  log(stopFlag ? `已停止（完成 ${ok} 题）` : `已完成 ${ok} 题`);
  dbg(`词书结束：成功 ${ok} 失败 ${bad}`);
}

// ─────────────────── 阅读真题：签名与接口（移植自 read.mjs） ───────────────────

async function hmacSign(raw) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(HMAC_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const buf = await crypto.subtle.sign('HMAC', key, enc.encode(raw));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function api(path, payload) {
  const body = {
    api_key: encodeURIComponent(path),
    timestamp: Math.floor(Date.now() / 1000),
    nonce: Math.random().toString(36).substring(2, 12),
    ...(payload || {})
  };
  const sorted = Object.keys(body).sort();
  let raw = '';
  for (const k of sorted) {
    let v = body[k];
    if (Array.isArray(v) || (typeof v === 'object' && v !== null)) v = JSON.stringify(v);
    raw += `${k}=${v}&`;
  }
  body.sign = await hmacSign(raw.replace(/&$/, ''));

  const res = await fetch(API_BASE + path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) {}
  return { http: res.status, json, text };
}

function detectReadTest() {
  const url = location.href;
  const m = url.match(/[?&]id=(\d+)/);
  const id = m ? m[1] : null;
  const kind = /jianya/i.test(url) ? 'jianya' : 'jijing';
  return { id, kind };
}

function normalizeAnswer(a, type) {
  if (a == null) return null;
  const v = String(a).trim();
  if (type === 7 && v.includes(',')) return v.split(',').map((s) => s.trim()).filter(Boolean);
  return v.includes(' / ') ? v.split(' / ')[0].trim() : v;
}

function optionTitles(list) {
  if (!Array.isArray(list)) return [];
  return list.map((o) => o && o.title).filter(Boolean);
}

function buildHighlights(parts, perPart) {
  const out = [];
  parts.forEach((part, partIndex) => {
    const paras = (part.content && part.content.paragraph) || [];
    const title = String((part.content && part.content.title) || '');
    const full = title + paras.join('');

    const pool = [];
    (part.question || []).forEach((g) => (g.list || []).forEach((q) => {
      try {
        const ai = typeof q.ai_central_sentences === 'string'
          ? JSON.parse(q.ai_central_sentences)
          : q.ai_central_sentences;
        ((ai && ai.sentences) || []).forEach((s) => {
          const t = String(s || '').trim();
          if (t.length >= 40) pool.push(t);
        });
      } catch (e) {}
    }));

    const uniq = Array.from(new Set(pool));
    for (let i = uniq.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [uniq[i], uniq[j]] = [uniq[j], uniq[i]];
    }

    let added = 0;
    const used = [];
    for (const sentence of uniq) {
      if (added >= perPart) break;
      const pos = full.indexOf(sentence);
      if (pos < 0) continue;
      if (used.some((u) => Math.abs(u - pos) < 200)) continue;
      used.push(pos);
      added++;
      out.push({
        start: pos, end: pos + sentence.length,
        local_start: pos, local_end: pos + sentence.length,
        text: sentence, level: 1, highlight_level: 1,
        scope_key: 'article', part_index: partIndex,
        highlight_id: 10000 + Math.floor(Math.random() * 80000),
        created_scene: 'practice', position_scene: 'practice', highlight_type: 'primary'
      });
    }
  });
  return out;
}

async function runRead() {
  const { id: testId, kind } = detectReadTest();
  if (!testId) {
    showHint('没读到试卷编号。请先打开一套阅读真题，地址栏里要能看到 id=数字，再点开始。');
    return;
  }

  const acc = Math.max(0, Math.min(100, S.readAcc)) / 100;
  const minMin = Math.min(S.minutesMin, S.minutesMax);
  const maxMin = Math.max(S.minutesMin, S.minutesMax);
  const perPart = Math.max(0, S.highlights | 0);

  // 剑雅与机经是两套接口，地址栏只有 id 时无法区分，依次试
  const order = kind === 'jianya' ? ['jianya', 'jijing'] : ['jijing', 'jianya'];
  let show = null;
  let usedKind = null;
  for (const k of order) {
    if (k === order[0]) log('正在获取试卷…');
    const r = await api(`/api/study/yuedu-zhenti/v1/${k}/test/show/${testId}`, {});
    const okShape = r.json && r.json.status === 0 && r.json.values && Array.isArray(r.json.values.parts);
    if (okShape) { show = r; usedKind = k; break; }
    dbg(`${k} 不可用：${(r.json && r.json.message) || String(r.text).slice(0, 60)}`);
  }
  if (!show) {
    showHint('两套接口都拉不到这套题。请确认停留在阅读真题的答题页（地址栏 id 是试卷编号），再点开始。');
    return;
  }
  dbg(`使用 ${usedKind} 接口`);

  const items = [];
  (show.json.values.parts || []).forEach((part) => {
    (part.question || []).forEach((group) => {
      const groupOpts = optionTitles(group.collect_option && group.collect_option.list);
      (group.list || []).forEach((q) => {
        const ownOpts = optionTitles(q.option);
        items.push({
          type: group.type,
          id: q.id,
          group_id: group.group_id,
          number: q.number,
          correct: normalizeAnswer(q.display_answer, group.type),
          options: ownOpts.length ? ownOpts : groupOpts
        });
      });
    });
  });

  if (!items.length) {
    log('这套题没有获取到题目');
    showHint('没能解析出题目，换一套试试。');
    return;
  }
  log(`共 ${items.length} 题`);
  dbg(`答案完整 ${items.filter((i) => i.correct != null).length}/${items.length}`);

  const highlights = buildHighlights(show.json.values.parts || [], perPart);
  if (perPart > 0) dbg(`生成划线 ${highlights.length} 条`);

  // 按正确率挑出故意做错的题
  const wrongCount = Math.round(items.length * (1 - acc));
  const idxs = items.map((_, i) => i);
  for (let i = idxs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
  }
  const wrongSet = new Set(idxs.slice(0, wrongCount));

  items.forEach((it, i) => {
    if (!wrongSet.has(i)) { it.answer = it.correct; return; }
    const cands = it.options.filter((o) => o !== it.correct);
    it.answer = cands.length ? cands[Math.floor(Math.random() * cands.length)] : null;
  });
  dbg(`目标正确率 ${(acc * 100).toFixed(0)}% → 故意错 ${wrongCount} 题`);

  // 时间轴
  const totalMin = minMin + Math.random() * Math.max(0, maxMin - minMin);
  const totalSec = Math.round(totalMin * 60);
  const weights = items.map(() => 0.7 + Math.random() * 0.6);
  const wsum = weights.reduce((a, b) => a + b, 0);
  let acc2 = 0;
  const timeAt = weights.map((w) => {
    acc2 += w;
    return Math.round((acc2 / wsum) * totalSec);
  });
  dbg(`用时设定 ${totalMin.toFixed(1)} 分钟`);

  const sessionKey = Date.now();
  const batch = Math.max(1, S.batch | 0);
  let cursor = 0, batchNo = 0;

  while (cursor < items.length && !stopFlag) {
    const end = Math.min(cursor + batch, items.length);
    const duration = timeAt[end - 1];

    const answerArr = items.map((it, idx) => ({
      type: it.type, id: it.id, group_id: it.group_id,
      answer: idx < end ? it.answer : null, mark: false
    }));

    batchNo++;
    const r = await api('/api/study/yuedu-zhenti/v1/submit', {
      key: sessionKey, answer: answerArr, duration, highlights, notes: [],
      // 剑雅与机经的编号字段名不同，三个都给，服务端取认得的那个
      jijing_test_id: String(testId), test_id: String(testId), paper_id: String(testId)
    });
    const ok = r.json && r.json.status === 0;
    dbg(`批 ${batchNo}: ${end}/${items.length} duration=${duration}s → ${ok ? 'ok' : String(r.text).slice(0, 80)}`);
    if (ok) log(`已作答 ${end}/${items.length}`);
    if (!ok) {
      showHint('提交被拒绝，停止。把日志发我。');
      return;
    }
    cursor = end;
  }

  if (stopFlag) { log('已停止，未交卷'); return; }

  const finalAnswers = items.map((it) => ({
    type: it.type, id: it.id, group_id: it.group_id, answer: it.answer, mark: false
  }));
  const fin = await api('/api/study/yuedu-zhenti/v1/submit', {
    key: sessionKey, answer: finalAnswers, duration: timeAt[timeAt.length - 1],
    highlights, notes: [], action: '手动提交',
    jijing_test_id: String(testId), test_id: String(testId), paper_id: String(testId)
  });
  const finOk = fin.json && fin.json.status === 0;
  if (finOk) {
    log(`✅ 已交卷（用时约 ${Math.round(timeAt[timeAt.length - 1] / 60)} 分钟）`);
    showHint('已完成，刷新结果页即可查看成绩。', 5000);
  } else {
    log('⚠️ 交卷失败');
    showHint('交卷未成功，请稍后重试。', 6000);
    dbg('交卷失败：' + String(fin.text).slice(0, 150));
  }
}

// ─────────────────────────── 任务调度 ───────────────────────────

async function start(kind) {
  if (busy) return;
  busy = kind;
  stopFlag = false;

  const btn = kind === 'words' ? $('wordsGo') : $('readGo');
  const other = kind === 'words' ? $('readGo') : $('wordsGo');
  btn.textContent = '停止';
  btn.classList.add('stop');
  other.disabled = true;

  log(kind === 'words' ? '开始：自动写词书' : '开始：自动写阅读真题');

  try {
    if (kind === 'words') await runWords();
    else await runRead();
  } catch (e) {
    log('出错：' + (e && e.message ? e.message : String(e)));
  } finally {
    try {
      await withTimeout(chrome.runtime.sendMessage({ type: 'release' }), 3000, 'release timeout');
    } catch (e) {}
    busy = null;
    btn.textContent = '开始';
    btn.classList.remove('stop');
    other.disabled = false;
    log('结束');
  }
}

$('wordsGo').addEventListener('click', () => {
  if (busy === 'words') { stopFlag = true; return; }
  if (busy) return;
  start('words');
});

$('readGo').addEventListener('click', () => {
  if (busy === 'read') { stopFlag = true; return; }
  if (busy) return;
  start('read');
});

// ─────────────────────────── 初始化 ───────────────────────────

(async () => {
  await loadSettings();
  applyVipState();
  refreshControls();
  bindRange('wordsAcc', 'wordsAcc', (v) => v + '%');
  bindRange('readAcc', 'readAcc', (v) => v + '%');
  bindNumber('minMin', 'minutesMin');
  bindNumber('maxMin', 'minutesMax');
  bindNumber('batch', 'batch');
  bindNumber('highlights', 'highlights');
  log('就绪');
})();
