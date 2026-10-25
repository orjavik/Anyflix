# Anyflix

A Chrome extension that filters a small, explicit set of network requests associated with streaming verification, ad delivery, and consent-management flows.

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

## Popup settings

Click the Anyflix icon to open the popup.

- **Anyflix on/off** turns all filtering on or off. When it is off, no rules are active, the Netflix request hook is not injected and the toolbar icon turns grey.
- **TV 2 Play: Block session check** blocks TV 2's repeating `session/verify` call (rule `2007`). It is off by default and can only be used while Anyflix is on. See the TV 2 session check under [Known limitations](#known-limitations).

Rule changes apply to new requests right away. Reload open pages afterwards, which is also needed for the Netflix hook to be added or removed.

## Network-only design

Anyflix does not remove, hide, inspect, or modify page elements. It does not patch video playback and it does not rewrite server responses.

The extension uses two request-level mechanisms:

- `rules.json` contains declarative Chrome rules for stable URL-based requests. `rules-tv2-session.json` holds the optional TV 2 session-check rule in a separate ruleset that is disabled by default.
- `request-blocker.js` runs only on Netflix and prevents the three known verification GraphQL operations from being dispatched. Those operations cannot be represented safely as declarative rules because they share a GraphQL URL with normal Netflix traffic and are identified by request metadata.

All blocked requests fail locally; Anyflix never fabricates a successful response. A service may handle a failed request differently after an upstream change, so request filtering cannot guarantee a particular playback or consent-flow outcome.

## Covered services

| Service                       | What is blocked                                                                                                                            | Rule IDs      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| Netflix                       | FTL probe requests, plus the `CLCSInterstitialLolomo`, `CLCSInterstitialPlaybackAndPostPlayback` and `CLCSSendFeedback` GraphQL operations | `2001`        |
| Allente                       | Stream session-monitoring calls                                                                                                            | `2002`        |
| TV 2 Play                     | Ad segments under `/yos/`, the known three-segment `.mp4` ad CDN paths, and the ad beacons `/adQuartile`, `/adResume`, `/adManifest`       | `2003`–`2005` |
| TV 2 Play                     | The playback-quality (NPAW analytics) `/start` call                                                                                        | `2006`        |
| TV 2 Play (optional, off)     | The `session/verify` session check, only when enabled in the popup                                                                         | `2007`        |
| VG, E24, Minmote, Aftenposten | The Schibsted consent-management scripts                                                                                                   | `1001`–`1005` |

Everything else on these sites is deliberately left alone, including the Yospace ad-management SDK, TV 2's session check (unless enabled in the popup), other playback-quality requests, and normal Akamai playback under `/pfr/`.

`background.js` applies the popup settings. It turns the rulesets on and off and registers the Netflix hook. This uses the `storage` and `scripting` permissions.

## Known limitations

- **TV 2 Play black screen.** TV 2 stitches ads into the stream. The blocked ad segments are retried by the player before it falls back to the plain stream, so the screen can stay black for a few seconds and the timeline can jump at the start of an ad break. Blocking the stitched manifest (`/csm/`) was tried and broke playback, so it is not used.
- **TV 2 session check.** TV 2 calls `api.play.tv2.no/rest/user/session/verify` on start-up, and its response asks for a new check every 60 seconds. It is not blocked by default. Turn on **Block session check** in the popup to block it. The app waits for this call on start-up and retries failed calls with a delay, so with blocking on, the home page takes several seconds longer to load.

## Verifying the rules

After reloading the unpacked extension, use the browser Network panel on a target page. Matching declarative requests should be reported as blocked, while the Netflix operation-specific requests are stopped before the native `fetch` or `XMLHttpRequest` call is made. Normal GraphQL operations are intentionally left untouched.

## Disclaimer

This project is provided for educational and research purposes only. Not affiliated with or endorsed by any streaming platform. Use at your own risk and ensure compliance with applicable laws and service agreements. The author assumes no liability for any consequences resulting from use of this software. This software is provided "AS IS" without warranty of any kind.
