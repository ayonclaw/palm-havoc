#!/usr/bin/env python3
"""Take the entry's screenshots: serve game/, open each scene from shots.json in Chromium, and
write screenshots/<name>. 1280x720 JPEG, well inside the gate's 256 KiB a shot.

    python3 tools/capture.py                # writes screenshots/
    python3 tools/capture.py --port 8300
"""

import argparse
import functools
import http.server
import json
import pathlib
import socketserver
import threading

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
GAME = ROOT / "game"
SHOTS = ROOT / "screenshots"
CHROME = "/home/ubuntu/.cache/ms-playwright/chromium-1234/chrome-linux/chrome"
ARGS = [
    "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
    "--no-sandbox", "--disable-dev-shm-usage", "--ignore-gpu-blocklist",
]


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):  # keep the capture print-out clean
        pass


class Server(socketserver.TCPServer):
    allow_reuse_address = True


def serve(port):
    handler = functools.partial(Quiet, directory=str(GAME))
    httpd = Server(("127.0.0.1", port), handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    return httpd


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8311)
    parser.add_argument("--wait", type=int, default=4000, help="milliseconds to let the scene settle")
    args = parser.parse_args()

    shots = json.loads((ROOT / "shots.json").read_text())
    SHOTS.mkdir(exist_ok=True)
    httpd = serve(args.port)
    base = f"http://127.0.0.1:{args.port}/index.html"

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=CHROME, args=ARGS)
        page = browser.new_page(viewport={"width": 1280, "height": 720}, device_scale_factor=1)
        page.set_default_timeout(120000)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
        for shot in shots:
            page.goto(base + shot["query"], wait_until="load")
            page.wait_for_function("window.palmHavoc && window.palmHavoc.ready === true", timeout=60000)
            page.wait_for_timeout(args.wait)
            target = SHOTS / shot["name"]
            page.screenshot(path=str(target), type="jpeg", quality=88)
            print(f"{target.relative_to(ROOT)}  {target.stat().st_size // 1024} KiB")
        browser.close()
    httpd.shutdown()
    if errors:
        print("console errors:", errors)


if __name__ == "__main__":
    main()
