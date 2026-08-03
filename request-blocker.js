// Anyflix keeps this hook deliberately limited to request dispatch.
// It never reads or changes page elements, playback state, or response bodies.

(() => {
  'use strict';

  const INSTALL_MARKER = Symbol.for('anyflix.networkRequestBlockerInstalled');

  if (globalThis[INSTALL_MARKER]) return;

  Object.defineProperty(globalThis, INSTALL_MARKER, { value: true });

  const BLOCKED_OPERATIONS = new Set([
    'CLCSInterstitialLolomo',
    'CLCSInterstitialPlaybackAndPostPlayback',
    'CLCSSendFeedback',
  ]);
  const OPERATION_HEADER = 'x-netflix.context.operation-name';

  const isBlockedOperation = (operationName) =>
    typeof operationName === 'string' && BLOCKED_OPERATIONS.has(operationName);

  const getHeader = (headers, headerName) => {
    if (!headers) return undefined;

    try {
      if (typeof headers.get === 'function') {
        return headers.get(headerName) ?? undefined;
      }

      if (Array.isArray(headers)) {
        const entry = headers.find(([name]) => name.toLowerCase() === headerName);
        return entry?.[1];
      }

      if (typeof headers === 'object') {
        const key = Object.keys(headers).find(
          (name) => name.toLowerCase() === headerName,
        );
        return key ? headers[key] : undefined;
      }
    } catch (_) {
      // An unusual Headers-like object must not prevent the original request.
    }

    return undefined;
  };

  const getOperationFromBody = (body) => {
    if (typeof body === 'string') {
      try {
        return JSON.parse(body)?.operationName;
      } catch (_) {
        const match = /"operationName"\s*:\s*"([^"]+)"/.exec(body);
        return match?.[1];
      }
    }

    if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
      return body.get('operationName') ?? undefined;
    }

    if (typeof FormData !== 'undefined' && body instanceof FormData) {
      const operationName = body.get('operationName');
      return typeof operationName === 'string' ? operationName : undefined;
    }

    return undefined;
  };

  const getBlockedOperation = (headers, body) => {
    const headerOperation = getHeader(headers, OPERATION_HEADER);

    if (isBlockedOperation(headerOperation)) return headerOperation;

    const bodyOperation = getOperationFromBody(body);
    return isBlockedOperation(bodyOperation) ? bodyOperation : undefined;
  };

  const isNetflixGraphqlRequest = (requestUrl) => {
    if (!requestUrl) return false;

    try {
      const url = new URL(requestUrl, globalThis.location.href);
      const isNetflixHost =
        url.hostname === 'netflix.com' || url.hostname.endsWith('.netflix.com');

      return isNetflixHost && url.pathname.toLowerCase().includes('graphql');
    } catch (_) {
      return false;
    }
  };

  const getRequestUrl = (resource) => {
    if (typeof resource === 'string') return resource;
    if (resource instanceof URL) return resource.href;
    return resource?.url;
  };

  const requestHasOwnBody = (init) =>
    init && Object.prototype.hasOwnProperty.call(init, 'body') && init.body !== undefined;

  const getFetchBlockedOperation = (resource, init) => {
    if (!isNetflixGraphqlRequest(getRequestUrl(resource))) return null;

    const headers = init?.headers ?? resource?.headers;
    const headerOperation = getBlockedOperation(headers);

    if (headerOperation) return Promise.resolve(headerOperation);

    if (requestHasOwnBody(init)) {
      return Promise.resolve(getBlockedOperation(undefined, init.body));
    }

    if (resource instanceof Request) {
      try {
        return resource
          .clone()
          .text()
          .then((body) => getBlockedOperation(undefined, body))
          .catch(() => undefined);
      } catch (_) {
        // A consumed body should use the browser's normal fetch behaviour.
      }
    }

    return Promise.resolve(undefined);
  };

  const blockedRequestError = () => {
    const message = 'Request blocked by Anyflix.';
    return typeof DOMException === 'function'
      ? new DOMException(message, 'NetworkError')
      : new TypeError(message);
  };

  const originalFetch = globalThis.fetch;

  globalThis.fetch = function anyflixFetch(resource, init) {
    const blockedOperation = getFetchBlockedOperation(resource, init);

    if (!blockedOperation) {
      return originalFetch.apply(this, arguments);
    }

    return blockedOperation.then((operationName) => {
      if (!operationName) return originalFetch.apply(this, arguments);

      console.info('Anyflix: Blocked Netflix request:', operationName);
      throw blockedRequestError();
    });
  };

  const requestMetadata = new WeakMap();
  const originalXhrOpen = XMLHttpRequest.prototype.open;
  const originalXhrSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  const originalXhrSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function anyflixOpen(method, url, ...rest) {
    requestMetadata.set(this, {
      headers: new Map(),
      url: String(url),
    });

    return originalXhrOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.setRequestHeader = function anyflixSetRequestHeader(name, value) {
    const metadata = requestMetadata.get(this);

    if (metadata) {
      const headerName = String(name).toLowerCase();
      const previousValue = metadata.headers.get(headerName);
      const nextValue = String(value);
      metadata.headers.set(
        headerName,
        previousValue ? `${previousValue}, ${nextValue}` : nextValue,
      );
    }

    return originalXhrSetRequestHeader.call(this, name, value);
  };

  XMLHttpRequest.prototype.send = function anyflixSend(body) {
    const metadata = requestMetadata.get(this);
    const operationName = getBlockedOperation(metadata?.headers, body);

    if (metadata && isNetflixGraphqlRequest(metadata.url) && operationName) {
      console.info('Anyflix: Blocked Netflix request:', operationName);
      this.abort();

      queueMicrotask(() => {
        this.dispatchEvent(new Event('error'));
        this.dispatchEvent(new Event('loadend'));
      });
      return undefined;
    }

    return originalXhrSend.call(this, body);
  };
})();
