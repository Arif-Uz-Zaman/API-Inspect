// Page interceptor — runs in the page's MAIN world (declared with "world": "MAIN"
// in the manifest), so it can wrap window.fetch / XMLHttpRequest WITHOUT injecting
// an inline <script>. MAIN-world content scripts are not subject to the page CSP,
// which avoids the "inline script violates Content Security Policy" error on strict sites.
(function() {
  'use strict';

  const capturedRequests = new Map();
  let requestIdCounter = 0;

  function parseBody(body) {
    if (!body) return null;
    try {
      if (typeof body === 'string') {
        try {
          return JSON.parse(body);
        } catch {
          return body;
        }
      } else if (body instanceof FormData) {
        const obj = {};
        for (let [key, value] of body.entries()) {
          obj[key] = value;
        }
        return obj;
      } else if (body instanceof URLSearchParams) {
        const obj = {};
        for (let [key, value] of body.entries()) {
          obj[key] = value;
        }
        return obj;
      }
      return body;
    } catch (e) {
      return '[Unable to parse body]';
    }
  }

  function headersToObject(headers) {
    const obj = {};
    if (headers instanceof Headers) {
      for (let [key, value] of headers.entries()) {
        obj[key] = value;
      }
    } else if (typeof headers === 'object') {
      Object.assign(obj, headers);
    }
    return obj;
  }

  // Intercept fetch
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const requestId = 'fetch-' + requestIdCounter++;
    const startTime = Date.now();

    let url, options = {};
    if (typeof args[0] === 'string') {
      url = args[0];
      options = args[1] || {};
    } else if (args[0] instanceof Request) {
      url = args[0].url;
      options = {
        method: args[0].method,
        headers: headersToObject(args[0].headers)
      };
    }

    const requestData = {
      id: requestId,
      type: 'fetch',
      url: url,
      method: (options.method || 'GET').toUpperCase(),
      headers: headersToObject(options.headers || {}),
      requestBody: parseBody(options.body),
      timestamp: new Date().toISOString(),
      startTime: startTime,
      status: null,
      responseHeaders: {},
      responseBody: null,
      error: null
    };

    capturedRequests.set(requestId, requestData);
    window.postMessage({ type: 'API_REQUEST_CAPTURED', data: requestData }, '*');

    return originalFetch.apply(this, args)
      .then(response => {
        const clonedResponse = response.clone();
        requestData.status = response.status;
        requestData.statusText = response.statusText;
        requestData.responseHeaders = headersToObject(response.headers);
        requestData.duration = Date.now() - startTime;

        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          clonedResponse.json()
            .then(json => {
              requestData.responseBody = json;
              window.postMessage({ type: 'API_REQUEST_CAPTURED', data: requestData }, '*');
            })
            .catch(() => {
              clonedResponse.text().then(text => {
                requestData.responseBody = text;
                window.postMessage({ type: 'API_REQUEST_CAPTURED', data: requestData }, '*');
              }).catch(() => {});
            });
        } else if (contentType.includes('text')) {
          clonedResponse.text()
            .then(text => {
              requestData.responseBody = text;
              window.postMessage({ type: 'API_REQUEST_CAPTURED', data: requestData }, '*');
            })
            .catch(() => {});
        } else {
          requestData.responseBody = '[Binary/Non-text Response]';
          window.postMessage({ type: 'API_REQUEST_CAPTURED', data: requestData }, '*');
        }

        return response;
      })
      .catch(error => {
        requestData.status = 0;
        requestData.error = error.message;
        requestData.duration = Date.now() - startTime;
        window.postMessage({ type: 'API_REQUEST_CAPTURED', data: requestData }, '*');
        throw error;
      });
  };

  // Intercept XMLHttpRequest
  const OriginalXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function() {
    const xhr = new OriginalXHR();
    const requestId = 'xhr-' + requestIdCounter++;
    let startTime;

    const requestData = {
      id: requestId,
      type: 'xhr',
      url: null,
      method: null,
      headers: {},
      requestBody: null,
      timestamp: new Date().toISOString(),
      startTime: null,
      status: null,
      responseHeaders: {},
      responseBody: null,
      error: null
    };

    const originalOpen = xhr.open;
    xhr.open = function(method, url, ...rest) {
      requestData.method = method.toUpperCase();
      requestData.url = url;
      startTime = Date.now();
      requestData.startTime = startTime;
      return originalOpen.apply(this, [method, url, ...rest]);
    };

    const originalSetRequestHeader = xhr.setRequestHeader;
    xhr.setRequestHeader = function(header, value) {
      requestData.headers[header] = value;
      return originalSetRequestHeader.apply(this, arguments);
    };

    const originalSend = xhr.send;
    xhr.send = function(body) {
      requestData.requestBody = parseBody(body);
      capturedRequests.set(requestId, requestData);
      window.postMessage({ type: 'API_REQUEST_CAPTURED', data: requestData }, '*');

      xhr.addEventListener('load', function() {
        requestData.status = xhr.status;
        requestData.statusText = xhr.statusText;
        requestData.duration = Date.now() - startTime;

        const headerStr = xhr.getAllResponseHeaders();
        const headers = {};
        headerStr.split('\r\n').forEach(line => {
          const parts = line.split(': ');
          if (parts.length === 2) {
            headers[parts[0]] = parts[1];
          }
        });
        requestData.responseHeaders = headers;

        try {
          const contentType = xhr.getResponseHeader('content-type') || '';
          if (contentType.includes('application/json')) {
            try {
              requestData.responseBody = JSON.parse(xhr.responseText);
            } catch {
              requestData.responseBody = xhr.responseText;
            }
          } else {
            requestData.responseBody = xhr.responseText || xhr.response;
          }
        } catch (e) {
          requestData.responseBody = '[Unable to read response]';
        }

        window.postMessage({ type: 'API_REQUEST_CAPTURED', data: requestData }, '*');
      });

      xhr.addEventListener('error', function() {
        requestData.status = 0;
        requestData.error = 'Network error';
        requestData.duration = Date.now() - startTime;
        window.postMessage({ type: 'API_REQUEST_CAPTURED', data: requestData }, '*');
      });

      return originalSend.apply(this, arguments);
    };

    return xhr;
  };

  // Listen for resend requests
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data.type === 'RESEND_REQUEST_FROM_EXTENSION') {
      const config = event.data.request;
      const options = {
        method: config.method,
        headers: config.headers,
        credentials: 'include'
      };

      if (config.body && config.method !== 'GET' && config.method !== 'HEAD') {
        options.body = typeof config.body === 'object' ? JSON.stringify(config.body) : config.body;
      }

      const startTime = Date.now();
      originalFetch(config.url, options)
        .then(response => {
          const duration = Date.now() - startTime;
          const clonedResponse = response.clone();
          const contentType = response.headers.get('content-type') || '';

          let bodyPromise;
          if (contentType.includes('application/json')) {
            bodyPromise = clonedResponse.json().catch(() => clonedResponse.text());
          } else if (contentType.includes('text')) {
            bodyPromise = clonedResponse.text();
          } else {
            bodyPromise = Promise.resolve('[Binary/Non-text Response]');
          }

          bodyPromise.then(responseBody => {
            window.postMessage({
              type: 'RESEND_RESPONSE',
              response: {
                status: response.status,
                statusText: response.statusText,
                headers: headersToObject(response.headers),
                body: responseBody,
                duration: duration
              }
            }, '*');
          });
        })
        .catch(error => {
          window.postMessage({
            type: 'RESEND_RESPONSE',
            response: {
              status: 0,
              error: error.message,
              duration: Date.now() - startTime
            }
          }, '*');
        });
    }
  });

  console.log('API Request Inspector - Interceptor active (MAIN world)');
})();
