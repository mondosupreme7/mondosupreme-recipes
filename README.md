# Mondosupreme Recipes

[mondosupreme.com](https://mondosupreme.com) is a small landing page. Its visitor counter is a shared Firebase total at `hits/total`: one browser session counts once, and the same visitor can count again after 30 minutes. Until `board/database.rules.json` is published, the counter keeps showing its saved local number. Recipes live at [/recipes/](https://mondosupreme.com/recipes/) and are shared through the same Firebase Realtime Database as the board and chat. Anyone can read and add recipes. Only the owner can edit or delete them. Favorites stay in this browser under `mondosupreme.favs.v1`, and `mondosupreme.recipes.v1` is a local cache. Search, filter, import, and export still work. Publish `board/database.rules.json` in the Firebase console before sharing goes live; until then the page keeps using local storage.

[Wiki](https://mondosupreme.com/wiki/) is a shared set of notes and how-tos on that same Firebase project. Anyone can read and add pages. Only the owner can edit, rename, delete, restore an older version, or tick a checklist. `mondosupreme.wiki.v1` is the local cache until `board/database.rules.json` is published.

[Board](https://mondosupreme.com/board/) is a shared drawing page: freehand pen, eraser, undo of your own last stroke, and pan and zoom. Strokes are shared through Firebase Realtime Database. The rules in `board/database.rules.json` cap stroke size, point count, and rate, keep about a day of strokes, and allow only the owner account to clear the board.

[Chat](https://mondosupreme.com/chat/) is one public room on that same Firebase project. Display names stay in this browser under `mondosupreme.chat.name`. Messages are plain text. The rules cap length and rate, keep about the last 200 messages from the past week, and allow only the owner account to remove a message, clear the room, or block someone.

[Arcade](https://mondosupreme.com/arcade/) is a three-cartridge cabinet: High Seas Cruiser, Supreme Kitchen Rush, and Cyber Brick Breaker 1999. Personal bests stay in `mondosupreme.arcade.v1`. Shared top-10 scores use the same Firebase project once `board/database.rules.json` is published. Only the owner can clear a board.

[Pet](https://mondosupreme.com/pet/) is MondoGotchi, a keychain virtual pet. The egg, care, and evolutions stay in `mondosupreme.pet.v1`, including time away (capped so a long break does not silently end the pet). The Pet Park shares a snapshot on the same Firebase project once `board/database.rules.json` is published. Only the owner can remove a pet from the park.

[Forum](https://mondosupreme.com/forum/) is a bulletin board for blog posts and replies. Threads stay in `mondosupreme.forum.v1` until `board/database.rules.json` is published, then anyone signed in can post and reply. Only the owner can edit, delete, pin, lock, mark an official post, or ban a writer.

[The Locked Room](https://mondosupreme.com/escape/) is a small mystery in the browser. Progress stays on this device under `mondosupreme.escape.v1`.

The static site at the repo root is published to GitHub Pages on every push to `main`. A hash or query on `/` is forwarded to `/recipes/` so older recipe links keep working.

[Cruises](https://mondosupreme.com/cruises/) is a map of the Royal Caribbean International fleet. Ship identities live in `cruises/fleet.json`. A scheduled Action listens to [aisstream.io](https://aisstream.io/) for about 75 seconds every 5 minutes, asks [Open Waters](https://openwaters.io/ais/) for any ship that stayed quiet, and publishes `cruises/positions.json`. The key stays in the `AISSTREAM_API_KEY` repository secret. The page also re-reads that file every 2 minutes and can refresh Open Waters in the browser.
