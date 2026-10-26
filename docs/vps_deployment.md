# piu-rivals: VPS deployment

How to run the piu-rivals server (API and scrape worker) on the VPS. The commands assume
Ubuntu or Debian with `sudo`; adjust package commands for other systems.

```
https://api.pumpking.top:6767  →  nginx (TLS)  →  127.0.0.1:9876  piu-rivals-api     ┐
                                                                  piu-rivals-worker  ┴─ MySQL piurivals
```

The site on GitHub Pages calls the API at `https://api.pumpking.top:6767` (set in `web/.env`).
Node only listens on `127.0.0.1:9876`; nginx is the only thing reachable from outside.

## 1. Before you start

- **DNS:** an `A` record for `api.pumpking.top` pointing to the VPS's IP address.
- **Packages:** Node 22 or newer (`node -v`), MySQL 8, nginx, git, and pm2:

  ```sh
  sudo npm install -g pm2
  ```

- **Firewall:** port 6767 must be open for the API, and port 80 while getting the TLS
  certificate. With ufw:

  ```sh
  sudo ufw allow 6767/tcp
  sudo ufw allow 80/tcp
  ```

  Also open 6767 in your VPS provider's firewall, if it has one.

## 2. Get the code

```sh
cd ~   # the guide uses /home/piutop/piu-rivals; any folder works
git clone https://github.com/Zdreni/piu-rivals.git
cd piu-rivals
npm ci
cd server
npx playwright install --with-deps chromium   # Chromium for the scrape worker, plus the system libraries it needs
```

## 3. Database

In `sudo mysql` (or `mysql -u root -p`):

```sql
CREATE DATABASE piurivals CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'piurivals'@'localhost' IDENTIFIED BY '<a strong password>';
GRANT ALL PRIVILEGES ON piurivals.* TO 'piurivals'@'localhost';
```

## 4. Configuration

Create `server/.env` (it stays on the VPS and is never committed):

```sh
DATABASE_URL=mysql://piurivals:<the password>@localhost:3306/piurivals
GOOGLE_CLIENT_ID=313841359336-54sso15hgflfia5h767gqrtab8emui7n.apps.googleusercontent.com
ADMIN_EMAILS=zdreni@gmail.com
```

The defaults cover the rest: the API listens on `127.0.0.1:9876`, and allows requests from
`https://zdreni.github.io`. See `server/.env.example` for every setting.

Then create the tables:

```sh
npm run migrate
```

## 5. Start the API and the worker

From `server/`:

```sh
pm2 start ecosystem.config.cjs   # starts piu-rivals-api and piu-rivals-worker
pm2 save
pm2 startup                      # prints a command; run it, so pm2 starts again after a reboot
curl http://127.0.0.1:9876/health   # → {"ok":true}
```

Logs: `pm2 logs piu-rivals-api`, `pm2 logs piu-rivals-worker` (add `--nostream` to print and exit).
If an app keeps restarting with empty logs, run it directly to see the error:
`node --import tsx src/server.ts` (or `src/worker.ts`) from `server/`.

## 6. TLS certificate

Get a Let's Encrypt certificate for `api.pumpking.top`. certbot proves the domain over port 80:

```sh
sudo apt install certbot python3-certbot-nginx
sudo certbot certonly --nginx -d api.pumpking.top
```

certbot renews it automatically; the renewal also uses port 80, so keep it open.

## 7. nginx

Create `/etc/nginx/sites-available/piu-rivals-api`:

