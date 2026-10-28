// Marks links to player profiles and Sessions pages on piuscores: a green frame for players in
// piu-rivals, an orange one for players who aren't, with a button after the link to add the player
// and scrape them. The frame is an outline, so the page's layout doesn't move.
const MARK = 'data-piu-rivals';
const BUTTON_CLASS = 'piu-rivals-scrape';
const STYLE_ID = 'piu-rivals-player-links';

const styles = `
  a[${MARK}] { border-radius: 6px; outline: 2px solid; outline-offset: 1px; }
  a[${MARK}="known"] { outline-color: #4FE33F; }
  a[${MARK}="unknown"] { outline-color: #FFB020; }
  .${BUTTON_CLASS} { display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box;
                     width: 18px; height: 18px; margin-left: 6px; padding: 0; vertical-align: middle;
                     background: #FFD400; color: #14201A; border: none; border-radius: 4px;
                     font: 700 13px/1 Roboto, Arial, sans-serif; cursor: pointer; }
  .${BUTTON_CLASS}:hover:not(:disabled) { background: #FFE34D; }
  .${BUTTON_CLASS}:disabled { opacity: .6; cursor: default; }
  .${BUTTON_CLASS}.failed { background: #FF2A00; color: #FFFFFF; }
`;


// The page may drop the style when it re-renders, so it is put back on every pass.
function addStyle() {
  if (document.getElementById(STYLE_ID))
    return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = styles;
  document.head.appendChild(style);
}


// What a player's button shows for the scrape request made from it: none yet, being sent,
// requested, or failed with a message.
function buttonState(request) {
  if (request?.state === 'sending')
    return { label: '…', title: 'Adding to piu-rivals', enabled: false };

  if (request?.state === 'requested')
    return { label: '✓', title: 'Queued for scraping on piu-rivals', enabled: false };

  if (request?.state === 'failed')
    return { label: '!', title: `${request.message}. Click to try again.`, enabled: true, failed: true };

  return { label: '+', title: 'Add to piu-rivals and scrape', enabled: true };
}


// playerIdOf gives the player a link's path leads to, or null. onScrape(playerId) asks for the
// player to be added and scraped, and answers as the background's register message does.
export function createPlayerLinks({ playerIdOf, onScrape }) {
  // Scrape requests made from the buttons, by player ID: { state, message }.
  const requests = new Map();
  let knownIds = null;

  function linkPlayerId(link) {
    return playerIdOf(new URL(link.href, location.href).pathname);
  }

  async function scrape(playerId) {
    requests.set(playerId, { state: 'sending' });
    mark(knownIds);

    const result = await onScrape(playerId);
    requests.set(playerId, (result.run
      ?  { state: 'requested' }
      :  { state: 'failed', message: result.message  ||  'Not signed in to piu-rivals as an admin' }));
    mark(knownIds);
  }

  // The page's own buttons may be in the same element as the link, so the click goes no further.
  function createButton(playerId) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = BUTTON_CLASS;
    button.dataset.player = playerId;

    button.addEventListener('click', (event)  => {
      event.preventDefault();
      event.stopPropagation();
      scrape(playerId);
    });

    return button;
  }

  function showButton(link, playerId) {
    let button = link.nextElementSibling;
    if (! button?.classList.contains(BUTTON_CLASS)) {
      button = createButton(playerId);
      link.after(button);
    }

    const { label, title, enabled, failed } = buttonState(requests.get(playerId));
    if (button.textContent !== label)
      button.textContent = label;

    button.title = title;
    button.disabled = ! enabled;
    button.classList.toggle('failed', !! failed);
  }

  // Buttons whose link is gone, leads elsewhere now, or is to a player now in piu-rivals.
  function removeStaleButtons() {
    for (const button of document.querySelectorAll(`.${BUTTON_CLASS}`)) {
      const link = button.previousElementSibling;
      const stale = ! knownIds  ||  link?.getAttribute(MARK) !== 'unknown'  ||  linkPlayerId(link) !== button.dataset.player;
      if (stale)
        button.remove();
    }
  }

  // ids is the piu-rivals players' IDs, or null to take the marks away (signed out, not an admin).
  function mark(ids) {
    knownIds = ids;
    if (knownIds)
      addStyle();

    for (const link of document.querySelectorAll('a[href]')) {
      const playerId = (knownIds  ?  linkPlayerId(link)  :  null);
      const linkMark = (playerId  ?  (knownIds.has(playerId)  ?  'known'  :  'unknown')  :  null);
      if (linkMark !== link.getAttribute(MARK)) {
        if (linkMark)
          link.setAttribute(MARK, linkMark);
        else
          link.removeAttribute(MARK);
      }

      if (linkMark === 'unknown')
        showButton(link, playerId);
    }

    removeStaleButtons();
    for (const playerId of requests.keys()) {
      if (knownIds?.has(playerId))
        requests.delete(playerId);
    }
  }

  return {
    mark,
    // Whether a player requested here isn't in piu-rivals yet, so the marks are worth checking again.
    waiting: ()  =>  [...requests.values()].some((request)  =>  request.state === 'requested'),
  };
}
