#!/usr/bin/env node
/**
 * idictation-auto — 爱听写（idictation.cn）「看词选义」自动作答
 *
 * 工作方式：
 *   1. 题目卡片里存在一个 opacity:0 的节点，含当前单词的音标和完整释义（站点自己用来做答后反馈）；
 *   2. 四个选项的中文释义可以从可见文本解析出来；
 *   3. 用分词 + 最长公共子串给每个选项打分，取最高分的一项；
 *   4. 通过 CDP 的 Input.dispatchMouseEvent 在选项坐标上发真实鼠标事件完成点击。
 *
 * 两个必须知道的限制：
 *   - 站点会检测无头浏览器并把 document 清空跳 about:blank，所以浏览器必须有窗口（headed）。
 *   - 选项卡片对 element.click() 和手工合成事件无反应，只有真实指针事件有效，因此走 CDP。
 *
 * 用法见 README.md。此文件不含任何账号、路径等个人信息。
 */

import { appendFileSync, readFileSync, existsSync } from 'node:fs';

// ─────────────────────────────── 参数解析 ───────────────────────────────

const argv = process.argv.slice(2);
const has = (name) => argv.includes('--' + name);
function opt(name, fallback = null) {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}

const configPath = opt('config', './config.json');
let config = {};
if (existsSync(configPath)) {
  try {
    config = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (e) {
    console.error(`配置文件 ${configPath} 不是合法 JSON：${e.message}`);
    process.exit(1);
  }
}

const CDP = opt('cdp');
const LOG_PATH = opt('log', config.logPath || './solve.log');
const MAX_FAIL = Number(opt('max-fail', config.maxFail ?? 25));
const WANT_RESTART = has('restart') || config.restart === true;
const BOOK_PATH = opt('book-path', config.bookPath || '/main/book');
const BOOK_TITLE = opt('book-title', config.bookTitle || '');
const CHAPTERS_FILE = opt('chapters');
const CHAPTERS = CHAPTERS_FILE
  ? JSON.parse(readFileSync(CHAPTERS_FILE, 'utf8'))
  : (Array.isArray(config.chapters) ? config.chapters : []);

const ONLY_HERE = has('here') || CHAPTERS.length === 0;

if (!CDP) {
  console.error(`缺少 --cdp 参数。

先执行 agent-browser get cdp-url 拿到地址，例如：
  node src/solve.mjs --cdp "ws://127.0.0.1:9222/devtools/browser/xxxx" --here`);
  process.exit(1);
}

// ─────────────────────────────── 小工具 ───────────────────────────────

const log = (s) => { try { appendFileSync(LOG_PATH, s + '\n'); } catch {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const squeeze = (s) => (s || '').replace(/[\s\u3000]+/g, '');

// ─────────────────────── 注入到页面里执行的两段代码 ───────────────────────

/** 读出当前题：进度、隐藏释义（即答案）、四个选项及其屏幕坐标 */
const STATE_EXPR = `(()=>{
var T=function(s){return (s||'').replace(/[\\s\\u3000]+/g,'')};
var vis=function(e){var s=getComputedStyle(e);return s.display!=='none'&&s.visibility!=='hidden'&&parseFloat(s.opacity)>0.05};
var m=document.body.innerText.match(/(\\d+)\\/(\\d+)/);
var prog=m?m[0]:'';
var cands=[],all=document.querySelectorAll('p,div,span');
for(var i=0;i<all.length;i++){
  var e=all[i];
  if(e.children.length)continue;
  var s=getComputedStyle(e);
  if(!(s.opacity==='0'||s.visibility==='hidden'||s.display==='none'))continue;
  var t=e.textContent.trim();
  if(!/^[a-z]{1,6}\\.\\s*[（(\\u4e00-\\u9fa5]/.test(t))continue;
  if(t.length<3||t.length>160)continue;
  cands.push(t);
}
var ans=cands.length?cands[cands.length-1]:'';
var lines=document.body.innerText.split('\\n').map(function(s){return s.trim()}).filter(Boolean);
var opts=[];
for(var j=0;j<lines.length;j++){
  var mm=lines[j].match(/^快捷键：(\\d)$/);
  if(mm&&lines[j+1]){
    var pt=String(lines[j+1]).trim();
    if(pt&&pt!=='不知道'&&!/^\\//.test(pt))opts.push({n:parseInt(mm[1],10),txt:pt});
  }
}
opts=opts.map(function(o){
  var el=[].slice.call(document.querySelectorAll('div,span')).filter(function(e){
    return e.children.length===0&&vis(e)&&T(e.textContent)===T(o.txt);
  });
  if(!el.length){o.x=0;o.y=0;return o}
  var r=el[el.length-1].getBoundingClientRect();
  o.x=Math.round(r.left+r.width/2);
  o.y=Math.round(r.top+r.height/2);
  return o;
});
return JSON.stringify({prog:prog,ans:ans,ansList:cands.slice(-6),opts:opts})})()`;

/**
 * 关掉挡路的浮层：Element Plus 的遮罩会拦截鼠标事件，必须置为 display:none。
 * restart=true 时把「继续听写」换成「重新开始」，用来重刷整章成绩。
 */
const clearExpr = (restart) => `(()=>{var r=[];
${restart
    ? `var br=[].slice.call(document.querySelectorAll('button')).filter(function(e){return e.textContent.trim()==='重新开始'});
 if(br.length){br[0].click();r.push('restart')}`
    : `var b1=[].slice.call(document.querySelectorAll('button')).filter(function(e){return e.textContent.trim()==='继续听写'});
 if(b1.length){b1[0].click();r.push('cont')}`}
 var b4=[].slice.call(document.querySelectorAll('button')).filter(function(e){return e.textContent.trim()==='不再提醒'});
 b4.forEach(function(b){b.click()});if(b4.length)r.push('toast'+b4.length);
 var b2=[].slice.call(document.querySelectorAll('button')).filter(function(e){return e.textContent.trim()==='暂不'});
 if(b2.length){b2[0].click();r.push('later')}
 var cs=[].slice.call(document.querySelectorAll('button[aria-label]')).filter(function(e){return (e.getAttribute('aria-label')||'').indexOf('关闭')>=0});
 cs.forEach(function(c){c.click()});if(cs.length)r.push('x'+cs.length);
 var ovs=[].slice.call(document.querySelectorAll('.el-overlay'));
 ovs.forEach(function(o){o.style.display='none'});
 if(ovs.length)r.push('ov'+ovs.length);
 return r.join(',')})()`;

const CLEAR = clearExpr(false);
const CLEAR_ENTRY = clearExpr(WANT_RESTART);

/** 按文字找元素并点击（用于站内导航：班级 / 词书卡片 / 章节标题） */
const clickTextExpr = (txt) => `(()=>{
var T=function(s){return (s||'').replace(/[\\s\\u3000]+/g,'')};
var all=[].slice.call(document.querySelectorAll('h5,button,div,span,a'));
var hits=all.filter(function(e){return e.children.length===0&&T(e.textContent)===T(${JSON.stringify(txt)})});
if(!hits.length)return 'NF';
var el=hits[0],up=el;
for(var i=0;i<6&&up;i++){
  if(String(up.className).indexOf('cursor')>=0||up.tagName==='BUTTON'||up.tagName==='A'||up.tagName==='H5'){
    up.click();return 'CLICKED';
  }
  up=up.parentElement;
}
el.click();return 'CLICKED_INNER'})()`;

/** 站内跳转：用 history.pushState 避免整页刷新（整页刷新会被反爬清成 about:blank） */
const spaGoExpr = (path) => `(()=>{
history.pushState({},'','${path}');
window.dispatchEvent(new PopStateEvent('popstate'));
return 'pushed'})()`;

// ─────────────────────────────── 匹配算法 ───────────────────────────────

/**
 * 给选项打分：答案释义按「；，/、」切成若干义项，逐项与选项文本比较。
 * 整段命中给长度×3，否则按字符重合数兜底。
 */
function pickOption(answerText, options) {
  const body = squeeze(answerText).replace(/^[a-z]{1,6}\./, '');
  const senses = body.split(/[；;，,/、]/).map(squeeze).filter((x) => x.length >= 2);
  let bestIdx = -1;
  let bestScore = -1;
  for (const o of options) {
    if (o.n > 4) continue; // 第五个是「不知道」，不参与
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

// ─────────────────────────────── CDP 连接 ───────────────────────────────

const ws = new WebSocket(CDP);
let msgId = 0;
const pending = new Map();

function send(method, params = {}, sessionId) {
  const id = ++msgId;
  const payload = { id, method, params };
  if (sessionId) payload.sessionId = sessionId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify(payload));
    setTimeout(() => {
      if (pending.has(id)) { pending.delete(id); reject(new Error('timeout: ' + method)); }
    }, 25000);
  });
}

ws.addEventListener('message', (e) => {
  const d = JSON.parse(e.data);
  if (d.id && pending.has(d.id)) {
    const p = pending.get(d.id);
    pending.delete(d.id);
    if (d.error) p.reject(new Error(JSON.stringify(d.error)));
    else p.resolve(d.result);
  }
});

await new Promise((res, rej) => {
  ws.addEventListener('open', res);
  ws.addEventListener('error', () => rej(new Error('无法连接 CDP，检查 --cdp 地址是否还有效')));
});

const targets = await send('Target.getTargets');
const page = targets.targetInfos.find((t) => t.type === 'page' && /idictation/.test(t.url));
if (!page) {
  console.error('没找到 idictation 的标签页。请确认浏览器已打开并登录该站点。');
  process.exit(1);
}
const { sessionId: sid } = await send('Target.attachToTarget', { targetId: page.targetId, flatten: true });

async function evaluate(expr) {
  const r = await send('Runtime.evaluate', {
    expression: expr,
    returnByValue: true,
    awaitPromise: true,
  }, sid);
  if (r.exceptionDetails) return 'ERR:' + JSON.stringify(r.exceptionDetails).slice(0, 200);
  return r.result.value;
}

async function clickAt(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 }, sid);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 }, sid);
  await sleep(30);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 }, sid);
}

