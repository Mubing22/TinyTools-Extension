#!/usr/bin/env node
/**
 * 一键启动器
 *
 * 职责：装依赖 → 开浏览器 → 等登录 → 问你要刷哪本书哪几章 → 开始答题。
 *
 * 设计原则：本文件不包含任何具体词书名、章节名、班级 ID、账号等信息。
 * 所有业务参数都由使用者在运行时输入，脚本只负责执行。
 *
 * 用法：双击 start.bat（Windows）或执行 ./start.sh（macOS/Linux）
 */

import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Windows 控制台默认不是 UTF-8，先切一下，否则中文全是乱码
if (process.platform === 'win32') {
  spawnSync('chcp 65001', { shell: true, stdio: 'ignore' });
}

const HERE = dirname(fileURLToPath(import.meta.url));
const SOLVE = join(HERE, 'src', 'solve.mjs');
const CONFIG = join(HERE, 'config.json');
const SITE = 'https://www.idictation.cn';

const line = (s = '') => console.log(s);
const step = (n, msg) => console.log(`\n[${n}] ${msg}`);
const ok = (msg) => console.log(`    √ ${msg}`);
const warn = (msg) => console.log(`    ! ${msg}`);

/**
 * 执行一条命令行。
 * 传整串而不是「命令 + 参数数组」，是为了避免 Node 的 DEP0190 警告。
 * 含空格的路径需自行加引号。
 */
function run(cmdline, { inherit = false } = {}) {
  const r = spawnSync(cmdline, {
    shell: true,
    encoding: 'utf8',
    stdio: inherit ? 'inherit' : 'pipe',
    maxBuffer: 8 * 1024 * 1024,
  });
  return {
    code: r.status === null ? -1 : r.status,
    out: `${r.stdout || ''}${r.stderr || ''}`.trim(),
  };
}

/** 全程复用一个 readline，避免多行输入时提示符错乱 */
const rl = createInterface({ input: process.stdin, output: process.stdout });
let rlClosed = false;
rl.on('close', () => { rlClosed = true; });

function ask(question) {
  if (rlClosed) return Promise.resolve('');
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    rl.question(question, finish);
    rl.once('close', () => finish(''));
  });
}

/**
 * 找一个能用的 Chromium 内核浏览器。
 * 本工具靠 CDP 驱动浏览器，所以只支持 Chromium 系（Chrome / Edge / Brave / Chromium），
 * Firefox 和 Safari 的协议不同，用不了。
 * Windows 自带 Edge，没装 Chrome 的同学也能直接跑。
 */
function detectBrowser() {
  const candidates = [];

  if (process.platform === 'win32') {
    candidates.push(
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    );
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    );
  } else {
    candidates.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/microsoft-edge',
      '/usr/bin/brave-browser',
    );
  }

  return candidates.find((p) => p && existsSync(p)) || null;
}

/**
 * 打开页面看它到底处于什么状态。
 * 目的是：如果用户还没进到答题页、或者页面在「听写」模式，就地告诉他该怎么改，
 * 而不是等他按了回车再抛一句报错然后退出。
 */
const PROBE_EXPR = `(()=>{
  var t=document.body.innerText||'';
  var m=t.match(/(\\d+)\\/(\\d+)/);
  var hasOptions=/快捷键：\\d/.test(t);
  var mode='';
  if(/听音选义/.test(t))mode='听音选义';
  else if(/看词选义/.test(t))mode='看词选义';
  else if(/听写/.test(t))mode='听写';
  return JSON.stringify({
    href:location.href,
    prog:m?m[0]:'',
    hasOptions:hasOptions,
    mode:mode
  })})()`;

async function probeQuiz(wsUrl) {
  const socket = new WebSocket(wsUrl);
  let seq = 0;
  const waiting = new Map();

  socket.addEventListener('message', (e) => {
    const d = JSON.parse(e.data);
    if (d.id && waiting.has(d.id)) {
      waiting.get(d.id)(d.result);
      waiting.delete(d.id);
    }
  });

  const call = (method, params = {}, sid) => new Promise((resolve) => {
    const mid = ++seq;
    waiting.set(mid, resolve);
    socket.send(JSON.stringify({ id: mid, method, params, ...(sid ? { sessionId: sid } : {}) }));
  });

  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve);
    socket.addEventListener('error', () => reject(new Error('连不上')));
  });

  try {
    const targets = await call('Target.getTargets');
    const tab = targets.targetInfos.find((t) => t.type === 'page' && /idictation/.test(t.url));
    if (!tab) return { href: '', prog: '', hasOptions: false, mode: '', missingTab: true };
    const { sessionId } = await call('Target.attachToTarget', { targetId: tab.targetId, flatten: true });
    const r = await call('Runtime.evaluate', { expression: PROBE_EXPR, returnByValue: true }, sessionId);
    return JSON.parse(r.result.value);
  } finally {
    socket.close();
  }
}

