import { config } from './config.ts';

const TOKEN_KEY = 'piu-rivals.token';
// Sent when the server no longer accepts the stored session, so the app shows the sign-in again.
export const SIGNED_OUT_EVENT = 'piu-rivals:signed-out';


export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}


// Browser storage can be unavailable (private windows, blocked site data); then the session
// lasts only until the page is reloaded.
let memoryToken: string | null = null;


export function storedToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)  ??  memoryToken;
  } catch {
    return memoryToken;
  }
}


export function storeToken(token: string | null) {
  memoryToken = token;
  try {
    if (token)
      localStorage.setItem(TOKEN_KEY, token);
    else
      localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Kept in memory only.
  }
}


// Takes the session from a "#dev_token=" link printed by `npm run dev-login` in server/.
export function takeDevToken() {
  const token = new URLSearchParams(location.hash.slice(1)).get('dev_token');
  if (! token)
    return;

  storeToken(token);
  history.replaceState(history.state, '', location.pathname + location.search);
}


export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = storedToken();
  let response: Response;
  try {
    response = await fetch(`${config.apiUrl}${path}`, {
      method,
      headers: {
        ...(token  ?  { authorization: `Bearer ${token}` }  :  {}),
        ...(body !== undefined  ?  { 'content-type': 'application/json' }  :  {}),
      },
      body: (body !== undefined  ?  JSON.stringify(body)  :  undefined),
    });
  } catch {
    throw new ApiError(0, 'The piu-rivals server is unreachable');
  }

  const data = await response.json().catch(()  =>  null);
  if (! response.ok) {
    if (response.status === 401  &&  token) {
      storeToken(null);
      window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
    }

    throw new ApiError(response.status, data?.error  ??  `Request failed (${response.status})`);
  }

  return data as T;
}


export const errorText = (error: unknown)  =>  (error instanceof Error  ?  error.message  :  String(error));
