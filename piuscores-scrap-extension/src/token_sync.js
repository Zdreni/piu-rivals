import { REJECTED_TOKEN_KEY, SITE_TOKEN_KEY, TAG, TOKEN_KEY } from './config.js';

// Runs on the piu-rivals site: keeps the extension's copy of the site's login session in step with
// it, so the background worker can call the API while you're on piuscores. Signing out on the site
// removes the copy too.
const CHECK_INTERVAL_MS = 2000;


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
  if (token === (stored  ??  null)  ||  (token  &&  token === rejected))
    return;

  if (token)
    await chrome.storage.local.set({ [TOKEN_KEY]: token });
  else
    await chrome.storage.local.remove(TOKEN_KEY);

  console.log(`${TAG} ${(token  ?  'Picked up'  :  'Dropped')} the piu-rivals login session`);
}


const syncLogged = ()  =>  sync().catch((error)  =>  console.error(TAG, error));

// Signing in or out in this tab doesn't fire "storage" events, so the session is also checked
// every few seconds.
window.addEventListener('storage', syncLogged);
setInterval(syncLogged, CHECK_INTERVAL_MS);
syncLogged();
