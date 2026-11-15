# Free LetsFG searches in La Dolce Vita

This backend uses the **free personal LetsFG PFS** flow (not its paid Developer API) through a Cloudflare Worker with a SQLite-backed Durable Object. Your Angular website stays on GitHub Pages.

**Current status:** The code is ready but no Cloudflare deployment or flight-provider OAuth connection has been authorized yet. A LetsFG connection inside ChatGPT does NOT hand a token to this independent website.

## How it works

1. Cloudflare Durable Object performs LetsFG's OAuth dynamic client registration and PKCE authorization code exchange after the owner approves in a browser.
2. Refresh tokens rotate and are persisted before the new access token is used. The access token lasts about one hour. Nothing is sent to GitHub Pages.
3. The backend starts a free PFS search at POST https://letsfg.co/api/search, then polls GET /api/results/{search_id} every 2 seconds, including any pending split-ticket/enrichment phase (up to 75 seconds).
4. The frontend shows only returned, exact-date live offers; never estimates masquerading as real quotes. No booking/payment routes are available.
5. The search endpoint defaults **OFF**. After owner approval, the user may set PUBLIC_SEARCH_ENABLED=true. The Worker limits searches to 40/day deployment-wide and 6/day per IP by default. Limits reduce quota abuse but do not secure a public website against determined outsiders.

## Step 1 — Free Cloudflare Worker

Sign into https://dash.cloudflare.com/ and prepare a Cloudflare Workers Free account. SQLite-backed Durable Objects work on Workers Free.

In GitHub repository https://github.com/aishwaryaapsangi/my-rome/settings/secrets/actions, add your Cloudflare-owned deploy credentials as Actions secrets:
- CLOUDFLARE_API_TOKEN (narrow Workers deployment permission)
- CLOUDFLARE_ACCOUNT_ID

Never paste them into chat or commit them to files.

Cloudflare deploys automatically when files under api-worker/ are merged into main. You can also run the https://github.com/aishwaryaapsangi/my-rome/actions/workflows/deploy-worker.yml workflow manually.

Find the deployed API public HTTPS URL ending in workers.dev in the Cloudflare dashboard. No URL has been deployed by ChatGPT yet.

## Step 2 — Owner authorizes free LetsFG OAuth

In Cloudflare Worker Settings → Variables and Secrets, add a private ADMIN_SETUP_TOKEN (a random 32-byte or longer owner password). Generate a random string locally using the command openssl rand -hex 32. Optionally add QUOTA_SALT as another secret. Do not share either.

**Recommended: open https://my-rome-flight-api.aishwaryaapsangi25.workers.dev/api/connect in your browser.** Paste the private ADMIN_SETUP_TOKEN you added to Cloudflare into the password field (not into ChatGPT), then click **Connect my LetsFG account**. The Worker redirects you to LetsFG to approve the free connection. This form does not use JavaScript and never puts the secret in the URL.\n\nAlternatively, from your terminal, set WORKER_BASE to your real HTTPS Cloudflare URL and ADMIN_SETUP_TOKEN to your secret (neither belongs in GitHub). Call the owner-only route:

    curl -fsS -X POST "$WORKER_BASE/api/auth/start" -H "Authorization: Bearer $ADMIN_SETUP_TOKEN"

Its JSON response has an authorizationUrl. Open it in your browser, review LetsFG permissions, then approve. LetsFG returns to the Worker's /api/auth/callback URL. The Worker stores OAuth credentials in the Durable Object and refreshes them when they expire.

The owner can later revoke the local connection with:

    curl -fsS -X POST "$WORKER_BASE/api/auth/disconnect" -H "Authorization: Bearer $ADMIN_SETUP_TOKEN"

Check GET $WORKER_BASE/api/health. Before public search is enabled, the response will report freeAccountConnected:true and ready:false.

Do NOT create a paid LetsFG Developer API account just to use free personal search. Paid Developer calls remain disabled by default (ENABLE_PAID_LETSFG must be explicitly true for that separate mode).

## Step 3 — Opt in to searches and connect the website

In the Cloudflare Worker's configuration, set PUBLIC_SEARCH_ENABLED=true only once you are ready to spend your free personal search quota. The version-controlled api-worker/wrangler.json defaults to false, so future Wrangler deployments may restore false. Confirm the effective setting after each deployment.

Verify GET $WORKER_BASE/api/health reports ready:true.

In the public file https://github.com/aishwaryaapsangi/my-rome/blob/main/public/runtime-config.json, set the apiBaseUrl property to the public HTTPS Worker base URL only, with no secret. Push to main and GitHub Pages redeploys. The app at https://aishwaryaapsangi.github.io/my-rome/ will then search fresh LetsFG offers for the selected departure, return and passenger count.

## Security and availability

- This is your own free PERSONAL search allowance, not a public high-volume API license. LetsFG currently limits free PFS searches to 10/10 minutes, 30/hour and 100/day per user; our deployment limit is intentionally lower.
- CORS alone is not authentication. A determined public visitor can still use up your personal allowance. For private-only use, protect the site and Worker with authentication (for example Cloudflare Access), or leave searches disabled.
- Do not store bearer/refresh tokens in the frontend. OAuth credentials never pass through the GitHub app.
- If LetsFG returns 401, reconnect through the owner-only OAuth route. If it returns 429, do not retry automatically.
- Supplier prices are snapshots and can expire; self-transfer/unprotected connections need extra care. No booking or payment is performed here.
- No production search has been made or tested without the user's OAuth approval.

## References

LetsFG OAuth: https://letsfg.co/developers/docs/mcp/index.html

LetsFG PFS polling: https://letsfg.co/developers/docs/agent-guide/index.html

Cloudflare Workers Free: https://developers.cloudflare.com/workers/platform/limits/

Cloudflare Durable Objects Free: https://developers.cloudflare.com/durable-objects/platform/pricing/
