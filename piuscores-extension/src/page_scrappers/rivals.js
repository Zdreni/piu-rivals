import { displayName } from '../storage.js';
import { text } from './common.js';

const SESSIONS_LINK_ATTR = 'data-piuscores-sessions';


export function isRivalsPage() {
  return /^\/Rivals\/?$/i.test(location.pathname);
}


const nameKey = (name) => displayName(name).toLowerCase();


// Roster rows only show names, so IDs come from the rival feed links ("/Player/<id>/Sessions?session=…")
// and from stored players. Full names (with the "#1234" tag) are matched first; a tagless match
// is used only when it is unambiguous.
function rivalIdsByName(players) {
  const exact = new Map();
  const loose = new Map();
  const add = (name, playerId) => {
    if (!name || !playerId) return;
    if (!exact.has(name)) exact.set(name, playerId);
    const key = nameKey(name);
    if (loose.has(key) && loose.get(key) !== playerId) loose.set(key, null);
    else loose.set(key, playerId);
  };

  for (const link of document.querySelectorAll('[data-testid="rival-feed"] a.dash-ch-name[href]')) {
    const playerId = new URL(link.href, location.href).pathname.match(/^\/Player\/([^/]+)\/Sessions\/?$/)?.[1];
    if (playerId) add(text(link), decodeURIComponent(playerId));
  }
  for (const [playerId, player] of Object.entries(players || {})) add(player?.name, playerId);

  return (name) => exact.get(name) ?? loose.get(nameKey(name)) ?? null;
}


function createSessionsLink(compareButton, playerId) {
  const link = document.createElement('a');
  link.setAttribute(SESSIONS_LINK_ATTR, playerId);
  link.href = `/Player/${encodeURIComponent(playerId)}/Sessions`;
  // Same look as the site's Compare button next to it.
  link.className = compareButton?.className || 'mud-button-root mud-button mud-button-outlined mud-button-outlined-primary mud-button-outlined-size-small';
  link.classList.remove('mud-ripple');
  link.style.textDecoration = 'none';
  link.innerHTML = '<span class="mud-button-label">Sessions</span>';
  return link;
}


// Adds a Sessions button next to Compare on each roster row whose player ID is known. Runs on
// every DOM change, so the button is fixed up when Blazor re-renders a row with another rival.
export async function runRivalsPage() {
  if (!isRivalsPage()) return;
  const rows = document.querySelectorAll('[data-testid="rival-roster"] .rvl-row');
  if (!rows.length) return;

  const { players } = await chrome.storage.local.get('players');
  const rivalId = rivalIdsByName(players);

  for (const row of rows) {
    const playerId = rivalId(text(row.querySelector('.rvl-row-name')));
    const existing = row.querySelector(`[${SESSIONS_LINK_ATTR}]`);
    if (existing?.getAttribute(SESSIONS_LINK_ATTR) === playerId) continue;
    existing?.remove();
    if (!playerId) continue;

    const compare = [...row.querySelectorAll('button')].find((button) => text(button) === 'Compare');
    const link = createSessionsLink(compare, playerId);
    if (compare) compare.after(link);
    else row.append(link);
  }
}
