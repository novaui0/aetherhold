# Aetherhold mods

Drop a `*.py` file into this folder and restart the server. Every file is
imported at boot, in alphabetical order. A broken mod is reported and skipped —
it can never stop the realm from starting.

## Contract

```python
MOD = {
    "name": "Convoy Events",
    "version": "1.0",
    "author": "you",
    "description": "Random road events with a boss-bar countdown.",
}


def register(api):
    @api.command("convoy", "Announce the next convoy", aliases=("c",))
    def convoy(ctx):
        ctx.title("CONVOY FORMING", "Assembly at the north gate")
        ctx.bar("Convoy departs in 30s", 0.15)
        return "You called the convoy."     # privately answered to the caller

    @api.on("join")
    def greet(ctx):
        ctx.title("WELCOME", ctx.player.name)
```

### `api.command(name, help_text, aliases=())`

Registers `/name`. The handler receives a context (`ctx`) and may return a
string, which is sent back to the caller as a private system line.

Context fields:

| field | meaning |
| --- | --- |
| `ctx.room` | the room the command was typed in |
| `ctx.player` | the player who typed it |
| `ctx.args` | whitespace-split arguments |
| `ctx.text` | everything after the command name |
| `ctx.data` | the mod's own dict, kept for the lifetime of the process |
| `ctx.rooms` | all live rooms |

Context helpers:

| helper | effect |
| --- | --- |
| `ctx.reply(text)` | private system line to the caller |
| `ctx.broadcast(text)` | system line to the room |
| `ctx.title(title, sub)` | big centre-screen title + subtitle |
| `ctx.bar(text, 0..1)` | boss-bar strip across the top |

### `api.on(event)`

Events: `chat` (room, player, text), `join` (room, player),
`leave` (room, player), `tick` (every 4 seconds, no room).

### Other

- `api.log(message)` — prints with a `[mod:name]` prefix.
- `api.data` — a dict for counters and state. Not persisted across restarts.
- Module-level names must not clash with `server.py` globals you rely on.

## Seeing what is loaded

- `GET /api/mods` returns every loaded mod, its commands and any load errors.
- `/help` in chat lists mod commands after the built-in ones.
- The console banner shows `+ mod Name v1.0 — /commands` per loaded mod.
