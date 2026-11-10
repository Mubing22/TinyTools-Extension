#!/usr/bin/env node
/**
 * 一键启动器（阅读题）
 *
 * 流程：装依赖 → 开浏览器 → 等你打开一套阅读题 → 自动识别试卷 ID → 开始作答
 *
 * 设计原则：本文件不写死试卷 ID、账号等信息
 * 试卷从你当前打开的页面 URL 里自动读，账号由你自己在浏览器里登录
 *
 * 用法：双击 start.bat（Windows）或执行 ./start.sh（macOS/Linux）
 */

import { spawnSync, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform === 'win32') {
  spawnSync('chcp 65001', { shell: true, stdio: 'ignore' });
}

const HERE = dirname(fileURLToPath(import.meta.url));
const SOLVER = join(HERE, 'src', 'read.mjs');
const SITE = 'https://www.idictation.cn';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const line = (s = '') => console.log(s);
const step = (n, msg) => console.log(`\n[${n}] ${msg}`);
const ok = (msg) => console.log(`    √ ${msg}`);
const warn = (msg) => console.log(`    ! ${msg}`);

function run(cmdline, { inherit = false } = {}) {
  const r = spawnSync(cmdline, {
    shell: true,
    encoding: 'utf8',
    stdio: inherit ? 'inherit' : 'pipe',
    maxBuffer: 8 * 1024 * 1024,
  });
  return { code: r.status === null ? -1 : r.status, out: `${r.stdout || ''}${r.stderr || ''}`.trim() };
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
let rlClosed = false;
rl.on('close', () => { rlClosed = true; });

function ask(question) {
  if (rlClosed) return Promise.resolve('');
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v) => { if (!settled) { settled = true; resolve(v); } };
    rl.question(question, finish);
    rl.once('close', () => finish(''));
  });
}

/** 找一个能用的 Chromium 内核浏览器 */
function detectBrowser() {
  const cands = process.platform === 'win32'
    ? [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      ]
    : process.platform === 'darwin'
      ? [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
          '/Applications/Chromium.app/Contents/MacOS/Chromium',
        ]
      : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'];
  return cands.find((p) => p && existsSync(p)) || null;
}

/** 带调试端口启动，返回 CDP 地址；已开着就复用 */
async function ensureBrowser(exe) {
  const profileDir = join(HERE, '.browser-profile');

  const alive = async (port) => {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1200) });
      if (!res.ok) return null;
      const info = await res.json();
      return info.webSocketDebuggerUrl || null;
    } catch { return null; }
  };

  for (let p = 9222; p <= 9240; p++) {
    const ws = await alive(p);
    if (ws) return { port: p, ws, reused: true };
  }

  let port = 9222;
  while (await alive(port)) port++;

  try {
    spawn(exe, [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      SITE,
    ], { detached: true, stdio: 'ignore' }).unref();
  } catch { return null; }

  for (let i = 0; i < 40; i++) {
    await sleep(300);
    const ws = await alive(port);
    if (ws) return { port, ws, reused: false };
  }
  return null;
}

/** 连上浏览器，读当前页面地址和是否已登录 */
async function probePage(cdpWs) {
  const socket = new WebSocket(cdpWs);
  let seq = 0;
  const pending = new Map();
  socket.addEventListener('message', (e) => {
    const d = JSON.parse(e.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result); pending.delete(d.id); }
  });
  const call = (method, params = {}, sid) => new Promise((res) => {
    const id = ++seq;
    pending.set(id, res);
    socket.send(JSON.stringify({ id, method, params, ...(sid ? { sessionId: sid } : {}) }));
  });

  await new Promise((r, j) => { socket.addEventListener('open', r); socket.addEventListener('error', () => j(new Error('连不上'))); });

  try {
    const targets = await call('Target.getTargets');
    const tab = targets.targetInfos.find((x) => x.type === 'page' && /idictation/.test(x.url));
    if (!tab) return { url: '', hasTab: false };
    const { sessionId } = await call('Target.attachToTarget', { targetId: tab.targetId, flatten: true });
    const r = await call('Runtime.evaluate', {
      expression: `JSON.stringify({url: location.href, hasTest: !!document.querySelector('button')})`,
      returnByValue: true,
    }, sessionId);
    return JSON.parse(r.result.value);
  } finally {
    socket.close();
  }
}

/**
 * 从地址里解析试卷 ID
 * 阅读题的地址形如 /ielts/read/read-jj?lid=-1&cid=3&sid=2&id=90
 */
