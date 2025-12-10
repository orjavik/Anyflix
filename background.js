// Anyflix - Netflix Household Bypass
// Background service worker

console.log('Anyflix: Background service worker started');

// Log when rules are matched (for debugging)
chrome.declarativeNetRequest.onRuleMatchedDebug?.addListener((info) => {
  console.log('Anyflix: Blocked request:', info.request.url);
});
