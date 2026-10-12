import { pagePlayerId, parseNumber, savePlayerInfo, text } from './common.js';


function profilePlayerId() {
  return /^\/Player\/[^/]+\/?$/.test(location.pathname) ? pagePlayerId() : null;
}


export async function runProfilePage(ui, ownPlayerId) {
  const playerId = profilePlayerId();
  if (!playerId) return;
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
