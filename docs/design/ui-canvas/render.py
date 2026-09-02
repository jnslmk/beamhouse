#!/usr/bin/env python3
"""Render each .dc.html artboard to renders/<Name>.png.

The artboards are static HTML+SVG, so they need no Design Components runtime:
strip the <x-dc> wrapper, drop the <helmet> into a plain <head>, and screenshot.

    python3 render.py              # all eight
    python3 render.py Main Trouble # just those

Needs Playwright with Chromium (`~/.cache/ms-playwright` on this machine).
Run `optipng -o3 renders/*.png` afterwards; the committed renders are optimised.
"""
import pathlib
import re
import sys
import tempfile

from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).parent
OUT = HERE / "renders"

WRAP = ('<!doctype html><html><head><meta charset="utf-8">%s</head>'
        '<body>%s</body></html>')


def main(names):
    files = ([HERE / (n if n.endswith(".dc.html") else n + ".dc.html") for n in names]
             if names else sorted(HERE.glob("*.dc.html")))
    OUT.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp, sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        for f in files:
            src = f.read_text(encoding="utf-8")
            # The phone artboards (#40) are narrower than the desktop 1440; a 1440
            # viewport would pad them out to the right.
            w, h = 1440, 900
            if 'class="app phone"' in src:
                w, h = 390, 844
            elif 'class="app land"' in src:
                w, h = 844, 390
            page.set_viewport_size({"width": w, "height": h})
            style = re.search(r"<helmet>(.*?)</helmet>", src, re.S).group(1)
            body = re.search(r"</helmet>\s*(.*?)\s*</x-dc>", src, re.S).group(1)
            shim = pathlib.Path(tmp) / (f.name.replace(".dc.html", ".html"))
            shim.write_text(WRAP % (style, body), encoding="utf-8")
            page.goto(shim.as_uri())
            page.wait_for_timeout(2200)          # webfonts
            out = OUT / (f.name.replace(".dc.html", ".png"))
            page.screenshot(path=str(out), full_page=True)
            print("rendered", out.relative_to(HERE))
        browser.close()


if __name__ == "__main__":
    main(sys.argv[1:])
