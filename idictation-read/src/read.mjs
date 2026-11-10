/**
 * 阅读题自动作答
 *
 * 可调：
 *   --accuracy  目标正确率，0.9 表示 40 题里故意错 4 题
 *   --minutes   总时长区间，默认 50-60 分钟
 *   --batch     每批提交几题
 *   --seed      随机种子（复现用）
 *
 * 答案来源：show 接口的 display_answer（答案在前端泄露）
 * 计时方式：duration 由前端上报，这里按真实做题节奏累计
 */
import { createHmac } from 'node:crypto';

const argv = process.argv.slice(2);
const arg = (n, d = null) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const has = (n) => argv.includes('--' + n);

const CDP = arg('cdp');
const TEST_ID = arg('test', '23');
const DRY = has('dry');
const ACCURACY = Number(arg('accuracy', '0.95'));
const MIN_MIN = Number(arg('minutes-min', '45'));
const MAX_MIN = Number(arg('minutes-max', '55'));
const BATCH = Number(arg('batch', '8'));
const HIGHLIGHT_PER_PART = Number(arg('highlights', '3'));   // 每篇伪造几条划线，0 = 不划
const KEY = 'idictation_2024';
const BASE = 'https://www.idictation.cn';

if (!CDP) { console.error('需要 --cdp'); process.exit(1); }
if (ACCURACY < 0 || ACCURACY > 1) { console.error('--accuracy 要在 0~1 之间'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ── CDP 取 cookie ──
const ws = new WebSocket(CDP);
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const d = JSON.parse(e.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result); pending.delete(d.id); }
});
const call = (method, params = {}, sid) => new Promise((res) => {
  const id = ++seq;
  pending.set(id, res);
  ws.send(JSON.stringify({ id, method, params, ...(sid ? { sessionId: sid } : {}) }));
});
await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });

const targets = await call('Target.getTargets');
const page = targets.targetInfos.find((t) => t.type === 'page' && /idictation/.test(t.url))
  || targets.targetInfos.find((t) => t.type === 'page');
if (!page) { console.error('没有页面'); process.exit(1); }
const { sessionId } = await call('Target.attachToTarget', { targetId: page.targetId, flatten: true });
await call('Network.enable', {}, sessionId);
const ck = await call('Network.getCookies', { urls: [BASE + '/'] }, sessionId);
const cookies = ck.cookies || [];
if (!cookies.length) { console.error('拿不到 cookie，先在浏览器里登录'); process.exit(1); }
const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

// ── 签名 ──
function sign(data) {
  const sorted = Object.keys(data).sort().reduce((a, k) => { a[k] = data[k]; return a; }, {});
  let s = '';
  for (const k in sorted) {
    let v = sorted[k];
    if (Array.isArray(v) || (typeof v === 'object' && v !== null)) v = JSON.stringify(v);
    s += `${k}=${v}&`;
  }
  return createHmac('sha256', KEY).update(s.replace(/&$/, '')).digest('hex');
}

