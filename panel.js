// DevTools panel adapter.
// Binds the shared inspector core to the DevTools network API + inspected tab.
(function() {
  'use strict';

  const tabId = chrome.devtools.inspectedWindow.tabId;

  const transport = {
    tabId: tabId,

    start(onRequest) {
      // Capture via the DevTools Network API
      if (chrome.devtools && chrome.devtools.network) {
        chrome.devtools.network.onRequestFinished.addListener((request) => {
          try {
            const requestData = {
              id: `devtools-${Date.now()}-${Math.random()}`,
              type: 'devtools',
              resourceType: request._resourceType || '',
              url: request.request.url,
              method: request.request.method,
              headers: {},
              requestBody: null,
              timestamp: request.startedDateTime || new Date().toISOString(),
              startTime: new Date(request.startedDateTime).getTime(),
              status: request.response.status,
              statusText: request.response.statusText,
              responseHeaders: {},
              responseBody: null,
              duration: request.time,
              error: null
            };

            request.request.headers.forEach(header => {
              requestData.headers[header.name] = header.value;
            });

            request.response.headers.forEach(header => {
              requestData.responseHeaders[header.name] = header.value;
            });

            if (request.request.postData) {
              try {
                requestData.requestBody = JSON.parse(request.request.postData.text);
              } catch {
                requestData.requestBody = request.request.postData.text;
              }
            }

            request.getContent((content) => {
              if (content) {
                try {
                  requestData.responseBody = JSON.parse(content);
                } catch {
                  requestData.responseBody = content;
                }
              }
              onRequest(requestData);
            });
          } catch (error) {
            console.error('Error processing request:', error);
          }
        });
      }
      // Note: capture comes solely from the DevTools Network API here. The
      // content-script interceptor is intentionally NOT consumed in the panel —
      // subscribing to both produced duplicate rows (one per source).
    },

    evalCode(code) {
      return new Promise((resolve, reject) => {
        chrome.devtools.inspectedWindow.eval(code, (result, exceptionInfo) => {
          if (exceptionInfo) {
            reject(new Error(exceptionInfo.value || 'Evaluation failed'));
          } else {
            resolve(result);
          }
        });
      });
    },

    clear() {
      chrome.runtime.sendMessage({ type: 'CLEAR_REQUESTS', tabId });
    }
  };

  window.initInspector(transport);
})();