/** 把探测结果翻译成「现在该做什么」 */
function judgePage(st) {
  if (st.missingTab || !st.href) {
    return { ok: false, why: '浏览器里还没有打开爱听写的页面。请在浏览器地址栏输入 www.idictation.cn' };
  }
  if (!st.prog) {
    return { ok: false, why: '还没进到章节里。请点「班级」→ 你的词书卡片 → 任意一个章节' };
  }
  if (!st.hasOptions) {
    if (st.mode === '听写' || st.mode === '听音选义') {
      return {
        ok: false,
        why: `当前是「${st.mode}」模式，本工具只处理「看词选义」。`
          + '\n       请点页面右上角的模式按钮，切换到「看词选义」，再回来按回车',
      };
    }
    return { ok: false, why: '这道题暂时没看到选项，可能是页面还没加载完。稍等一下再按回车' };
  }
  return { ok: true, prog: st.prog };
}

// ─────────────────────────── 1. Node 版本 ───────────────────────────

step(1, '检查 Node.js');
const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor < 22) {
  warn(`当前 Node 版本 ${process.versions.node}，本工具需要 22 或更高。`);
  line('    请到 https://nodejs.org/ 下载最新 LTS 版本安装后重开这个窗口。');
  process.exit(1);
}
ok(`Node ${process.versions.node}`);

// ─────────────────────── 2. agent-browser ───────────────────────

step(2, '检查 agent-browser');
let probe = run('agent-browser --help');
if (probe.code !== 0) {
  warn('没检测到 agent-browser，开始自动安装（需要联网，大约几十秒）…');

  if (run('npm --version').code !== 0) {
    warn('找不到 npm，说明 Node 没装好。请重新安装 Node.js 后再试。');
    process.exit(1);
  }

  if (run('npm install -g agent-browser', { inherit: true }).code !== 0) {
    warn('自动安装失败。请手动执行下面这行，然后重新启动本脚本：');
    line('      npm install -g agent-browser');
    if (process.platform !== 'win32') line('    提示权限不足就在前面加 sudo。');
    process.exit(1);
  }

  if (run('agent-browser --help').code !== 0) {
    warn('安装完成但无法运行，请关掉这个窗口重新打开后再试。');
    process.exit(1);
  }
}
ok('agent-browser 已就绪');

// ─────────────────────── 3. 启动浏览器 ───────────────────────

step(3, '启动浏览器');
line('    会弹出一个浏览器窗口。必须是带窗口的模式，无头模式会被网站识别并卡白屏。');

const browserPath = detectBrowser();
if (browserPath) {
  const name = /msedge/i.test(browserPath) ? 'Edge'
    : /brave/i.test(browserPath) ? 'Brave'
    : /chromium/i.test(browserPath) ? 'Chromium'
    : 'Chrome';
  ok(`使用本机的 ${name}`);
} else {
  warn('这台电脑没找到 Chrome / Edge / Brave，尝试用 agent-browser 自带的浏览器。');
  line('    如果启动失败，执行 agent-browser install 下载内核后重试。');
}

const launchCmd = browserPath
  ? `agent-browser --headed --executable-path "${browserPath}" open ${SITE}`
  : `agent-browser --headed open ${SITE}`;

if (run(launchCmd).code !== 0) {
  warn('浏览器启动失败。可以试试：');
  line('      agent-browser install');
  line('    装完再重新运行本脚本。');
  process.exit(1);
}
ok('浏览器已打开站点');

// ─────────────────────── 4. 等用户操作 ───────────────────────

step(4, '请在浏览器里登录并选好章节');
line('    ① 输入你自己的手机号和密码登录；');
line('    ② 依次点「班级」→ 你要刷的词书卡片 → 任意一个章节，');
line('       停在「选择单词对应的释义」那道题上，先别答题。');

