// 后台：负责用 chrome.debugger 在页面坐标上发出真实鼠标事件。
// 站点的选项卡片只认真实指针事件（合成事件会被忽略），所以必须走 CDP。
'use strict';

let attachedTab = null;

async function ensureAttach(tabId) {
  if (attachedTab === tabId) return;
  if (attachedTab !== null) {
    try { await chrome.debugger.detach({ tabId: attachedTab }); } catch (e) {}
    attachedTab = null;
  }
  await chrome.debugger.attach({ tabId }, '1.3');
  attachedTab = tabId;
}

async function dispatchClick(tabId, x, y) {
  const target = { tabId };
  const base = { x, y };
  await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent',
    { ...base, type: 'mouseMoved', button: 'none', buttons: 0 });
  await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent',
    { ...base, type: 'mousePressed', button: 'left', buttons: 1, clickCount: 1 });
  await new Promise((r) => setTimeout(r, 30));
  await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent',
    { ...base, type: 'mouseReleased', button: 'left', buttons: 0, clickCount: 1 });
}

chrome.debugger.onDetach.addListener((source) => {
  if (attachedTab !== null && source.tabId === attachedTab) attachedTab = null;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (attachedTab === tabId) attachedTab = null;
});

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || !sender.tab) return;

  if (msg.type === 'click') {
    const tabId = sender.tab.id;
    (async () => {
      try {
        await ensureAttach(tabId);
        await dispatchClick(tabId, Math.round(msg.x), Math.round(msg.y));
        reply({ ok: true });
      } catch (e) {
        reply({ ok: false, error: String(e && e.message ? e.message : e) });
      }
    })();
    return true;
  }

  if (msg.type === 'release') {
    (async () => {
      if (attachedTab !== null) {
        try { await chrome.debugger.detach({ tabId: attachedTab }); } catch (e) {}
        attachedTab = null;
      }
      reply({ ok: true });
    })();
    return true;
  }
});
