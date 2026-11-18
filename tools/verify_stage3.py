#!/usr/bin/env python3
"""Drive the stage-three build in the Playwright Chromium and measure it: console errors, the size
of the crowd and the fleet, how many of them actually moved between two frames, whether the
contextual prompts appear and then fade, that a mission still completes and pays, and that a crime
still raises the wanted level. Prints numbers, then PASS or FAIL.

    python3 tools/verify_stage3.py
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

IDLE = """{axisForward:()=>0,axisStrafe:()=>0,sprinting:false,handbrake:false,consumePress:()=>false,endFrame:()=>{}}"""


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


class Server(socketserver.TCPServer):
    allow_reuse_address = True


def main():
    handler = functools.partial(Quiet, directory=str(GAME))
    httpd = Server(("127.0.0.1", 8474), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()

    results = {}
    errors = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=CHROME, args=ARGS)
        page = browser.new_page(viewport={"width": 900, "height": 520}, device_scale_factor=1)
        page.set_default_timeout(120000)
        page.on("pageerror", lambda error: errors.append(f"pageerror: {error}"))
        page.on("console", lambda message: errors.append(f"console.{message.type}: {message.text}")
                if message.type == "error" else None)

        page.goto("http://127.0.0.1:8474/index.html?seed=1", wait_until="load")
        page.wait_for_function("window.palmHavoc && window.palmHavoc.ready === true", timeout=180000)

        results["cash_at_boot"] = page.evaluate("document.getElementById('cash-value').textContent")
        results["old_hint_strip_gone"] = page.evaluate("!document.getElementById('hint')")
        page.click("#start-button")
        for _ in range(3):
            page.keyboard.press("Enter")
            page.wait_for_timeout(500)
        page.wait_for_function("!document.getElementById('intro').classList.contains('visible')", timeout=30000)

        # The prompt shows while it is useful...
        try:
            page.wait_for_function("document.getElementById('prompt').classList.contains('visible')", timeout=20000)
            results["prompt_appeared"] = True
        except Exception:
            results["prompt_appeared"] = False
        results["prompt_text"] = page.evaluate("document.getElementById('prompt-text').textContent")
        # Counts and movement between two frames, one simulated second apart.
        results["cars"] = page.evaluate("window.palmHavoc.traffic.cars.filter(c => c.alive).length")
        results["pedestrians"] = page.evaluate("window.palmHavoc.pedestrians.people.length")
        results["shops"] = page.evaluate("window.palmHavoc.city.buildings.filter(b => b.shop).length")
        results["shop_names"] = page.evaluate("new Set(window.palmHavoc.city.buildings.filter(b => b.shop).map(b => b.shop)).size")
        moved = page.evaluate(f"""() => {{
          const h = window.palmHavoc, IDLE = {IDLE};
          const before = h.traffic.cars.filter(c => c.alive).map(c => ({{ car: c, along: c.along }}));
          const people = h.pedestrians.people.map(p => ({{ p, x: p.x, z: p.z }}));
          for (let i = 0; i < 60; i += 1) h.game.step(1 / 60, IDLE, h.game.mode);
          return {{
            carsMoved: before.filter(e => Math.abs(e.car.along - e.along) > 0.5).length,
            walkersMoved: people.filter(e => Math.hypot(e.p.x - e.x, e.p.z - e.z) > 0.1).length,
            moving: h.traffic.cars.filter(c => c.alive && c.speed > 1).length,
          }};
        }}""")
        results.update(moved)

        # The prompt fades once the player walks somewhere it has nothing to say. The render loop
        # in this container is throttled to about one frame a second, so the scene clock is driven
        # by hand here: the same prompt and HUD code the frame loop calls, run for twenty seconds
        # of game time, with the player out on the sand where there is no car to point at.
        page.evaluate("""() => {
          const h = window.palmHavoc;
          h.game.teleport(0, -330, 0);
          for (let i = 0; i < 60 * 20; i += 1) {
            h.game.tickPrompts(1 / 60);
            h.hud.update(1 / 60, h.game.hudState());
          }
        }""")
        page.wait_for_timeout(1200)
        results["prompt_after_walk"] = page.evaluate("""() => {
          const el = document.getElementById('prompt');
          return { visibleClass: el.classList.contains('visible'), opacity: getComputedStyle(el).opacity,
                   promptClock: Math.round(window.palmHavoc.game.time) };
        }""")
        results["prompt_seen_then_gone"] = bool(results["prompt_text"]) and not results["prompt_after_walk"]["visibleClass"]

        # A crime still raises the level, and the HUD lights the stars.
        page.evaluate("window.palmHavoc.police.crime(2, 'verify')")
        page.evaluate(f"for (let i = 0; i < 240; i += 1) window.palmHavoc.game.step(1 / 60, {IDLE}, window.palmHavoc.game.mode)")
        page.evaluate("window.palmHavoc.hud.update(0.016, window.palmHavoc.game.hudState())")
        results["stars"] = page.evaluate("window.palmHavoc.police.stars")
        results["hud_stars_lit"] = page.evaluate("document.querySelectorAll('#wanted .star.lit').length")

        # Mission one, driven through the game's own rules: steal, then reach the pier.
        page.evaluate("""() => {
          const h = window.palmHavoc;
          h.police.reset();
          h.missions.stole();
          const pier = h.missions.context.landmarks.pier;
          h.game.teleport(pier.x, pier.z + 6, 0);
        }""")
        page.evaluate(f"for (let i = 0; i < 300; i += 1) window.palmHavoc.game.step(1 / 60, {IDLE}, window.palmHavoc.game.mode)")
        results["mission_completed"] = page.evaluate("window.palmHavoc.missions.completed.includes('curb-service')")
        results["cash_after_mission"] = page.evaluate("window.palmHavoc.missions.cash")
        results["hud_cash"] = page.evaluate("document.getElementById('cash-value').textContent")
        page.evaluate("window.palmHavoc.game.saveNow()")
        results["save_cash"] = page.evaluate("JSON.parse(localStorage.getItem('palm-havoc-save-v1')).cash")

        browser.close()
    httpd.shutdown()

    print(json.dumps(results, indent=1))
    print("console errors:", errors[:6] if errors else "none")

    ok = (
        not errors
        and results["prompt_appeared"]
        and not results["prompt_after_walk"]["visibleClass"]
        and float(results["prompt_after_walk"]["opacity"]) < 0.05
        and results["old_hint_strip_gone"]
        and results["cars"] >= 120
        and results["pedestrians"] >= 160
        and results["carsMoved"] >= 50
        and results["walkersMoved"] >= 60
        and results["stars"] >= 2
        and results["hud_stars_lit"] == results["stars"]
        and results["mission_completed"]
        and results["cash_after_mission"] == results["save_cash"]
        and results["hud_cash"].replace("$", "").replace(",", "") == str(results["cash_after_mission"])
    )
    print("verify stage 3:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
