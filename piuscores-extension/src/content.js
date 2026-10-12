import { createScoresUI } from './ui/rivals.js';
import { STORAGE_VERSION } from './storage.js';
import { exportTargets } from './export_targets.js';
import { syncOwnPlayerId, TAG } from './page_scrappers/common.js';
import { runProfilePage } from './page_scrappers/profile.js';
import { runRivalCompare } from './page_scrappers/rival_compare.js';
import {
  isSessionsContentLoaded, isSessionsPage, runSessionsPage, scrapePlayerSessions,
} from './page_scrappers/sessions.js';

const ui = createScoresUI(
  exportTargets,
  (report) => scrapePlayerSessions(ui, report),
  isSessionsContentLoaded,
);
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
  if (isSessionsPage()) {
    await runSessionsPage(ui, ownPlayerId);
    return;
  }
  await runProfilePage(ui, ownPlayerId);
  await runRivalCompare(ui, ownPlayerId);
}


chrome.storage.onChanged.addListener((_, area) => {
  if (area === 'local' && ui.isOpen()) ui.render().catch((error) => console.error(TAG, error));
});

ui.initialize();

let pending = Promise.resolve();
const schedule = () => {
  ui.ensure();
  clearTimeout(timer);
  timer = setTimeout(() => {
    pending = pending.then(run).catch((error) => console.error(TAG, error));
  }, 500);
};

new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
schedule();
