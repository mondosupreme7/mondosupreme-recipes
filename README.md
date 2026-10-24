# Mondosupreme Recipes

[mondosupreme.com](https://mondosupreme.com) is a small landing page. Recipes live at [/recipes/](https://mondosupreme.com/recipes/) and stay in the browser (local storage). Search, filter, favorite, import, and export them as JSON.

[Wiki](https://mondosupreme.com/wiki/) is a personal set of notes and how-tos. Pages stay in this browser under `mondosupreme.wiki.v1`. Export the JSON backup to move them.

The static site at the repo root is published to GitHub Pages on every push to `main`. A hash or query on `/` is forwarded to `/recipes/` so older recipe links keep working.

[Cruises](https://mondosupreme.com/cruises/) is a map of the Royal Caribbean International fleet. Ship identities live in `cruises/fleet.json`. A scheduled Action listens to [aisstream.io](https://aisstream.io/) for about three minutes and publishes `cruises/positions.json`. The key stays in the `AISSTREAM_API_KEY` repository secret. Ships that are quiet during a run keep their last stored position.
