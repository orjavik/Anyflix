# Anyflix

A Chrome extension that bypasses household network verification checks, allowing you to both watch your favorite shows from networks outside your registered home, and to watch more than one stream from the same account.

## Installation

1. **Clone or download this repository**

2. **Load the extension in Chrome**

   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right corner)
   - Click "Load unpacked"
   - Select the `Anyflix` folder

3. **The extension is now active!**
   - You'll see the Anyflix icon in your Chrome toolbar
   - Browse normally - household checks are bypassed

## How It Works

The extension intercepts household verification requests at multiple layers:

1. **GraphQL Interception**: Intercepts `CLCSInterstitialLolomo` (browse) and `CLCSInterstitialPlaybackAndPostPlayback` (playback) GraphQL operations and returns fake responses
2. **Session Monitoring Protection**: Blocks the `https://w-sgprod-zulu.api-canaldigital.com/v1/stream/session/*/streaming` POST used to monitor playback sessions
3. **Response Stripping**: Removes household/interstitial/borrower data from JSON API responses
4. **Video Control**: Patches video element methods to prevent household-triggered pauses
5. **DOM Cleanup**: Periodically removes verification overlays that may appear
6. **Network Requests**: Intercepts `/api/ftl/probe` network fingerprinting requests

## Disclaimer

This project is provided for educational and research purposes only. Not affiliated with or endorsed by Netflix. Use at your own risk and ensure compliance with applicable laws and service agreements. The author assumes no liability for any consequences resulting from use of this software. This software is provided "AS IS" without warranty of any kind.

---

**Note**: This extension works by intercepting household verification APIs. Providers may update their systems, which could affect the extension's functionality. Check for updates regularly.
