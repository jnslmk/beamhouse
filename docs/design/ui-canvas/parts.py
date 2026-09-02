# Shared building blocks for the Beamhouse UI canvas artboards.
import math

W, H = 1440, 900
VW, VH = 1392, 856          # viewport area (minus 48px rail, 44px chip bar)
PW, PH = 390, 844           # the M3a phone frame (#40) — iPhone 14/15 logical viewport

FONTS = ('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?'
         'family=Barlow:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap">')

TOKENS = """
:root{
  --bg0:oklch(0.155 0.006 75); --bg1:oklch(0.205 0.007 75);
  --bg2:oklch(0.252 0.008 75); --bg3:oklch(0.305 0.009 75);
  --line:oklch(0.345 0.008 75); --line2:oklch(0.275 0.007 75);
  --hi:oklch(0.945 0.004 85); --mid:oklch(0.735 0.006 85); --lo:oklch(0.565 0.008 85);
  --beam:oklch(0.80 0.150 72); --sel:oklch(0.78 0.150 220); --ok:oklch(0.78 0.150 152);
  --warn:oklch(0.78 0.150 52); --bad:oklch(0.70 0.165 22); --blind:oklch(0.74 0.150 300);
  --ui:'Barlow',system-ui,sans-serif; --mono:'IBM Plex Mono',ui-monospace,monospace;
}
"""

BASE_CSS = TOKENS + """
*{box-sizing:border-box}
body{margin:0;font-family:var(--ui);background:var(--bg0);color:var(--hi);
     -webkit-font-smoothing:antialiased}
a{color:var(--sel)} a:hover{color:var(--hi)}
.app{width:1440px;background:var(--bg0);display:flex;flex-direction:column;overflow:hidden}
.chips{height:44px;flex:none;background:var(--bg1);border-bottom:1px solid var(--line2);
       display:flex;align-items:center;gap:7px;padding:0 12px}
.mark{display:flex;align-items:center;gap:7px;padding-right:11px;margin-right:4px;
      border-right:1px solid var(--line2);height:20px}
.mark .wm{font-family:var(--ui);font-size:12.5px;font-weight:600;letter-spacing:.055em;
          color:var(--mid);text-transform:uppercase}
.chip{display:flex;align-items:center;gap:8px;height:28px;padding:0 9px 0 10px;
      background:var(--bg2);border:1px solid var(--line2);border-radius:3px;cursor:default}
.chip .k{font-size:9.5px;font-weight:600;letter-spacing:.105em;color:var(--lo);
         text-transform:uppercase;line-height:1}
.chip .v{font-family:var(--mono);font-size:11.5px;font-weight:500;color:var(--hi);line-height:1;
         white-space:nowrap}
.chip .cv{opacity:.42;margin-left:-1px}
.chip.warn{border-color:color-mix(in oklab,var(--warn) 55%,transparent);
           background:color-mix(in oklab,var(--warn) 9%,var(--bg2))}
.chip.warn .v{color:var(--warn)}
.chip.bad{border-color:color-mix(in oklab,var(--bad) 60%,transparent);
          background:color-mix(in oklab,var(--bad) 10%,var(--bg2))}
.chip.bad .v{color:var(--bad)}
.chip.on{border-color:color-mix(in oklab,var(--sel) 60%,transparent);
         background:color-mix(in oklab,var(--sel) 12%,var(--bg2))}
.chip.on .v{color:var(--sel)}
.chip.call{border-color:color-mix(in oklab,var(--beam) 62%,transparent);
           background:color-mix(in oklab,var(--beam) 12%,var(--bg2))}
.chip.call .v{color:var(--beam)}
.chip.mute .v{color:var(--lo)}
.spacer{flex:1}
.body{flex:1;display:flex;min-height:0}
.rail{width:48px;flex:none;background:var(--bg1);border-right:1px solid var(--line2);
      display:flex;flex-direction:column;align-items:center;gap:3px;padding-top:8px}
.tool{width:32px;height:32px;border-radius:3px;display:flex;align-items:center;
      justify-content:center;color:var(--lo)}
.tool.act{background:var(--bg3);color:var(--hi)}
.tool.sep{height:1px;width:22px;background:var(--line2);margin:5px 0;border-radius:0}
.view{flex:1;position:relative;background:var(--bg0);overflow:hidden}
.view svg.scene{position:absolute;inset:0;display:block}
"""

# ---------------------------------------------------------------- chrome

CHEV = ('<svg class="cv" width="9" height="9" viewBox="0 0 12 12" fill="none" '
        'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" '
        'stroke-linejoin="round"><path d="M3 4.8L6 7.8 9 4.8"/></svg>')


def chip(k, v, cls=""):
    c = "chip" + ((" " + cls) if cls else "")
    return ('<div class="%s"><span class="k">%s</span><span class="v">%s</span>%s</div>'
            % (c, k, v, CHEV))


