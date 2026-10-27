// Content Script (ISOLATED world) - message bridge between the MAIN-world
// page interceptor (pageInterceptor.js) and the extension background.
// The interceptor itself is now a separate "world": "MAIN" content script, so
// no inline <script> is injected and strict-CSP pages no longer report violations.
(function() {
  'use strict';

  console.log('API Request Inspector - Content script loaded');

  // Listen for messages from the page interceptor and forward to background
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    
    if (event.data.type === 'API_REQUEST_CAPTURED') {
      console.log('Content script forwarding captured request:', event.data.data.id);
      chrome.runtime.sendMessage({
        type: 'API_REQUEST_CAPTURED',
        data: event.data.data
      }).catch((error) => {
        console.error('Failed to send to background:', error);
      });
    }
    
    if (event.data.type === 'RESEND_RESPONSE') {
      console.log('Content script forwarding resend response');
      chrome.runtime.sendMessage({
        type: 'RESEND_RESPONSE',
        response: event.data.response
      }).catch((error) => {
        console.error('Failed to send response to background:', error);
      });
    }
  });

  // Listen for resend commands from background and forward to page
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'RESEND_REQUEST') {
      window.postMessage({
        type: 'RESEND_REQUEST_FROM_EXTENSION',
        request: message.request
      }, '*');
    }
  });
})();
