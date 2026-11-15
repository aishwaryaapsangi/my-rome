# 🔐 Secure real-time flight-search API for La Dolce Vita

The website uses **GitHub Pages** and cannot hold API secrets. This optional **Cloudflare Worker** performs authenticated searches and returns normalized results to the Angular travel studio.

## Source selection

**1. LetsFG — recommended first for multi-airline comparison.** The open-source [LetsFG/LetsFG](https://github.com/LetsFG/LetsFG) repository is MIT-licensed. We use its *documented hosted API* instead of copying its scraping engine. The stable developer API accepts `date_from`, `return_from`, `adults`, cabin and max stops and can return flights from multiple airlines/OTAs. The Developer API requires a separate account, a payment method and `LETSFG_API_KEY`. Verify billing terms [here](https://letsfg.co/developers/docs/api-guide/index.html). **We have not created a LetsFG account or made any live fare calls.**

**2. Duffel — optional fallback.** Its offer requests use two date-specific slices and multiple adult passengers. It may not include every airline. Tokens can be test or live; **test offers are explicitly flagged** and excluded from the live winner calculation. Create and manage a token via [Duffel](https://duffel.com/docs/api/v2/offer-requests).

## Activate the Worker

1. Create a Cloudflare account / Workers deployment. For GitHub Actions, add repository **Actions secrets** `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (restricted as Cloudflare recommends).
2. Run GitHub workflow **Deploy private flight search API**. It publishes `api-worker/wrangler.json` and reports a `*.workers.dev` URL.
3. In Cloudflare Worker **Settings → Variables and Secrets**, create a secret `LETSFG_API_KEY` (or `DUFFEL_ACCESS_TOKEN`). **Never paste keys into HTML, chat, GitHub files, or public runtime-config.**
4. Check `GET https://your-worker.workers.dev/api/health` returns `ready:true`.
5. Put only the **public HTTPS Worker base URL** in `public/runtime-config.json`, e.g. `{"apiBaseUrl":"https://my-rome-flight-api.YOUR-SUBDOMAIN.workers.dev"}`. Push `main`; GitHub Pages redeploys.
6. Configure Cloudflare **WAF rate limiting**, preferably a Turnstile challenge and spend limits before exposing a charged API. The Worker includes short caching and date validation, but CORS alone **does not prevent non-browser abuse**. Use a restrictive budget on your provider account.

## Browser → Worker contract

```http
POST /api/search
Content-Type: application/json

{
  "origin":"BOS",
  "destination":"FCO",
  "departure":"2027-07-19",
  "returnDate":"2027-07-26",
  "adults":4,
  "cabin":"M",
  "maxStops":1,
  "provider":"all"
}
```

Response contains `offers[]` with `airline`, `pricePerPerson`, `totalPrice`, `currency`, `source`, `bookingUrl`, `stopsOutbound`, `stopsReturn`, `durationMinutes`, `isTest`, `selfTransfer`, `splitTicket`, `expiresAt`, `checkedAt`, `errors[]`, and the exact request `query`. All prices correspond to the requested date pair, not historic examples.

No bookings or payments are performed by this code. Always recheck availability and final baggage-inclusive costs with the seller.

## Developing locally

```bash
node --test tests/api-worker.test.mjs
cd api-worker
npx wrangler dev
```

If you want self-serve searches without obtaining provider API credentials, [LetsFG](https://letsfg.co/) also has its own hosted consumer search; that is **separate** from your own website and cannot directly populate its in-app price list.
