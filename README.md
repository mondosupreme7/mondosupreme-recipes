# Mondosupreme Recipes

[mondosupreme.com](https://mondosupreme.com) is a small landing page. Recipes live at [/recipes/](https://mondosupreme.com/recipes/) and stay in the browser (local storage). Search, filter, favorite, import, and export them as JSON.

[Wiki](https://mondosupreme.com/wiki/) is a personal set of notes and how-tos. Pages stay in this browser under `mondosupreme.wiki.v1`. Export the JSON backup to move them.

[Board](https://mondosupreme.com/board/) is a shared drawing page: freehand pen, eraser, undo of your own last stroke, and pan and zoom. Strokes stay on this device until `board/config.js` has the public Firebase web config. The Realtime Database rules in `board/database.rules.json` cap stroke size, point count, and rate, keep about a day of strokes, and allow only the owner account to clear the board.

The static site at the repo root is published to GitHub Pages on every push to `main`. A hash or query on `/` is forwarded to `/recipes/` so older recipe links keep working.

[Cruises](https://mondosupreme.com/cruises/) is a map of the Royal Caribbean International fleet. Ship identities live in `cruises/fleet.json`. A scheduled Action listens to [aisstream.io](https://aisstream.io/) for about three minutes and publishes `cruises/positions.json`. The key stays in the `AISSTREAM_API_KEY` repository secret. Ships that are quiet during a run keep their last stored position.
