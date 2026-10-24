# Mondosupreme Recipes

Personal recipe notebook for [mondosupreme.com](https://mondosupreme.com). Recipes stay in the browser (local storage). Search, filter, favorite, import, and export them as JSON.

The static site at the repo root is published to GitHub Pages on every push to `main`.

[Cruises](https://mondosupreme.com/cruises/) is a map of the Royal Caribbean International fleet. Ship identities live in `cruises/fleet.json`. A scheduled Action reads last-known positions from [Open Waters AIS](https://openwaters.io/ais/) and publishes `cruises/positions.json`. No API key is required. An optional personal token can be stored as the `OPENWATERS_TOKEN` repository secret.
