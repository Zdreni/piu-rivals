export const TAG = '[piuscores-scrap]';

export const API_URL = 'https://api.pumpking.top:6767';

// Where the piu-rivals site keeps its login session (web/src/api.ts).
export const SITE_TOKEN_KEY = 'piu-rivals.token';

// The extension's copy of that session, in chrome.storage.local.
export const TOKEN_KEY = 'token';

// A session the API turned down; not picked up again from a site tab that still holds it.
export const REJECTED_TOKEN_KEY = 'rejectedToken';
