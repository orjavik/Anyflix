// Anyflix - Household Bypass
// This script intercepts GraphQL requests that check household/network status

(function() {
  'use strict';

  // Operations to intercept and modify
  const BLOCKED_OPERATIONS = [
    'CLCSInterstitialLolomo',               // Browse page household interstitial check
    'CLCSInterstitialPlaybackAndPostPlayback',  // Playback household interstitial check
    'CLCSSendFeedback'                      // Feedback about interstitial shown
  ];

  // Flag to track if we've bypassed the check
  let bypassApplied = false;

  // Override Netflix's internal state if possible
  const patchNetflixState = () => {
    try {
      // Try to find and patch Netflix's internal CLCS state
      if (window.netflix?.falcorCache) {
        console.log('Anyflix: Found Netflix falcor cache');
      }
      
      // Look for the player API and patch household state
      const playerApp = document.querySelector('[data-uia="player"]');
      if (playerApp && !bypassApplied) {
        console.log('Anyflix: Player detected, applying bypass');
        bypassApplied = true;
      }
    } catch (e) {
      // Ignore errors
    }
  };

  // Store original fetch
  const originalFetch = window.fetch;

  // Override fetch to intercept Netflix requests
  window.fetch = async function(...args) {
    const [resource, config] = args;
    const url = typeof resource === 'string' ? resource : resource?.url;
    
    // Intercept the FTL probe request (network fingerprinting)
    if (url && url.includes('/api/ftl/probe')) {
      console.log('Anyflix: Intercepted ftl/probe (fetch)');
      // Return a fake timestamp response that the player expects
      return new Response(JSON.stringify({
        time: Date.now(),
        serverTime: Date.now()
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Check if this is a GraphQL request to Netflix
    if (url && url.includes('graphql')) {
      try {
        // Check the operation name in headers
        const operationName = config?.headers?.['x-netflix.context.operation-name'];
        
        if (operationName && BLOCKED_OPERATIONS.includes(operationName)) {
          console.log('Anyflix: Intercepted household check:', operationName);
          
          // Return a fake successful response that says "no interstitial needed"
          if (operationName === 'CLCSInterstitialLolomo') {
            return new Response(JSON.stringify({
              data: {
                clcsInterstitialLolomo: null
              }
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          
          // For playback interstitial, return null (no interstitial needed)
          if (operationName === 'CLCSInterstitialPlaybackAndPostPlayback') {
            return new Response(JSON.stringify({
              data: {
                clcsInterstitialPlaybackAndPostPlayback: null
              }
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          
          // For feedback, just return success
          if (operationName === 'CLCSSendFeedback') {
            return new Response(JSON.stringify({
              data: {
                clcsSendFeedback: { success: true }
              }
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          }
        }

        // Also check the body for operation names (fallback method)
        if (config?.body) {
          const bodyStr = typeof config.body === 'string' ? config.body : '';
          for (const op of BLOCKED_OPERATIONS) {
            if (bodyStr.includes(`"operationName":"${op}"`)) {
              console.log('Anyflix: Intercepted household check (body):', op);
              
              if (op === 'CLCSInterstitialLolomo') {
                return new Response(JSON.stringify({
                  data: {
                    clcsInterstitialLolomo: null
                  }
                }), {
                  status: 200,
                  headers: { 'Content-Type': 'application/json' }
                });
              }
              
              if (op === 'CLCSInterstitialPlaybackAndPostPlayback') {
                return new Response(JSON.stringify({
                  data: {
                    clcsInterstitialPlaybackAndPostPlayback: null
                  }
                }), {
                  status: 200,
                  headers: { 'Content-Type': 'application/json' }
                });
              }
              
              if (op === 'CLCSSendFeedback') {
                return new Response(JSON.stringify({
                  data: {
                    clcsSendFeedback: { success: true }
                  }
                }), {
                  status: 200,
                  headers: { 'Content-Type': 'application/json' }
                });
              }
            }
          }
        }
      } catch (e) {
        console.error('Anyflix: Error intercepting request:', e);
      }
    }

    // For ALL Netflix API requests, intercept the response and strip household data
    if (url && (url.includes('netflix.com') || url.includes('nflxvideo.net'))) {
      try {
        const response = await originalFetch.apply(this, args);
        
        // Clone the response so we can read it
        const clone = response.clone();
        const contentType = response.headers.get('content-type') || '';
        
        // Only modify JSON responses
        if (contentType.includes('application/json')) {
          try {
            const data = await clone.json();
            
            // Check if response contains household/interstitial data
            const dataStr = JSON.stringify(data);
            if (dataStr.includes('interstitial') || dataStr.includes('borrower') || 
                dataStr.includes('household') || dataStr.includes('CLCS')) {
              console.log('Anyflix: Stripping household data from response');
              
              // Recursively remove interstitial-related properties
              const cleanData = JSON.parse(dataStr, (key, value) => {
                if (key.toLowerCase().includes('interstitial')) return null;
                if (key.toLowerCase().includes('borrower') && typeof value === 'object') return null;
                return value;
              });
              
              return new Response(JSON.stringify(cleanData), {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers
              });
            }
          } catch (jsonErr) {
            // Not valid JSON or parsing failed, return original
          }
        }
        
        return response;
      } catch (fetchErr) {
        // Fetch failed, let it pass through
        throw fetchErr;
      }
    }

    // Pass through all other requests
    return originalFetch.apply(this, args);
  };

  // Also override XMLHttpRequest for completeness
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._anyflixUrl = url;
    this._anyflixMethod = method;
    return originalXHROpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function(body) {
    const url = this._anyflixUrl || '';
    
    // Intercept the FTL probe request (network fingerprinting)
    if (url.includes('/api/ftl/probe')) {
      console.log('Anyflix: Intercepted ftl/probe (XHR)');
      
      const fakeResponse = JSON.stringify({
        time: Date.now(),
        serverTime: Date.now()
      });
      
      // Need to properly simulate the XHR lifecycle
      const self = this;
      setTimeout(() => {
        Object.defineProperty(self, 'readyState', { value: 4, writable: false });
        Object.defineProperty(self, 'status', { value: 200, writable: false });
        Object.defineProperty(self, 'statusText', { value: 'OK', writable: false });
        Object.defineProperty(self, 'responseText', { value: fakeResponse, writable: false });
        Object.defineProperty(self, 'response', { value: fakeResponse, writable: false });
        Object.defineProperty(self, 'responseURL', { value: url, writable: false });
        
        // Trigger the state change events
        if (self.onreadystatechange) self.onreadystatechange();
        if (self.onload) self.onload();
        
        // Dispatch events for listeners
        self.dispatchEvent(new Event('readystatechange'));
        self.dispatchEvent(new Event('load'));
        self.dispatchEvent(new Event('loadend'));
      }, 5);
      
      return;
    }
    
    // Intercept GraphQL household checks
    if (url.includes('graphql') && body) {
      const bodyStr = typeof body === 'string' ? body : '';
      for (const op of BLOCKED_OPERATIONS) {
        if (bodyStr.includes(`"operationName":"${op}"`)) {
          console.log('Anyflix: Intercepted XHR household check:', op);
          
          // Create a fake response based on operation type
          let fakeResponse;
          if (op === 'CLCSInterstitialLolomo') {
            fakeResponse = JSON.stringify({ data: { clcsInterstitialLolomo: null } });
          } else if (op === 'CLCSInterstitialPlaybackAndPostPlayback') {
            fakeResponse = JSON.stringify({ data: { clcsInterstitialPlaybackAndPostPlayback: null } });
          } else {
            fakeResponse = JSON.stringify({ data: { clcsSendFeedback: { success: true } } });
          }
          
          // Simulate successful response
          Object.defineProperty(this, 'readyState', { value: 4 });
          Object.defineProperty(this, 'status', { value: 200 });
          Object.defineProperty(this, 'responseText', { value: fakeResponse });
          Object.defineProperty(this, 'response', { value: fakeResponse });
          
          setTimeout(() => {
            this.onreadystatechange?.();
            this.onload?.();
          }, 10);
          
          return;
        }
      }
    }
    return originalXHRSend.apply(this, [body]);
  };

  // Remove any existing household interstitial overlays from the DOM
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Look for the household interstitial modal
          const interstitial = node.querySelector?.('[data-uia*="interstitial"], [class*="interstitial"], [class*="borrower"]');
          if (interstitial) {
            console.log('Anyflix: Removing household interstitial overlay');
            interstitial.remove();
          }
          
          // Also check if the node itself is the interstitial
          if (node.dataset?.uia?.includes('interstitial') || 
              node.className?.includes?.('interstitial') ||
              node.className?.includes?.('borrower')) {
            console.log('Anyflix: Removing household interstitial node');
            node.remove();
          }
        }
      }
    }
    
    // Check for and resume paused video if it was interrupted
    patchNetflixState();
  });

  // Periodically check for video pause state and try to resume
  const checkAndResumeVideo = () => {
    try {
      const video = document.querySelector('video');
      if (video && video.paused && video.readyState >= 2) {
        // Check if there's an interstitial overlay causing the pause
        const overlay = document.querySelector('[data-uia*="interstitial"], [class*="interstitial"], [class*="borrower"]');
        if (overlay) {
          console.log('Anyflix: Found overlay while video paused, removing and resuming');
          overlay.remove();
          video.play().catch(() => {});
        }
      }
      
      // Also look for any modal or popup that might be blocking
      const modals = document.querySelectorAll('[class*="modal"], [class*="popup"], [class*="overlay"]');
      modals.forEach(modal => {
        const text = modal.textContent || '';
        if (text.includes('husholdning') || text.includes('household') || 
            text.includes('WiFi') || text.includes('nettverk')) {
          console.log('Anyflix: Removing household modal');
          modal.remove();
        }
      });
    } catch (e) {
      // Ignore errors
    }
  };

  // Run the check periodically
  setInterval(checkAndResumeVideo, 500);

  // Patch the video element to prevent household-triggered pauses
  const patchVideoElement = () => {
    const video = document.querySelector('video');
    if (video && !video._anyflixPatched) {
      video._anyflixPatched = true;
      
      const originalPause = video.pause.bind(video);
      let lastPlayTime = 0;
      
      video.pause = function() {
        // Check if this pause is likely from household restriction
        const timeSincePlay = Date.now() - lastPlayTime;
        const hasOverlay = document.querySelector('[data-uia*="interstitial"], [class*="interstitial"], [class*="borrower"]');
        
        // If paused very quickly after play and there's an overlay, this is likely household restriction
        if (timeSincePlay < 5000 && hasOverlay) {
          console.log('Anyflix: Blocking household-triggered pause');
          hasOverlay.remove();
          return; // Don't pause
        }
        
        return originalPause();
      };
      
      // Track when play is called
      const originalPlay = video.play.bind(video);
      video.play = function() {
        lastPlayTime = Date.now();
        return originalPlay();
      };
      
      console.log('Anyflix: Video element patched');
    }
  };

  // Check for video element periodically
  setInterval(patchVideoElement, 100);

  // Start observing once DOM is ready
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  console.log('Anyflix: Household bypass injected');
})();
