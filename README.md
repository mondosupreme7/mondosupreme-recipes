# Mondosupreme Recipes

[mondosupreme.com](https://mondosupreme.com) is a small landing page. Recipes live at [/recipes/](https://mondosupreme.com/recipes/) and stay in the browser (local storage). Search, filter, favorite, import, and export them as JSON.

[Wiki](https://mondosupreme.com/wiki/) is a personal set of notes and how-tos. Pages stay in this browser under `mondosupreme.wiki.v1`. Export the JSON backup to move them.

[Board](https://mondosupreme.com/board/) is a shared drawing page: freehand pen, eraser, undo of your own last stroke, and pan and zoom. Strokes are shared through Firebase Realtime Database. The rules in `board/database.rules.json` cap stroke size, point count, and rate, keep about a day of strokes, and allow only the owner account to clear the board.

[Chat](https://mondosupreme.com/chat/) is one public room on that same Firebase project. Display names stay in this browser under `mondosupreme.chat.name`. Messages are plain text. The rules cap length and rate, keep about the last 200 messages from the past week, and allow only the owner account to remove a message, clear the room, or block someone.

[The Locked Room](https://mondosupreme.com/escape/) is a small mystery in the browser. Progress stays on this device under `mondosupreme.escape.v1`.

The static site at the repo root is published to GitHub Pages on every push to `main`. A hash or query on `/` is forwarded to `/recipes/` so older recipe links keep working.

[Cruises](https://mondosupreme.com/cruises/) is a map of the Royal Caribbean International fleet. Ship identities live in `cruises/fleet.json`. A scheduled Action listens to [aisstream.io](https://aisstream.io/) for about 75 seconds every 5 minutes, asks [Open Waters](https://openwaters.io/ais/) for any ship that stayed quiet, and publishes `cruises/positions.json`. The key stays in the `AISSTREAM_API_KEY` repository secret. The page also re-reads that file every 2 minutes and can refresh Open Waters in the browser.
