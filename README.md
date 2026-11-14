# 🍋 La Dolce Vita — Italy 2027

An interactive family travel planner for Boston to Rome, with a 10-day itinerary, editable daily costs, a July flight-date heatmap and links to the official Delta and ITA booking sites.

## Hosting

GitHub Pages can host `index.html` directly, or GitHub Actions can build the Angular wrapper and deploy it. In repository **Settings → Pages**, set **Source** to **GitHub Actions** when the workflow is available.

## Flight-price integrity

The populated July benchmark is a historical **14-night, one-person, any-airline** monitor. It is **not** a 10-day Delta/ITA fare. Delta/ITA official-price cells are blank until verified. Never commit flight API tokens to this repository.

Source and complete deployment notes are included in this repository.