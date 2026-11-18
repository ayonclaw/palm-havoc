#!/usr/bin/env python3
"""Drive the game in the Playwright Chromium and check it actually works: no console errors, traffic
and pedestrians moving between frames, car theft, a wanted level answered by cruisers, combat, a
mission completed through the game's own rules, and the save.

SwiftShader throttles requestAnimationFrame in this headless container to about one frame a second,
so every interaction is polled for rather than assumed to land on a particular frame.

    python3 tools/verify.py
"""

import functools
import http.server
import json
import pathlib
import socketserver
import threading

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
GAME = ROOT / "game"
CHROME = "/home/ubuntu/.cache/ms-playwright/chromium-1234/chrome-linux/chrome"
ARGS = [
    "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
    "--no-sandbox", "--disable-dev-shm-usage", "--ignore-gpu-blocklist",
]


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


class Server(socketserver.TCPServer):
    allow_reuse_address = True


def press_until(page, key, condition, attempts=8):
    """Press a key, then wait for the world to catch up; repeat while the condition is false."""
    for _ in range(attempts):
        page.keyboard.press(key)
        try:
            page.wait_for_function(condition, timeout=6000)
            return True
        except Exception:
            continue
    return False


def main():
    handler = functools.partial(Quiet, directory=str(GAME))
    httpd = Server(("127.0.0.1", 8472), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()

    results = {}
    errors = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=CHROME, args=ARGS)
        page = browser.new_page(viewport={"width": 800, "height": 450}, device_scale_factor=1)
        page.on("pageerror", lambda error: errors.append(f"pageerror: {error}"))
        page.on("console", lambda message: errors.append(f"console.{message.type}: {message.text}")
                if message.type == "error" else None)

        page.goto("http://127.0.0.1:8472/index.html?seed=1", wait_until="load")
        page.wait_for_function("window.palmHavoc && window.palmHavoc.ready === true", timeout=90000)

        page.click("#start-button")
        page.wait_for_timeout(500)
        for _ in range(3):
            page.keyboard.press("Enter")
            page.wait_for_timeout(400)
        page.wait_for_function("!document.getElementById('intro').classList.contains('visible')", timeout=20000)
        results["intro_done"] = True
        results["first_mission"] = page.evaluate("window.palmHavoc.missions.mission.id")
        results["objective"] = page.evaluate("document.getElementById('objective').textContent")

        # The world is alive: one car and one walker have to have moved by the next frames.
        page.evaluate("""() => {
          const h = window.palmHavoc;
          window.__probe = {
            cars: h.traffic.cars.filter(c => c.alive).map(c => c.along),
            ped: h.pedestrians.people[0].x + ',' + h.pedestrians.people[0].z,
            time: h.game.time,
          };
        }""")
        page.wait_for_function("""() => {
          const h = window.palmHavoc;
          const cars = h.traffic.cars.filter(c => c.alive);
          const moved = cars.filter((c, i) => Math.abs(c.along - window.__probe.cars[i]) > 1).length;
          return moved > 5
            || h.pedestrians.people[0].x + ',' + h.pedestrians.people[0].z !== window.__probe.ped;
        }""", timeout=60000)
        results["world_advanced_seconds"] = round(page.evaluate("window.palmHavoc.game.time - window.__probe.time"), 2)
        results["traffic_cars"] = page.evaluate("window.palmHavoc.traffic.cars.filter(c => c.alive).length")
        results["traffic_moving"] = page.evaluate("window.palmHavoc.traffic.cars.filter(c => c.alive && c.speed > 0.5).length")
        results["traffic_moved"] = page.evaluate("""() => {
          const cars = window.palmHavoc.traffic.cars.filter(c => c.alive);
          return cars.filter((c, i) => Math.abs(c.along - window.__probe.cars[i]) > 1).length;
        }""")
        results["traffic_changed"] = results["traffic_moved"] > 5
        results["pedestrians"] = page.evaluate("window.palmHavoc.pedestrians.people.length")
        results["pedestrian_moved"] = page.evaluate("window.palmHavoc.pedestrians.people[0].x + ',' + window.palmHavoc.pedestrians.people[0].z !== window.__probe.ped")

        # Car theft: stand by a traffic car and press E. Retry, because the car keeps driving.
        for _ in range(6):
            page.evaluate("""() => {
              const h = window.palmHavoc;
              if (h.mode() === 'car') return;
              const car = h.traffic.cars.find(c => c.alive && c.speed < 12) || h.traffic.cars.find(c => c.alive);
              const at = h.traffic.positionOf(car, h.camera.position.clone());
              h.game.teleport(at.x + 1.2, at.z + 1.2);
            }""")
            page.keyboard.press("KeyE")
            page.wait_for_timeout(2500)
            if page.evaluate("window.palmHavoc.mode() === 'car'"):
                break
        results["stole_car"] = page.evaluate("window.palmHavoc.mode() === 'car'")
        results["wanted_after_theft"] = page.evaluate("window.palmHavoc.police.stars")

        # Mission one: drive the stolen car to Pier Nine.
        page.evaluate("""() => {
          const h = window.palmHavoc;
          const pier = h.missions.context.landmarks.pier;
          h.game.teleport(pier.x, pier.z + 6, 0);
        }""")
        try:
            page.wait_for_function("window.palmHavoc.missions.completed.includes('curb-service')", timeout=30000)
        except Exception:
            pass
        results["mission_step"] = page.evaluate("window.palmHavoc.missions.step")
        results["mission_1_completed"] = page.evaluate("window.palmHavoc.missions.completed.includes('curb-service')")
        results["cash_after_mission_1"] = page.evaluate("window.palmHavoc.missions.cash")
        results["next_mission"] = page.evaluate("window.palmHavoc.missions.index")

        # A crime raises the level, and cruisers answer it.
        page.evaluate("window.palmHavoc.police.crime(2, 'verify');")
        page.wait_for_function("window.palmHavoc.police.units.length >= 1", timeout=60000)
        try:
            page.wait_for_function("document.querySelectorAll('#wanted .star.lit').length >= 3", timeout=20000)
        except Exception:
            pass
        results["wanted_stars"] = page.evaluate("window.palmHavoc.police.stars")
        results["police_units"] = page.evaluate("window.palmHavoc.police.units.length")
        results["hud_stars_lit"] = page.evaluate("document.querySelectorAll('#wanted .star.lit').length")

        # Combat: leave the car, then pull the trigger.
        page.keyboard.press("KeyE")
        page.wait_for_timeout(2500)
        results["left_car"] = page.evaluate("window.palmHavoc.mode() === 'foot'")
        page.evaluate("window.palmHavoc.combat.ammo = 12; window.palmHavoc.combat.cooldown = 0;")
        before_shots = page.evaluate("window.palmHavoc.combat.shots")
        page.keyboard.press("KeyF")
        try:
            page.wait_for_function(f"window.palmHavoc.combat.shots > {before_shots}", timeout=12000)
        except Exception:
            pass
        results["shots_fired"] = page.evaluate("window.palmHavoc.combat.shots") - before_shots

        page.evaluate("window.palmHavoc.game.saveNow()")
        results["save_present"] = page.evaluate("localStorage.getItem('palm-havoc-save-v1') !== null")

        browser.close()
    httpd.shutdown()

    print(json.dumps(results, indent=1))
    print("console errors:", errors[:8] if errors else "none")

    ok = (
        not errors
        and results["intro_done"]
        and results["traffic_changed"]
        and results["pedestrian_moved"]
        and results["traffic_moving"] > 10
        and results["stole_car"]
        and results["mission_1_completed"]
        and results["cash_after_mission_1"] > 0
        and results["wanted_stars"] >= 3
        and results["police_units"] >= 1
        and results["hud_stars_lit"] >= 3
        and results["shots_fired"] >= 1
        and results["save_present"]
    )
    print("verify:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