ICONS = {
 "select": 'M5.5 3.2l13.2 7.6-5.7 1.5-1.7 5.6z',
 "move": 'M12 3.5v17M3.5 12h17M12 3.5l-2.6 2.6M12 3.5l2.6 2.6M12 20.5l-2.6-2.6M12 20.5l2.6-2.6'
         'M3.5 12l2.6-2.6M3.5 12l2.6 2.6M20.5 12l-2.6-2.6M20.5 12l-2.6 2.6',
 "rotate": 'M20 12a8 8 0 1 1-2.4-5.7M20.2 4.4v4.2h-4.2',
 "measure": 'M3.5 9h17v6h-17zM7.6 9v3.1M11.6 9v3.1M15.6 9v3.1M19.6 9v3.1',
 "objects": 'M12 3.2l7.8 4.4v8.8L12 20.8l-7.8-4.4V7.6zM4.2 7.6l7.8 4.4 7.8-4.4M12 12v8.8',
 "camera": 'M4 7.4h3.9l1.5-2h5.2l1.5 2H20v11.2H4z',
 "capture": 'M12 4.2l6.7 3.9M18.7 8.1l-3.3 11.6M15.4 19.7H8.6M8.6 19.7L5.3 8.1M5.3 8.1L12 4.2',
}


def icon(name, size=19):
    extra = ''
    if name == "array":
        pts = ''.join('<circle cx="%d" cy="%d" r="1.55" fill="currentColor" stroke="none"/>'
                      % (6 + 6 * i, 6 + 6 * j) for i in range(3) for j in range(3))
        return ('<svg width="%d" height="%d" viewBox="0 0 24 24" fill="none">%s</svg>'
                % (size, size, pts))
    if name == "camera":
        extra = '<circle cx="12" cy="13" r="3.4"/>'
    if name == "capture":
        extra = '<circle cx="12" cy="12" r="7.9"/>'
    return ('<svg width="%d" height="%d" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
            'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">'
            '<path d="%s"/>%s</svg>' % (size, size, ICONS[name], extra))


def rail(active="select"):
    order = ["select", "move", "rotate", "array", "sep", "measure", "objects", "sep",
             "camera", "capture"]
    out = []
    for t in order:
        if t == "sep":
            out.append('<div class="tool sep"></div>')
        else:
            out.append('<div class="tool%s">%s</div>'
                       % (" act" if t == active else "", icon(t)))
    return '<div class="rail">%s</div>' % ''.join(out)


LOGO = ('<svg width="15" height="15" viewBox="0 0 16 16" fill="none">'
        '<path d="M8 1.6L14 14.4H2z" fill="oklch(0.80 0.150 72)" opacity="0.22"/>'
        '<path d="M8 1.6L14 14.4H2z" stroke="oklch(0.80 0.150 72)" stroke-width="1.1" '
        'stroke-linejoin="round"/><circle cx="8" cy="3.4" r="1.5" '
        'fill="oklch(0.80 0.150 72)"/></svg>')


def chipbar(chips, mark="Beamhouse"):
    """The chip bar. ``mark`` is the wordmark slot.

    On the Pages viewer the slot carries the viewer indication and the feed
    (ADR-0032): ``Beamhouse \u00b7 demo``. It is persistent, costs no new layout, and is
    the reason the viewer needs no Feed chip.
    """
    return ('<div class="chips"><div class="mark">%s<span class="wm">%s</span></div>'
            '%s<div class="spacer"></div></div>' % (LOGO, mark, ''.join(chips)))


# ---------------------------------------------------------------- the phone frame (#40)