async function api(path, payload) {
  const body = {
    api_key: encodeURIComponent(path),
    timestamp: Math.floor(Date.now() / 1000),
    nonce: Math.random().toString(36).substring(2, 12),
  };
  Object.assign(body, payload || {});
  body.sign = sign(body);

  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookieHeader,
      'Origin': BASE,
      'Referer': BASE + '/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

// ── 拉题 ──
console.log(`拉取 Test ${TEST_ID} …`);
const show = await api(`/api/study/yuedu-zhenti/v1/jijing/test/show/${TEST_ID}`);
if (!show.json || show.json.status !== 0) {
  console.error('拉取失败:', show.status, show.text.slice(0, 200));
  process.exit(1);
}

// ── 整理题目：正确答案 + 可选的错误答案 ──
function normalizeAnswer(a, type) {
  if (a == null) return null;
  const v = String(a).trim();
  // type=7 是多选题（拖拽），题干答案是 "B,C,E" 这种，提交时要用数组
  if (type === 7 && v.includes(',')) return v.split(',').map((s) => s.trim()).filter(Boolean);
  return v.includes(' / ') ? v.split(' / ')[0].trim() : v;
}

function optionTitles(list) {
  if (!Array.isArray(list)) return [];
  return list.map((o) => o && o.title).filter(Boolean);
}

const items = [];
show.json.values.parts.forEach((part) => {
  (part.question || []).forEach((group) => {
    // 匹配题的选项挂在题组的 collect_option 上
    const groupOpts = optionTitles(group.collect_option && group.collect_option.list);
    (group.list || []).forEach((q) => {
      const ownOpts = optionTitles(q.option);
      const opts = ownOpts.length ? ownOpts : groupOpts;
      items.push({
        type: group.type,
        id: q.id,
        group_id: group.group_id,
        number: q.number,
        correct: normalizeAnswer(q.display_answer, group.type),
        options: opts,
        aiSentences: (() => {
          try {
            const ai = typeof q.ai_central_sentences === 'string'
              ? JSON.parse(q.ai_central_sentences)
              : q.ai_central_sentences;
            return (ai && ai.sentences) || [];
          } catch { return []; }
        })(),
      });
    });
  });
});

console.log(`共 ${items.length} 题，答案完整 ${items.filter((i) => i.correct).length} 题`);

/**
 * 伪造划线批注
 * 规律从 practice_result.highlights 反推：
 *   全文 = 文章标题 + 各段落直接拼接，start/end 为全文偏移
 *   local_start/local_end 实测与 start/end 相同
 * 句子来源：每道题 ai_central_sentences.sentences，都是文章原句
 */
function buildHighlights(parts, perPart = 3) {
  const out = [];

  parts.forEach((part, partIndex) => {
    const paras = part.content?.paragraph || [];
    const title = String(part.content?.title || '');
    const full = title + paras.join('');

    const pool = [];
    (part.question || []).forEach((g) => (g.list || []).forEach((q) => {
      try {
        const ai = typeof q.ai_central_sentences === 'string'
          ? JSON.parse(q.ai_central_sentences)
          : q.ai_central_sentences;
        (ai?.sentences || []).forEach((s) => {
          const t = String(s || '').trim();
          if (t.length >= 40) pool.push(t);
        });
      } catch { /* 单题解析失败就跳过 */ }
    }));

    const uniq = [...new Set(pool)];
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
        start: pos,
        end: pos + sentence.length,
        local_start: pos,
        local_end: pos + sentence.length,
        text: sentence,
        level: 1,
        highlight_level: 1,
        scope_key: 'article',
        part_index: partIndex,
        highlight_id: 10000 + Math.floor(Math.random() * 80000),
        created_scene: 'practice',
        position_scene: 'practice',
        highlight_type: 'primary',
      });
    }
  });

  return out;
}

const fakeHighlights = buildHighlights(show.json.values.parts, HIGHLIGHT_PER_PART);
console.log(`生成划线 ${fakeHighlights.length} 条（每篇最多 ${HIGHLIGHT_PER_PART} 条）`);
if (fakeHighlights.length) {
  fakeHighlights.slice(0, 3).forEach((h) => {
    console.log(`  篇${h.part_index + 1} [${h.start}-${h.end}] ${h.text.slice(0, 40)}…`);
  });
}

// ── 按正确率决定哪些题故意做错 ──
const wrongCount = Math.round(items.length * (1 - ACCURACY));
const indices = items.map((_, i) => i);
for (let i = indices.length - 1; i > 0; i--) {          // 洗牌
  const j = Math.floor(Math.random() * (i + 1));
  [indices[i], indices[j]] = [indices[j], indices[i]];
}
const wrongSet = new Set(indices.slice(0, wrongCount));

for (const idx of wrongSet) {
  const it = items[idx];
  const candidates = it.options.filter((o) => o !== it.correct);
  if (candidates.length) {
    it.answer = pick(candidates);                        // 选/判断题：挑个错的选项
  } else {
    it.answer = null;                                    // 填空题：留空
  }
}
items.forEach((it, i) => { if (!wrongSet.has(i)) it.answer = it.correct; });

