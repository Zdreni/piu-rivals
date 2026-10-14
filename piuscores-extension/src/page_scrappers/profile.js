import { pagePlayerId, parseNumber, savePlayerInfo, text } from './common.js';


function profilePlayerId() {
  return /^\/Player\/[^/]+\/?$/.test(location.pathname) ? pagePlayerId() : null;
}


export async function runProfilePage(ownPlayerId) {
  const playerId = profilePlayerId();
  if (! playerId)
    return;

  const profileHeader = document.querySelector('[data-testid="player-hero"]');
  await savePlayerInfo(
    playerId,
    text(profileHeader?.querySelector('h5')),
    parseNumber(text(profileHeader?.querySelector('.ph-pum .cmp-hero-num'))),
    ownPlayerId,
    'profile page',
  );
}