```nginx
server {
    listen 6767 ssl;
    listen [::]:6767 ssl;
    server_name api.pumpking.top;

    ssl_certificate     /etc/letsencrypt/live/api.pumpking.top/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.pumpking.top/privkey.pem;

    # Best results are large JSON responses that compress well.
    gzip on;
    gzip_types application/json;

    location / {
        proxy_pass http://127.0.0.1:9876;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Turn it on:

```sh
sudo ln -s /etc/nginx/sites-available/piu-rivals-api /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
curl https://api.pumpking.top:6767/health   # → {"ok":true}, from any machine
```

## 8. First use

1. Open <https://zdreni.github.io/piu-rivals/> and sign in with zdreni@gmail.com; you become an admin.
2. **Players → Register players**: paste the PIU Scores links of the players to add. Each is added and
   its whole Phoenix 2 history scraped; follow the runs on **Scraping**.
3. Later, **Scraping → Scrape all players** picks up everyone's new sessions. A first full scrape of
   many players takes a long time (expect most of a day for hundreds of players).
4. **Users**: add the other people's Google emails and link each one to their player.

## Updating

Every push to `main` that changes `server/` or `shared/` deploys itself (set it up once, below).
By hand, from the repo folder:

```sh
bash server/deploy.sh   # latest origin/main; or pass a commit hash
```

[`server/deploy.sh`](../server/deploy.sh) moves the checkout to the commit and, only when
`package-lock.json` changed, runs `npm ci` and installs Playwright's Chromium. Then it runs the
database migrations, restarts the pm2 apps and waits for `/health`. GitHub is the source of truth:
the checkout follows it even after a force push or rewritten history, and local changes to tracked
files on the VPS are discarded. `server/.env` isn't tracked, so it always stays.

A worker restart stops the scrape run in progress; it shows as "interrupted", and everything
stored up to then stays. Start a new run to continue. So the worker restarts only when the
deploy changes something it runs: the scraper, database code and migrations, config, packages or
the pm2 config. A deploy that changes only the API (`server/src/api/`, `server/src/server.ts`),
the site, the shared types, the extensions, tests or docs restarts just the API and leaves a scrape
run going. To restart the worker by hand: `pm2 restart piu-rivals-worker`.

When a new Playwright version needs more system libraries, run
`sudo npx playwright install-deps chromium` in `server/` once; the deploy has no sudo.

## Automatic deployment

The workflow [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) runs on every push to `main`:

1. If `server/` or `shared/` changed: type-checks the server, runs its tests against a throwaway
   MySQL, then connects to the VPS over SSH and runs `server/deploy.sh` for the pushed commit.
2. If `web/` or `shared/` changed: builds the site and publishes it to GitHub Pages, after the
   server is deployed, so a new site never calls an old API. When the server's tests or deploy fail,
   the site isn't published either.

**Actions → Deploy → Run workflow** deploys both by hand, e.g. to retry after a failure. A failed
server deploy isn't retried by a later push that changes only `web/`, so run it by hand then.

### One-time setup

1. **Deploy once by hand** (the first time, the VPS checkout doesn't have `deploy.sh` yet):

   ```sh
   cd ~/piu-rivals && git pull && bash server/deploy.sh
   ```

2. **A deploy key.** On your own computer, make a key pair used only for this:

   ```sh
   ssh-keygen -t ed25519 -N "" -C "piu-rivals deploy" -f piu-rivals-deploy
   ```

3. **Let the key run only the deploy.** On the VPS, add one line to `~/.ssh/authorized_keys` of
   the user that runs pm2 (here `piutop`), with the contents of `piu-rivals-deploy.pub` at the end:

   ```
   command="bash /home/piutop/piu-rivals/server/deploy.sh",restrict ssh-ed25519 AAAA... piu-rivals deploy
   ```

   With `command=` the key can't open a shell or run anything else, whatever the connection asks
   for; the commit the workflow sends reaches the script as its argument (`SSH_ORIGINAL_COMMAND`),
   and the script accepts nothing but a commit hash. `restrict` turns off port forwarding and the like.

4. **The VPS's host key**, so the workflow knows it's talking to your VPS. On your computer:

   ```sh
   ssh-keyscan -p 22 api.pumpking.top
   ```

5. **Repository secrets.** In the repo, **Settings → Secrets and variables → Actions → New repository secret**:

   | Secret | Value |
   |---|---|
   | `VPS_HOST` | `api.pumpking.top` (or the VPS's IP) |
   | `VPS_USER` | `piutop` |
   | `VPS_SSH_KEY` | the contents of the private key `piu-rivals-deploy` |
   | `VPS_KNOWN_HOSTS` | the output of `ssh-keyscan` |
   | `VPS_SSH_PORT` | only if SSH isn't on port 22 |

   Then delete the private key file from your computer.

6. **Check it:** `ssh -i piu-rivals-deploy piutop@api.pumpking.top` (before deleting the key)
   should run a deploy and disconnect. Or run the workflow by hand, as above.

The workflow replaces the old `pages.yml`; GitHub Pages keeps publishing from **GitHub Actions**
with no changes in the settings.
