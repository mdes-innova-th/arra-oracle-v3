# Arra Oracle Studio Worker

This Worker serves the React/Vite Studio build from Cloudflare Workers Static
Assets and proxies `/api/*` to a running Arra Oracle HTTP backend. It is the
#2206 make-it-work path for hosting Studio in the same Workers ecosystem as the
remote MCP Worker.

## Deploy

1. Build the frontend assets.

   ```bash
   cd frontend
   bun install
   bun run build
   ```

2. Configure the backend URL.

   Edit `workers/studio/wrangler.jsonc`:

   ```jsonc
   "vars": {
     "ORACLE_URL": "https://your-oracle-backend.example.com"
   }
   ```

3. Deploy the Worker.

   ```bash
   cd workers/studio
   bun install
   bunx wrangler login
   bunx wrangler deploy
   ```

The Studio URL is:

```text
https://<worker-name>.<account>.workers.dev/
```

## Runtime behavior

- Static React assets are served from `../../frontend/dist`.
- React Router fallback is handled by Workers Static Assets SPA mode.
- `/api/*` requests proxy to `ORACLE_URL` with the same method, query string,
  body, and content headers.
- API responses are marked `cache-control: no-store`.
- Vite hashed assets are cached with `public, max-age=31536000, immutable`.
- HTML and unhashed assets use a short `stale-while-revalidate` cache.

## Secrets

If the backend requires a bearer token, store it as a Worker secret:

```bash
bunx wrangler secret put ARRA_API_TOKEN
```

`ARRA_API_KEY` is accepted as a legacy fallback. Do not point `ORACLE_URL` at the
MCP endpoint; it should be the Arra Oracle HTTP API origin that serves `/api/*`.

## Validate locally

```bash
bun test tests/workers/studio-worker.test.ts
bunx tsc --noEmit
cd workers/studio && bun run typecheck
```
