"""Welcome Kit — greets arrivals with a title card and hands out small utilities.

Drop-in mod for Aetherhold. Delete the file to remove it entirely.
"""

MOD = {
    "name": "Welcome Kit",
    "version": "1.1",
    "author": "Aetherhold",
    "description": "Title card on arrival, /ping latency check and a /tips rotation.",
}

TIPS = [
    "E enters the truck — E again steps out.",
    "M opens the road map. Pick a stop, then Travel.",
    "Fuel is listed per road in the map panel; empty tanks are towed.",
    "Repair shops bring condition back above 80%.",
    "The codex is K. Charisma is not a substitute for brakes.",
]

TAGLINES = {
    "turkey": "ANADOLU HATTI",
    "america": "THE LONG ROAD",
    "europe": "THE OLD HIGHWAY",
}


def register(api):
    state = api.data
    state.setdefault("arrivals", 0)
    state.setdefault("tip", 0)

    @api.on("join")
    def welcome(ctx):
        state["arrivals"] += 1
        room = ctx.room
        world = getattr(room, "theme", "ember")
        tagline = TAGLINES.get(getattr(room, "region", ""), "WELCOME TO THE ROAD")
        ctx.title(ctx.player.name.upper(), tagline)
        ctx.bar(f"{len(room.players)} on the road · {ctx.player.cls}", 0.35)
        ctx.reply(
            f"Welcome aboard, {ctx.player.name}. /tips for a quick hint, /ping to check the wire."
        )
        api.log(f"{ctx.player.name} arrived ({state['arrivals']} total) in {world}")

    @api.command("ping", "Check the round trip to the host")
    def ping(ctx):
        return "pong — you are talking to the host right now."

    @api.command("tips", "Show the next driving tip", aliases=("tip",))
    def tips(ctx):
        index = state["tip"] % len(TIPS)
        state["tip"] += 1
        ctx.reply(f"Tip {index + 1}/{len(TIPS)}: {TIPS[index]}")
        return None

    @api.command("arrivals", "How many travellers have arrived")
    def arrivals(ctx):
        return f"{state['arrivals']} travellers have stepped off the mist since boot."
