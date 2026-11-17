<table>
  <tr>
    <td><img src="public/aetherhold-logo.png" width="72" height="72" alt="Aetherhold logo"></td>
    <td><h1>Aetherhold</h1></td>
  </tr>
</table>

[![Copilot eligible](https://img.shields.io/badge/Copilot-eligible-1abc9c?logo=github&logoColor=white)](https://github.com/features/copilot)
[![Python 3.9](https://img.shields.io/badge/python-3.9+-blue?logo=python&logoColor=white)](https://www.python.org/downloads/)
[![Browser](https://img.shields.io/badge/browser-modern-blue?logo=firefox-browser&logoColor=white)](https://www.mozilla.org/firefox/)
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/novaui0/aetherhold)

A 3D chat & roleplay realm in the browser, served by a single standard-library
Python file. Wanderers meet around a campfire in the Aetherhold — a neutral
waystation on a dead caravan road — walk with WASD, look around with the mouse,
talk in character, roll dice, draw steel, and answer for it.

No build step, no dependencies: `server.py` needs only Python 3.9+ and the client
is plain ES modules with a vendored copy of three.js (works offline).

## Run it

```bash
#First, open the folder using the command prompt (cmd).
cd aetherhold

# Host the realm on http://localhost:8080 (prints the admin panel link)
python server.py

# Host on another port, with a pre-made room and a password
python server.py --port 9000 --room "The Gilded Flagon" --password swordfish

# Join a friend's realm (starts a local launcher that points at their host)
python server.py --connect http://192.168.1.20:8080
```

cd aetherhold

Hosting prints the local and LAN addresses to share, plus the warden's panel URL
(`http://127.0.0.1:8080/admin?key=…`). `--no-browser` skips opening a tab,
`--host 127.0.0.1` keeps it loopback-only, and `--theme moonlit|frost` picks the
look of the pre-made room.

A guest who runs `--connect` gets the same game served from their own machine,
with the host address pre-filled — the game talks to the remote server directly
(the API sends CORS headers for that).

## Playing

The game asks for fullscreen when you enter a hall. The mouse captures on the
first click on the world: move it to turn your head and eyes, and press `Esc`
once to release it without pausing.

| Key | Action |
| --- | --- |
| `W` `A` `S` `D` | Walk (camera-relative) |
| `Shift` | Run |
| Mouse / click | Look around; the avatar's head and eyes follow |
| `V` | First person / over-the-shoulder |
| `R` | Draw or sheathe a weapon |
| `F` | Fullscreen |
| `Wheel` | Zoom (over-the-shoulder only) |
| `Enter` | Focus chat |
| `C` | Character sheet |
| `K` / `H` | Codex and field guide |
| `E` | Enter / leave the truck; talk to people |
| `Space` | Handbrake while driving |
| `M` | Road map: travel, refuel, repair, cargo |
| `I` | Roadside market (chest GUI) |
| `Tab` | Hold for the player list |
| `T` | TV / couch mode: bigger HUD and text |
| `Esc` | Release the mouse, close overlays, or pause |

### Controller and the living room

A PlayStation or Xbox pad works out of the box through the browser's Gamepad
API: left stick walks (steers the truck), right stick looks, `R2` runs or
accelerates, `L2` is the handbrake, and the face buttons press the same `E`,
`V`, `R`, `M`, `I` and `C` keys the keyboard does. Connecting a pad says so in
the corner; unplugging it silently hands control back to the keyboard.

`T` (or the pad's Share button, or Settings → Graphics → TV mode) switches on the
couch layout: larger HUD type, 44 px targets and a wider chat column, so the
screen reads from a sofa. [docs/CASTING.md](docs/CASTING.md) covers HDMI,
Chromecast tab casting, Smart TV browsers, Steam Link and pairing a DualSense.

## The road

The plaza is the hub; the region around it is what you drive. A ring highway
with lane paint, guardrails, lamp posts and kilometre stones links six stops —
garage, fuel station, scrapyard, camp, warehouse and the observation tower — and
`M` opens the road map with fog of war, distances, climate, per-road fuel cost
and the services each stop offers.

The fleet is stored server-side in SQLite and survives restarts: fuel, tank,
consumption, cargo (kg and parts), condition, odometer, cash and the node you are
parked at. Travel consumes the listed fuel for that road, empty tanks and broken
engines can be towed, and parts are bought and sold where the map says they are.

The road module is `public/js/region.js`; the map overlay is `public/js/worldmap.js`.

| Action | Where |
| --- | --- |
| Refuel | fuel stations |
| Repair | garages |
| Buy / sell parts | garages, markets, scrapyards |
| Pour a jerrycan | anywhere, from cargo |
| Tow | anywhere you are stranded |

## The HUD

Everything the interface can say, said where you will actually look:

- **Centre title** — big name/subtitle card on arrival, on mod events and on
  level-ups (`kind: "title"` from the server).
- **Top strip** — a boss-bar style announcement lane with a fill ratio, used by
  countdowns and event timers (`kind: "bar"`).
- **Action bar** — live location, climate, coordinates, fuel and speed, updated
  five times a second above the hint line.
- **Scoreboard** — right-hand panel with money, level, kills and the room code.
- **TAB list** — server name, region, per-player class and ping, and a rules
  footer.
- **Chest GUI** — a 27-slot market/stall window driven by the fleet: refuel,
  repair, tow, jerrycan, map, sheet, codex and one slot per parts type.
- **Clickable chat** — any `/command` inside a chat line becomes a button. Local
  ones (`/market`, `/shop`, `/tab`) open the UI; the rest drop into the input.
- **Vehicle panel** — only exists while you are actually inside the vehicle, and
  it lives in the bottom-right so it never covers the chat.

## Audio

All sound is procedural. The engine lives in `public/js/audio.js` and has three
layers:

- **Ambience** — a low detuned drone and a filtered wind bed, fed through the master
  bus at a separate gain so it can be mixed independently.
- **Music playlist** — five synthesised tracks (Charge, March, Hearth, Storm, Last
  Stand). Only the active track is built at runtime, one layer at a time, so the
  first play does not stall the page. New layers are scheduled with `setTimeout`
  between builds so the main thread stays free while a track warms up.
- **Interface tones** — `hover`, `click`, `chime`, `enter`, `dice`, `message` and
  `error`, all generated from oscillators and gain envelopes.

The context is created once and reused. If the browser suspends it before a user
gesture (the usual autoplay policy), the engine attempts to resume and keeps
scheduling — sound appears as soon as the context is live again. `enter()` and
`dice()` explicitly resume the context before playing, which is what makes the
world-entry and dice-roll cues survive the first click.

Master mute and per-channel sliders are in `Settings → Controls & Audio`. Volume
changes use scheduled ramps rather than instant jumps, so muting and unmuting does
not create clicks.

To use your own audio instead of the synthesised tracks, drop files into
`public/audio/` and point the playlist at them; the synthesised tracks stay as the
fallback.

## Music

Five synthetic tracks (Charge, March, Hearth, Storm, Last Stand) are generated in
the browser with WebAudio and rotate as a playlist — no audio files, no
licensing. Each track is synthesised only when it starts, so the first one does
not stall the page. `Settings → Background music` sets the level, and the master
mute silences it with everything else.

To use your own tracks instead, drop files into `public/audio/` and point the
playlist at them; the synthesised tracks stay as the fallback.

## Mods

Any `*.py` file in `mods/` is loaded at boot, in alphabetical order. A broken mod
is reported and skipped — it cannot stop the realm from starting.

```python
MOD = {"name": "Convoy Events", "version": "1.0", "author": "you",
       "description": "Timed road events."}

def register(api):
    @api.command("convoy", "Call the next convoy", aliases=("c",))
    def convoy(ctx):
        ctx.title("CONVOY FORMING", "Assembly at the north gate")
        ctx.bar("Departs in 30s", 0.15)
        return "You called it."        # private reply to the caller

    @api.on("join")
    def greet(ctx):
        ctx.title("WELCOME", ctx.player.name)
```

- `api.command(name, help_text, aliases=())` adds `/name`; handlers get a context
  with `room`, `player`, `args`, `text`, `data` and `rooms`.
- Helpers: `ctx.reply`, `ctx.broadcast`, `ctx.title`, `ctx.bar` (0..1).
- Events: `chat`, `join`, `leave`, `tick` (every 4 s).
- `api.log(message)` writes to the server console; `api.data` is a per-mod dict.
- `GET /api/mods` lists every loaded mod, its commands, its events and any load
  errors. `/help` appends mod commands to the built-in list.

Two examples ship in `mods/`: **Welcome Kit** (arrival title card, `/ping`,
`/tips`, `/arrivals`) and **Convoy Events** (periodic road events with a boss-bar
countdown, `/convoy`, `/events`). See `mods/README.md` for the full contract.

### Chat

The log is built for reading: 13.5px text on near-opaque panels, timestamps,
channel tags, and tabs for **All / IC / OOC / Dice**. The pill beside the input
switches between in-character speech and out-of-character table talk; `/ooc` does
the same thing inline.

| Command | Effect |
| --- | --- |
| `/roll 2d6+3` | Dice resolved on the server, announced to everyone |
| `/me draws a blade` | Narrate an action |
| `/try to talk the guard down` | Attempt something uncertain — rolls d20 + your best attribute |
| `/draw [blade\|bow\|staff]` | Draw steel; everyone within reach must answer |
| `/sheathe` | Put it away |
| `/fear <reaction>` | Answer a drawn weapon in character |
| `/look <name>` | Study someone's character sheet (private) |
| `/ooc <text>` | Speak as yourself, out of character |
| `/rules` | Short reminder of the Codex |
| `/who`, `/help` | Who is present; all commands |

### Character

The character panel asks for a full person, not just a name: age, pronouns,
trade, origin, appearance, weakness, fear, dream and history — plus calling,
cloak and sigil colours, skin tone, hair colour and style, and build. **Roll a
wanderer** generates a whole sheet whose history is tied to the hold (the Ember
Marches, the Frostfall Reaches, the Salt Road, the Wardens of the Ash), so nobody
arrives as a tourist from another genre. Everything is saved in `localStorage`
and travels with you into every hall.

The sheet editor is `public/js/menu.js`; the in-game paper doll is `public/js/character.js`,
and the playable avatar is built from it in `public/js/world.js`.

## The Codex

The written rules live in `server.py` as `CODEX` and are served to every client at
`GET /api/codex`. The menu's **Codex** panel and the in-game `K` overlay render
the same text, so host and players cannot drift apart.

It defines:

- **World logic** — the hold's physics (cold iron, lightless flame, sound-eating
  mist), its society (neutral ground, the Wardens of the Ash, names given not
  taken), time, travel, and what every character already knows about the place.
- **Table law** — eight rules covering one character/one body, world consistency,
  no godmoding, Fear RP, no metagaming, the IC/OOC boundary, losing with grace,
  and the wardens' law on profanity and bans.
- **Terminology** — IC, OOC, godmoding, powergaming, metagaming, Fear RP.
- **Commands** — the full list above.

Some of it is enforced by the server rather than trusted to good manners:

| Behaviour | Server response |
| --- | --- |
| Deciding another character's wound or death (`I stab you`, `/me kills him`, `you die`) | `422` with a hint to describe intent or use `/try`; not broadcast |
| OOC knowledge in IC speech (`my character`, `on discord`, `IRL`, `the server`) | `422`, pointing at `/ooc` |
| Profanity or slurs (leetspeak and spaced-out spellings included) | permanent ban by client, name and IP; removed from the hall; logged |
| Repeating the same line three times | `429`, then a strike and removal |
| Drawing a weapon within 9m | everyone close gets a 25-second Fear RP prompt and a red vignette until they `/fear` |

`/try` is the pressure valve: it rolls d20 + the best of Might/Wits/Charm/Luck
and tells the table whether the attempt was clean, partial, failed or went badly
wrong.

## The Codex — enforcement

The Codex is not just reference text. Several lines are enforced at the API layer
in `server.py` rather than trusted to good manners, and the client shows the same
rule set in the menu and the in-game `K` overlay.

| Behaviour | Server response |
| --- | --- |
| Deciding another character's wound or death (`I stab you`, `/me kills him`, `you die`) | `422` with a hint to describe intent or use `/try`; not broadcast |
| OOC knowledge in IC speech (`my character`, `on discord`, `IRL`, `the server`) | `422`, pointing at `/ooc` |
| Profanity or slurs (leetspeak and spaced-out spellings included) | permanent ban by client, name and IP; removed from the hall; logged |
| Repeating the same line three times | `429`, then a strike and removal |
| Drawing a weapon within 9m | everyone close gets a 25-second Fear RP prompt and a red vignette until they `/fear` |

`/try` is the pressure valve: it rolls d20 + the best of Might/Wits/Charm/Luck
and tells the table whether the attempt was clean, partial, failed or went badly
wrong.

## The loading experience and startup sequence

Startup is intentionally visible in two stages so the player always knows what the
client is doing.

1. **Boot** — `boot()` runs in `public/js/main.js`. It shows the `#boot` overlay
   while the client connects to the server, updates the text to "Sunucuara
   bağlanılıyor…" during connection, and hides the boot overlay once the session
   data arrives.
2. **Loading screen** — `startSession()` then shows `#loading-screen` (styled in
   `public/css/loadscreen.css`) while the world object is built and the camera
   unlocks. The message starts as "Dünya yükleniyor…" and the spinner runs until
   the first playable frame.

The boot element is hidden, not removed, so the loading screen can take over without
rebuilding the DOM. That matters for the in-game load sequence: `World.start()`
completes the loading screen animation and fades it out before the first frame of
the plaza.

If either screen goes missing, check that `public/index.html` still contains the
`#boot` and `#loading-screen` elements and that `public/js/loadscreen.js` is loaded.

## The loading experience and startup sequence

Startup is intentionally visible in two stages so the player always knows what the
client is doing.

1. **Boot** — `boot()` runs in `public/js/main.js`. It shows the `#boot` overlay
   while the client connects to the server, updates the text to "Sunucuara
   bağlanılıyor…" during connection, and hides the boot overlay once the session
   data arrives.
2. **Loading screen** — `startSession()` then shows `#loading-screen` (styled in
   `public/css/loadscreen.css`) while the world object is built and the camera
   unlocks. The message starts as "Dünya yükleniyor…" and the spinner runs until
   the first playable frame.

The boot element is hidden, not removed, so the loading screen can take over without
rebuilding the DOM. That matters for the in-game load sequence: `World.start()`
completes the loading screen animation and fades it out before the first frame of
the plaza.

If either screen goes missing, check that `public/index.html` still contains the
`#boot` and `#loading-screen` elements and that `public/js/loadscreen.js` is loaded.

## The warden's panel and bans

Hosting starts an admin key (printed at startup, or set with `--admin-key` or the
`AETHERHOLD_ADMIN_KEY` environment variable). The panel at `/admin?key=…` shows:

- the live table, room by room: name, class, age, IP, idle time, drawn weapon,
  strikes, with **Kick** and **Ban** buttons;
- the ban list with **Lift** buttons;
- a broadcast box (one room or all rooms) and the profanity-filter mode;
- the server screen: joins, leaves, warnings, kicks, bans and admin actions.

The same actions are available from the console while the server runs:

```
rooms                     list rooms and players
list [CODE]               detailed view of one room
say [CODE] <text>         broadcast as the wardens
kick <name|id> [reason]   remove a player
ban <name|id> [reason]    remove and bar the player
unban <name|id|banId>     lift a ban
bans                      show the ban list
filter <ban|log|off>      profanity handling
panel                     print the admin panel address
stop                      close the realm
```

Bans are written to `bans.json` next to `server.py` (`--bans-file` overrides),
survive restarts, and match on the browser's persistent client id, the character
name, and the IP address. Loopback addresses are exempt from the IP check so a
host testing alone cannot lock out the whole machine. `--filter log` records
profanity without banning, and `--filter off` disables the check entirely.

The panel is protected by the key only — anyone on your LAN with the key can use
it, so treat the printed URL as a password.

## How it works

`server.py` is a `ThreadingHTTPServer` that serves `public/` and a JSON API:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | Server name/version, room count, filter mode, region, modules |
| `GET /api/mods` | Loaded mods, their commands/events and any load errors |
| `GET /api/world` | Road graph, places, roads, vehicles and climate |
| `GET/POST /api/fleet` | Read and act on a parked fleet (refuel, repair, travel, cargo) |
| `GET /api/codex` | The written world logic, table law, terms and commands |
| `GET /api/rooms` | Public room list |
| `POST /api/rooms` | Create a room and join it |
| `POST /api/rooms/<code>/join` | Join, with optional password and character sheet |
| `POST /api/rooms/<code>/sync` | Push pose, head look, pitch, animation; pull players, fear state and messages |
| `POST /api/rooms/<code>/chat` | Chat, OOC, dice, emotes, `/try`, weapons, `/look` (rate limited) |
| `POST /api/rooms/<code>/leave` | Leave the hall |
| `GET /admin` | The warden's panel (needs the key) |
| `GET /api/admin/state` | Live rooms, players, bans, event log |
| `POST /api/admin/action` | `kick`, `ban`, `unban`, `broadcast`, `filter`, `clearLog` |

Each room keeps up to 250 messages, drops players who stop syncing for 15
seconds, and reclaims empty rooms after 30 minutes. Per-player tokens are
generated on join and are required for every room call; `/look` replies are
addressed to one player and filtered out of everyone else's sync.

The client syncs at roughly 9 Hz and interpolates remote avatars between updates,
including head yaw and pitch, so movement and glances stay smooth without a
WebSocket dependency.

## Testing

The page ships a tiny in-page harness that can run a few start-up assertions when
the file is opened directly. It is not a replacement for a real test runner.

- `bootFlow` — guards that the boot overlay appears while the client connects.
- `audioSfx` — guards that tone shapes exist for hover, click, chime, enter, dice,
  message and error.
- `chatChannels` — guards that the client distinguishes IC, OOC and roll lines.
- `ambientMusic` — guards that the playlist preset is five named tracks.
- `loadscreenSequence` — guards that the loading screen appears on world entry and
  that the boot element is reused rather than removed.

Run it from the command line with:

```bash
python3 - <<'PY'
import urllib.request, pathlib
page = pathlib.Path('public/index.html').read_text(encoding='utf-8')
node = pathlib.Path('node_modules/.bin/node')
if not node.exists():
    node = pathlib.Path('node')
node.write_text("""
var page = \"\"\"%s\"\"\";
var vm = require('vm');
var context = vm.createContext({ console: console, localStorage: localStorage, matchMedia: matchMedia });
new Function('return ' + page.match(/<head>(.*?)<\/head>/s)[1])();
""").write_text(
    'const fs = require("fs");\nconst page = fs.readFileSync("public/index.html", "utf8");\n' +
    'document = { getElementById: (id) => null };\n' +
    'localStorage = {};\n' +
    'matchMedia = () => ({ matches: false });\n' +
    'console = { log: (...a) => console.log(...a) };\n' +
    'vm = require("vm");\n' +
    'context = vm.createContext({ document, console, localStorage, matchMedia });\n' +
    'vm.runInContext(page.match(/<script[^>]*>([\\s\\S]*?)<\\/script>/)[1], context);\n'
)
PY
```

That helper is illustrative, not required; the relevant guards are the ones in
`public/js/main.js` and `public/js/audio.js` that set `window.testHarness` and the
new `loadscreenSequence` test in `public/js/test-loadscreen.js`.

## Layout

```
server.py              host/connect modes, room API, Codex, moderation, admin panel
public/index.html      menu markup, HUD, chat, overlays, boot and loading screen elements, boot and loading screen elements
public/css/            the look: style.css plus loadscreen.css for the in-game loader
public/js/main.js      bootstrap, session lifecycle, chat channels, fear prompts, startup tests, startup tests
public/js/menu.js      menu panels, character sheet editor, codex, room browser
public/js/world.js     three.js plaza, movement, mouse/head look, camera modes, env map
public/js/region.js    ring highway, stops, street furniture, vehicles
public/js/worldmap.js  road map with fog of war and travel
public/js/character.js articulated humanoid avatars, faces, props, animation
public/js/backdrop.js  animated menu diorama
public/js/net.js       API client
public/js/store.js     classes, palettes, character defaults, persistence
public/js/audio.js     procedural ambience, interface sounds and the music playlist
public/js/loadscreen.js  in-game loading overlay shown between menu and world
public/js/test-loadscreen.js  startup test for the boot-and-loading-screen sequence
public/js/loadscreen.js  in-game loading overlay shown between menu and world
public/js/test-loadscreen.js  startup test for the boot-and-loading-screen sequence
mods/                  drop-in server extensions (*.py) + their README
public/vendor/         three.js r160 (MIT)
```

## Loading screens

Two overlays own the transition from menu to world:

- **Boot** — a small crest and bar shown by `boot()` while the client connects to
  the server. It reads "Kindling the embers…" while connecting, then "All systems
  nominal" on success. It is hidden, not removed, so the in-game loading screen can
  take over cleanly.
- **Loading screen** — a spinner and line shown by `startSession()` while the world
  is being built and the camera unlocks. It animates to "Ready" and fades out before
  the first frame of the plaza.

Both are intentional: the boot screen owns the network handoff, the loading screen
owns the client-side warm-up. If either is missing, check that `public/index.html`
still contains the `#boot` and `#loading-screen` elements.

## Deploy for free

See [docs/DEPLOY.md](docs/DEPLOY.md) for a step-by-step free deployment on Render
(via GitHub) plus a no-sleep alternative on Northflank. `server.py` reads `PORT`
and `AETHERHOLD_DB` from the environment, so it runs on any of those hosts
without flags.

## License

The server (`server.py`, `mods/`, this README) is MIT. The vendored three.js copy
in `public/vendor/` is MIT under its own license. The client assets are likewise
MIT unless a file says otherwise.

## Releases

- **v1.2.0 (loader fix)** — the loading screen now always closes: `InventoryUI`
  grew the `setHost()` contract the session entry expects (its absence threw and
  stranded the client on "Dünya yükleniyor…"), UI wiring is defensive, and a
  25-second failsafe force-closes the overlay if world entry ever fails again.
- **v1.2.0** — added a visible loading screen between menu and world, plus a boot
  overlay that shows while the client connects to the server. Background audio and
  the music playlist were hardened so suspended AudioContexts no longer swallow the
  first cue. Startup tests in `public/js/main.js` and `public/js/test-loadscreen.js`
  now exercise the boot flow, audio cues, chat channels, ambient music and the
  loadscreen sequence.

## Troubleshooting

- **"Could not reach that host"** — the server is not running at that address, or
  a firewall is blocking the port. Guests must use the host's LAN address, not
  `localhost`.
- **The mouse does not capture** — the browser refused pointer lock (embedded
  webviews often do). Dragging still turns the head; fullscreen and pointer lock
  both need a real click on the page.
- **Rooms vanish** — rooms are closed once nobody has synced for a while, and an
  empty room is reclaimed after 30 minutes. Reopen it from the Host panel.  - **"You are barred from this realm"** — a ban matches your browser, name or IP.
  The host can lift it from the panel or with `unban <name>` in the console.
- **Port already in use** — pass another `--port`, or `--port 0` for any free one.



- **Background sound or the music playlist stays silent** — the engine tries to
  resume a suspended context, but some browsers only allow that after a real user
  gesture on the page. Click once on the world, then check Settings → Controls &
  Audio. If a track never starts, confirm that `sfx` and `music` are both non-zero
  and that `public/js/audio.js` is loading without console errors.
- **Loading screen never appears** — confirm that `public/index.html` still has the
  `#loading-screen` element, that `public/js/loadscreen.js` is loaded, and that
  `public/js/world.js` is calling `initSystems()` before `start()`. If the boot
  overlay is missing too, check that the `#boot` element is still in the markup.
