// VIP 补丁：在页面主世界运行，document_start 注入，早于站点 axios 初始化。
// 只改写两个响应的会员状态字段，其余数据原样透传；不做任何额外请求。
// 开关存在 localStorage['__idictation_pro']，可实时切换，无需刷新。
(function () {
  'use strict';

  if (window.__idictationProVip) return;
  window.__idictationProVip = '2.0';

  var KEY = '__idictation_pro';
  var STATUS = '进行中';
  var END = '2099-12-31 23:59:59';
  var START = '2024-01-01 00:00:00';

  function enabled() {
    try {
      return localStorage.getItem(KEY) !== 'off';
    } catch (e) {
      return true;
    }
  }

  function isTarget(u) {
    if (typeof u !== 'string') return false;
    return u.indexOf('/api/study/customer/v1/login/msg') !== -1 ||
           u.indexOf('/api/study/customer/v1/member/detail') !== -1;
  }

  function fillDates(o) {
    if (!o.start_date) o.start_date = START;
    if (!o.first_start_date) o.first_start_date = START;
    o.end_date = END;
  }

  function patchPayload(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    var vals = obj.values;
    if (!vals || typeof vals !== 'object') return obj;

    // member/detail：会员信息直接在 values 上
    if ('status' in vals) {
      vals.status = STATUS;
      fillDates(vals);
    }
    // login/msg：会员信息在 values.member 上，zf() 会优先取它
    var m = vals.member;
    if (m && typeof m === 'object' && 'status' in m) {
      m.status = STATUS;
      fillDates(m);
    }
    return obj;
  }

  function patchText(text) {
    if (!text) return text;
    try {
      return JSON.stringify(patchPayload(JSON.parse(text)));
    } catch (e) {
      return text;
    }
  }

  // ---- XHR ----
  var proto = XMLHttpRequest.prototype;
  var textDesc = Object.getOwnPropertyDescriptor(proto, 'responseText');
  var respDesc = Object.getOwnPropertyDescriptor(proto, 'response');
  var origOpen = proto.open;

  proto.open = function (method, url) {
    try { this.__idictUrl = url; } catch (e) {}
    try {
      if (isTarget(url)) {
        if (textDesc && textDesc.get) {
          Object.defineProperty(this, 'responseText', {
            configurable: true,
            get: function () {
              var raw;
              try { raw = textDesc.get.call(this); } catch (e) { return raw; }
              return enabled() ? patchText(raw) : raw;
            }
          });
        }
        if (respDesc && respDesc.get) {
          Object.defineProperty(this, 'response', {
            configurable: true,
            get: function () {
              var r;
              try { r = respDesc.get.call(this); } catch (e) { return r; }
              if (!enabled()) return r;
              return r && typeof r === 'object' ? patchPayload(r) : r;
            }
          });
        }
      }
    } catch (e) {}
    return origOpen.apply(this, arguments);
  };

  // ---- 桥接：把词条列表（c_id + 全部 id）送到隔离世界的悬浮窗 ----
  // 页面世界的变量隔离世界读不到，只能通过 window.postMessage 传递。
  var origSend = proto.send;
  proto.send = function () {
    var self = this;
    try {
      var u = self.__idictUrl || '';
      if (typeof u === 'string' && u.indexOf('/api/study/lexicon/v1/list') !== -1) {
        self.addEventListener('load', function () {
          try {
            var j = JSON.parse(self.responseText);
            var d = (j && j.values && j.values.data) || [];
            if (d.length) {
              window.postMessage({
                __idict: 'wordlist',
                c_id: d[0].c_id,
                g_id: d[0].g_id,
                ids: d.map(function (x) { return x.id; }),
                words: d.map(function (x) { return x.word; })
              }, '*');
            }
          } catch (e) {}
        });
      }
    } catch (e) {}
    return origSend.apply(this, arguments);
  };

  // ---- 调试：在页面 Console 里 __idictationTrace() 记录答题接口的请求体 ----
  // 必须定义在主世界，隔离世界的 window 与页面 Console 不是同一个对象。
  window.__idictationTrace = function () {
    if (window.__idictationTraceHooked) return 'already hooked';
    window.__idictationTraceHooked = true;
    var X = XMLHttpRequest.prototype.open;
    var S = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u) {
      try { this.__traceUrl = u; } catch (e) {}
      return X.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function (body) {
      try {
        var u = this.__traceUrl || '';
        var self = this;
        if (/lexicon\/v1\/list|chapter\/list/.test(u)) {
          // 词条列表：需要同时看请求参数与返回，才能确定 lexicon_id 的来源
          self.addEventListener('load', function () {
            try {
              console.log('[IDICT-RES]', u,
                'REQ=' + String(body).slice(0, 300),
                'RES=' + String(self.responseText).slice(0, 700));
            } catch (e) {}
          });
        } else if (/lexicon|practice|submit|result/i.test(u)) {
          console.log('[IDICT-REQ]', u, typeof body === 'string' ? body.slice(0, 1500) : body);
        }
      } catch (e) {}
      return S.apply(this, arguments);
    };
    return 'hooked';
  };

  // ---- fetch ----
  var origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = function () {
      var args = arguments;
      var u = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url);
      var p = origFetch.apply(this, args);
      if (!isTarget(u) || !enabled()) return p;
      return p.then(function (res) {
        return res.clone().text().then(function (t) {
          return new Response(patchText(t), {
            status: res.status,
            statusText: res.statusText,
            headers: res.headers
          });
        });
      });
    };
  }
})();