PHONE_CSS = """
.app.phone{width:390px;height:844px}
.app.land{width:844px;height:390px}
/* The viewer has no tool rail: nothing on a phone is editable (ADR-0032). */
.app.phone .body,.app.land .body{flex-direction:column}
/* The rig is 1.63:1 and a portrait phone is 0.46:1. Whole-rig-at-full-width is a
   240px strip on an 844px screen, so portrait gives the viewport a BAND and spends
   the rest on the list. 390x320 is the largest band that still slices to the rig's
   own content span (x 174..1217 of 1392) rather than cropping into it. */
.app.phone .pband{height:320px;flex:none;position:relative;background:var(--bg0);
  border-bottom:1px solid var(--line2);overflow:hidden}
.app.phone .pband svg.scene{position:absolute;inset:0;width:100%;height:100%;display:block}
/* [corrected 2026-09-02 - #45] Landscape had no size rule at all, so the SVG rendered at
   its intrinsic 1392x856 and was simply CLIPPED by the 844px frame - preserveAspectRatio
   never even applied, and the floor was cropped away in the one orientation ADR-0032
   decision 4 calls "the payoff frame". Sizing it to the box is what lets "meet" fit the
   whole rig. [corrected 2026-09-02 - #55] Fitting the whole CANVAS then left the rig at
   48% of the width: the landscape scene is drawn with the rig's own content box
   (x 174..1217 x y 190..716, viewBox "174 190 1043 526", see scene.py) so the rig, not
   the canvas, is what meets the frame. */
.app.land .view svg.scene{width:100%;height:100%}
.app.phone .plist{flex:1;min-height:0;position:relative;overflow:hidden;
  display:flex;flex-direction:column}
.app.phone .plist .sfoot{margin-top:auto}
.lhead{display:flex;align-items:baseline;justify-content:space-between;gap:10px;
  padding:11px 16px 9px;background:var(--bg1);border-bottom:1px solid var(--line2)}
.lhead h3{margin:0;font-size:10px;font-weight:600;letter-spacing:.115em;
  text-transform:uppercase;color:var(--mid)}
.lhead em{font-style:normal;font-family:var(--mono);font-size:10.5px;color:var(--lo)}
.frow{display:flex;align-items:center;gap:10px;height:44px;flex:none;padding:0 16px;
  border-bottom:1px solid var(--line2)}
.frow .dot{width:7px;height:7px;border-radius:50%;flex:none}
.frow .nm{flex:1;font-size:12.5px;color:var(--mid);white-space:nowrap;overflow:hidden;
  text-overflow:ellipsis}
.frow .ad{font-family:var(--mono);font-size:11.5px;color:var(--hi)}
.frow .ct{font-family:var(--mono);font-size:10px;color:var(--lo);min-width:34px;
  text-align:right}
.frow.on{background:color-mix(in oklab,var(--sel) 13%,var(--bg1))}
.frow.on .nm{color:var(--sel)}
.app.phone .chips,.app.land .chips{gap:6px;padding:0 10px}
.app.phone .mark,.app.land .mark{padding-right:9px;margin-right:2px}
.app.phone .mark .wm,.app.land .mark .wm{font-size:11px;letter-spacing:.045em}
.app.phone .mark .wm b,.app.land .mark .wm b{color:var(--beam);font-weight:600}
/* 44px touch floor: the chips grow to it, the bar grows with them.
   [corrected 2026-09-02 - #45] Landscape is still a phone, and was drawn with the
   DESKTOP 44px bar and 28px chips - which contradicts ADR-0032 decision 6 outright.
   It costs 12px of the 390px height and buys the touch floor in the orientation
   ADR-0032 calls "the payoff frame". */
.app.phone .chips,.app.land .chips{height:56px}
.app.phone .chip,.app.land .chip{height:44px;padding:0 8px 0 9px;gap:6px}
.app.phone .chip .k,.app.land .chip .k{font-size:9px}
.app.phone .chip .v,.app.land .chip .v{font-size:11px}
/* The phone Sel chip carries the COUNT, never the name: the bar then has a constant
   width, and identity belongs to the sheet, which has all 390px to say it in. */
.sheet{position:absolute;left:0;right:0;bottom:0;background:var(--bg1);
  border-top:1px solid var(--line);border-radius:12px 12px 0 0;
  box-shadow:0 -14px 40px oklch(0.10 0.005 75 / .55);padding:0 0 14px}
.sheet .grip{width:34px;height:4px;border-radius:2px;background:var(--line);
  margin:8px auto 2px}
.sheet .sh{display:flex;align-items:baseline;gap:8px;padding:6px 16px 10px}
.sheet .sh h3{margin:0;font-size:16px;font-weight:600;letter-spacing:.005em}
.sheet .sh em{font-style:normal;font-family:var(--mono);font-size:10.5px;color:var(--lo)}
.srow{display:flex;align-items:center;justify-content:space-between;gap:12px;
  min-height:38px;padding:0 16px;border-top:1px solid var(--line2)}
.srow .k{font-size:9.5px;font-weight:600;letter-spacing:.105em;text-transform:uppercase;
  color:var(--lo);white-space:nowrap}
.srow .v{font-family:var(--mono);font-size:12px;color:var(--hi);text-align:right}
.srow .v i{font-style:normal;color:var(--lo)}
.srow.tall{align-items:flex-start;padding-top:9px;padding-bottom:9px}
.srow .v.wrap{white-space:normal;font-size:10.5px;line-height:1.5;color:var(--mid)}
.sfoot{margin-top:2px;padding:10px 16px 0;border-top:1px solid var(--line2);
  font-size:10.5px;line-height:1.5;color:var(--lo)}
.sfoot b{color:var(--mid);font-weight:600}
.viewlist{padding:2px 0 0}
.vitem{display:flex;align-items:center;justify-content:space-between;height:44px;
  padding:0 16px;border-top:1px solid var(--line2);font-size:13px;color:var(--mid)}
.vitem.on{color:var(--sel)}
.vitem em{font-style:normal;font-family:var(--mono);font-size:10.5px;color:var(--lo)}
.ptag{position:absolute;left:10px;bottom:10px;display:flex;align-items:center;gap:6px;
  height:24px;padding:0 9px;border-radius:3px;
  background:color-mix(in oklab,var(--bg0) 84%,transparent);
  border:1px solid color-mix(in oklab,var(--beam) 44%,transparent);
  font-size:9.5px;font-weight:600;letter-spacing:.105em;text-transform:uppercase;
  color:var(--beam)}
.tapdot{position:absolute;width:38px;height:38px;border-radius:50%;
  border:1.5px solid var(--sel);transform:translate(-50%,-50%);
  background:color-mix(in oklab,var(--sel) 14%,transparent)}
"""
