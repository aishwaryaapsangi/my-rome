# 🍋 La Dolce Vita · my-rome

An interactive Italian summer planner for four travelers, hosted on GitHub Pages. The project includes an **Angular 21 frontend**, a self-contained photo-rich travel studio, a 10-day Rome / Florence itinerary, editable daily budget, and a full July airfare heatmap.

## Open your website

After GitHub Pages reports a successful deployment, your site should be:

**https://aishwaryaapsangi.github.io/my-rome/**

View the [deployment workflow](https://github.com/aishwaryaapsangi/my-rome/actions/workflows/deploy.yml).

### Turn on Pages (one-time)

Open **Settings → Pages → Build and deployment → Source: GitHub Actions**.

The workflow builds Angular with `--base-href /my-rome/` and publishes `dist/my-rome/browser`. Every update to `main` triggers a new deployment. A `public/studio.html` copy of the studio is included in the Angular build and displayed inside an Angular component; `index.html` also contains a static fallback.

## Flights: what is and is not live

The **31-day July benchmark** is an observed one-person, 14-night price calendar across unspecified airlines and must NOT be treated as Delta/ITA pricing for this 10-day family holiday.

The **Delta/ITA 10-day flight tab** accepts actual airline-direct price quotes that you check using the included links. There is currently **no verified direct Delta or ITA day-by-day API connection** and no guaranteed four-seat inventory. Supplier APIs, including Duffel, may have different coverage and fares than direct airline websites.

GitHub Pages serves static files; it **cannot safely store or use a flight API secret**. For real-time supplier offers, deploy a separate HTTPS backend, protect the token on that server, and configure the studio's optional flight-API URL. Do not commit credentials or paste tokens into the website.

## Development

Requires Node 22.16+.

```bash
npm install
npm start
npm run build -- --base-href /my-rome/
```

The Angular source is in `src`; the portable full experience is in `public/studio.html`.

## Official booking links

[Delta flights](https://www.delta.com/flightsearch/book-a-flight) · [ITA BOS–Rome](https://www.ita-airways.com/lhg/us/en/o-d/cy-cy/boston-rome) · [Colosseum](https://ticketing.colosseo.it/en) · [Vatican](https://tickets.museivaticani.va) · [Uffizi](https://www.uffizi.it/en/the-uffizi) · [Trenitalia](https://www.trenitalia.com/en/connections/our-destinations-app.html)

**Privacy:** this is a public GitHub repository and public website; don't commit passport details or personal addresses.
