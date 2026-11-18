#!/usr/bin/env python3
"""Capture one staged shot and print console errors plus a few counts.

    python3 tools/peek.py vista [--out /tmp/x.jpg] [--wait 4000]
"""
import argparse
import functools
import http.server
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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("shot")
    parser.add_argument("--out", default=None)
    parser.add_argument("--wait", type=int, default=3500)
    parser.add_argument("--port", type=int, default=8411)
    args = parser.parse_args()

    handler = functools.partial(Quiet, directory=str(GAME))
    httpd = Server(("127.0.0.1", args.port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()

    out = pathlib.Path(args.out or f"/tmp/peek-{args.shot}.jpg")
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=CHROME, args=ARGS)
        page = browser.new_page(viewport={"width": 1280, "height": 720}, device_scale_factor=1)
        errors = []
        page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
        page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
        page.goto(f"http://127.0.0.1:{args.port}/index.html?shot={args.shot}&seed=1", wait_until="load")
        page.wait_for_function("window.palmHavoc && window.palmHavoc.ready === true", timeout=90000)
        page.wait_for_timeout(args.wait)
        page.screenshot(path=str(out), type="jpeg", quality=90)
        info = page.evaluate("""() => {
          const h = window.palmHavoc;
          return {
            cars: h.traffic.cars.filter(c => c.alive).length,
            moving: h.traffic.cars.filter(c => c.alive && c.speed > 0.4).length,
            peds: h.pedestrians.people.length,
            living: h.pedestrians.living,
            stars: h.police.stars,
            units: h.police.units.length,
            tris: h.renderer.info.render.triangles,
            calls: h.renderer.info.render.calls,
          };
        }""")
        browser.close()
    httpd.shutdown()
    print("out:", out, out.stat().st_size // 1024, "KiB")
    print("info:", info)
    print("errors:", errors[:10] if errors else "none")


if __name__ == "__main__":
    main()
