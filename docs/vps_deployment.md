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
2. **Players → Import players from the old extension** to bring in your stored players.
3. **Scrape all players**. The first full scrape takes a long time (expect most of a day for
   hundreds of players); follow it on **Scrape runs**.
4. **Users**: add the other people's Google emails and link each one to their player.

## Updating

```sh
cd ~/piu-rivals
git pull
npm ci
cd server
npm run migrate
pm2 restart piu-rivals-api piu-rivals-worker
```

A worker restart stops the scrape run in progress; it shows as "interrupted", and everything
stored up to then stays. Start a new run to continue.
