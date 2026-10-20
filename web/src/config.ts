// Set in web/.env (and web/.env.development for `npm run dev`).
export const config = {
  apiUrl: import.meta.env.VITE_API_URL as string,
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID as string,
};
