# Aetherhold

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
| `Esc` | Release the mouse, close overlays, or pause |

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

## Layout

```
server.py              host/connect modes, room API, Codex, moderation, admin panel
public/index.html      menu markup, HUD, chat, overlays
public/css/style.css   the whole look, including the readability pass
public/js/main.js      bootstrap, session lifecycle, chat channels, fear prompts
public/js/menu.js      menu panels, character sheet editor, codex, room browser
public/js/world.js     three.js plaza, movement, mouse/head look, camera modes, env map
public/js/region.js    ring highway, stops, street furniture, vehicles
public/js/worldmap.js  road map with fog of war and travel
public/js/character.js articulated humanoid avatars, faces, props, animation
public/js/backdrop.js  animated menu diorama
public/js/net.js       API client
public/js/store.js     classes, palettes, character defaults, persistence
public/js/audio.js     procedural ambience, interface sounds and the music playlist
mods/                  drop-in server extensions (*.py) + their README
public/vendor/         three.js r160 (MIT)
```

## Troubleshooting

- **"Could not reach that host"** — the server is not running at that address, or
  a firewall is blocking the port. Guests must use the host's LAN address, not
  `localhost`.
- **The mouse does not capture** — the browser refused pointer lock (embedded
  webviews often do). Dragging still turns the head; fullscreen and pointer lock
  both need a real click on the page.
- **Rooms vanish** — rooms are closed once nobody has synced for a while, and an
  empty room is reclaimed after 30 minutes. Reopen it from the Host panel.
- **"You are barred from this realm"** — a ban matches your browser, name or IP.
  The host can lift it from the panel or with `unban <name>` in the console.
- **Port already in use** — pass another `--port`, or `--port 0` for any free one.