// ─────────────────────────────── 主流程 ───────────────────────────────

async function readState() {
  try {
    return JSON.parse(await evaluate(STATE_EXPR));
  } catch {
    return null;
  }
}

async function solveCurrentChapter(tag, maxQuestions = 200) {
  let ok = 0;
  let failed = 0;
  let consecutiveFail = 0;

  for (let i = 0; i < maxQuestions; i++) {
    await evaluate(CLEAR);

    const st = await readState();
    if (!st) { await sleep(400); continue; }
    if (!st.prog) { log(`${tag} 读不到进度，可能不在答题页`); break; }

    const [cur, total] = st.prog.split('/').map(Number);
    if (cur >= total) { log(`${tag} 本章已完成 ${st.prog}`); break; }

    // 隐藏释义可能有多个残留（上一题 + 当前题），用打分选最匹配的那个
    const candidates = (st.ansList && st.ansList.length) ? st.ansList : (st.ans ? [st.ans] : []);
    let best = null;
    for (const cand of candidates) {
      const r = pickOption(cand, st.opts);
      if (!best || r.score > best.score) best = { text: cand, ...r };
    }
    if (!best) {
      failed++;
      log(`${tag} 没有可用的释义 ${st.prog}`);
      if (consecutiveFail++ > 20) break;
      await sleep(500);
      continue;
    }

    const target = st.opts.find((o) => o.n === best.idx);
    if (st.opts.length < 4 || !target || !target.x) {
      failed++;
      log(`${tag} 选项解析失败 ${st.prog} 数量=${st.opts.length}`);
      if (consecutiveFail++ > MAX_FAIL) break;
      await sleep(400);
      continue;
    }

    const before = st.prog;
    await clickAt(target.x, target.y);

    // 等页面切到下一题；站点网络慢时可能要好几秒
    let advanced = false;
    for (let k = 0; k < 30; k++) {
      await sleep(300);
      const next = await readState();
      if (next && next.prog && next.prog !== before) { advanced = true; break; }
    }

    if (advanced) {
      ok++;
      consecutiveFail = 0;
      log(`${tag} ${before} → ${target.txt}`);
    } else {
      // 可能是判断题已变但进度文本没刷新
      const again = await readState();
      if (again && again.ans !== st.ans) {
        ok++;
        consecutiveFail = 0;
        continue;
      }
      failed++;
      consecutiveFail++;
      log(`${tag} 点击后未推进 ${before} 选择=${best.idx}:${target.txt}`);
      if (consecutiveFail > MAX_FAIL) {
        log(`${tag} 连续失败过多，停止本章`);
        break;
      }
      await sleep(1000);
    }
  }

  return { ok, failed };
}

