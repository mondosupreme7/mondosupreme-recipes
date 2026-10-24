# Mondosupreme Recipes

Personal recipe notebook for [mondosupreme.com](https://mondosupreme.com). Recipes stay in the browser (local storage). Search, filter, favorite, import, and export them as JSON.

The static site at the repo root is published to GitHub Pages on every push to `main`.

[Cruises](https://mondosupreme.com/cruises/) is a map of the Royal Caribbean International fleet. Ship identities live in `cruises/fleet.json`. A scheduled Action listens to [aisstream.io](https://aisstream.io/) for about three minutes and publishes `cruises/positions.json`. The key stays in the `AISSTREAM_API_KEY` repository secret. Ships that are quiet during a run keep their last stored position.
