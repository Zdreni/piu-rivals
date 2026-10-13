import { pagePlayerId, parseNumber, savePlayerInfo, text } from './common.js';


function profilePlayerId() {
  return /^\/Player\/[^/]+\/?$/.test(location.pathname) ? pagePlayerId() : null;
}


export async function runProfilePage(ownPlayerId) {
  const playerId = profilePlayerId();
  if (!playerId) return;
  const hero = document.querySelector('[data-testid="player-hero"]');
  await savePlayerInfo(
    playerId,
    text(hero?.querySelector('h5')),
    parseNumber(text(hero?.querySelector('.ph-pum .cmp-hero-num'))),
    ownPlayerId,
    'profile page',
  );
}
