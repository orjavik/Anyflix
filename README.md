# Anyflix

A Chrome extension that bypasses household network verification checks, allowing you to watch your favorite shows from networks outside your registered home.

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
2. **Response Stripping**: Removes household/interstitial/borrower data from all JSON API responses
3. **Video Control**: Patches video element methods to prevent household-triggered pauses
4. **DOM Cleanup**: Periodically removes verification overlays that may appear
5. **Network Requests**: Intercepts `/api/ftl/probe` network fingerprinting requests

## Disclaimer

This extension is provided for educational purposes. Use at your own risk and in compliance with Terms of Service and local laws. The author is not responsible for account suspension or other consequences of using this extension. The extension is not to be distributed.

---

**Note**: This extension works by intercepting household verification APIs. Providers may update their systems, which could affect the extension's functionality. Check for updates regularly.
