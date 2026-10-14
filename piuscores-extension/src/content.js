import { createRivalsWindow } from './ui/rivals_window.js';
import { createScrapOverlay } from './ui/scrap_overlay.js';
import { migrateStorage } from './storage.js';
import { exportTargets } from './export_targets.js';
import { pagePlayerId, syncOwnPlayerId, TAG } from './page_scrappers/common.js';
import { runProfilePage } from './page_scrappers/profile.js';
import { isRivalsPage, runRivalsPage } from './page_scrappers/rivals.js';
import {
  countNewSessions, recordSessionsVisit, runSessionsPage, scrapePlayerSessions,
} from './page_scrappers/sessions.js';
import { isSessionsPage, readSessionsPage } from './page_scrappers/sessions_content.js';

const rivalsWindow = createRivalsWindow(exportTargets, pagePlayerId);
const scrapOverlay = createScrapOverlay({
  scrapeResults: scrapePlayerSessions,
  readSessionsPage,
  countNewSessions,
  onNothingToGrab: () => recordSessionsVisit().catch((error) => console.error(TAG, error)),
});

let timer = null;


async function run() {
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
  if (area !== 'local')
    return;

  if (rivalsWindow.isOpen())
    rivalsWindow.render().catch((error) => console.error(TAG, error));

  scrapOverlay.reload().catch((error) => console.error(TAG, error));
});


// Stored data is migrated before anything reads it.
let pending = migrateStorage().then(() => {
  rivalsWindow.initialize();
  return scrapOverlay.reload();
}).catch((error) => console.error(TAG, error));


const schedule = () => {
  scrapOverlay.update();
  clearTimeout(timer);

  timer = setTimeout(() => {
    pending = pending.then(run).catch((error) => console.error(TAG, error));
  }, 500);
};


new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
schedule();
