# Shared building blocks for the Beamhouse UI canvas artboards.
import math

W, H = 1440, 900
VW, VH = 1392, 856          # viewport area (minus 48px rail, 44px chip bar)

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


def chipbar(chips):
    return ('<div class="chips"><div class="mark">%s<span class="wm">Beamhouse</span></div>'
            '%s<div class="spacer"></div></div>' % (LOGO, ''.join(chips)))
