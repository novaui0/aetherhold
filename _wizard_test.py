import builtins
import io
import sys
import types

import server

answers = iter(["2", "2", "", "10", "", "wizard_test.db", "Y"])
builtins.input = lambda prompt="": next(answers)
sys.stdin = types.SimpleNamespace(isatty=lambda: True)

args = types.SimpleNamespace(
    no_wizard=False, language="", region="turkey", name="", slots=12,
    modules="vehicles,logistics,world", db="",
)
config = server.setup_wizard(args)
print("\nRESULT:", config)
assert config["language"] == "tr", config
assert config["region"] == "america", config
assert config["name"] == "Transcontinental Freight Line", config
assert config["slots"] == 10, config
assert config["modules"] == ["vehicles", "logistics", "world"], config
assert config["db"] == "wizard_test.db", config

# Cancelling must not open anything.
answers = iter(["1", "1", "", "", "", "", "N"])
builtins.input = lambda prompt="": next(answers)
assert server.setup_wizard(args) is None

# Non-interactive hosts skip the wizard and take flags.
sys.stdin = types.SimpleNamespace(isatty=lambda: False)
args.language = "en"
args.region = "america"
args.name = "Flag Server"
args.slots = 6
auto = server.setup_wizard(args)
assert auto["region"] == "america" and auto["name"] == "Flag Server" and auto["slots"] == 6, auto

# Region catalogs must both build valid graphs with symmetric road lookups.
for key in server.REGIONS:
    world = server.build_world(key)
    ids = {node["id"] for node in world["nodes"]}
    assert world["start"] in ids
    for road in world["roads"]:
        assert road["from"] in ids and road["to"] in ids
        assert 0 < road["km"] < 3000
    print(key, len(world["nodes"]), "places", len(world["roads"]), "roads", "OK")

print("WIZARD_OK")