async function gotoChapter(chapterTitle) {
  await evaluate(spaGoExpr(BOOK_PATH));
  await sleep(2200);
  await evaluate(clickTextExpr('班级'));
  await sleep(1800);
  if (BOOK_TITLE) {
    const r = await evaluate(clickTextExpr(BOOK_TITLE));
    log(`打开词书 ${BOOK_TITLE} → ${r}`);
    await sleep(1800);
  }
  const r = await evaluate(clickTextExpr(chapterTitle));
  await sleep(3000);
  await evaluate(CLEAR_ENTRY);
  await sleep(1200);
  return r;
}

log(`=== 开始 ${new Date().toISOString()} ===`);

if (ONLY_HERE) {
  const cleared = await evaluate(CLEAR_ENTRY);
  log(`清理浮层：${cleared}`);
  await sleep(1200);

  const st = await readState();
  if (!st || !st.prog) {
    console.error('当前页面不是答题页。请先手动进入某一章并停在一道题上。');
    process.exit(1);
  }
  const r = await solveCurrentChapter('当前章');
  log(`本章结束 ok=${r.ok} 失败=${r.failed}`);
  console.log(`ok=${r.ok} failed=${r.failed}`);
} else {
  let startedChapters = 0;
  let totalAnswered = 0;

  for (const chapter of CHAPTERS) {
    const nav = await gotoChapter(chapter);
    log(`导航 ${chapter} → ${nav}`);
    const st = await readState();
    if (!st || !st.prog) {
      log(`跳过 ${chapter}（没进到答题页，检查章节名是否和页面完全一致）`);
      console.log(`  ! 跳过：${chapter}（没进到答题页，章节名可能抄错了）`);
      continue;
    }
    startedChapters++;
    const r = await solveCurrentChapter(chapter);
    totalAnswered += r.ok;
    log(`本章结束 ${chapter} ok=${r.ok} 失败=${r.failed}`);
    console.log(`${chapter}  ok=${r.ok}  failed=${r.failed}`);
  }

  log(`=== 全部结束：成功进入 ${startedChapters}/${CHAPTERS.length} 章，答题 ${totalAnswered} 道 ===`);

  if (startedChapters === 0) {
    console.error(`
一章都没能开始。最常见的原因是章节标题和页面上的对不上
（中文括号、空格、大小写都要一模一样），或者 bookPath/bookTitle 填错了。
请核对后重新运行。`);
    process.exit(1);
  }
}

ws.close();
process.exit(0);
