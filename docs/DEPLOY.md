# Deploy Aetherhold for free (Render + GitHub)

Aetherhold is a single standard-library Python file, so it deploys to Render's
free tier with no build step and no credit card.

## What you get (free tier)

- Public `https://your-app.onrender.com` URL.
- 750 instance-hours / month (≈ 24/7 fits).
- Sleeps after 15 minutes with no traffic; waking takes ~1 minute.
- 5 GB outbound bandwidth / month (shared across the workspace).
- Ephemeral disk: the SQLite fleet database resets on redeploy/restart.
  Acceptable for a free game; set `AETHERHOLD_DB` only if you add a disk.

## Step 1 — Push to GitHub

```bash
git add server.py Dockerfile render.yaml .dockerignore docs/DEPLOY.md
git commit -m "Make Aetherhold deployable to Render (free tier)"
git push origin main
```

(Use your own fork/remote if you are not `novaui0/aetherhold`.)

## Step 2 — Create the Render service

1. Go to https://render.com and sign up (no card required for free tier).
2. **New → Web Service**, connect your GitHub account and pick the repo.
3. Render auto-detects Python. Confirm:
   - **Runtime:** Python 3
   - **Build command:** `echo "no dependencies"`
   - **Start command:** `python server.py --no-wizard --no-browser`
   - **Plan:** Free
   - **Health check path:** `/api/health`
4. (Optional) Under **Environment**, add:
   - `AETHERHOLD_ADMIN_PASSWORD` — a password you choose for `/admin`.
   - `AETHERHOLD_ADMIN_KEY` — a key for the control API.
   If omitted, both are random and printed in the deploy logs.
5. Click **Create Web Service**. First build takes ~1 minute.

A `render.yaml` Blueprint is included, so **New → Blueprint** and picking the repo
applies the same settings without filling the form by hand.

## Step 3 — Play

Open the assigned `onrender.com` URL. Everyone can join directly from the
browser — no `--connect` needed, because the game is served from the same host.

The admin panel is at `https://your-app.onrender.com/admin?key=…` (key printed
in the Render logs; or use the env var you set).

## Alternative: Northflank (no-sleep, no card)

Northflank's Sandbox advertises always-on compute with no card. Use the
included `Dockerfile`:

1. Push to GitHub.
2. Northflank → **New Service → Build from Git**, pick the repo.
3. Set start command to `python server.py --no-wizard --no-browser` (or let the
   Dockerfile handle it) and expose port 8080.
4. Deploy and open the generated `code.run` URL.

## Notes

- `server.py` reads `PORT` and `AETHERHOLD_DB` from the environment, so it works
  on Render, Northflank, Railway, Fly and Docker without flags. The defaults
  (8080, `./aetherhold.db`) are unchanged for local hosting.
- On a host with no TTY (all of the above) the setup wizard is skipped
  automatically and defaults are used (region `turkey`, 12 slots).
- The console panel is disabled automatically when stdin is not a TTY.
- Behind a proxy the server trusts `X-Forwarded-For` for the real client IP, so
  a ban hits the player rather than everyone sharing the load balancer. The
  header is only honoured when the socket peer is loopback/LAN.
- For a permanent database, add a Render Disk and point `AETHERHOLD_DB` at it
  (e.g. `/var/data/aetherhold.db`).
- `render.yaml` pins `PYTHON_VERSION=3.13.5`; change it there if you need another
  version.

## Troubleshooting

- **"Application failed to respond"** — the process must listen on `$PORT`. This
  server does; do not override `--port` in the start command.
- **Page loads but rooms never appear** — the client talks to the same origin it
  was served from. Open the `onrender.com` URL directly, not a local copy of
  `public/index.html`.
- **First visit takes ~30 s** — a sleeping free instance is waking. Reload once.
- **Everything resets after a deploy** — the free disk is ephemeral; that is the
  SQLite fleet database being recreated. Add a disk for persistence.
- **`/admin` asks for a password you lost** — set `AETHERHOLD_ADMIN_PASSWORD` in
  the Render dashboard and redeploy, or read it from the boot logs.