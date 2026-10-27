// Standalone-window adapter.
// Binds the shared inspector core to a user-chosen tab via the chrome.debugger API,
// so requests can be captured from — and replayed into — that specific tab.
(function() {
  'use strict';

  const DEBUGGER_VERSION = '1.3';

  let attachedTabId = null;
  let onRequestCb = null;
  const inflight = new Map(); // debugger requestId -> partial request record
  const extraReqHeaders = new Map();  // requestId -> full request headers (arrives separately)
  const extraRespHeaders = new Map(); // requestId -> full response headers (arrives separately)
  let redirectSeq = 0; // makes redirect-hop ids unique (requestId is reused across redirects)

  // Target-bar elements
  const tabPicker = document.getElementById('tabPicker');
  const refreshTabsBtn = document.getElementById('refreshTabsBtn');
  const reloadTabBtn = document.getElementById('reloadTabBtn');
  const detachBtn = document.getElementById('detachBtn');
  const targetStatus = document.getElementById('targetStatus');

  const transport = {
    get tabId() { return attachedTabId; },

    start(onRequest) {
      onRequestCb = onRequest;
      setupTargetBar();
      refreshTabs();
    },

    evalCode(code) {
      return new Promise((resolve, reject) => {
        if (!attachedTabId) {
          reject(new Error('No tab selected. Pick a tab to listen to first.'));
          return;
        }
        chrome.debugger.sendCommand(
          { tabId: attachedTabId },
          'Runtime.evaluate',
          { expression: code, awaitPromise: true, returnByValue: true },
          (res) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            if (!res) {
              reject(new Error('No result from target tab'));
              return;
            }
            if (res.exceptionDetails) {
              reject(new Error(res.exceptionDetails.text || 'Evaluation error'));
              return;
            }
            resolve(res.result ? res.result.value : null);
          }
        );
      });
    },

    clear() {
      inflight.clear();
      extraReqHeaders.clear();
      extraRespHeaders.clear();
    }
  };

  window.initInspector(transport);

  // ---------------------------------------------------------------------------
  // Target bar / tab selection
  // ---------------------------------------------------------------------------
  function setupTargetBar() {
    refreshTabsBtn.addEventListener('click', refreshTabs);

    tabPicker.addEventListener('change', () => {
      const id = parseInt(tabPicker.value, 10);
      if (Number.isNaN(id)) {
        detach();
        return;
      }
      attachToTab(id);
    });

    reloadTabBtn.addEventListener('click', () => {
      if (attachedTabId !== null) {
        chrome.tabs.reload(attachedTabId);
        setStatus('● Listening (reloading…)', 'live');
      }
    });

    detachBtn.addEventListener('click', () => {
      detach();
      tabPicker.value = '';
    });

    chrome.debugger.onDetach.addListener((source) => {
      if (source.tabId === attachedTabId) {
        attachedTabId = null;
        setStatus('Detached', 'idle');
        detachBtn.style.display = 'none';
        reloadTabBtn.style.display = 'none';
      }
    });

    chrome.debugger.onEvent.addListener(onDebuggerEvent);

    // Drop the banner when the window closes
    window.addEventListener('beforeunload', () => {
      if (attachedTabId !== null) {
        try { chrome.debugger.detach({ tabId: attachedTabId }); } catch (e) {}
      }
    });
  }

  function refreshTabs() {
    chrome.tabs.query({}, (tabs) => {
      const current = tabPicker.value;
      tabPicker.innerHTML = '<option value="">Select a tab…</option>';
      tabs
        .filter(t => t.url && /^https?:/i.test(t.url))
        .forEach(t => {
          const option = document.createElement('option');
          option.value = String(t.id);
          let host = '';
          try { host = new URL(t.url).host; } catch (e) { host = t.url; }
          const title = (t.title || host).slice(0, 50);
          option.textContent = `${title} — ${host}`;
          tabPicker.appendChild(option);
        });
      if (current) tabPicker.value = current;
    });
  }

  function attachToTab(tabId) {
    // Detach from any previous target first
    if (attachedTabId !== null && attachedTabId !== tabId) {
      try { chrome.debugger.detach({ tabId: attachedTabId }); } catch (e) {}
      attachedTabId = null;
    }

    setStatus('Attaching…', 'pending');
    chrome.debugger.attach({ tabId }, DEBUGGER_VERSION, () => {
      if (chrome.runtime.lastError) {
        const msg = chrome.runtime.lastError.message || 'Attach failed';
        setStatus('⚠ ' + msg, 'error');
        tabPicker.value = '';
        return;
      }
      attachedTabId = tabId;
      inflight.clear();
      extraReqHeaders.clear();
      extraRespHeaders.clear();
      chrome.debugger.sendCommand({ tabId }, 'Network.enable', {}, () => {
        if (chrome.runtime.lastError) {
          setStatus('⚠ ' + chrome.runtime.lastError.message, 'error');
          return;
        }
        setStatus('● Listening', 'live');
        detachBtn.style.display = '';
        reloadTabBtn.style.display = '';
        console.log('[API Inspector] Attached + Network.enable on tab', tabId);
      });
    });
  }

  function detach() {
    if (attachedTabId === null) return;
    const id = attachedTabId;
    attachedTabId = null;
    try { chrome.debugger.detach({ tabId: id }); } catch (e) {}
    setStatus('Detached', 'idle');
    detachBtn.style.display = 'none';
    reloadTabBtn.style.display = 'none';
  }

  function setStatus(text, state) {
    targetStatus.textContent = text;
    targetStatus.className = 'target-status target-status--' + (state || 'idle');
  }

  // ---------------------------------------------------------------------------
  // Network capture via the debugger protocol
  // ---------------------------------------------------------------------------
  function onDebuggerEvent(source, method, params) {
    if (!attachedTabId || source.tabId !== attachedTabId) return;

    switch (method) {
      case 'Network.requestWillBeSent': {
        const req = params.request || {};

        // A redirect: the PREVIOUS hop's response is delivered here (same requestId,
        // no separate responseReceived/loadingFinished). Finalize + emit it as its
        // own entry before we overwrite the record with the redirected request.
        if (params.redirectResponse) {
          const prev = inflight.get(params.requestId);
          if (prev) {
            const resp = params.redirectResponse;
            prev.status = resp.status;
            prev.statusText = resp.statusText || '';
            prev.responseHeaders = mergeHeaders(prev.responseHeaders, resp.headers);
            const location = (resp.headers && (resp.headers.location || resp.headers.Location)) || req.url;
            prev.responseBody = `[Redirect ${resp.status} → ${location}]`;
            if (params.timestamp && prev.startMono) {
              prev.duration = (params.timestamp - prev.startMono) * 1000;
            }
            emit(Object.assign({}, prev, { id: prev.id + '#redirect' + (redirectSeq++) }));
            inflight.delete(params.requestId);
          }
        }

        let requestBody = null;
        if (req.postData) {
          try { requestBody = JSON.parse(req.postData); }
          catch { requestBody = req.postData; }
        }
        const rec = {
          id: params.requestId,
          type: 'debugger',
          resourceType: params.type || '',
          url: req.url,
          method: req.method,
          headers: req.headers || {},
          requestBody: requestBody,
          timestamp: params.wallTime ? params.wallTime * 1000 : Date.now(),
          startMono: params.timestamp,
          status: null,
          statusText: '',
          responseHeaders: {},
          responseBody: null,
          duration: null,
          error: null
        };
        // Full headers (cookies, content-length, sec-*, …) may have already arrived
        if (extraReqHeaders.has(params.requestId)) {
          rec.headers = mergeHeaders(rec.headers, extraReqHeaders.get(params.requestId));
          extraReqHeaders.delete(params.requestId);
        }
        inflight.set(params.requestId, rec);
        break;
      }

      // Complete request headers as actually sent on the wire
      case 'Network.requestWillBeSentExtraInfo': {
        const rec = inflight.get(params.requestId);
        if (rec) {
          rec.headers = mergeHeaders(rec.headers, params.headers);
          emit(rec);
        } else {
          extraReqHeaders.set(params.requestId, params.headers || {});
        }
        break;
      }

      case 'Network.responseReceived': {
        const rec = inflight.get(params.requestId);
        if (!rec) return;
        const resp = params.response || {};
        rec.status = resp.status;
        rec.statusText = resp.statusText || '';
        rec.responseHeaders = mergeHeaders(resp.headers || {}, extraRespHeaders.get(params.requestId));
        extraRespHeaders.delete(params.requestId);
        if (params.type) rec.resourceType = params.type;
        rec.mimeType = resp.mimeType || '';
        emit(rec);
        break;
      }

      // Complete response headers (incl. set-cookie) as actually received
      case 'Network.responseReceivedExtraInfo': {
        const rec = inflight.get(params.requestId);
        if (rec) {
          rec.responseHeaders = mergeHeaders(rec.responseHeaders, params.headers);
          emit(rec);
        } else {
          extraRespHeaders.set(params.requestId, params.headers || {});
        }
        break;
      }

      case 'Network.loadingFinished': {
        const rec = inflight.get(params.requestId);
        if (!rec) return;
        if (params.timestamp && rec.startMono) {
          rec.duration = (params.timestamp - rec.startMono) * 1000;
        }
        fetchResponseBody(params.requestId, rec);
        break;
      }

      case 'Network.loadingFailed': {
        const rec = inflight.get(params.requestId);
        if (!rec) return;
        rec.error = params.errorText || 'Request failed';
        rec.status = rec.status || 0;
        emit(rec);
        inflight.delete(params.requestId);
        break;
      }
    }
  }

  function fetchResponseBody(requestId, rec) {
    chrome.debugger.sendCommand(
      { tabId: attachedTabId },
      'Network.getResponseBody',
      { requestId },
      (res) => {
        if (!chrome.runtime.lastError && res && !res.base64Encoded && res.body) {
          try { rec.responseBody = JSON.parse(res.body); }
          catch { rec.responseBody = res.body; }
        } else if (res && res.base64Encoded) {
          rec.responseBody = '[Binary response]';
        }
        emit(rec);
        inflight.delete(requestId);
      }
    );
  }

  // Case-insensitive merge; values from `extra` win, extra-only headers are added.
  function mergeHeaders(base, extra) {
    const out = {};
    const seen = {}; // lowercased name -> key used in `out`
    const add = (k, v) => {
      const lk = k.toLowerCase();
      if (seen[lk] !== undefined) {
        out[seen[lk]] = v;
      } else {
        seen[lk] = k;
        out[k] = v;
      }
    };
    Object.entries(base || {}).forEach(([k, v]) => add(k, v));
    Object.entries(extra || {}).forEach(([k, v]) => add(k, v));
    return out;
  }

  function emit(rec) {
    if (onRequestCb) {
      // Clone so later mutations don't retroactively change captured snapshots
      onRequestCb(Object.assign({}, rec));
    }
  }
})();