function parseTestId(url) {
  if (!url) return null;
  if (!/\/ielts\/read\/read-jj/.test(url)) return { error: 'notReading' };
  try {
    const u = new URL(url);
    const id = u.searchParams.get('id');
    return id ? { id } : { error: 'noId' };
  } catch {
    return { error: 'badUrl' };
  }
}

// ─────────────────────────── 主流程 ───────────────────────────

step(1, '检查 Node.js');
const major = Number(process.versions.node.split('.')[0]);
if (major < 22) {
  warn(`当前 Node 版本 ${process.versions.node}，需要 22 或更高`);
  line('    去 https://nodejs.org/ 下最新 LTS，装完重开窗口');
  process.exit(1);
}
ok(`Node ${process.versions.node}`);

step(2, '查找浏览器');
const browserPath = detectBrowser();
if (!browserPath) {
  warn('没找到 Chrome / Edge / Chromium');
  line('    Windows 一般自带 Edge，正常不会走到这里');
  process.exit(1);
}
const browserName = /msedge/i.test(browserPath) ? 'Edge' : /chromium/i.test(browserPath) ? 'Chromium' : 'Chrome';
ok(`使用本机的 ${browserName}`);

step(3, '启动浏览器');
const launched = await ensureBrowser(browserPath);
if (!launched) {
  warn('浏览器没能启动，或者调试端口没响应');
  line('    先把所有 Chrome / Edge 窗口关掉，再重新运行本脚本');
  process.exit(1);
}
ok(launched.reused ? `复用了已开着的浏览器（端口 ${launched.port}）` : `浏览器已启动（端口 ${launched.port}）`);

step(4, '请在浏览器里打开一套阅读题');
line('    ① 登录你的账号');
line('    ② 进入任意一套雅思阅读真题，停在答题页面上');
line('       不用答题，脚本会自己识别试卷编号');

await ask('\n    弄好后回到这个窗口，按回车继续… ');

step(5, '识别试卷');
let testId = null;
for (;;) {
  let page = null;
  try {
    page = await probePage(launched.ws);
  } catch {
    warn('浏览器好像被关掉了，请重新运行本脚本');
    process.exit(1);
  }

  if (!page || !page.url) {
    if (rlClosed) { warn('窗口已不接收输入，请重新双击 start.bat'); process.exit(1); }
    warn('浏览器里没打开爱听写的页面');
    await ask('    打开后按回车重试… ');
    continue;
  }

  const parsed = parseTestId(page.url);
  if (parsed && parsed.id) {
    testId = parsed.id;
    ok(`检测到试卷 ID = ${testId}`);
    break;
  }

  if (rlClosed) { warn('窗口已不接收输入，请重新双击 start.bat'); process.exit(1); }

  if (parsed && parsed.error === 'notReading') {
    warn('当前不在阅读题页面');
    line('    请点进「阅读」→ 选一套真题，地址里要带 read-jj');
  } else if (parsed && parsed.error === 'noId') {
    warn('地址里没有试卷编号（缺 id 参数）');
    line('    正常情况下地址形如 …/read-jj?lid=-1&id=90');
  } else {
    warn('读不出当前地址');
  }
  await ask('    调整好后按回车重试… ');
}

step(6, '设置正确率');
line('    目标正确率填 0~1 之间，比如 0.9 表示 40 题里故意错 4 题');
const accInput = (await ask('    直接回车用默认 0.9：')).trim();

let accuracy = 0.9;
if (accInput) {
  const n = Number(accInput);
  if (Number.isFinite(n) && n >= 0 && n <= 1) {
    accuracy = n;
  } else {
    warn(`「${accInput}」不是 0~1 的数，用默认 0.9`);
  }
}
ok(`正确率 ${(accuracy * 100).toFixed(0)}%，用时随机 45~55 分钟`);

step(7, '开始作答');
line('');

const cmd = `"${process.execPath}" "${SOLVER}" --cdp "${launched.ws}" --test ${testId} --accuracy ${accuracy}${process.argv.includes('--dry') ? ' --dry' : ''}`;
const solved = run(cmd, { inherit: true });

if (solved.code === 0) {
  line('\n────────────────────────────');
  line('跑完了');
  line('');
  line('成绩去哪看：浏览器里点「记录」，或直接看结果页顶部的分数和用时');
  line('想再刷一套：浏览器里换一套题，再双击一次 start.bat');
  line('────────────────────────────');
} else {
  line('\n没能正常跑完，把上面最后几行报错发出来');
}

if (!rlClosed) {
  await ask('\n按回车关闭此窗口… ');
  rl.close();
}
process.exit(solved.code === 0 ? 0 : 1);
