# Anyflix

A Chrome extension that filters a small, explicit set of network requests associated with streaming verification and consent-management flows.

## Network-only design

Anyflix does not remove, hide, inspect, or modify page elements. It does not patch video playback and it does not rewrite server responses.

The extension uses two request-level mechanisms:

- `rules.json` contains declarative Chrome rules for stable URL-based requests: Netflix FTL probes, Allente session-monitoring calls, and the VG/E24 consent scripts.
- `request-blocker.js` runs only on Netflix and prevents the three known verification GraphQL operations from being dispatched. Those operations cannot be represented safely as declarative rules because they share a GraphQL URL with normal Netflix traffic and are identified by request metadata.

All blocked requests fail locally; Anyflix never fabricates a successful response. A service may handle a failed request differently after an upstream change, so request filtering cannot guarantee a particular playback or consent-flow outcome.

Rule IDs are grouped by purpose: `1001`–`1003` for consent scripts and `2001`–`2002` for URL-addressable service requests.

## Installation

1. **Clone or download this repository**

2. **Load the extension in Chrome**

   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right corner)
   - Click "Load unpacked"
   - Select the `Anyflix` folder

3. **The extension is now active!**
   - You'll see the Anyflix icon in your Chrome toolbar
   - Reload any already-open target pages

## Verifying the rules

After reloading the unpacked extension, use the browser Network panel on a target page. Matching declarative requests should be reported as blocked, while the Netflix operation-specific requests are stopped before the native `fetch` or `XMLHttpRequest` call is made. Normal GraphQL operations are intentionally left untouched.

## Disclaimer

This project is provided for educational and research purposes only. Not affiliated with or endorsed by any streaming platform. Use at your own risk and ensure compliance with applicable laws and service agreements. The author assumes no liability for any consequences resulting from use of this software. This software is provided "AS IS" without warranty of any kind.