await ask('\n    弄好后回到这个窗口，按回车继续… ');

// ─────────────────────── 5. 取调试地址 ───────────────────────

step(5, '连接浏览器');
const wsLine = (run('agent-browser get cdp-url').out || '')
  .split('\n').map((s) => s.trim()).find((s) => s.startsWith('ws://'));

if (!wsLine) {
  warn('拿不到调试地址。多半是浏览器被关了，重新跑一次本脚本即可。');
  process.exit(1);
}
ok('已连接');

// 在真正开始前，确认页面确实停在能答题的位置；不对就告诉用户怎么改，而不是直接报错退出
for (;;) {
  if (rlClosed) {
    warn('这个窗口已经不接收输入了（可能是被管道/脚本调用）。请直接重新双击 start.bat。');
    process.exit(1);
  }
  let st = null;
  try {
    st = await probeQuiz(wsLine);
  } catch {
    warn('浏览器好像被关掉了。请重新运行本脚本。');
    process.exit(1);
  }
  const verdict = judgePage(st);
  if (verdict.ok) {
    ok(`页面就绪，进度 ${verdict.prog}`);
    break;
  }
  console.log('');
  warn(verdict.why);
  await ask('    处理好之后，回到这里按回车重试… ');
  console.log('');
}

// ─────────────────────── 6. 确认要刷的范围 ───────────────────────

step(6, '选择要刷的范围');
line('    1 = 只刷当前打开的这一章（最省事）');
line('    2 = 按章节列表批量刷（需要你输入词书名和章节名）');

let mode = (await ask('\n    请输入 1 或 2，直接回车默认 1：')).trim();
if (mode !== '2') mode = '1';

let solveArgs;

if (mode === '1') {
  ok('只刷当前章，不需要额外输入');
  solveArgs = ['--here'];
} else {
  line('');
  line('    词书标题：照抄页面上的书名（括号、空格都要一致）。');

  let bookTitle = '';
  while (!bookTitle) {
    bookTitle = (await ask('    词书标题：')).trim();
    if (!bookTitle) warn('不能为空，请重新输入。');
  }

  line('');
  line('    章节标题：一行一个，抄页面弹窗里的章节名（同样要一字不差）。');
  line('    输完直接按回车（空行）结束。');

  const chapters = [];
  for (;;) {
    const t = (await ask(`    第 ${chapters.length + 1} 章：`)).trim();
    if (!t) break;
    chapters.push(t);
  }

  if (!chapters.length) {
    warn('一章都没输入，改为只刷当前章。');
    solveArgs = ['--here'];
  } else {
    const cfg = {
      bookPath: '/main/book',
      bookTitle,
      chapters,
      logPath: './solve.log',
      maxFail: 25,
      restart: false,
    };
    writeFileSync(CONFIG, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
    ok(`已保存 config.json，共 ${chapters.length} 章：${chapters.join('、')}`);
    line('    以后想再跑同样的列表，直接重跑本脚本并选 2 就会复用它。');
    solveArgs = ['--config', CONFIG];
  }
}

// ─────────────────────── 7. 开始答题 ───────────────────────

step(7, '开始答题');
line('    想中途停止，按 Ctrl + C。\n');

// 路径可能含空格，统一加引号后再拼命令行
const node = process.execPath;
const cmd = mode === '1' || solveArgs[0] === '--here'
  ? `"${node}" "${SOLVE}" --here --cdp "${wsLine}"`
  : `"${node}" "${SOLVE}" --config "${CONFIG}" --cdp "${wsLine}"`;

const solved = run(cmd, { inherit: true });

if (solved.code === 0) {
  line('\n────────────────────────────');
  line('跑完了。');
  line('');
  line('去哪儿看成绩：回到浏览器，点左上角那个章节名旁边的返回，');
  line('词书弹窗里每一章都标着正确率。');
  line('');
  line('想刷下一章：在浏览器里进入新章节，再双击一次 start.bat。');
  line('────────────────────────────');
} else {
  line('\n没能正常跑完。浏览器窗口先别关，可以再跑一次本脚本接着做。');
  line('如果反复失败，把上面最后几行报错发出来，通常能看出原因。');
}

// 不管成功失败都停一下，免得窗口一闪而过、什么都没看见
if (!rlClosed) {
  await ask('\n按回车关闭此窗口… ');
  rl.close();
}
process.exit(solved.code === 0 ? 0 : 1);
