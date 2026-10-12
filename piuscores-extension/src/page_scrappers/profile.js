import { parseNumber, savePlayerInfo, text } from './common.js';

function profilePlayerId() {
  return location.pathname.match(/^\/Player\/([^/]+)\/?$/)?.[1] ?? null;
}

function addSessionsButton(playerId) {
  const block = document.querySelector('[data-testid="player-hero"] .ph-pum');
  if (!block || block.querySelector('.piuscores-sessions-btn')) return;
  const link = document.createElement('a');
  link.className = 'piuscores-sessions-btn';
  link.href = `/Player/${playerId}/Sessions`;
  link.textContent = 'Sessions →';
  link.title = 'Open this player\'s Sessions page';
  link.style.cssText = 'align-self:flex-start;margin-left:auto;padding:2px 8px;border:1px solid #4FE33F;'
    + 'border-radius:4px;color:#4FE33F;font:500 12px/1.4 Roboto,Arial,sans-serif;'
    + 'text-decoration:none;white-space:nowrap;';
  block.appendChild(link);
}

export async function runProfilePage(ui, ownPlayerId) {
  const playerId = profilePlayerId();
  if (!playerId) return;
  addSessionsButton(playerId);
  const hero = document.querySelector('[data-testid="player-hero"]');
  await savePlayerInfo(
    ui,
    playerId,
    text(hero?.querySelector('h5')),
    parseNumber(text(hero?.querySelector('.ph-pum .cmp-hero-num'))),
    ownPlayerId,
    'profile page',
  );
}
