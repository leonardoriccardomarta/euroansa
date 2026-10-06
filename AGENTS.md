<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Cloud Agent environment

The app uses the Neon HTTP driver (`@neondatabase/serverless`). Local Postgres does not speak that protocol. This environment runs Postgres 16 and `/opt/euroansa/neon-http-proxy.cjs`. `NODE_OPTIONS` loads `/opt/euroansa/neon-fetch-preload.cjs`, which sends the driver's `https://api.…/sql` calls to the proxy. Keep `DATABASE_URL` on a hostname with a dot (default `postgresql://euroansa@db.localtest.me/euroansa`); do not switch the app to a raw TCP driver.

- Install: `npm ci`
- Dev server: the environment start script (`/opt/euroansa/start-dev.sh`) starts Postgres, the proxy, and `next dev` on port 3000
- Open http://localhost:3000 — `127.0.0.1` is also allowed via `allowedDevOrigins`
- Local admin, created by `POST /api/setup`: `admin@prontopratica.local` / `admin123456`
- `AUTH_SECRET` and `CRON_SECRET` are generated on first boot into `~/.config/euroansa/dev.env`
- Gmail, Gemini, and Cloudflare R2 are not required to sign in, view pratiche, or save a lead
