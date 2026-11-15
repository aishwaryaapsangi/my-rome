# Deploy La Dolce Vita flight API via Railway

The Angular website remains on GitHub Pages. Railway is an optional host for the private flight API.

## Setup
1. Connect Railway to GitHub and import the repository aishwaryaapsangi/my-rome.
2. The root railway.json uses api-worker/Dockerfile, not Angular. Confirm the service is building with Dockerfile.
3. In Railway Variables, securely add LETSFG_API_KEY (LetsFG Developer API credential), or DUFFEL_ACCESS_TOKEN (Duffel live credential). No tokens belong in GitHub, public JavaScript, or chat.
4. Add ALLOWED_ORIGIN=https://aishwaryaapsangi.github.io. Do not include /my-rome/ in an HTTP Origin.
5. In Railway networking settings, generate a public HTTPS domain. Test its /api/health endpoint and ensure ready:true.
6. Add only that public base URL to public/runtime-config.json, as the apiBaseUrl value, and commit. GitHub Pages redeploys automatically.
7. Open https://aishwaryaapsangi.github.io/my-rome/ and use Compare live flights.

**Important security note:** This service performs searches but no bookings. CORS alone is not authentication. Turn on provider spending caps and a hosting-side rate limit before exposing a paid flight API to the public. LetsFG Developer API requires account activation and may incur fees; Duffel's test keys produce non-bookable offers. Never claim live prices until a successful authenticated search returns real inventory.

Backend source: api-worker/src/http-server.mjs; tests: tests/railway-adapter.test.mjs.

Hosting docs: https://docs.railway.com/services
Hosting variables: https://docs.railway.com/variables
LetsFG docs: https://letsfg.co/developers/docs/api-search/index.html
Duffel docs: https://duffel.com/docs/api/v2/offer-requests
