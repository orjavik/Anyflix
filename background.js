// Applies the popup settings: which rulesets are enabled and whether the
// Netflix request hook is injected. Chrome resets enabled rulesets to the
// manifest defaults on every extension update, so this also runs on install.

const DEFAULT_SETTINGS = {
  enabled: true,
  tv2BlockSession: false,
};

const NETFLIX_SCRIPT = {
  id: "netflix-request-blocker",
  matches: ["*://*.netflix.com/*"],
  js: ["request-blocker.js"],
  runAt: "document_start",
  world: "MAIN",
};

const ICONS_ON = {
  16: "icons/icon-16.png",
  48: "icons/icon-48.png",
  128: "icons/icon-128.png",
};

const ICONS_OFF = {
  16: "icons/icon-16-off.png",
  48: "icons/icon-48-off.png",
  128: "icons/icon-128-off.png",
};

const applySettings = async () => {
  const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
  const enableRulesetIds = [];
  const disableRulesetIds = [];

  (settings.enabled ? enableRulesetIds : disableRulesetIds).push("ruleset_1");
  (settings.enabled && settings.tv2BlockSession
    ? enableRulesetIds
    : disableRulesetIds
  ).push("tv2_session");

  await chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds,
    disableRulesetIds,
  });

  const registered = await chrome.scripting.getRegisteredContentScripts({
    ids: [NETFLIX_SCRIPT.id],
  });

  if (settings.enabled && registered.length === 0) {
    await chrome.scripting.registerContentScripts([NETFLIX_SCRIPT]);
  } else if (!settings.enabled && registered.length > 0) {
    await chrome.scripting.unregisterContentScripts({
      ids: [NETFLIX_SCRIPT.id],
    });
  }

  await chrome.action.setIcon({
    path: settings.enabled ? ICONS_ON : ICONS_OFF,
  });
};

// Run one apply at a time so quick toggling cannot register the script twice.
let queue = Promise.resolve();

const scheduleApply = () => {
  queue = queue
    .then(applySettings)
    .catch((error) => console.error("Anyflix: Could not apply settings:", error));
  return queue;
};

chrome.runtime.onInstalled.addListener(scheduleApply);
chrome.runtime.onStartup.addListener(scheduleApply);
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local") scheduleApply();
});
