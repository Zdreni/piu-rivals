import { buttonStack, uiRoot, useStyles } from './ui_host.js';

const fmt = (n) => (n === null || n === undefined ? '—' : n.toLocaleString('en-US'));

// Ordered last, so it stays under the RIVALS button whichever is placed first.
const scrapOverlayStyles = `
  .scrap-results { order: 1; }
  .scrap-results:disabled { color: #2F782B; border-color: #2F782B; cursor: default; }
`;


function isPlayerSessionsPage() {
  return /^\/Player\/[^/]+\/Sessions\/?$/i.test(location.pathname);
}


function isPlayerProfilePage() {
  return /^\/Player\/[^/]+\/?$/i.test(location.pathname);
}


// "N+" means every session on the page is new, so older pages may hold more. PB is left out
// until the PUMBILITY of the newest session can be read.
function scrapLabel(info) {
  if (!info) return 'Loading sessions...';
  const { count, more, known, name, pumbility } = info;
  if (count === 0) return 'No new sessions to grab';
  if (!known) return `Add player '${name}'${pumbility === null ? '' : ` PB ${fmt(pumbility)}`} and scrap his results`;
  const sessions = `${count}${more ? '+' : ''} session${count === 1 && !more ? '' : 's'}`;
  return `Grab scores from ${sessions}`;
}


// The grab scores button, shown on player profile and Sessions pages, under the RIVALS button.
// `update` refreshes it after the page or the scrap info changed. `onNothingToGrab` is called once
// per opened Sessions page, when the button first shows there are no new sessions to grab.
export function createScrapOverlay(scrapeResults, getScrapInfo, onNothingToGrab) {
  let isScraping = false;
  let scrapStatus = null;
  // The finished message stays until another page is opened.
  let finishedPath = null;
  let readyPath = null;

  useStyles('scrap', scrapOverlayStyles);
  const button = document.createElement('button');
  button.className = 'btn scrap-results';
  button.type = 'button';
  buttonStack().appendChild(button);

  // The scrap info is null until the Sessions page has loaded its cards and the stored
  // checkpoint is known, so the button stays disabled until the session count is final.
  function update() {
    uiRoot();
    button.hidden = !isPlayerSessionsPage() && !isPlayerProfilePage();
    if (isPlayerProfilePage()) {
      button.disabled = false;
      button.textContent = 'Open sessions to grab scores';
      return;
    }
    if (finishedPath !== null && finishedPath !== location.pathname) {
      finishedPath = null;
      scrapStatus = null;
    }
    const info = getScrapInfo();
    if (info && readyPath !== location.pathname) {
      readyPath = location.pathname;
      if (info.count === 0) onNothingToGrab();
    }
    button.disabled = isScraping || finishedPath !== null || !info || info.count === 0;
    const label = scrapStatus ?? scrapLabel(info);
    if (button.textContent !== label) button.textContent = label;
  }

  button.addEventListener('click', async () => {
    if (isPlayerProfilePage()) {
      location.assign(`${location.pathname.replace(/\/$/, '')}/Sessions`);
      return;
    }
    isScraping = true;
    update();
    try {
      const finished = await scrapeResults((status) => {
        scrapStatus = status;
        update();
      });
      if (finished) finishedPath = location.pathname;
    } catch (error) {
      console.error('[piuscores] Unable to scrape player sessions', error);
      scrapStatus = 'Scraping failed';
    } finally {
      isScraping = false;
      update();
      if (finishedPath === null) {
        setTimeout(() => {
          scrapStatus = null;
          update();
        }, 2500);
      }
    }
  });

  update();
  return { update };
}
