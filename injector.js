// Anyflix - Household Bypass
// Intercepts GraphQL and XHR requests that enforce Netflix household/network checks,
// returning fake "no interstitial needed" responses so playback is never interrupted.

(function() {
  'use strict';

  // GraphQL operation names that trigger household verification popups.
  // Intercepting these prevents the interstitial from ever being shown.
  const BLOCKED_OPERATIONS = [
    'CLCSInterstitialLolomo',               // Household check on the browse page
    'CLCSInterstitialPlaybackAndPostPlayback', // Household check during/after playback
    'CLCSSendFeedback',                     // Telemetry sent after an interstitial is shown
  ];

  // CSS selector that matches household interstitial overlay elements in the DOM.
  // Used in multiple places so it's defined once here.
  const INTERSTITIAL_SELECTOR = '[data-uia*="interstitial"], [class*="interstitial"], [class*="borrower"]';

  // Streaming-session endpoint used by the Canaldigital host to monitor playback.
  // Intercepting this path prevents the monitoring POST from reaching the server.
  const STREAM_SESSION_PATH = '/v1/stream/session/';

  // ---------------------------------------------------------------------------
  // Fullscreen transition guard
  // ---------------------------------------------------------------------------
  // Netflix briefly pauses the video, adds/removes overlay elements, and
  // restructures the DOM when entering or exiting fullscreen. Without this guard,
  // our DOM observer and video-pause hook would react to those transient changes
  // and remove legitimate Netflix UI elements or force a play() call at the wrong
  // moment — causing the visible flicker.
  let isFullscreenTransitioning = false;
  let fullscreenTransitionTimer;

  // Set the guard for 800 ms on every fullscreen state change.
  // 800 ms covers Netflix's CSS transition duration with some headroom.
  const onFullscreenChange = () => {
    isFullscreenTransitioning = true;
    clearTimeout(fullscreenTransitionTimer);
    fullscreenTransitionTimer = setTimeout(() => {
      isFullscreenTransitioning = false;
    }, 800);
  };

  // Listen for both the standard and WebKit-prefixed fullscreen events.
  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange);

  // ---------------------------------------------------------------------------
  // Fake response factory
  // ---------------------------------------------------------------------------
  // Returns the JSON body Netflix expects when there is no household interstitial.
  // Centralised here so it's not duplicated across fetch and XHR interceptors.
  const fakeResponse = (operationName) => {
    let data;
    if (operationName === 'CLCSInterstitialLolomo') {
      // null tells the browse page renderer not to show any interstitial lolomo row
      data = { clcsInterstitialLolomo: null };
    } else if (operationName === 'CLCSInterstitialPlaybackAndPostPlayback') {
      // null tells the player not to pause and show an interstitial
      data = { clcsInterstitialPlaybackAndPostPlayback: null };
    } else {
      // CLCSSendFeedback — acknowledge the telemetry call with a success flag
      data = { clcsSendFeedback: { success: true } };
    }
    return JSON.stringify({ data });
  };

  // Wraps fakeResponse() in a fetch Response object ready to return from the
  // fetch interceptor.
  const fakeJsonResponse = (operationName) => new Response(fakeResponse(operationName), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  // ---------------------------------------------------------------------------
  // Fetch interceptor
  // ---------------------------------------------------------------------------
  // Wraps window.fetch to intercept three categories of request:
  //   1. /api/ftl/probe  — network-topology fingerprinting; return a fake timestamp
  //   2. graphql         — household check operations; return a fake null response
  //   3. *.netflix.com and api-canaldigital.com — strip any interstitial/borrower/household keys from JSON
  const originalFetch = window.fetch;

  window.fetch = async function(...args) {
    const [resource, config] = args;
    const url = typeof resource === 'string' ? resource : resource?.url;

    if (url && url.includes('api-canaldigital.com') && url.includes(STREAM_SESSION_PATH) && url.includes('/streaming')) {
      console.log('Anyflix: Intercepted stream session monitoring request (fetch)');
      return new Response('', {
        status: 204,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    // FTL probe: Netflix uses this to detect whether two devices share a local
    // network (a proxy/VPN would give different latency). Returning a plausible
    // timestamp prevents the check from triggering a household warning.
    if (url && url.includes('/api/ftl/probe')) {
      console.log('Anyflix: Intercepted ftl/probe (fetch)');
      return new Response(JSON.stringify({ time: Date.now(), serverTime: Date.now() }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // GraphQL household check: resolve the operation name from either the
    // custom request header (primary path) or the request body (fallback).
    if (url && url.includes('graphql')) {
      try {
        const operationName =
          config?.headers?.['x-netflix.context.operation-name'] ??
          (() => {
            const bodyStr = typeof config?.body === 'string' ? config.body : '';
            // Body-based detection for clients that don't set the custom header
            return BLOCKED_OPERATIONS.find(op => bodyStr.includes(`"operationName":"${op}"`));
          })();

        if (operationName && BLOCKED_OPERATIONS.includes(operationName)) {
          console.log('Anyflix: Intercepted household check:', operationName);
          return fakeJsonResponse(operationName);
        }
      } catch (e) {
        console.error('Anyflix: Error intercepting request:', e);
      }
    }

    // Response scrubbing: for any JSON response from Netflix domains, remove
    // keys that relate to household/interstitial state. This is a safety net for
    // operation names or endpoints not covered above.
    if (url && (url.includes('netflix.com') || url.includes('nflxvideo.net') || url.includes('api-canaldigital.com'))) {
      try {
        const response = await originalFetch.apply(this, args);
        const contentType = response.headers.get('content-type') || '';

        if (contentType.includes('application/json')) {
          try {
            const data = await response.clone().json();
            const dataStr = JSON.stringify(data);

            // Only pay the cost of re-serialisation when relevant keys are present
            if (dataStr.includes('interstitial') || dataStr.includes('borrower') ||
                dataStr.includes('household') || dataStr.includes('CLCS')) {
              console.log('Anyflix: Stripping household data from response');
              // Reviver function nulls out interstitial/borrower keys recursively
              const cleanData = JSON.parse(dataStr, (key, value) => {
                if (key.toLowerCase().includes('interstitial')) return null;
                if (key.toLowerCase().includes('borrower') && typeof value === 'object') return null;
                return value;
              });
              return new Response(JSON.stringify(cleanData), {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
              });
            }
          } catch (_) {
            // Response is not valid JSON — return the original unchanged
          }
        }

        return response;
      } catch (fetchErr) {
        // Network error (e.g. blocked by uBlock); re-throw so the caller handles it
        throw fetchErr;
      }
    }

    // All other requests pass through unmodified
    return originalFetch.apply(this, args);
  };

  // ---------------------------------------------------------------------------
  // XHR interceptor
  // ---------------------------------------------------------------------------
  // Some Netflix code paths use XMLHttpRequest instead of fetch; this mirrors
  // the same ftl/probe and GraphQL interception logic for those paths.
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  // Store the URL on the instance so send() can inspect it
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._anyflixUrl = url;
    return originalXHROpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function(body) {
    const url = this._anyflixUrl || '';

    if (url.includes('api-canaldigital.com') && url.includes(STREAM_SESSION_PATH) && url.includes('/streaming')) {
      console.log('Anyflix: Intercepted stream session monitoring request (XHR)');
      const self = this;
      setTimeout(() => {
        Object.defineProperty(self, 'readyState', { value: 4, writable: false });
        Object.defineProperty(self, 'status', { value: 204, writable: false });
        Object.defineProperty(self, 'statusText', { value: 'No Content', writable: false });
        Object.defineProperty(self, 'responseText', { value: '', writable: false });
        Object.defineProperty(self, 'response', { value: '', writable: false });
        Object.defineProperty(self, 'responseURL', { value: url, writable: false });
        if (self.onreadystatechange) self.onreadystatechange();
        if (self.onload) self.onload();
        self.dispatchEvent(new Event('readystatechange'));
        self.dispatchEvent(new Event('load'));
        self.dispatchEvent(new Event('loadend'));
      }, 5);
      return;
    }

    // FTL probe via XHR: simulate a complete, successful response synchronously
    // via setTimeout to match the async behaviour the caller expects.
    if (url.includes('/api/ftl/probe')) {
      console.log('Anyflix: Intercepted ftl/probe (XHR)');
      const responseText = JSON.stringify({ time: Date.now(), serverTime: Date.now() });
      const self = this;
      setTimeout(() => {
        // Populate all properties the caller may read
        Object.defineProperty(self, 'readyState', { value: 4, writable: false });
        Object.defineProperty(self, 'status', { value: 200, writable: false });
        Object.defineProperty(self, 'statusText', { value: 'OK', writable: false });
        Object.defineProperty(self, 'responseText', { value: responseText, writable: false });
        Object.defineProperty(self, 'response', { value: responseText, writable: false });
        Object.defineProperty(self, 'responseURL', { value: url, writable: false });
        // Fire all the standard completion callbacks/events
        if (self.onreadystatechange) self.onreadystatechange();
        if (self.onload) self.onload();
        self.dispatchEvent(new Event('readystatechange'));
        self.dispatchEvent(new Event('load'));
        self.dispatchEvent(new Event('loadend'));
      }, 5);
      return; // Prevent the real request from being sent
    }

    // GraphQL household check via XHR: scan the request body for the operation name
    if (url.includes('graphql') && body) {
      const bodyStr = typeof body === 'string' ? body : '';
      const matched = BLOCKED_OPERATIONS.find(op => bodyStr.includes(`"operationName":"${op}"`));
      if (matched) {
        console.log('Anyflix: Intercepted XHR household check:', matched);
        const responseText = fakeResponse(matched);
        // Set response properties before firing callbacks
        Object.defineProperty(this, 'readyState', { value: 4 });
        Object.defineProperty(this, 'status', { value: 200 });
        Object.defineProperty(this, 'responseText', { value: responseText });
        Object.defineProperty(this, 'response', { value: responseText });
        setTimeout(() => {
          this.onreadystatechange?.();
          this.onload?.();
        }, 10);
        return; // Prevent the real request from being sent
      }
    }

    return originalXHRSend.apply(this, [body]);
  };

  // ---------------------------------------------------------------------------
  // DOM observer: remove interstitial overlay elements
  // ---------------------------------------------------------------------------
  // Watches for household interstitial nodes being inserted into the DOM and
  // removes them immediately. This handles cases where the interstitial renders
  // before our fetch/XHR intercepts can suppress the triggering request.
  // Skipped during fullscreen transitions to avoid removing transient Netflix
  // UI elements that share class names with interstitials.
  const observer = new MutationObserver((mutations) => {
    if (isFullscreenTransitioning) return; // Don't touch DOM during fullscreen animations

    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;

        // Check descendants first (interstitial may be nested inside another element)
        const interstitial = node.querySelector?.(INTERSTITIAL_SELECTOR);
        if (interstitial) {
          console.log('Anyflix: Removing household interstitial overlay');
          interstitial.remove();
        }

        // Also check the node itself in case it is the interstitial root
        if (node.dataset?.uia?.includes('interstitial') ||
            node.className?.includes?.('interstitial') ||
            node.className?.includes?.('borrower')) {
          console.log('Anyflix: Removing household interstitial node');
          node.remove();
        }
      }
    }
  });

  const startObserver = () => observer.observe(document.body, { childList: true, subtree: true });
  if (document.body) {
    startObserver();
  } else {
    document.addEventListener('DOMContentLoaded', startObserver);
  }

  // ---------------------------------------------------------------------------
  // Periodic household overlay / modal check
  // ---------------------------------------------------------------------------
  // Belt-and-suspenders sweep that runs every 500 ms to catch interstitials that
  // slip past the mutation observer (e.g. added before observation started).
  // Skipped during fullscreen transitions to prevent spurious video.play() calls
  // that would cause a visible flicker during the animation.
  const checkAndResumeVideo = () => {
    if (isFullscreenTransitioning) return;
    try {
      const video = document.querySelector('video');
      // If the video is paused and there is an interstitial overlay, remove the
      // overlay and resume — the pause was caused by the household check, not the user.
      if (video && video.paused && video.readyState >= 2) {
        const overlay = document.querySelector(INTERSTITIAL_SELECTOR);
        if (overlay) {
          console.log('Anyflix: Found overlay while video paused, removing and resuming');
          overlay.remove();
          video.play().catch(() => {});
        }
      }

      // Scan for any modal/popup/overlay whose text content contains household
      // keywords (Norwegian and English). Only text-matched elements are removed
      // to avoid false positives against legitimate Netflix UI.
      const modals = document.querySelectorAll('[class*="modal"], [class*="popup"], [class*="overlay"]');
      modals.forEach(modal => {
        const text = modal.textContent || '';
        if (text.includes('husholdning') || text.includes('household') ||
            text.includes('WiFi') || text.includes('nettverk')) {
          console.log('Anyflix: Removing household modal');
          modal.remove();
        }
      });
    } catch (_) {
      // Silently ignore errors — Netflix may restructure the DOM at any time
    }
  };

  setInterval(checkAndResumeVideo, 500);

  // ---------------------------------------------------------------------------
  // Video element patch: block household-triggered pauses
  // ---------------------------------------------------------------------------
  // Overrides video.pause() to detect and suppress pauses that are caused by
  // a household interstitial rather than by the user. If a pause is requested
  // within 5 seconds of the last play() call AND an interstitial overlay is
  // present, the pause is blocked and the overlay is removed instead.
  //
  // Uses a MutationObserver (rather than a polling interval) to detect when
  // Netflix inserts a new <video> element, so patching happens immediately
  // without burning CPU on a tight interval.
  const patchVideoElement = (video) => {
    if (video._anyflixPatched) return; // Don't double-patch the same element
    video._anyflixPatched = true;

    const originalPause = video.pause.bind(video);
    const originalPlay = video.play.bind(video);
    let lastPlayTime = 0; // Timestamp of the most recent play() call

    video.pause = function() {
      // Always allow pauses during fullscreen transitions; the player needs them
      // for its own resize/layout logic and blocking them causes the flicker.
      if (isFullscreenTransitioning) return originalPause();

      const timeSincePlay = Date.now() - lastPlayTime;
      const hasOverlay = document.querySelector(INTERSTITIAL_SELECTOR);

      // Heuristic: a pause within 5 s of play() while an interstitial exists is
      // almost certainly a household-triggered pause, not a user action.
      if (timeSincePlay < 5000 && hasOverlay) {
        console.log('Anyflix: Blocking household-triggered pause');
        hasOverlay.remove();
        return; // Suppress the pause
      }

      return originalPause();
    };

    // Track the last play time so the pause heuristic above has a reference point
    video.play = function() {
      lastPlayTime = Date.now();
      return originalPlay();
    };

    console.log('Anyflix: Video element patched');
  };

  // Re-run patchVideoElement whenever new elements are added to the DOM;
  // Netflix can swap out the <video> element (e.g. on track/quality change).
  const videoObserver = new MutationObserver(() => {
    document.querySelectorAll('video').forEach(patchVideoElement);
  });

  const startVideoObserver = () => {
    // Patch any <video> elements already in the DOM before the observer starts
    document.querySelectorAll('video').forEach(patchVideoElement);
    videoObserver.observe(document.body, { childList: true, subtree: true });
  };

  if (document.body) {
    startVideoObserver();
  } else {
    document.addEventListener('DOMContentLoaded', startVideoObserver);
  }

  console.log('Anyflix: Household bypass injected');
})();
