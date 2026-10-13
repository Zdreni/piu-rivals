import { displayName } from '../storage.js';
import { text } from './common.js';

const SESSIONS_LINK_ATTR = 'data-piuscores-sessions';
const STORED_ROSTER_ATTR = 'data-piuscores-stored-roster';


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


function storedOnlyRow(playerId, player) {
  const name = typeof player?.name === 'string' && player.name ? player.name : playerId;
  const row = document.createElement('div');
  row.className = 'rvl-row';
  row.style.opacity = '0.75';

  const avatar = document.createElement('div');
  avatar.className = 'mud-avatar mud-avatar-medium mud-avatar-filled mud-avatar-filled-default mud-elevation-0';
  avatar.textContent = displayName(name).charAt(0).toUpperCase();

  const main = document.createElement('div');
  main.className = 'rvl-row-main';
  const nameEl = document.createElement('div');
  nameEl.className = 'rvl-row-name';
  nameEl.textContent = name;
  const meta = document.createElement('div');
  meta.className = 'rvl-row-meta';
  meta.textContent = typeof player?.pumbility === 'number'
    ? `Stored only · PUMBILITY ${player.pumbility.toLocaleString('en-US')}`
    : 'Stored only';
  main.append(nameEl, meta);

  row.append(avatar, main, createSessionsLink(null, playerId));
  return row;
}


// Stored players that aren't site rivals get their own roster block after the site's roster
// (kept outside it so Blazor's rows are left alone). Only shown on the "Your rivals" tab.
function renderStoredOnly(roster, players, ownPlayerId, rosterIds) {
  const existing = document.querySelector(`[${STORED_ROSTER_ATTR}]`);
  const activeTab = text(document.querySelector('.mud-tab.mud-tab-active'));
  const storedOnly = roster && (!activeTab || activeTab === 'Your rivals')
    ? Object.entries(players || {})
      .filter(([playerId]) => playerId !== ownPlayerId && !rosterIds.has(playerId))
      .sort(([, a], [, b]) => (b?.pumbility ?? -1) - (a?.pumbility ?? -1)
        || String(a?.name ?? '').localeCompare(String(b?.name ?? '')))
    : [];
  if (!storedOnly.length) {
    existing?.remove();
    return;
  }

  // Re-rendered only when the content changes, so our own DOM edits don't retrigger it endlessly.
  const signature = JSON.stringify(storedOnly.map(([playerId, p]) => [playerId, p?.name, p?.pumbility]));
  if (existing?.getAttribute(STORED_ROSTER_ATTR) === signature && existing.previousElementSibling === roster) return;
  existing?.remove();

  const block = document.createElement('div');
  block.setAttribute(STORED_ROSTER_ATTR, signature);
  block.style.marginTop = '16px';
  const caption = document.createElement('div');
  caption.className = 'rvl-row-meta';
  caption.style.margin = '0 0 8px 4px';
  caption.textContent = 'Stored in piuscores, but not your rivals on the site';
  const list = document.createElement('div');
  list.className = 'rvl-roster';
  list.append(...storedOnly.map(([playerId, player]) => storedOnlyRow(playerId, player)));
  block.append(caption, list);
  roster.after(block);
}


// Adds a Sessions button next to Compare on each roster row whose player ID is known, and lists
// stored players that aren't site rivals below the roster. Runs on every DOM change, so the
// button is fixed up when Blazor re-renders a row with another rival.
export async function runRivalsPage() {
  if (!isRivalsPage()) return;
  const roster = document.querySelector('[data-testid="rival-roster"]');
  const rows = roster ? roster.querySelectorAll('.rvl-row') : [];

  const { players, ownPlayerId } = await chrome.storage.local.get(['players', 'ownPlayerId']);
  const rivalId = rivalIdsByName(players);
  const rosterIds = new Set();

  for (const row of rows) {
    const playerId = rivalId(text(row.querySelector('.rvl-row-name')));
    if (playerId) rosterIds.add(playerId);
    const existing = row.querySelector(`[${SESSIONS_LINK_ATTR}]`);
    if (existing?.getAttribute(SESSIONS_LINK_ATTR) === playerId) continue;
    existing?.remove();
    if (!playerId) continue;

    const compare = [...row.querySelectorAll('button')].find((button) => text(button) === 'Compare');
    const link = createSessionsLink(compare, playerId);
    if (compare) compare.after(link);
    else row.append(link);
  }

  renderStoredOnly(roster, players, ownPlayerId, rosterIds);
}
