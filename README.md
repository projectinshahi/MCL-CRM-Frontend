# MCL CRM Frontend

Next.js app for MCL CRM. It holds no data and no secrets: every `/api/*` call is forwarded by the Next server to
the MCL-CRM-Backend Express API (a rewrite in `next.config.ts`), so the browser only ever talks to this site and the
API's session cookie is first-party.

## Run locally

1. Start the API (`MCL-CRM-Backend`, `npm run dev`, port 4000). Its `FRONTEND_ORIGIN` must list this app's address,
   e.g. `http://localhost:3000,http://localhost:3001`.
2. `npm install`, then `npm run dev` and open http://localhost:3000 (or 3001 when 3000 is taken). Without a session
   cookie, `proxy.ts` sends you to `/login`.

No `.env` file is needed for development. To override something, copy `.env.example` to `.env.local` (git ignores it).

## Configuration

Both variables are read when the app is **built** (`next build`): after changing one, build again.

| Variable | Needed | Purpose |
|---|---|---|
| `API_URL` | **Required for `next build`** (the build stops without it). `next dev` falls back to `http://localhost:4000`. | Address of the MCL API, e.g. `https://api.example.com` (no trailing slash, no `/api`). Read by the Next server only; never sent to the browser. A plain `http://` address that isn't this machine builds with a warning. |
| `NEXT_PUBLIC_DEFAULT_PHONE_COUNTRY` | Optional, default `IN` | Country preselected in phone fields and used to read saved numbers without `+code`. Public (sent to the browser). Keep equal to the API's `DEFAULT_PHONE_COUNTRY`; an empty value means no preselection. |

Never put a secret in a `NEXT_PUBLIC_*` variable: those are copied into the JavaScript every visitor downloads.
Database URLs, `SESSION_SECRET`, SMTP and Cloudinary credentials belong to the API only.

## Checks

```bash
npm test              # unit tests (lib/*.test.mjs, Node's test runner)
npm run lint
npx tsc --noEmit
API_URL=http://localhost:4000 npm run build   # a local production build
```

## Deploying

Any Node.js host that runs `next build` / `next start`, or Vercel, works:

1. Set `API_URL` (and optionally `NEXT_PUBLIC_DEFAULT_PHONE_COUNTRY`) in the host's **build** environment.
2. Build with `npm ci && npm run build`; run with `npm start` (listens on `PORT`, default 3000).
3. Serve the site over **https**. The API's session cookie is `Secure` in production, so over plain http nobody can
   sign in.
4. Put this site's exact public origin (e.g. `https://crm.example.com`) in the API's `FRONTEND_ORIGIN`.

The API's own requirements, migrations and release steps are in `MCL-CRM-Backend/README.md` ("Deploying").
