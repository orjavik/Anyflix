const DEFAULT_SETTINGS = {
  enabled: true,
  tv2BlockSession: false,
};

const enabledInput = document.getElementById("enabled");
const tv2SessionInput = document.getElementById("tv2-block-session");

document.getElementById("version").textContent =
  `v${chrome.runtime.getManifest().version}`;

const render = (settings) => {
  enabledInput.checked = settings.enabled;
  tv2SessionInput.checked = settings.tv2BlockSession;
  tv2SessionInput.disabled = !settings.enabled;

  document.body.classList.toggle("paused", !settings.enabled);
  document.getElementById("status-text").textContent = settings.enabled
    ? "Active"
    : "Paused";
  document.getElementById("master-hint").textContent = settings.enabled
    ? "Filtering requests"
    : "Nothing is blocked";
};

const save = async (changes) => {
  await chrome.storage.local.set(changes);
  render(await chrome.storage.local.get(DEFAULT_SETTINGS));
};

enabledInput.addEventListener("change", () =>
  save({ enabled: enabledInput.checked }),
);
tv2SessionInput.addEventListener("change", () =>
  save({ tv2BlockSession: tv2SessionInput.checked }),
);

chrome.storage.local.get(DEFAULT_SETTINGS).then(render);
