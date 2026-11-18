#!/usr/bin/env python3
"""Check the entry against the gate's numeric limits before handing it in: reads game/ and
screenshots/ the way the scorer does and prints what it measured.

    python3 tools/check_gate.py
"""

import pathlib
import re
import sys

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
GAME = ROOT / "game"
SHOTS = ROOT / "screenshots"

GAME_MAX_ENTRIES = 993
GAME_MAX_BYTES = 48 * 1024 * 1024
PATH_MAX_BYTES = 1000
INDEX_MAX_BYTES = 1024 * 1024
SHOT_MAX_BYTES = 256 * 1024
SHOT_LONG_MAX = 1280
SHOT_SHORT_MIN = 480


def check_game():
    entries = 0
    total = 0
    longest = ("", 0)
    symlinks = []
    for path in GAME.rglob("*"):
        entries += 1
        relative = path.relative_to(GAME).as_posix()
        longest = max(longest, (relative, len(relative.encode())))
        if path.is_symlink():
            symlinks.append(relative)
            continue
        if path.is_file():
            total += path.stat().st_size
    index = GAME / "index.html"
    print(f"game/ entries {entries}/{GAME_MAX_ENTRIES}, {total / 1048576:.2f}/{GAME_MAX_BYTES / 1048576:.0f} MiB")
    print(f"index.html {index.stat().st_size}/{INDEX_MAX_BYTES} bytes")
    print(f"longest path {longest[1]} bytes: {longest[0]}")
    print(f"symlinks {len(symlinks)}")
    return (
        entries <= GAME_MAX_ENTRIES
        and total <= GAME_MAX_BYTES
        and index.stat().st_size <= INDEX_MAX_BYTES
        and longest[1] <= PATH_MAX_BYTES
        and not symlinks
    )


def check_references():
    """Every reference in index.html and the modules it loads must stay inside game/."""
    html = (GAME / "index.html").read_text()
    bad = []
    for match in re.finditer(r'(?:src|href)="([^"]+)"', html):
        value = match.group(1)
        if value.startswith("data:"):
            continue
        if re.match(r'^[a-z]+:', value) or value.startswith("//"):
            bad.append(value)
        elif not (GAME / value.lstrip("/")).is_file():
            bad.append(value)
    modules = sorted(GAME.rglob("*.js"))
    external = []
    for module in modules:
        text = module.read_text(errors="ignore")
        for match in re.finditer(r"""(?:from|import)\s*\(?\s*['"]([^'"]+)['"]""", text):
            specifier = match.group(1)
            if any(token in specifier for token in "+$()  ") or len(specifier) > 200:
                continue  # a string the minifier spliced together, not a module specifier
            if specifier.startswith("."):
                if not (module.parent / specifier).resolve().is_file():
                    external.append(f"{module.name}: {specifier}")
            elif not specifier.startswith("node:"):
                external.append(f"{module.name}: {specifier}")
    print(f"references under game/: {len(modules)} scripts; {len(bad) + len(external)} outside")
    for entry in bad + external[:5]:
        print("  !", entry)
    return not bad and not external


def check_screenshots():
    shots = sorted(p for p in SHOTS.iterdir() if p.is_file() and not p.name.startswith("."))
    ok = 3 <= len(shots) <= 4
    for shot in shots:
        size = shot.stat().st_size
        with Image.open(shot) as image:
            width, height = image.size
        long_side, short_side = max(width, height), min(width, height)
        good = size <= SHOT_MAX_BYTES and long_side <= SHOT_LONG_MAX and short_side >= SHOT_SHORT_MIN
        ok = ok and good
        print(f"{shot.name}: {width}x{height}, {size / 1024:.0f} KiB {'ok' if good else 'FAIL'}")
    print(f"screenshots: {len(shots)} (3 to 4)")
    return ok


def main():
    results = [check_game(), check_references(), check_screenshots()]
    print("gate limits:", "pass" if all(results) else "FAIL")
    return 0 if all(results) else 1


if __name__ == "__main__":
    sys.exit(main())
