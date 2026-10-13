import { createRivalsWindow } from './ui/rivals_window.js';
import { createScrapOverlay } from './ui/scrap_overlay.js';
import { STORAGE_VERSION } from './storage.js';
import { exportTargets } from './export_targets.js';
import { syncOwnPlayerId, TAG } from './page_scrappers/common.js';
import { runProfilePage } from './page_scrappers/profile.js';
import { isRivalsPage, runRivalsPage } from './page_scrappers/rivals.js';
import {
  getScrapInfo, isSessionsPage, loadScrapState, runSessionsPage, scrapePlayerSessions,
} from './page_scrappers/sessions.js';

const rivalsWindow = createRivalsWindow(exportTargets);
rivalsWindow.initialize();
const scrapOverlay = createScrapOverlay(scrapePlayerSessions, getScrapInfo);
let timer = null;


async function ensureStorageVersion() {
  const { storageVersion } = await chrome.storage.local.get('storageVersion');
  if (storageVersion === undefined) {
    await chrome.storage.local.set({ storageVersion: STORAGE_VERSION });
  } else if (storageVersion !== STORAGE_VERSION) {
    console.warn(`${TAG} Stored data version ${storageVersion} differs from supported version ${STORAGE_VERSION}`);
  }
}


async function run() {
  await ensureStorageVersion();
  const ownPlayerId = await syncOwnPlayerId();
  if (isRivalsPage()) {
    await runRivalsPage();
    return;
  }
  if (isSessionsPage()) {
    await runSessionsPage(ownPlayerId);
    return;
  }
  await runProfilePage(ownPlayerId);
}


chrome.storage.onChanged.addListener((_, area) => {
  if (area !== 'local') return;
  if (rivalsWindow.isOpen()) rivalsWindow.render().catch((error) => console.error(TAG, error));
  loadScrapState().then(() => scrapOverlay.update()).catch((error) => console.error(TAG, error));
});

loadScrapState().then(() => scrapOverlay.update()).catch((error) => console.error(TAG, error));

let pending = Promise.resolve();
const schedule = () => {
  scrapOverlay.update();
  clearTimeout(timer);
  timer = setTimeout(() => {
    pending = pending.then(run).catch((error) => console.error(TAG, error));
  }, 500);
};

new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
schedule();
