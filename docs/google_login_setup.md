# piu-rivals: Google login setup

One-time setup of "Sign in with Google" for piu-rivals, in the Google Cloud project `piu-rivals`. The menu names below are from the **Google Auth Platform** section of the console (older consoles call it "APIs & Services → OAuth consent screen").

1. Open <https://console.cloud.google.com>, sign in, and select (or create) the project `piu-rivals`.
2. Open **Google Auth Platform**. On **Branding**, set the app name `piu-rivals` and your support email.
3. On **Audience**, make sure the user type is **External**, then under **Publishing status** click **Publish app**. While the app is in "Testing", only the test users listed there can sign in. With only the basic `openid email profile` scopes, Google doesn't need to verify the app.
4. On **Clients**, click **Create client** and choose **Web application**. In **Authorized JavaScript origins**, add `https://zdreni.github.io`, plus `http://localhost:5173` for local development. No redirect URIs are needed.
5. Copy the **Client ID** (it ends in `.apps.googleusercontent.com`). It goes into `web/` config and `server/.env` as `GOOGLE_CLIENT_ID`. It isn't secret, and no client secret is needed: the server only checks Google's ID tokens.

Google sign-in still lets in any Google account; piu-rivals itself only lets in users an admin has added (see [the design](design.md#api)).
