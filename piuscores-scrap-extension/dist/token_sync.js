(() => {
  // src/config.js
  var TAG = "[piuscores-scrap]";
  var SITE_TOKEN_KEY = "piu-rivals.token";
  var TOKEN_KEY = "token";
  var REJECTED_TOKEN_KEY = "rejectedToken";

  // src/token_sync.js
  var CHECK_INTERVAL_MS = 2e3;
  function siteToken() {
    try {
      return localStorage.getItem(SITE_TOKEN_KEY);
    } catch {
      return null;
    }
  }
  async function sync() {
    const token = siteToken();
    const { [TOKEN_KEY]: stored, [REJECTED_TOKEN_KEY]: rejected } = await chrome.storage.local.get([TOKEN_KEY, REJECTED_TOKEN_KEY]);
    if (token === (stored ?? null) || token && token === rejected)
      return;
    if (token)
      await chrome.storage.local.set({ [TOKEN_KEY]: token });
    else
      await chrome.storage.local.remove(TOKEN_KEY);
    console.log(`${TAG} ${token ? "Picked up" : "Dropped"} the piu-rivals login session`);
  }
  var syncLogged = () => sync().catch((error) => console.error(TAG, error));
  window.addEventListener("storage", syncLogged);
  setInterval(syncLogged, CHECK_INTERVAL_MS);
  syncLogged();
})();
