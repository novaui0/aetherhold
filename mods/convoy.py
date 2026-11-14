"""Convoy Events — periodic road events announced with a title card and boss bar.

Every ~2 minutes (every 30 ticks) an event starts in each live room: a boss bar
counts down at the top of the screen, then the outcome lands as a system line.
Players can also call /convoy themselves.
"""

MOD = {
    "name": "Convoy Events",
    "version": "1.0",
    "author": "Aetherhold",
    "description": "Timed road events with a top-screen countdown and /convoy.",
}

EVENTS = [
    ("CONVOY FORMING", "Assembly at the north gate — fuel up", "The convoy rolls out. Six rigs, one road."),
    ("STORM FRONT", "Ice on the pass — chains or patience", "The front passed. Two axles did not."),
    ("FUEL SHORTAGE", "The depot is dry until dawn", "Tankers arrived. Prices doubled, as promised."),
    ("BANDITS ON THE RING", "Armed men at kilometre 40", "The ring is quiet again. Nobody asks how."),
    ("BRIDGE CLOSED", "Canyon route only — no trailers", "The bridge reopened with fresh weld marks."),
]

TICK_INTERVAL = 4.0          # must match server start_mod_ticker()
TICKS_PER_EVENT = 45         # 45 * 4s = 3 minutes
EVENT_TICKS = 15             # 15 * 4s = 1 minute of countdown


def register(api):
    state = api.data
    state.setdefault("ticks", 0)
    state.setdefault("active", None)
    state.setdefault("index", 0)

    def begin(room):
        title, sub, outcome = EVENTS[state["index"] % len(EVENTS)]
        state["index"] += 1
        state["active"] = {"left": EVENT_TICKS, "outcome": outcome}
        room.broadcast({
            "kind": "title", "from": None, "text": title,
            "detail": sub, "mod": "convoy",
        })

    def end(room):
        active = state["active"]
        state["active"] = None
        if active:
            room.broadcast({
                "kind": "system", "from": None,
                "text": active["outcome"], "mod": "convoy",
            })

    @api.command("convoy", "Call the next convoy event now", aliases=("c",))
    def convoy(ctx):
        if state["active"]:
            return "A convoy event is already running."
        begin(ctx.room)
        return "You called it. Watch the top of the screen."

    @api.command("events", "List the road events this server can roll")
    def events(ctx):
        return " · ".join(title.title() for title, _, _ in EVENTS)

    @api.on("tick")
    def tick(ctx):
        state["ticks"] += 1
        for room in list(ctx.rooms.values()):
            if len(room.players) == 0:
                continue
            if state["active"] is None:
                if state["ticks"] % TICKS_PER_EVENT == 0:
                    begin(room)
                continue
            state["active"]["left"] -= 1
            left = state["active"]["left"]
            fraction = max(0.0, min(1.0, left / EVENT_TICKS))
            if left <= 0:
                end(room)
            elif left % 2 == 0:
                room.broadcast({
                    "kind": "bar", "from": None,
                    "text": f"Event ending in {left * int(TICK_INTERVAL)}s",
                    "detail": f"{fraction:.3f}", "mod": "convoy",
                })