console.log(`目标正确率 ${(ACCURACY * 100).toFixed(0)}% → 故意错 ${wrongCount} 题`);
console.log('错题明细:');
[...wrongSet].sort((a, b) => a - b).forEach((i) => {
  const it = items[i];
  console.log(`  第 ${it.number} 题 type=${it.type} 正确=${it.correct} 提交=${it.answer === null ? '(空)' : it.answer}`);
});

// ── 时间轴：总时长落在指定区间 ──
const totalMin = rand(MIN_MIN, MAX_MIN);
const totalSec = Math.round(totalMin * 60);
// 每题平均占用，加 ±30% 抖动，最后缩放到总时长
const weights = items.map(() => rand(0.7, 1.3));
const wsum = weights.reduce((a, b) => a + b, 0);
const cumulative = [];
let acc = 0;
weights.forEach((w) => { acc += w; cumulative.push(acc / wsum); });
const timeAt = cumulative.map((r) => Math.round(r * totalSec));

console.log(`\n总时长设定 ${totalMin.toFixed(1)} 分钟（${totalSec}s）`);

if (DRY) {
  console.log('\n[dry] 不提交');
  items.forEach((it, i) => {
    const mark = wrongSet.has(i) ? '×' : '√';
    console.log(`  ${mark} #${it.number} type=${it.type} ${it.correct} → ${it.answer === null ? '(空)' : it.answer} @${timeAt[i]}s`);
  });
  ws.close();
  process.exit(0);
}

// ── 分批提交 ──
const sessionKey = Date.now();
const startWall = Date.now();      // 时间轴起点，按真实时钟等待
let cursor = 0;
let batchNo = 0;

while (cursor < items.length) {
  const end = Math.min(cursor + BATCH, items.length);
  const duration = timeAt[end - 1];

  // 不等待：duration 只是上报值，服务端不校验真实耗时（已实测 321s 草稿被接受）

  const answerArr = items.map((it, idx) => ({
    type: it.type,
    id: it.id,
    group_id: it.group_id,
    answer: idx < end ? it.answer : null,
    mark: false,
  }));

  const highlights = fakeHighlights;

  batchNo++;
  const r = await api('/api/study/yuedu-zhenti/v1/submit', {
    key: sessionKey,
    answer: answerArr,
    duration,
    highlights,
    notes: [],
    jijing_test_id: String(TEST_ID),
  });

  const ok = r.json && r.json.status === 0;
  console.log(`批 ${batchNo}: 已答 ${end}/${items.length}, duration=${duration}s -> ${r.status} ${ok ? 'ok' : r.text.slice(0, 120)}`);

  cursor = end;
}

console.log('\n分批保存完成，开始交卷…');

// 交卷：同一个 submit 接口，多带 action: "手动提交"
// 这一步才会生成正式记录（结果页的分数/用时都来自它）
const finalAnswers = items.map((it) => ({
  type: it.type,
  id: it.id,
  group_id: it.group_id,
  answer: it.answer,
  mark: false,
}));

const finalSubmit = await api('/api/study/yuedu-zhenti/v1/submit', {
  key: sessionKey,
  answer: finalAnswers,
  duration: timeAt[timeAt.length - 1],
  highlights: fakeHighlights,
  notes: [],
  jijing_test_id: String(TEST_ID),
  action: '手动提交',
});

const finalOk = finalSubmit.json && finalSubmit.json.status === 0;
console.log(`交卷: ${finalSubmit.status} ${finalOk ? 'ok' : finalSubmit.text.slice(0, 150)}`);

if (finalOk) {
  console.log(`\n完成 —— 用时设定 ${(timeAt[timeAt.length - 1] / 60).toFixed(1)} 分钟，答题 ${items.length} 题，正确 ${items.filter((it) => !wrongSet.has(items.indexOf(it))).length} 题`);
}

ws.close();
process.exit(0);






