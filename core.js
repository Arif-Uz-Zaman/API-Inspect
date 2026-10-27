// Shared Inspector core.
// UI + editor + filtering logic, decoupled from how requests are captured/sent.
// A "transport" object supplies the environment-specific behaviour:
//   transport.tabId            -> id of the target tab (may be null until chosen)
//   transport.start(onRequest) -> begin capturing; call onRequest(requestData) per request
//   transport.evalCode(code)   -> Promise<result> running JS in the target page context
//   transport.clear()          -> (optional) clear captured requests in the backend
window.initInspector = function(transport) {
  'use strict';

  let requests = [];
  let selectedRequest = null;
  let originalRequest = null;
  let filterText = '';
  let filterMethod = '';
  let activeTypes = new Set(); // empty = show all resource types
  let hideDataUrls = false;
  let environments = [];
  let currentEnvironment = null;
  let savedRequests = [];

  // DOM Elements
  const requestList = document.getElementById('requestList');
  const requestCount = document.getElementById('requestCount');
  const filterInput = document.getElementById('filterInput');
  const methodFilter = document.getElementById('methodFilter');
  const resourceFilters = document.getElementById('resourceFilters');
  const moreFiltersBtn = document.getElementById('moreFiltersBtn');
  const moreFiltersPanel = document.getElementById('moreFiltersPanel');
  const hideDataUrlsInput = document.getElementById('hideDataUrls');
  const clearBtn = document.getElementById('clearBtn');
  const themeToggle = document.getElementById('themeToggle');

  // New feature elements
  const environmentSelector = document.getElementById('environmentSelector');
  const manageEnvBtn = document.getElementById('manageEnvBtn');
  const savedRequestsBtn = document.getElementById('savedRequestsBtn');
  const saveRequestBtn = document.getElementById('saveRequestBtn');
  const compareBtn = document.getElementById('compareBtn');

  const editorView = document.getElementById('editorView');
  const methodInput = document.getElementById('methodInput');
  const urlInput = document.getElementById('urlInput');
  const headersInput = document.getElementById('headersInput');
  const bodyInput = document.getElementById('bodyInput');
  const bodyGroup = document.getElementById('bodyGroup');
  const includeCookies = document.getElementById('includeCookies');
  const sendRequestBtn = document.getElementById('sendRequestBtn');
  const copyAsCurlBtn = document.getElementById('copyAsCurlBtn');
  const resetBtn = document.getElementById('resetBtn');

  const responseView = document.getElementById('responseView');
  const responseStatus = document.getElementById('responseStatus');
  const responseBody = document.getElementById('responseBody');
  const responseHeaders = document.getElementById('responseHeaders');
  const cookiesView = document.getElementById('cookiesView');
  const errorView = document.getElementById('errorView');
  const errorMessage = document.getElementById('errorMessage');

  // Initialize
  init();

  function init() {
    setupEventListeners();
    setupModalCloseButtons();
    loadTheme();
    loadEnvironments();
    loadSavedRequests();
    updateChipStates();
    if (transport.start) {
      transport.start(updateOrAddRequest);
    }
  }

  function setupModalCloseButtons() {
    document.getElementById('closeEnvModal')?.addEventListener('click', () => {
      document.getElementById('envModal').style.display = 'none';
    });

    document.getElementById('closeSavedModal')?.addEventListener('click', () => {
      document.getElementById('savedModal').style.display = 'none';
    });

    document.getElementById('closeSaveModal')?.addEventListener('click', () => {
      document.getElementById('saveModal').style.display = 'none';
    });

    document.getElementById('cancelSaveBtn')?.addEventListener('click', () => {
      document.getElementById('saveModal').style.display = 'none';
    });

    document.getElementById('closeCompareModal')?.addEventListener('click', () => {
      document.getElementById('compareModal').style.display = 'none';
    });

    document.getElementById('closeHelpModal')?.addEventListener('click', () => {
      document.getElementById('helpModal').style.display = 'none';
    });

    // Click outside modal to close
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.style.display = 'none';
        }
      });
    });
  }

  function setupEventListeners() {
    // Filter
    filterInput.addEventListener('input', (e) => {
      filterText = e.target.value.toLowerCase();
      renderRequestList();
    });

    methodFilter.addEventListener('change', (e) => {
      filterMethod = e.target.value;
      renderRequestList();
    });

    // Resource type chips (multi-select; "All" resets)
    resourceFilters.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      const type = chip.dataset.type;

      if (type === 'all') {
        activeTypes.clear();
      } else if (activeTypes.has(type)) {
        activeTypes.delete(type);
      } else {
        activeTypes.add(type);
      }
      updateChipStates();
      renderRequestList();
    });

    // More filters dropdown
    moreFiltersBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = moreFiltersPanel.style.display !== 'none';
      moreFiltersPanel.style.display = isOpen ? 'none' : 'flex';
      moreFiltersBtn.classList.toggle('open', !isOpen);
    });

    moreFiltersPanel.addEventListener('click', (e) => e.stopPropagation());

    document.addEventListener('click', () => {
      moreFiltersPanel.style.display = 'none';
      moreFiltersBtn.classList.remove('open');
    });

    hideDataUrlsInput.addEventListener('change', (e) => {
      hideDataUrls = e.target.checked;
      renderRequestList();
    });

    // Clear button
    clearBtn.addEventListener('click', clearRequests);

    // Theme toggle
    themeToggle.addEventListener('click', toggleTheme);

    // Environment management
    environmentSelector.addEventListener('change', (e) => {
      const envName = e.target.value;
      currentEnvironment = environments.find(env => env.name === envName);
    });

    manageEnvBtn.addEventListener('click', openEnvironmentManager);
    savedRequestsBtn.addEventListener('click', openSavedRequests);
    saveRequestBtn.addEventListener('click', openSaveDialog);
    compareBtn.addEventListener('click', openCompareDialog);
    document.getElementById('helpBtn')?.addEventListener('click', () => {
      document.getElementById('helpModal').style.display = 'flex';
    });

    // Send request button
    sendRequestBtn.addEventListener('click', sendRequest);

    // Copy as cURL
    copyAsCurlBtn.addEventListener('click', copyAsCurl);

    // Export menu (cURL / JMeter .jmx)
    const exportBtn = document.getElementById('exportBtn');
    const exportMenu = document.getElementById('exportMenu');
    if (exportBtn && exportMenu) {
      exportBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = exportMenu.style.display !== 'none';
        exportMenu.style.display = isOpen ? 'none' : 'flex';
      });
      exportMenu.addEventListener('click', (e) => {
        const item = e.target.closest('[data-export]');
        if (!item) return;
        exportMenu.style.display = 'none';
        switch (item.dataset.export) {
          case 'curl-one': copyAsCurl(); break;
          case 'curl-all': copyAllAsCurl(); break;
          case 'jmx-one': exportSelectedJmx(); break;
          case 'jmx-all': exportAllJmx(); break;
        }
      });
      document.addEventListener('click', () => { exportMenu.style.display = 'none'; });
    }

    // Reset button
    resetBtn.addEventListener('click', resetEditor);

    // Method change - show/hide body field
    methodInput.addEventListener('change', (e) => {
      const method = e.target.value;
      bodyGroup.style.display = ['POST', 'PUT', 'PATCH'].includes(method) ? 'block' : 'none';
    });

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tabName = e.target.dataset.tab;
        switchTab(tabName);
      });
    });
  }

  function updateOrAddRequest(requestData) {
    const index = requests.findIndex(r => r.id === requestData.id);
    if (index >= 0) {
      requests[index] = requestData;
    } else {
      requests.unshift(requestData);
    }
    renderRequestList();

    // Update selected request if it's the same one
    if (selectedRequest && selectedRequest.id === requestData.id) {
      selectRequest(requestData);
    }
  }

  function getFilteredRequests() {
    return requests.filter(req => {
      const matchesText = filterText === '' ||
        req.url.toLowerCase().includes(filterText) ||
        req.method.toLowerCase().includes(filterText);

      const matchesMethod = filterMethod === '' || req.method === filterMethod;

      const matchesType = activeTypes.size === 0 ||
        activeTypes.has(getResourceCategory(req));

      const matchesDataUrl = !hideDataUrls ||
        !(req.url || '').toLowerCase().startsWith('data:');

      return matchesText && matchesMethod && matchesType && matchesDataUrl;
    });
  }

  function renderRequestList() {
    const filteredRequests = getFilteredRequests();

    // Sort: pinned requests first, then by timestamp
    const sortedRequests = filteredRequests.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return (b.timestamp || 0) - (a.timestamp || 0);
    });

    requestCount.textContent = sortedRequests.length;

    if (sortedRequests.length === 0) {
      requestList.innerHTML = `
        <div class="empty-state">
          <p>No requests match your filter.</p>
        </div>
      `;
      return;
    }

    const html = sortedRequests.map(req => {
      const statusClass = getStatusClass(req.status);
      const shortUrl = shortenUrl(req.url);
      const time = new Date(req.timestamp).toLocaleTimeString();
      const isSelected = selectedRequest && selectedRequest.id === req.id;
      const isPinned = req.pinned || false;

      return `
        <div class="request-item ${isSelected ? 'selected' : ''} ${isPinned ? 'pinned' : ''}" data-id="${req.id}">
          <div class="request-item-header">
            <div style="display: flex; gap: 4px; align-items: center;">
              <button class="pin-btn ${isPinned ? 'pinned' : ''}" data-id="${req.id}" title="${isPinned ? 'Unpin request' : 'Pin request'}">
                ${isPinned ? '📌' : '📍'}
              </button>
              <span class="method method-${req.method.toLowerCase()}">${req.method}</span>
            </div>
            <span class="status ${statusClass}">${req.status || '...'}</span>
          </div>
          <div class="request-url" title="${req.url}">${shortUrl}</div>
          <div class="request-meta">
            <span>${time}</span>
            ${req.duration ? `<span>${Math.round(req.duration)}ms</span>` : ''}
            <span class="request-type">${getCategoryLabel(getResourceCategory(req))}</span>
          </div>
        </div>
      `;
    }).join('');

    requestList.innerHTML = html;

    // Add click listeners for pin buttons
    document.querySelectorAll('.pin-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const requestId = btn.dataset.id;
        togglePinRequest(requestId);
      });
    });

    // Add click listeners for request items
    document.querySelectorAll('.request-item').forEach(item => {
      item.addEventListener('click', (e) => {
        // Don't select if clicking pin button
        if (e.target.classList.contains('pin-btn')) return;

        const id = item.dataset.id;
        const request = requests.find(r => r.id === id);
        if (request) {
          selectRequest(request);
        }
      });
    });
  }

  function parseAndFormatBody(body, headers) {
    if (!body) return '';

    try {
      const contentType = headers['content-type'] || headers['Content-Type'] || '';

      // Check if it's URL-encoded form data
      if (contentType.includes('application/x-www-form-urlencoded')) {
        const params = new URLSearchParams(body);
        const formatted = {};
        for (let [key, value] of params.entries()) {
          formatted[key] = value;
        }
        return JSON.stringify(formatted, null, 2);
      }

      // Check if it's already JSON
      if (contentType.includes('application/json')) {
        if (typeof body === 'object') {
          return JSON.stringify(body, null, 2);
        }
        const parsed = JSON.parse(body);
        return JSON.stringify(parsed, null, 2);
      }

      // Try to parse as JSON anyway
      if (typeof body === 'object') {
        return JSON.stringify(body, null, 2);
      }
      const parsed = JSON.parse(body);
      return JSON.stringify(parsed, null, 2);
    } catch (e) {
      // Return as-is if parsing fails
      return typeof body === 'object' ? JSON.stringify(body, null, 2) : body;
    }
  }

  function selectRequest(request) {
    selectedRequest = request;
    originalRequest = JSON.parse(JSON.stringify(request)); // Deep clone

    // Update UI
    document.querySelectorAll('.request-item').forEach(item => {
      item.classList.toggle('selected', item.dataset.id === request.id);
    });

    // Show editor
    editorView.style.display = 'block';
    editorView.previousElementSibling.style.display = 'none';

    // Populate editor
    methodInput.value = request.method;
    urlInput.value = request.url;
    headersInput.value = JSON.stringify(request.headers, null, 2);

    // Format body nicely
    bodyInput.value = parseAndFormatBody(request.requestBody, request.headers);

    bodyGroup.style.display = ['POST', 'PUT', 'PATCH'].includes(request.method) ? 'block' : 'none';
    sendRequestBtn.disabled = false;
    saveRequestBtn.disabled = false;
    compareBtn.disabled = requests.length < 2;

    // Show response if available
    if (request.status) {
      showResponse(request);
    } else {
      responseView.style.display = 'none';
      responseView.previousElementSibling.style.display = 'block';
    }
  }

  function syntaxHighlightJSON(json) {
    if (typeof json !== 'string') {
      json = JSON.stringify(json, null, 2);
    }

    json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
      let cls = 'json-number';
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'json-key';
        } else {
          cls = 'json-string';
        }
      } else if (/true|false/.test(match)) {
        cls = 'json-boolean';
      } else if (/null/.test(match)) {
        cls = 'json-null';
      }
      return '<span class="' + cls + '">' + match + '</span>';
    });
  }

  function showResponse(request) {
    responseView.style.display = 'block';
    responseView.previousElementSibling.style.display = 'none';

    // Status
    const statusClass = getStatusClass(request.status);
    responseStatus.innerHTML = `
      <span class="status ${statusClass}">${request.status} ${request.statusText || ''}</span>
      ${request.duration ? `<span>${Math.round(request.duration)}ms</span>` : ''}
    `;

    // Response body with syntax highlighting
    if (request.responseBody) {
      const formatted = formatJSON(request.responseBody);
      responseBody.innerHTML = syntaxHighlightJSON(formatted);
    } else {
      responseBody.textContent = '[No response body]';
    }

    // Response headers
    responseHeaders.textContent = JSON.stringify(request.responseHeaders, null, 2);

    // Load cookies
    loadCookies(request.url);

    // Error handling
    if (request.error) {
      errorView.style.display = 'block';
      errorMessage.textContent = request.error;
    } else {
      errorView.style.display = 'none';
    }
  }

  async function sendRequest() {
    sendRequestBtn.disabled = true;
    sendRequestBtn.textContent = '⏳ Sending...';

    try {
      // Parse headers with environment variables
      let headers = {};
      try {
        const headersText = replaceEnvironmentVariables(headersInput.value);
        headers = JSON.parse(headersText);
      } catch (e) {
        alert('Invalid JSON in headers field');
        sendRequestBtn.disabled = false;
        sendRequestBtn.textContent = '▶️ Send Request';
        return;
      }

      // Parse body with environment variables
      let body = null;
      const method = methodInput.value;
      if (['POST', 'PUT', 'PATCH'].includes(method)) {
        const bodyText = replaceEnvironmentVariables(bodyInput.value.trim());
        if (bodyText) {
          try {
            body = JSON.parse(bodyText);
          } catch (e) {
            body = bodyText;
          }
        }
      }

      // Replace environment variables in URL
      const url = replaceEnvironmentVariables(urlInput.value);

      // Filter out pseudo-headers (HTTP/2 headers that can't be set via fetch)
      const filteredHeaders = {};
      for (let [key, value] of Object.entries(headers)) {
        if (!key.startsWith(':')) {
          filteredHeaders[key] = value;
        }
      }

      // Prepare body based on content type
      let finalBody = null;
      if (body) {
        const contentType = filteredHeaders['content-type'] || filteredHeaders['Content-Type'] || '';
        if (contentType.includes('application/json')) {
          finalBody = typeof body === 'object' ? JSON.stringify(body) : body;
        } else if (contentType.includes('application/x-www-form-urlencoded')) {
          if (typeof body === 'object') {
            const params = new URLSearchParams();
            for (let [key, value] of Object.entries(body)) {
              params.append(key, value);
            }
            finalBody = params.toString();
          } else {
            finalBody = body;
          }
        } else {
          finalBody = typeof body === 'object' ? JSON.stringify(body) : body;
        }
      }

      const credentials = includeCookies && includeCookies.checked ? 'include' : 'same-origin';

      // Build a self-contained fetch expression to run in the target page context.
      const fetchCode = `
        (async function() {
          try {
            const headers = ${JSON.stringify(filteredHeaders)};
            const options = {
              method: ${JSON.stringify(method)},
              headers: headers,
              credentials: ${JSON.stringify(credentials)}
            };

            ${finalBody ? `options.body = ${JSON.stringify(finalBody)};` : ''}

            const startTime = Date.now();
            const response = await fetch(${JSON.stringify(url)}, options);
            const duration = Date.now() - startTime;

            const responseHeaders = {};
            for (let [key, value] of response.headers.entries()) {
              responseHeaders[key] = value;
            }

            let responseBody = '';
            const contentType = response.headers.get('content-type') || '';

            if (response.status === 204 || response.status === 205) {
              responseBody = '[No Content]';
            } else if (contentType.includes('application/json')) {
              try {
                responseBody = await response.json();
              } catch (e) {
                responseBody = await response.text();
              }
            } else if (contentType.includes('text') || contentType.includes('html') || contentType.includes('xml')) {
              responseBody = await response.text();
            } else {
              try {
                responseBody = await response.text();
              } catch (e) {
                responseBody = '[Binary/Non-text Response]';
              }
            }

            return {
              status: response.status,
              statusText: response.statusText,
              headers: responseHeaders,
              body: responseBody,
              duration: duration
            };
          } catch (error) {
            return {
              status: 0,
              error: error.message,
              duration: 0
            };
          }
        })();
      `;

      transport.evalCode(fetchCode)
        .then((result) => {
          handleResendResponse(result);
        })
        .catch((err) => {
          alert('Error: ' + (err && err.message ? err.message : err));
        })
        .finally(() => {
          sendRequestBtn.disabled = false;
          sendRequestBtn.textContent = '▶️ Send Request';
        });

    } catch (error) {
      alert('Error sending request: ' + error.message);
      sendRequestBtn.disabled = false;
      sendRequestBtn.textContent = '▶️ Send Request';
    }
  }

  function handleResendResponse(response) {
    sendRequestBtn.disabled = false;
    sendRequestBtn.textContent = '▶️ Send Request';

    if (!response) {
      alert('No response returned from the target page.');
      return;
    }

    // Create a temporary request object for display
    const displayRequest = {
      ...selectedRequest,
      status: response.status,
      statusText: response.statusText,
      responseHeaders: response.headers,
      responseBody: response.body,
      duration: response.duration,
      error: response.error
    };

    showResponse(displayRequest);
  }

  function resetEditor() {
    if (originalRequest) {
      selectRequest(originalRequest);
    }
  }

  // Normalize a request-like source into {method, url, headers, bodyStr}
  // `source` may be a captured request, or null to read the live editor fields.
  function normalizeForExport(source) {
    let method, url, headers, rawBody;

    if (source) {
      method = source.method;
      url = source.url;
      headers = source.headers || {};
      rawBody = source.requestBody;
    } else {
      method = methodInput.value;
      url = urlInput.value;
      try { headers = JSON.parse(headersInput.value); } catch (e) { headers = {}; }
      const bodyText = bodyInput.value.trim();
      if (['POST', 'PUT', 'PATCH'].includes(method) && bodyText) {
        try { rawBody = JSON.parse(bodyText); } catch (e) { rawBody = bodyText; }
      } else {
        rawBody = null;
      }
    }

    // Drop HTTP/2 pseudo-headers (":authority" etc.) and length/host headers that
    // replay tools (cURL/JMeter) must compute themselves — a stale value corrupts the request.
    const skip = new Set(['content-length', 'host']);
    const filteredHeaders = {};
    for (let [key, value] of Object.entries(headers)) {
      if (key.startsWith(':')) continue;
      if (skip.has(key.toLowerCase())) continue;
      filteredHeaders[key] = value;
    }

    const contentType = filteredHeaders['content-type'] || filteredHeaders['Content-Type'] || '';
    let bodyStr = null;
    if (rawBody !== null && rawBody !== undefined && rawBody !== '') {
      if (contentType.includes('application/x-www-form-urlencoded') && typeof rawBody === 'object') {
        const params = new URLSearchParams();
        for (let [k, v] of Object.entries(rawBody)) params.append(k, v);
        bodyStr = params.toString();
      } else if (typeof rawBody === 'object') {
        bodyStr = JSON.stringify(rawBody);
        if (!contentType) filteredHeaders['Content-Type'] = 'application/json';
      } else {
        bodyStr = String(rawBody);
      }
    }

    return { method, url, headers: filteredHeaders, bodyStr };
  }

  function buildCurl(source, singleLine) {
    const { method, url, headers, bodyStr } = normalizeForExport(source);
    const sep = singleLine ? ' ' : ' \\\n  ';
    let curl = `curl -X ${method} '${url}'`;
    Object.entries(headers).forEach(([key, value]) => {
      curl += `${sep}-H '${key}: ${String(value).replace(/'/g, "'\\''")}'`;
    });
    if (bodyStr) {
      curl += `${sep}--data-raw '${bodyStr.replace(/'/g, "'\\''")}'`;
    }
    return curl;
  }

  function copyAsCurl() {
    if (!selectedRequest && !urlInput.value) {
      alert('Please select a request first');
      return;
    }
    copyText(buildCurl(null, false), copyAsCurlBtn, '📋 Copy as cURL');
  }

  function copyAllAsCurl() {
    const list = getFilteredRequests();
    if (list.length === 0) {
      alert('No requests to copy.');
      return;
    }
    // One cURL per line — JMeter "Import from cURL" reads each line as a sampler.
    const text = list.map(req => buildCurl(req, true)).join('\n');
    copyText(text, null);
    flashExportBtn(`✅ Copied ${list.length} cURL command(s)`);
  }

  function copyText(text, btn, restoreLabel) {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);

      if (btn) {
        const original = restoreLabel || btn.textContent;
        btn.textContent = '✅ Copied!';
        setTimeout(() => { btn.textContent = original; }, 2000);
      }
      return true;
    } catch (err) {
      console.error('Failed to copy:', err);
      console.log(text);
      alert('Failed to copy to clipboard. Output logged to console.');
      return false;
    }
  }

  // ============ JMETER (.jmx) EXPORT ============

  function xmlEscape(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function buildHttpArg(rawName, rawValue) {
    return `
              <elementProp name="${xmlEscape(rawName)}" elementType="HTTPArgument">
                <boolProp name="HTTPArgument.always_encode">true</boolProp>
                <stringProp name="Argument.name">${xmlEscape(rawName)}</stringProp>
                <stringProp name="Argument.value">${xmlEscape(rawValue)}</stringProp>
                <stringProp name="Argument.metadata">=</stringProp>
                <boolProp name="HTTPArgument.use_equals">true</boolProp>
              </elementProp>`;
  }

  function buildSampler(source) {
    const { method, url, headers, bodyStr } = normalizeForExport(source);

    let protocol = 'https', domain = '', port = '', path = url;
    try {
      const u = new URL(url);
      protocol = u.protocol.replace(':', '');
      domain = u.hostname;
      port = u.port;
      path = u.pathname + u.search;
    } catch (e) { /* leave raw path */ }

    const name = `${method} ${path}`;
    const contentType = (headers['content-type'] || headers['Content-Type'] || '').toLowerCase();
    const isForm = contentType.includes('application/x-www-form-urlencoded');

    // Form bodies must be split into individual JMeter arguments (name/value rows);
    // JSON/other bodies are sent as a single raw post body.
    let postBodyRaw = false;
    let argsInner = '';

    if (bodyStr && isForm) {
      const params = new URLSearchParams(bodyStr);
      const parts = [];
      for (const [k, v] of params.entries()) {
        parts.push(buildHttpArg(k, v));
      }
      argsInner = parts.join('');
    } else if (bodyStr) {
      postBodyRaw = true;
      argsInner = `
              <elementProp name="" elementType="HTTPArgument">
                <boolProp name="HTTPArgument.always_encode">false</boolProp>
                <stringProp name="Argument.value">${xmlEscape(bodyStr)}</stringProp>
                <stringProp name="Argument.metadata">=</stringProp>
              </elementProp>`;
    }

    const argsXml = `
          <elementProp name="HTTPsampler.Arguments" elementType="Arguments">
            <collectionProp name="Arguments.arguments">${argsInner}
            </collectionProp>
          </elementProp>`;

    const headersXml = Object.entries(headers).map(([k, v]) => `
            <elementProp name="${xmlEscape(k)}" elementType="Header">
              <stringProp name="Header.name">${xmlEscape(k)}</stringProp>
              <stringProp name="Header.value">${xmlEscape(v)}</stringProp>
            </elementProp>`).join('');

    return `
        <HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="${xmlEscape(name)}" enabled="true">${argsXml}
          <stringProp name="HTTPSampler.domain">${xmlEscape(domain)}</stringProp>
          <stringProp name="HTTPSampler.port">${xmlEscape(port)}</stringProp>
          <stringProp name="HTTPSampler.protocol">${xmlEscape(protocol)}</stringProp>
          <stringProp name="HTTPSampler.path">${xmlEscape(path)}</stringProp>
          <stringProp name="HTTPSampler.method">${xmlEscape(method)}</stringProp>
          <boolProp name="HTTPSampler.follow_redirects">true</boolProp>
          <boolProp name="HTTPSampler.use_keepalive">true</boolProp>
          <boolProp name="HTTPSampler.postBodyRaw">${postBodyRaw}</boolProp>
        </HTTPSamplerProxy>
        <hashTree>
          <HeaderManager guiclass="HeaderPanel" testclass="HeaderManager" testname="HTTP Header Manager" enabled="true">
            <collectionProp name="HeaderManager.headers">${headersXml}
            </collectionProp>
          </HeaderManager>
          <hashTree/>
        </hashTree>`;
  }

  function buildJmx(list) {
    const samplers = list.map(buildSampler).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<jmeterTestPlan version="1.2" properties="5.0" jmeter="5.6.3">
  <hashTree>
    <TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="API Inspector Export" enabled="true">
      <boolProp name="TestPlan.functional_mode">false</boolProp>
      <boolProp name="TestPlan.serialize_threadgroups">false</boolProp>
      <elementProp name="TestPlan.user_defined_variables" elementType="Arguments" guiclass="ArgumentsPanel" testclass="Arguments" testname="User Defined Variables" enabled="true">
        <collectionProp name="Arguments.arguments"/>
      </elementProp>
    </TestPlan>
    <hashTree>
      <ThreadGroup guiclass="ThreadGroupGui" testclass="ThreadGroup" testname="Thread Group" enabled="true">
        <stringProp name="ThreadGroup.num_threads">1</stringProp>
        <stringProp name="ThreadGroup.ramp_time">1</stringProp>
        <elementProp name="ThreadGroup.main_controller" elementType="LoopController" guiclass="LoopControlPanel" testclass="LoopController" testname="Loop Controller" enabled="true">
          <boolProp name="LoopController.continue_forever">false</boolProp>
          <stringProp name="LoopController.loops">1</stringProp>
        </elementProp>
        <stringProp name="ThreadGroup.on_sample_error">continue</stringProp>
      </ThreadGroup>
      <hashTree>${samplers}
      </hashTree>
    </hashTree>
  </hashTree>
</jmeterTestPlan>`;
  }

  function downloadFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportSelectedJmx() {
    if (!selectedRequest && !urlInput.value) {
      alert('Please select a request first');
      return;
    }
    // `null` source => read the live editor fields (includes any edits)
    downloadFile('api-inspector-request.jmx', buildJmx([null]), 'application/xml');
    flashExportBtn('✅ Exported 1 request');
  }

  function exportAllJmx() {
    const list = getFilteredRequests();
    if (list.length === 0) {
      alert('No requests to export.');
      return;
    }
    downloadFile('api-inspector-requests.jmx', buildJmx(list), 'application/xml');
    flashExportBtn(`✅ Exported ${list.length} request(s)`);
  }

  function flashExportBtn(msg) {
    const btn = document.getElementById('exportBtn');
    if (!btn) return;
    const original = btn.dataset.label || btn.textContent;
    btn.dataset.label = original;
    btn.textContent = msg;
    setTimeout(() => { btn.textContent = btn.dataset.label; }, 2200);
  }

  function clearRequests() {
    const unpinnedCount = requests.filter(r => !r.pinned).length;
    const pinnedCount = requests.filter(r => r.pinned).length;

    if (unpinnedCount === 0) {
      alert('No requests to clear. All requests are pinned.');
      return;
    }

    const message = pinnedCount > 0
      ? `Clear ${unpinnedCount} unpinned request(s)? ${pinnedCount} pinned request(s) will remain.`
      : `Clear all ${unpinnedCount} captured request(s)?`;

    if (confirm(message)) {
      // Keep only pinned requests
      requests = requests.filter(r => r.pinned);

      // Clear selection if it was an unpinned request
      if (selectedRequest && !selectedRequest.pinned) {
        selectedRequest = null;
        originalRequest = null;
        sendRequestBtn.disabled = true;
      }

      renderRequestList();

      if (!selectedRequest) {
        editorView.style.display = 'none';
        editorView.previousElementSibling.style.display = 'block';
        responseView.style.display = 'none';
        responseView.previousElementSibling.style.display = 'block';
      }

      if (transport.clear) {
        transport.clear();
      }
    }
  }

  function togglePinRequest(requestId) {
    const request = requests.find(r => r.id === requestId);
    if (!request) return;

    request.pinned = !request.pinned;

    if (selectedRequest && selectedRequest.id === requestId) {
      selectedRequest.pinned = request.pinned;
    }

    renderRequestList();
  }

  function loadCookies(url) {
    chrome.runtime.sendMessage({
      type: 'GET_COOKIES',
      url: url
    }, (response) => {
      if (response && response.cookies) {
        const cookieStr = response.cookies.map(c =>
          `${c.name}=${c.value} (${c.domain}${c.path})`
        ).join('\n');
        cookiesView.textContent = cookieStr || '[No cookies]';
      }
    });
  }

  function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    document.querySelectorAll('.tab-pane').forEach(pane => {
      pane.classList.remove('active');
    });

    const pane = document.getElementById(tabName + 'Tab');
    if (pane) {
      pane.classList.add('active');
    }
  }

  function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    themeToggle.textContent = isDark ? '☀️' : '🌙';
    themeToggle.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }

  function loadTheme() {
    const theme = localStorage.getItem('theme');
    if (theme === 'dark') {
      document.body.classList.add('dark-mode');
      themeToggle.textContent = '☀️';
      themeToggle.title = 'Switch to light mode';
    }
  }

  // Helper functions
  function updateChipStates() {
    resourceFilters.querySelectorAll('.chip').forEach(chip => {
      const type = chip.dataset.type;
      const active = type === 'all'
        ? activeTypes.size === 0
        : activeTypes.has(type);
      chip.classList.toggle('active', active);
    });
  }

  const CATEGORY_LABELS = {
    'fetch-xhr': 'Fetch/XHR',
    'doc': 'Doc',
    'css': 'CSS',
    'js': 'JS',
    'font': 'Font',
    'img': 'Img',
    'media': 'Media',
    'manifest': 'Manifest',
    'socket': 'Socket',
    'wasm': 'Wasm',
    'other': 'Other'
  };

  function getCategoryLabel(category) {
    return CATEGORY_LABELS[category] || 'Other';
  }

  // Map a captured request to one of the filter-bar categories
  function getResourceCategory(req) {
    const rt = (req.resourceType || '').toLowerCase();
    switch (rt) {
      case 'xhr':
      case 'fetch': return 'fetch-xhr';
      case 'document': return 'doc';
      case 'stylesheet': return 'css';
      case 'script': return 'js';
      case 'font': return 'font';
      case 'image': return 'img';
      case 'media': return 'media';
      case 'manifest': return 'manifest';
      case 'websocket': return 'socket';
      case 'wasm': return 'wasm';
      case 'other': return 'other';
    }

    // Requests captured outside the network API are page fetch/XHR
    if (req.type === 'fetch' || req.type === 'xhr') return 'fetch-xhr';

    // Fall back to inferring from content-type / URL extension
    return inferCategory(req);
  }

  function inferCategory(req) {
    const headers = req.responseHeaders || {};
    const contentType = (
      headers['content-type'] || headers['Content-Type'] || ''
    ).toLowerCase();

    if (contentType.includes('json') || contentType.includes('graphql')) return 'fetch-xhr';
    if (contentType.includes('html')) return 'doc';
    if (contentType.includes('css')) return 'css';
    if (contentType.includes('javascript') || contentType.includes('ecmascript')) return 'js';
    if (contentType.includes('font')) return 'font';
    if (contentType.includes('image')) return 'img';
    if (contentType.includes('audio') || contentType.includes('video')) return 'media';
    if (contentType.includes('manifest')) return 'manifest';
    if (contentType.includes('wasm')) return 'wasm';

    const path = (() => {
      try { return new URL(req.url).pathname.toLowerCase(); }
      catch { return (req.url || '').toLowerCase(); }
    })();
    const ext = path.split('.').pop();

    if (req.url && req.url.startsWith('ws')) return 'socket';
    if (['css'].includes(ext)) return 'css';
    if (['js', 'mjs', 'cjs'].includes(ext)) return 'js';
    if (['woff', 'woff2', 'ttf', 'otf', 'eot'].includes(ext)) return 'font';
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif', 'ico', 'bmp'].includes(ext)) return 'img';
    if (['mp4', 'webm', 'ogg', 'mp3', 'wav', 'm4a', 'mov'].includes(ext)) return 'media';
    if (['wasm'].includes(ext)) return 'wasm';
    if (['html', 'htm'].includes(ext)) return 'doc';
    if (['json'].includes(ext)) return 'fetch-xhr';

    return 'other';
  }

  function getStatusClass(status) {
    if (!status) return 'status-pending';
    if (status >= 200 && status < 300) return 'status-success';
    if (status >= 300 && status < 400) return 'status-redirect';
    if (status >= 400 && status < 500) return 'status-client-error';
    if (status >= 500) return 'status-server-error';
    return 'status-unknown';
  }

  function shortenUrl(url) {
    try {
      const urlObj = new URL(url);
      let path = urlObj.pathname + urlObj.search;
      if (path.length > 60) {
        path = path.substring(0, 57) + '...';
      }
      return urlObj.hostname + path;
    } catch {
      return url.length > 60 ? url.substring(0, 57) + '...' : url;
    }
  }

  function formatJSON(obj) {
    if (typeof obj === 'string') {
      try {
        obj = JSON.parse(obj);
      } catch {
        return obj;
      }
    }
    return JSON.stringify(obj, null, 2);
  }

  // ============ ENVIRONMENT MANAGEMENT ============

  function loadEnvironments() {
    chrome.storage.local.get(['environments'], (result) => {
      environments = result.environments || [];
      renderEnvironmentSelector();
    });
  }

  function renderEnvironmentSelector() {
    environmentSelector.innerHTML = '<option value="">No Environment</option>';
    environments.forEach(env => {
      const option = document.createElement('option');
      option.value = env.name;
      option.textContent = env.name;
      environmentSelector.appendChild(option);
    });
  }

  function openEnvironmentManager() {
    const modal = document.getElementById('envModal');
    modal.style.display = 'flex';
    renderEnvironmentList();
    setupEnvModalListeners();
  }

  function renderEnvironmentList() {
    const envList = document.getElementById('envList');
    if (environments.length === 0) {
      envList.innerHTML = '<p style="color: var(--text-secondary);">No environments yet. Create one below.</p>';
      return;
    }

    envList.innerHTML = environments.map(env => `
      <div class="env-item">
        <div>
          <div class="env-name">${env.name}</div>
          <div class="env-vars">${Object.keys(env.variables).length} variables</div>
        </div>
        <div class="env-actions">
          <button class="btn btn-secondary btn-sm" onclick="deleteEnvironment('${env.name}')">Delete</button>
        </div>
      </div>
    `).join('');
  }

  window.deleteEnvironment = function(name) {
    if (confirm(`Delete environment "${name}"?`)) {
      environments = environments.filter(e => e.name !== name);
      chrome.storage.local.set({ environments });
      renderEnvironmentList();
      renderEnvironmentSelector();
    }
  };

  function setupEnvModalListeners() {
    const addVarBtn = document.getElementById('addEnvVarBtn');
    const saveEnvBtn = document.getElementById('saveEnvBtn');

    // Clear previous listeners
    const newAddVarBtn = addVarBtn.cloneNode(true);
    addVarBtn.parentNode.replaceChild(newAddVarBtn, addVarBtn);

    const newSaveBtn = saveEnvBtn.cloneNode(true);
    saveEnvBtn.parentNode.replaceChild(newSaveBtn, saveEnvBtn);

    document.getElementById('addEnvVarBtn').addEventListener('click', () => {
      addEnvironmentVariable();
    });

    document.getElementById('saveEnvBtn').addEventListener('click', () => {
      saveEnvironment();
    });
  }

  function addEnvironmentVariable() {
    const varsList = document.getElementById('envVarsList');
    const varItem = document.createElement('div');
    varItem.className = 'env-var-item';
    varItem.innerHTML = `
      <input type="text" placeholder="Variable name (e.g., baseUrl)" class="input-field var-key">
      <input type="text" placeholder="Value (e.g., https://api.example.com)" class="input-field var-value">
      <button class="btn btn-secondary" onclick="this.parentElement.remove()">Remove</button>
    `;
    varsList.appendChild(varItem);
  }

  function saveEnvironment() {
    const envName = document.getElementById('newEnvName').value.trim();
    if (!envName) {
      alert('Please enter an environment name');
      return;
    }

    const varItems = document.querySelectorAll('.env-var-item');
    const variables = {};

    varItems.forEach(item => {
      const key = item.querySelector('.var-key').value.trim();
      const value = item.querySelector('.var-value').value.trim();
      if (key && value) {
        variables[key] = value;
      }
    });

    if (Object.keys(variables).length === 0) {
      alert('Please add at least one variable');
      return;
    }

    environments = environments.filter(e => e.name !== envName);

    environments.push({
      name: envName,
      variables: variables
    });

    chrome.storage.local.set({ environments }, () => {
      renderEnvironmentList();
      renderEnvironmentSelector();
      document.getElementById('newEnvName').value = '';
      document.getElementById('envVarsList').innerHTML = '';
      alert('Environment saved!');
    });
  }

  function replaceEnvironmentVariables(text) {
    if (!currentEnvironment || !text) return text;

    let result = text;
    Object.entries(currentEnvironment.variables).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(regex, value);
    });
    return result;
  }

  // ============ SAVED REQUESTS ============

  function loadSavedRequests() {
    chrome.storage.local.get(['savedRequests'], (result) => {
      savedRequests = result.savedRequests || [];
      updateSaveButtonState();
    });
  }

  function updateSaveButtonState() {
    saveRequestBtn.disabled = !selectedRequest;
    compareBtn.disabled = requests.length < 2;
  }

  function openSaveDialog() {
    if (!selectedRequest) {
      alert('Please select a request first');
      return;
    }

    const modal = document.getElementById('saveModal');
    modal.style.display = 'flex';

    const urlPath = new URL(selectedRequest.url).pathname.split('/').filter(Boolean).join(' ');
    document.getElementById('saveRequestName').value = urlPath || 'New Request';
    document.getElementById('saveRequestCollection').value = '';
    document.getElementById('saveRequestDesc').value = '';

    const confirmBtn = document.getElementById('confirmSaveBtn');
    const newBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);

    document.getElementById('confirmSaveBtn').addEventListener('click', () => {
      saveCurrentRequest();
    });
  }

  function saveCurrentRequest() {
    const name = document.getElementById('saveRequestName').value.trim();
    if (!name) {
      alert('Please enter a request name');
      return;
    }

    const savedRequest = {
      id: Date.now().toString(),
      name: name,
      collection: document.getElementById('saveRequestCollection').value.trim() || 'Uncategorized',
      description: document.getElementById('saveRequestDesc').value.trim(),
      method: methodInput.value,
      url: urlInput.value,
      headers: headersInput.value,
      body: bodyInput.value,
      timestamp: new Date().toISOString()
    };

    savedRequests.push(savedRequest);
    chrome.storage.local.set({ savedRequests }, () => {
      document.getElementById('saveModal').style.display = 'none';
      alert(`Request "${name}" saved successfully!`);
    });
  }

  function openSavedRequests() {
    const modal = document.getElementById('savedModal');
    modal.style.display = 'flex';
    renderSavedRequests();
  }

  function renderSavedRequests() {
    const list = document.getElementById('savedRequestsList');

    if (savedRequests.length === 0) {
      list.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">No saved requests yet.</p>';
      return;
    }

    let html = '<p style="color: var(--accent-color); font-size: 12px; margin-bottom: 12px; padding: 8px; background: var(--accent-soft); border-radius: 4px;">💡 <strong>Tip:</strong> Click on any request to load it into the editor</p>';

    const grouped = {};
    savedRequests.forEach(req => {
      const collection = req.collection || 'Uncategorized';
      if (!grouped[collection]) grouped[collection] = [];
      grouped[collection].push(req);
    });

    html += Object.entries(grouped).map(([collection, reqs]) => `
      <div style="margin-bottom: 20px;">
        <h4 style="color: var(--accent-color); margin-bottom: 8px;">${collection}</h4>
        ${reqs.map(req => `
          <div class="saved-request-item" data-request-id="${req.id}">
            <div class="saved-request-header">
              <span class="saved-request-name">${req.name}</span>
              <span class="method method-${req.method.toLowerCase()}">${req.method}</span>
            </div>
            <div class="saved-request-url">${req.url}</div>
            ${req.description ? `<p style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">${req.description}</p>` : ''}
            <div class="saved-request-actions">
              <button class="btn btn-secondary btn-sm delete-saved-btn" data-request-id="${req.id}">Delete</button>
            </div>
          </div>
        `).join('')}
      </div>
    `).join('');

    list.innerHTML = html;

    list.querySelectorAll('.saved-request-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-saved-btn')) {
          return;
        }
        const requestId = item.dataset.requestId;
        loadSavedRequest(requestId);
      });
    });

    list.querySelectorAll('.delete-saved-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const requestId = btn.dataset.requestId;
        deleteSavedRequest(requestId);
      });
    });
  }

  function loadSavedRequest(id) {
    const req = savedRequests.find(r => r.id === id);
    if (!req) {
      console.error('Request not found:', id);
      return;
    }

    methodInput.value = req.method;
    urlInput.value = req.url;
    headersInput.value = req.headers;
    bodyInput.value = req.body;

    bodyGroup.style.display = ['POST', 'PUT', 'PATCH'].includes(req.method) ? 'block' : 'none';

    editorView.style.display = 'block';
    editorView.previousElementSibling.style.display = 'none';
    sendRequestBtn.disabled = false;
    saveRequestBtn.disabled = false;

    document.getElementById('savedModal').style.display = 'none';
  }

  function deleteSavedRequest(id) {
    if (confirm('Delete this saved request?')) {
      savedRequests = savedRequests.filter(r => r.id !== id);
      chrome.storage.local.set({ savedRequests }, () => {
        renderSavedRequests();
      });
    }
  }

  // ============ REQUEST COMPARISON ============

  function openCompareDialog() {
    if (requests.length < 2) {
      alert('Need at least 2 requests to compare');
      return;
    }

    const modal = document.getElementById('compareModal');
    modal.style.display = 'flex';

    const select1 = document.getElementById('compareSelect1');
    const select2 = document.getElementById('compareSelect2');

    const options = requests.map(req => {
      let path = req.url;
      try { const u = new URL(req.url); path = u.pathname + u.search; } catch (e) {}
      return `<option value="${req.id}" title="${xmlEscape(req.url)}">${xmlEscape(req.method + ' ' + path)}</option>`;
    }).join('');

    select1.innerHTML = options;
    select2.innerHTML = options;

    if (requests.length > 1) {
      select2.selectedIndex = 1;
    }

    const compareBtnEl = document.getElementById('runCompareBtn');
    const newBtn = compareBtnEl.cloneNode(true);
    compareBtnEl.parentNode.replaceChild(newBtn, compareBtnEl);

    document.getElementById('runCompareBtn').addEventListener('click', () => {
      compareRequests();
    });
  }

  function compareRequests() {
    const id1 = document.getElementById('compareSelect1').value;
    const id2 = document.getElementById('compareSelect2').value;

    if (id1 === id2) {
      alert('Please select two different requests');
      return;
    }

    const req1 = requests.find(r => r.id === id1);
    const req2 = requests.find(r => r.id === id2);

    if (!req1 || !req2) return;

    const resultDiv = document.getElementById('compareResult');

    function normalizeBody(body) {
      if (!body) return '';
      if (typeof body === 'object') {
        return JSON.stringify(body, null, 2);
      }
      try {
        const parsed = JSON.parse(body);
        return JSON.stringify(parsed, null, 2);
      } catch (e) {
        return String(body);
      }
    }

    const text1 = normalizeBody(req1.responseBody);
    const text2 = normalizeBody(req2.responseBody);

    const lines1 = text1.split('\n');
    const lines2 = text2.split('\n');

    function generateDiffHtml(lines, otherLines, isLeft) {
      let html = '<div style="font-family: \'Courier New\', monospace; font-size: 12px; line-height: 1.6;">';
      const maxLen = Math.max(lines.length, otherLines.length);

      for (let i = 0; i < maxLen; i++) {
        const line1 = lines[i] !== undefined ? lines[i] : null;
        const line2 = otherLines[i] !== undefined ? otherLines[i] : null;

        let bgColor = 'transparent';
        let textColor = 'inherit';
        let prefix = '';

        if (line1 === null && line2 !== null) {
          bgColor = isLeft ? 'transparent' : 'rgba(0, 255, 0, 0.2)';
          prefix = isLeft ? '' : '+ ';
          textColor = isLeft ? '#666' : 'inherit';
        } else if (line1 !== null && line2 === null) {
          bgColor = isLeft ? 'rgba(255, 0, 0, 0.2)' : 'transparent';
          prefix = isLeft ? '- ' : '';
          textColor = isLeft ? 'inherit' : '#666';
        } else if (line1 !== line2) {
          bgColor = 'rgba(255, 255, 0, 0.2)';
          prefix = '~ ';
        }

        const displayLine = line1 !== null ? line1 : line2;
        const escaped = String(displayLine || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');

        html += `<div style="background: ${bgColor}; color: ${textColor}; padding: 2px 4px; white-space: pre-wrap; word-wrap: break-word;">${prefix}${escaped}</div>`;
      }

      html += '</div>';
      return html;
    }

    resultDiv.innerHTML = `
      <div class="compare-panel">
        <h4>${req1.method} ${req1.url}</h4>
        <div><strong>Status:</strong> ${req1.status || 'N/A'}</div>
        <div><strong>Duration:</strong> ${req1.duration || 'N/A'}ms</div>
        <h5 style="margin-top: 12px;">Response Body:</h5>
        <div class="compare-diff" style="max-height: 500px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 4px; padding: 8px;">
          ${generateDiffHtml(lines1, lines2, true)}
        </div>
      </div>
      <div class="compare-panel">
        <h4>${req2.method} ${req2.url}</h4>
        <div><strong>Status:</strong> ${req2.status || 'N/A'}</div>
        <div><strong>Duration:</strong> ${req2.duration || 'N/A'}ms</div>
        <h5 style="margin-top: 12px;">Response Body:</h5>
        <div class="compare-diff" style="max-height: 500px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 4px; padding: 8px;">
          ${generateDiffHtml(lines2, lines1, false)}
        </div>
      </div>
    `;
  }
};
