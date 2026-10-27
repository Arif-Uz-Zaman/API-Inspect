// Background Service Worker (Manifest V3)
// Handles communication between content scripts and DevTools

const tabRequests = new Map(); // Store requests per tab

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message.type, sender.tab?.id || 'no-tab');
  
  if (message.type === 'INIT_DEVTOOLS') {
    // DevTools panel initialized for a tab
    const tabId = message.tabId;
    
    // Send existing requests for this tab
    if (tabRequests.has(tabId)) {
      sendResponse({ requests: Array.from(tabRequests.get(tabId).values()) });
    } else {
      tabRequests.set(tabId, new Map());
      sendResponse({ requests: [] });
    }
    return true;
  }

  if (message.type === 'API_REQUEST_CAPTURED' && sender.tab) {
    // Store request from content script
    const tabId = sender.tab.id;
    
    if (!tabRequests.has(tabId)) {
      tabRequests.set(tabId, new Map());
    }
    
    const requests = tabRequests.get(tabId);
    requests.set(message.data.id, message.data);
    
    console.log('Stored request:', message.data.id, message.data.method, message.data.url);

    // Forward to DevTools if connected
    chrome.runtime.sendMessage({
      type: 'REQUEST_UPDATE',
      tabId: tabId,
      data: message.data
    }).catch(() => {
      // DevTools might not be open, ignore error
    });

    return true;
  }

  if (message.type === 'RESEND_REQUEST') {
    // Forward resend request to content script
    console.log('Forwarding resend request to tab:', message.tabId);
    chrome.tabs.sendMessage(message.tabId, {
      type: 'RESEND_REQUEST',
      request: message.request
    }).catch(error => {
      console.error('Error sending to tab:', error);
      sendResponse({ error: error.message });
    });
    return true;
  }

  if (message.type === 'RESEND_RESPONSE') {
    // Forward resend response back to DevTools
    console.log('Forwarding resend response');
    chrome.runtime.sendMessage({
      type: 'RESEND_RESPONSE',
      response: message.response
    }).catch(() => {
      // DevTools might not be open
    });
    return true;
  }

  if (message.type === 'GET_COOKIES') {
    // Get cookies for a specific URL
    chrome.cookies.getAll({ url: message.url }, (cookies) => {
      sendResponse({ cookies: cookies });
    });
    return true;
  }

  if (message.type === 'CLEAR_REQUESTS') {
    // Clear requests for a tab
    const tabId = message.tabId;
    if (tabRequests.has(tabId)) {
      tabRequests.get(tabId).clear();
    }
    sendResponse({ success: true });
    return true;
  }
});

// Clean up when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  tabRequests.delete(tabId);
});

// Listen for messages from content script via tab messaging
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'devtools') {
    port.onMessage.addListener((message) => {
      if (message.type === 'INIT') {
        const tabId = message.tabId;
        
        // Send existing requests
        if (tabRequests.has(tabId)) {
          port.postMessage({
            type: 'INITIAL_REQUESTS',
            requests: Array.from(tabRequests.get(tabId).values())
          });
        }
      }
    });
  }
});

console.log('API Request Inspector - Background service worker loaded');
