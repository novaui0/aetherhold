import json
import urllib.request
import urllib.error
import uuid

BASE = "http://127.0.0.1:8201"
CLIENT = "t" + uuid.uuid4().hex[:12]
passed = 0
failed = []


def call(path, body=None, headers=None, method=None):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method or ("POST" if data else "GET"))
    req.add_header("Content-Type", "application/json")
    for key, value in (headers or {}).items():
        req.add_header(key, value)
    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            return res.status, json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read().decode("utf-8"))


def check(label, condition, detail=""):
    global passed
    if condition:
        passed += 1
        print(f"ok   {label}")
    else:
        failed.append(label)
        print(f"FAIL {label} {detail}")


status, health = call("/api/health")
check("health ok", status == 200 and health.get("ok"))
check("region is turkey", health.get("region") == "turkey")
check("language is tr", health.get("language") == "tr")
check("modules include vehicles", "vehicles" in health.get("modules", []))

status, world = call("/api/world?region=turkey")
w = world.get("world", {})
check("world served", status == 200 and len(w.get("nodes", [])) == 20)
check("world roads", len(w.get("roads", [])) == 30)
check("world currency", w.get("currency") == "₺")
check("world timezone", w.get("timezone") == "Europe/Istanbul")
kinds = {node["kind"] for node in w.get("nodes", [])}
for kind in ("metropolis", "town", "fuel", "pass", "historic", "viewpoint", "camp"):
    check(f"world has {kind}", kind in kinds or any(kind in n["services"] for n in w.get("nodes", [])))
check("world vehicles", len(w.get("vehicles", [])) == 3)
check("unknown region 404", call("/api/world?region=mars")[0] == 404)

status, fleet_res = call(f"/api/fleet?client={CLIENT}")
fleet = fleet_res.get("fleet", {})
check("fleet defaults", status == 200 and fleet.get("vehicle") == "truck")
check("fleet starts at istanbul", fleet.get("node") == "istanbul")
check("fleet tank full", abs(fleet.get("fuel", 0) - 240) < 0.01)
check("fleet range positive", fleet.get("rangeKm", 0) > 500)
check("fleet sees neighbours", "bursa" in fleet.get("discovered", []))
check("fleet cash", fleet.get("cash", 0) == 28000.0)
check("fleet currency", fleet.get("currency") == "₺")

status, travel = call("/api/fleet", {"clientId": CLIENT, "action": "travel", "to": "bursa"})
tf = travel.get("fleet", {})
check("travel to bursa", status == 200 and tf.get("node") == "bursa", travel)
check("travel burns fuel", 0 < travel.get("spent", 0) < 100, travel)
check("travel spends fuel", tf.get("fuel", 999) < 240)
check("travel adds odometer", tf.get("odometer", 0) > 0)
check("travel reveals roads", len(tf.get("discovered", [])) > 2)
check("travel returns road", travel.get("road", {}).get("kind") == "highway")

status, blocked = call("/api/fleet", {"clientId": CLIENT, "action": "travel", "to": "antalya"})
check("unscouted travel blocked", status == 403, blocked)

status, refuel = call("/api/fleet", {"clientId": CLIENT, "action": "refuel", "litres": 20})
rf = refuel.get("fleet", {})
check("refuel at bursa", status == 200 and rf.get("fuel", 0) > tf.get("fuel", 0), refuel)
check("refuel costs cash", rf.get("cash", 99999) < tf.get("cash", 0))
check("refuel charges", refuel.get("cost", 0) > 0)

status, repair = call("/api/fleet", {"clientId": CLIENT, "action": "repair"})
check("repair needs a garage", status == 409, repair)

status, buy = call("/api/fleet", {"clientId": CLIENT, "action": "buy", "part": "tire", "qty": 2})
bf = buy.get("fleet", {})
check("buy parts", status == 200 and bf.get("cargo", {}).get("tire") == 2, buy)
check("cargo weight", bf.get("cargoKg") == 44.0, bf)

status = 0
for _ in range(3):
    status, tooheavy = call("/api/fleet", {"clientId": CLIENT, "action": "buy", "part": "crate", "qty": 20})
check("cargo capacity enforced", status == 409, tooheavy)

status, saved = call("/api/fleet", {"clientId": CLIENT, "action": "save", "pos": [3, 0, -2], "fuel": 5, "condition": 55, "odometer": 999})
sf = saved.get("fleet", {})
check("save clamps fuel", status == 200 and sf.get("fuel") == 5, saved)
check("save condition", sf.get("condition") == 55)

status, tow = call("/api/fleet", {"clientId": CLIENT, "action": "tow"})
towf = tow.get("fleet", {})
check("tow to garage", status == 200 and "garage" in next(
    n["services"] for n in w["nodes"] if n["id"] == towf.get("node")), tow)
check("tow costs", towf.get("cash", 99999) < sf.get("cash", 0))

status, rep = call("/api/fleet", {"clientId": CLIENT, "action": "repair"})
check("repair at garage", status == 200 and rep.get("fleet", {}).get("condition") == 100, rep)

status, pour = call("/api/fleet", {"clientId": CLIENT, "action": "pour_jerrycan"})
check("no jerrycan", status == 409, pour)

status, bad = call("/api/fleet", {"clientId": CLIENT, "action": "fly"})
check("unknown fleet action", status == 404, bad)
check("fleet needs client", call("/api/fleet?client=")[0] == 400)

status, denied = call("/api/admin/state")
check("admin state needs auth", status == 401, denied)
status, wrong = call("/api/admin/login", {"password": "nope"})
check("admin wrong password", status == 401, wrong)
status, login = call("/api/admin/login", {"password": "wardentest"})
token = login.get("token")
check("admin login", status == 200 and bool(token), login)
status, state = call("/api/admin/state", headers={"X-Admin-Key": token})
check("admin session works", status == 200 and state.get("ok"), state)
check("admin config region", state.get("config", {}).get("region") == "turkey")
check("admin world stats", state.get("world", {}).get("roads") == 30)
check("admin fleet count", state.get("world", {}).get("fleet", 0) >= 1)
status, badtoken = call("/api/admin/state", headers={"X-Admin-Key": "not-a-session"})
check("bad session rejected", status == 401)

page = urllib.request.urlopen(BASE + "/admin", timeout=10).read().decode("utf-8")
check("panel login gate served", 'id="gate-password"' in page and "Unseal the panel" in page)
check("panel asks for password", "warden's password" in page)

print("")
print(f"{passed} passed, {len(failed)} failed")
if failed:
    print("FAILED:", failed)
    raise SystemExit(1)
