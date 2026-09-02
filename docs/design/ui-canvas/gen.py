#!/usr/bin/env python3
"""Generate the eight Beamhouse UI artboards as .dc.html working files."""
import json
import math
from parts import BASE_CSS, FONTS, PHONE_CSS, chip, chipbar, rail
import scene as S

HEAD = ('<!doctype html>\n<html>\n<head>\n  <meta charset="utf-8">\n'
        '  <script src="./support.js"></script>\n</head>\n<body>\n<x-dc>\n')
TAIL = '</x-dc>\n</body>\n</html>\n'

EXTRA_CSS = """
.badge{position:absolute;display:flex;align-items:center;gap:6px;height:23px;padding:0 9px 0 7px;
  background:color-mix(in oklab,var(--bg0) 90%,transparent);border:1px solid;border-radius:3px;
  font-size:9.5px;font-weight:600;letter-spacing:.105em;text-transform:uppercase;
  white-space:nowrap;transform:translate(-50%,-50%);line-height:1}
.badge.stale{border-color:var(--warn);color:var(--warn)}
.badge.bad{border-color:var(--bad);color:var(--bad)}
.badge.ovr{border-color:var(--sel);color:var(--sel)}
.badge.dotonly{padding:0;width:19px;height:19px;justify-content:center;gap:0}
.pop{position:absolute;width:272px;background:var(--bg1);border:1px solid var(--line);
  border-radius:4px;box-shadow:0 14px 38px oklch(0.10 0.005 75 / .58);overflow:hidden}
.pop h4{margin:0;padding:9px 11px;font-size:10px;font-weight:600;letter-spacing:.115em;
  text-transform:uppercase;color:var(--mid);background:var(--bg2);
  border-bottom:1px solid var(--line2);display:flex;justify-content:space-between;
  align-items:center}
.pop h4 em{font-style:normal;font-family:var(--mono);font-size:10px;color:var(--lo);
  letter-spacing:.02em;text-transform:none}
.nrow{display:flex;align-items:center;gap:8px;padding:5px 11px}
.nrow .lbl{width:20px;font-size:10px;font-weight:600;letter-spacing:.09em;color:var(--lo)}
.nfield{flex:1;display:flex;align-items:center;justify-content:space-between;height:25px;
  padding:0 8px;background:var(--bg0);border:1px solid var(--line2);border-radius:2px;
  font-family:var(--mono);font-size:11.5px;color:var(--hi)}
.nfield span.u{color:var(--lo);font-size:10px}
.ovrblk{margin:8px 0 0;padding:9px 11px 10px;border-top:1px solid var(--line2);
  background:color-mix(in oklab,var(--sel) 7%,var(--bg1));
  box-shadow:inset 2px 0 0 var(--sel)}
.ovrblk .t{display:flex;align-items:center;gap:6px;font-size:9.5px;font-weight:600;
  letter-spacing:.105em;text-transform:uppercase;color:var(--sel)}
.ovrblk .p{margin:6px 0 0;font-family:var(--mono);font-size:10.5px;color:var(--mid)}
.ovrblk .a{margin-top:7px;font-size:11px;color:var(--sel);text-decoration:underline;
  text-underline-offset:2px}
.note{padding:8px 11px;border-top:1px solid var(--line2);font-size:10.5px;color:var(--lo);
  line-height:1.45}
.scrim{position:absolute;inset:0;background:oklch(0.11 0.004 75 / .70)}
.panel{position:absolute;left:64px;top:56px;width:1264px;height:744px;background:var(--bg1);
  border:1px solid var(--line);border-radius:5px;display:flex;flex-direction:column;
  box-shadow:0 24px 64px oklch(0.09 0.004 75 / .62);overflow:hidden}
.phead{height:46px;flex:none;display:flex;align-items:center;gap:12px;padding:0 14px;
  border-bottom:1px solid var(--line2);background:var(--bg2)}
.ptitle{font-size:12.5px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;
  color:var(--hi)}
.search{width:224px;height:27px;display:flex;align-items:center;gap:7px;padding:0 9px;
  background:var(--bg0);border:1px solid var(--line2);border-radius:2px;font-size:11.5px;
  color:var(--lo)}
.tgl{display:flex;align-items:center;gap:7px;height:27px;padding:0 10px;background:var(--bg0);
  border:1px solid var(--line2);border-radius:2px;font-size:10px;font-weight:600;
  letter-spacing:.10em;text-transform:uppercase;color:var(--lo)}
.tgl.on{border-color:color-mix(in oklab,var(--sel) 60%,transparent);color:var(--sel);
  background:color-mix(in oklab,var(--sel) 11%,var(--bg0))}
.sw{width:22px;height:12px;border-radius:6px;background:var(--line);position:relative}
.tgl.on .sw{background:var(--sel)}
.sw i{position:absolute;top:2px;left:2px;width:8px;height:8px;border-radius:50%;
  background:var(--bg0)}
.tgl.on .sw i{left:12px}
.tabs{height:38px;flex:none;display:flex;align-items:stretch;gap:0;padding:0 14px;
  border-bottom:1px solid var(--line2);background:var(--bg1)}
.tab{display:flex;align-items:center;gap:7px;padding:0 15px;font-size:11.5px;font-weight:500;
  letter-spacing:.03em;color:var(--lo);border-bottom:2px solid transparent}
.tab.act{color:var(--hi);border-bottom-color:var(--beam)}
.tab .ct{font-family:var(--mono);font-size:9.5px;padding:1px 5px;border-radius:8px;
  background:var(--bg3);color:var(--mid)}
.tab .ct.bad{background:color-mix(in oklab,var(--bad) 24%,var(--bg3));color:var(--bad)}
.tab.dim{color:oklch(0.42 0.008 85)}
table{width:100%;border-collapse:collapse;font-size:11.5px}
thead th{position:sticky;top:0;text-align:left;font-size:9.5px;font-weight:600;
  letter-spacing:.11em;text-transform:uppercase;color:var(--lo);padding:9px 10px;
  background:var(--bg1);border-bottom:1px solid var(--line);white-space:nowrap}
tbody td{padding:0 10px;height:31px;border-bottom:1px solid var(--line2);color:var(--mid);
  white-space:nowrap}
tbody tr.sel td{background:color-mix(in oklab,var(--sel) 13%,transparent)}
tbody tr.sel td:first-child{box-shadow:inset 2px 0 0 var(--sel)}
td.m{font-family:var(--mono);font-size:11.5px;color:var(--hi)}
td.name{color:var(--hi)}
.mut{color:oklch(0.45 0.008 85)}
.pfx{color:var(--lo);font-size:10.5px}
.tbody{flex:1;overflow:hidden}
.pfoot{height:34px;flex:none;display:flex;align-items:center;gap:16px;padding:0 14px;
  border-top:1px solid var(--line2);background:var(--bg2);font-family:var(--mono);
  font-size:10.5px;color:var(--lo)}
.hrow{display:flex;align-items:center;gap:12px;height:38px;padding:0 14px;
  border-bottom:1px solid var(--line2)}
.hrow .t{font-family:var(--mono);font-size:10.5px;color:var(--lo);width:60px}
.hrow .d{flex:1;font-size:12px;color:var(--hi)}
.hrow .n{font-family:var(--mono);font-size:10.5px;color:var(--lo)}
.org{display:flex;align-items:center;gap:5px;width:74px;font-size:9px;font-weight:600;
  letter-spacing:.10em;text-transform:uppercase;color:var(--lo)}
.org.agent{color:var(--blind)}
.org.ing{color:var(--beam)}
.undoline{display:flex;align-items:center;gap:10px;padding:0 14px;height:26px;
  background:color-mix(in oklab,var(--sel) 10%,transparent);
  box-shadow:inset 0 1px 0 var(--sel),inset 0 -1px 0 var(--sel)}
.undoline span{font-size:9.5px;font-weight:600;letter-spacing:.11em;text-transform:uppercase;
  color:var(--sel)}
.undoline i{flex:1;height:1px;background:color-mix(in oklab,var(--sel) 40%,transparent)}
.iss{display:flex;gap:12px;padding:13px 14px;border-bottom:1px solid var(--line2)}
.iss .gl{width:26px;flex:none;display:flex;justify-content:center;padding-top:1px}
.iss .bd{flex:1}
.iss .h{display:flex;align-items:baseline;gap:9px}
.iss .h b{font-size:12px;font-weight:600;color:var(--hi)}
.iss .h em{font-style:normal;font-size:9.5px;font-weight:600;letter-spacing:.105em;
  text-transform:uppercase}
.iss .p{margin:5px 0 0;font-size:11.5px;line-height:1.5;color:var(--mid);max-width:920px}
.iss .p code{font-family:var(--mono);font-size:11px;color:var(--hi)}
.iss .acts{display:flex;gap:8px;margin-top:9px}
.act{height:25px;display:flex;align-items:center;padding:0 11px;border:1px solid var(--line);
  border-radius:2px;font-size:11px;color:var(--mid);background:var(--bg2)}
.act.pri{border-color:color-mix(in oklab,var(--sel) 60%,transparent);color:var(--sel);
  background:color-mix(in oklab,var(--sel) 11%,var(--bg2))}
.src{font-family:var(--mono);font-size:10px;color:var(--lo);margin-top:7px}
.empty{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:492px;
  text-align:center}
.empty h2{margin:0 0 7px;font-size:15px;font-weight:600;letter-spacing:.02em;color:var(--hi)}
.empty p{margin:0;font-size:12px;line-height:1.55;color:var(--lo)}
.drop{margin:20px 0 0;padding:26px 20px;border:1px dashed var(--line);border-radius:4px;
  background:color-mix(in oklab,var(--bg1) 70%,transparent)}
.drop b{display:block;font-size:13px;font-weight:600;color:var(--beam);margin-bottom:6px}
.drop .fmt{font-family:var(--mono);font-size:11px;color:var(--mid)}
.rej{margin:16px 0 0;font-size:11px;line-height:1.55;color:oklch(0.48 0.008 85)}
.rej code{font-family:var(--mono);font-size:10.5px;color:var(--lo)}
"""


def page(css_extra, body, height=900):
    return (HEAD + '<helmet>\n<style>\n' + BASE_CSS + css_extra +
            '\n.app{height:%dpx}\n' % height +
            '</style>\n' + FONTS + '\n</helmet>\n' + body + '\n' + TAIL)


# ----------------------------------------------------------------- glyphs

def gl_stale(s=13, c="currentColor"):
    return ('<svg width="%d" height="%d" viewBox="0 0 16 16" fill="none"><path d="M8 2.4l6 11.2H2z"'
            ' fill="%s" opacity="0.24"/><path d="M8 2.4l6 11.2H2z" stroke="%s" stroke-width="1.2" '
            'stroke-linejoin="round"/><path d="M8 6.3v3.1" stroke="%s" stroke-width="1.4" '
            'stroke-linecap="round"/><circle cx="8" cy="11.4" r="0.85" fill="%s"/></svg>'
            % (s, s, c, c, c, c))


def gl_conflict(s=13, c="currentColor"):
    return ('<svg width="%d" height="%d" viewBox="0 0 16 16" fill="none" stroke="%s" '
            'stroke-width="1.2"><circle cx="6.1" cy="8" r="3.7"/><circle cx="9.9" cy="8" r="3.7"/>'
            '<path d="M8 4.9a3.7 3.7 0 0 0 0 6.2 3.7 3.7 0 0 0 0-6.2z" fill="%s" opacity="0.3" '
            'stroke="none"/></svg>' % (s, s, c, c))


def gl_nodef(s=13, c="currentColor"):
    return ('<svg width="%d" height="%d" viewBox="0 0 16 16" fill="none" stroke="%s" '
            'stroke-width="1.2"><rect x="2.4" y="2.4" width="11.2" height="11.2" rx="1.6"/>'
            '<path d="M6.2 6.4a1.85 1.85 0 1 1 2.1 2.1v1" stroke-linecap="round"/>'
            '<circle cx="8.3" cy="11.4" r="0.85" fill="%s" stroke="none"/></svg>' % (s, s, c, c))


def gl_unpatched(s=13, c="currentColor"):
    return ('<svg width="%d" height="%d" viewBox="0 0 16 16" fill="none" stroke="%s" '
            'stroke-width="1.2"><rect x="2.4" y="2.4" width="11.2" height="11.2" rx="1.6" '
            'stroke-dasharray="2.6 2.2"/></svg>' % (s, s, c))


def gl_ovr(s=13, c="currentColor"):
    return ('<svg width="%d" height="%d" viewBox="0 0 16 16" fill="none" stroke="%s" '
            'stroke-width="1.2" stroke-linejoin="round"><path d="M8 2.2l5.2 3-5.2 3-5.2-3z" '
            'fill="%s" opacity="0.30" stroke="none"/><path d="M8 2.2l5.2 3-5.2 3-5.2-3z"/>'
            '<path d="M2.8 9.1l5.2 3 5.2-3"/></svg>' % (s, s, c, c))


def gl_person(s=12, c="currentColor"):
    return ('<svg width="%d" height="%d" viewBox="0 0 16 16" fill="none" stroke="%s" '
            'stroke-width="1.25"><circle cx="8" cy="5.3" r="2.6"/>'
            '<path d="M2.9 13.6a5.1 5.1 0 0 1 10.2 0" stroke-linecap="round"/></svg>' % (s, s, c))


def gl_agent(s=12, c="currentColor"):
    return ('<svg width="%d" height="%d" viewBox="0 0 16 16" fill="none" stroke="%s" '
            'stroke-width="1.25"><rect x="2.8" y="5" width="10.4" height="8" rx="2"/>'
            '<path d="M8 2.2V5M5.6 8.6v1.2M10.4 8.6v1.2" stroke-linecap="round"/>'
            '<circle cx="8" cy="1.9" r="0.95" fill="%s" stroke="none"/></svg>' % (s, s, c, c))


def gl_ingest(s=12, c="currentColor"):
    return ('<svg width="%d" height="%d" viewBox="0 0 16 16" fill="none" stroke="%s" '
            'stroke-width="1.25" stroke-linecap="round"><path d="M8 2.4v7.4M5.3 7.2L8 9.9l2.7-2.7"/>'
            '<path d="M2.8 11.9v1.7h10.4v-1.7"/></svg>' % (s, s, c))


def badge(x, y, cls, glyph, text=None):
    inner = glyph + (('<span>%s</span>' % text) if text else '')
    c = "badge " + cls + ("" if text else " dotonly")
    return '<div class="%s" style="left:%dpx;top:%dpx">%s</div>' % (c, x, y, inner)


# ----------------------------------------------------------------- artboards

CHIPS_REST = [
    chip("Feed", "live"), chip("Univ", "5 · ok"), chip("Patch", "warehouse.yml"),
    chip("Sel", "—", "mute"), chip("Render", "normal"), chip("Hold", "off", "mute"),
    chip("Snap", "0.1 m"), chip("Cam", "Front"),
]


def a_empty():
    body = ('<div class="app">' + chipbar([
        chip("Feed", "live"), chip("Univ", "none", "mute"),
        chip("Patch", "none — pick a file", "call"), chip("Sel", "—", "mute"),
        chip("Render", "normal"), chip("Hold", "off", "mute"), chip("Snap", "0.1 m"),
        chip("Cam", "Front")]) +
        '<div class="body">' + rail() + '<div class="view">' +
        S.scene(empty=True) +
        '<div class="empty"><h2>Nothing patched yet</h2>'
        '<p>The bridge is up and listening. Beamhouse needs a patch before it can '
        'put anything on the grid.</p>'
        '<div class="drop"><b>Open a patch file</b>'
        '<div class="fmt">Mizer project .yml &nbsp;·&nbsp; MVR .mvr</div></div>'
        '<p class="rej">A BlinderKitten <code>.olga</code> or a MagicQ CSV will be refused '
        'here: both name their fixture types internally, so there is nothing to resolve '
        'against a definition library.</p></div>'
        '</div></div></div>')
    return page(EXTRA_CSS, body)


def a_main():
    ov = ('<div class="badge ovr dotonly" style="left:412px;top:196px">%s</div>' % gl_ovr(12))
    body = ('<div class="app">' + chipbar(CHIPS_REST) +
            '<div class="body">' + rail() + '<div class="view">' +
            S.scene() + ov + '</div></div></div>')
    return page(EXTRA_CSS, body)


def a_trouble():
    leaders = ('<g stroke="oklch(0.55 0.02 75)" stroke-width="1" opacity="0.5">'
               '<line x1="754" y1="228" x2="754" y2="262"/>'
               '<line x1="248" y1="656" x2="286" y2="606"/>'
               '<line x1="1205" y1="650" x2="1180" y2="604"/>'
               '<line x1="742" y1="380" x2="800" y2="330"/></g>')
    badges = ''.join([
        badge(754, 268, "bad", gl_nodef(12), "No definition"),
        badge(352, 598, "bad", gl_conflict(12), "Overlap · 1.100 ×2"),
        badge(1122, 596, "bad", gl_unpatched(12), "Unpatched"),
        badge(838, 322, "stale", gl_stale(12), "Stale · 3 fixtures"),
        '<div class="badge ovr dotonly" style="left:412px;top:196px">%s</div>' % gl_ovr(12),
    ])
    chips = [
        chip("Feed", "live"), chip("Univ", "5 · 1 stale", "warn"),
        chip("Patch", "warehouse.yml · 4", "bad"), chip("Sel", "—", "mute"),
        chip("Render", "normal"), chip("Hold", "off", "mute"), chip("Snap", "0.1 m"),
        chip("Cam", "Front"),
    ]
    body = ('<div class="app">' + chipbar(chips) +
            '<div class="body">' + rail() + '<div class="view">' +
            S.scene(skip_beams=(3,), ghost_mover=3, star_stale=(6, 7, 8),
                    extra=leaders) + badges + '</div></div></div>')
    return page(EXTRA_CSS, body)


def a_place():
    x = 754
    giz = ('<g stroke-width="2" stroke-linecap="round" fill="none">'
           '<line x1="%d" y1="222" x2="%d" y2="240" stroke="oklch(0.70 0.165 22)"/>'
           '<path d="M%d 240 l-4 -6 l9 1 z" fill="oklch(0.70 0.165 22)" stroke="none"/>'
           '<line x1="%d" y1="222" x2="%d" y2="160" stroke="oklch(0.78 0.150 152)"/>'
           '<path d="M%d 160 l-4.5 7 l9 0 z" fill="oklch(0.78 0.150 152)" stroke="none"/>'
           '<line x1="%d" y1="222" x2="%d" y2="212" stroke="oklch(0.78 0.150 250)"/>'
           '<path d="M%d 212 l-1 7 l7 -4 z" fill="oklch(0.78 0.150 250)" stroke="none"/>'
           '<ellipse cx="%d" cy="222" rx="46" ry="15" stroke="oklch(0.78 0.150 220)" '
           'stroke-width="1.1" opacity="0.55"/>'
           '<circle cx="%d" cy="222" r="3.2" fill="oklch(0.945 0.004 85)" stroke="none"/></g>'
           % (x, x + 62, x + 62, x, x, x, x, x - 54, x - 54, x, x))
    pop = ('<div class="pop" style="left:842px;top:150px">'
           '<h4>Mover MR<em>id 4</em></h4>'
           '<div style="padding:5px 0 3px">'
           '<div class="nrow"><span class="lbl">X</span><div class="nfield">2.40<span class="u">m'
           '</span></div><div class="nfield">5.10<span class="u">m</span></div>'
           '<div class="nfield">−3.40<span class="u">m</span></div></div>'
           '<div class="nrow"><span class="lbl">R</span><div class="nfield">0<span class="u">°'
           '</span></div><div class="nfield">45<span class="u">°</span></div>'
           '<div class="nfield">0<span class="u">°</span></div></div></div>'
           '<div class="ovrblk"><div class="t">%s Placement overridden</div>'
           '<div class="p">patch &nbsp;2.10 &nbsp;5.10 &nbsp;−3.40</div>'
           '<div class="a">Revert to patch</div></div>'
           '<div class="note">Held while selected — the rig keeps running, the render does not.'
           '</div></div>' % gl_ovr(12, "var(--sel)"))
    chips = [
        chip("Feed", "live"), chip("Univ", "5 · ok"), chip("Patch", "warehouse.yml"),
        chip("Sel", "1 · Mover MR", "on"), chip("Render", "normal"),
        chip("Hold", "selection", "on"), chip("Snap", "0.1 m", "on"), chip("Cam", "Front"),
    ]
    body = ('<div class="app">' + chipbar(chips) +
            '<div class="body">' + rail("move") + '<div class="view">' +
            S.scene(sel_mover=3, extra=giz) + pop +
            '</div></div></div>')
    return page(EXTRA_CSS, body)


def a_array():
    pop = ('<div class="pop" style="left:832px;top:296px">'
           '<h4>Radial array<em>star</em></h4>'
           '<div style="padding:5px 0 3px">'
           '<div class="nrow"><span class="lbl">N</span><div class="nfield">10'
           '<span class="u">members</span></div></div>'
           '<div class="nrow"><span class="lbl">R</span><div class="nfield">2.40'
           '<span class="u">m</span></div></div>'
           '<div class="nrow"><span class="lbl">Δ</span><div class="nfield">36.0'
           '<span class="u">°</span></div></div>'
           '<div class="nrow"><span class="lbl">T</span><div class="nfield">90'
           '<span class="u">°</span></div></div></div>'
           '<div class="ovrblk"><div class="t">5 members flipped</div>'
           '<div class="p">spokes 2 4 6 8 10 &nbsp;·&nbsp; 180° about own mid-point</div></div>'
           '<div class="note">The array stays live: changing N re-places every member as one '
           'command.</div></div>')
    chips = [
        chip("Feed", "live"), chip("Univ", "5 · ok"), chip("Patch", "warehouse.yml"),
        chip("Sel", "10 · star", "on"), chip("Render", "normal"),
        chip("Hold", "selection", "on"), chip("Snap", "0.1 m"), chip("Cam", "Front"),
    ]
    flips = ''.join(
        '<div class="badge ovr dotonly" style="left:%dpx;top:%dpx">%s</div>'
        % (S.STAR_C[0] + int((S.STAR_R + 26) * math.cos(math.radians(-90 + i * 36))),
           S.STAR_C[1] + int((S.STAR_R + 26) * 0.42 * math.sin(math.radians(-90 + i * 36))),
           gl_ovr(11))
        for i in (1, 3, 5, 7, 9))
    body = ('<div class="app">' + chipbar(chips) +
            '<div class="body">' + rail("array") + '<div class="view">' +
            S.scene(star_sel=True, star_handles=True) +
            flips + pop + '</div></div></div>')
    return page(EXTRA_CSS, body)


# ---- overlay ---------------------------------------------------------------

def tabs(active, issues=0, dim=("Objects",)):
    names = ["Fixtures", "Objects", "Universes", "History", "Issues"]
    out = []
    for n in names:
        cls = "tab"
        if n == active:
            cls += " act"
        if n in dim and n != active:
            cls += " dim"
        ct = ""
        if n == "Issues" and issues:
            ct = '<span class="ct bad">%d</span>' % issues
        if n == "Objects" and n in dim:
            ct = '<span class="ct">—</span>'
        out.append('<div class="%s">%s%s</div>' % (cls, n, ct))
    return '<div class="tabs">%s</div>' % ''.join(out)


def SEARCH(what="fixtures"):
    return ('<div class="search"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" '
            'stroke="currentColor" stroke-width="1.4"><circle cx="7" cy="7" r="4.4"/>'
            '<path d="M10.3 10.3L14 14" stroke-linecap="round"/></svg>Filter %s</div>' % what)


def phead(title, editable=False, what="fixtures"):
    tg = ('<div class="tgl%s"><span class="sw"><i></i></span>Editable</div>'
          % (" on" if editable else ""))
    cols = ('<div class="tgl"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" '
            'stroke="currentColor" stroke-width="1.3"><rect x="2" y="2.6" width="12" '
            'height="10.8" rx="1.4"/><path d="M6.4 2.6v10.8M10 2.6v10.8"/></svg>Columns</div>')
    return ('<div class="phead"><div class="ptitle">%s</div>%s<div style="flex:1"></div>%s%s'
            '</div>' % (title, SEARCH(what), tg, cols))


FIX_ROWS = [
    ("", "1", "Mover SL", "1.1", "gdtf:", "GLP impression 90 RGB", "14ch Normal", None, None),
    ("", "2", "Mover SR", "1.15", "gdtf:", "GLP impression 90 RGB", "14ch Normal", None, None),
    ("", "3", "Mover ML", "1.29", "gdtf:", "GLP impression 90 RGB", "14ch Normal", None, None),
    ("ovr", "4", "Mover MR", "1.43", "gdtf:", "GLP impression 90 RGB", "14ch Normal", None, None),
    ("nodef", "5", "Mover BL", "1.57", "gdtf:", "GLP impression 90 RGB", "14ch Normal",
     None, None),
    ("", "6", "Mover BR", "1.71", "gdtf:", "GLP impression 90 RGB", "14ch Normal", None, None),
    ("", "7", "Fog Fury Jett", "1.85", "gdtf:", "ADJ Fog Fury Jett", "8ch", None, None),
    ("conflict", "8", "Dimmer A", "1.100", "ofl:", "Generic Dimmer", "1ch", None, None),
    ("conflict", "9", "Dimmer B", "1.100", "ofl:", "Generic Dimmer", "1ch", None, None),
    ("unpatched", "10", "Blinder", None, "ofl:", "Generic Dimmer", "1ch", None, None),
    ("", "101", "Spoke 1", "2.30", "bhs:", "spoke23", "3 ch/px · 23", None, None),
    ("", "102", "Spoke 2", "2.99", "bhs:", "spoke23", "3 ch/px · 23", None, None),
    ("", "107", "Spoke 7", "2.444", "bhs:", "spoke23", "3 ch/px · 23", None, None),
    ("", "108", "Spoke 8", "3.1", "bhs:", "spoke23", "3 ch/px · 23", None, None),
    ("", "−1", "Tube FOH", "4.400", "bhs:", "tube60", "3 ch/px · 60", "5.1", "3 ch/px · 60"),
]


def fixtures_tab():
    head = ('<thead><tr><th style="width:34px"></th><th style="width:56px">ID</th>'
            '<th style="width:196px">Name</th><th style="width:104px">Uni.Addr</th>'
            '<th style="width:300px">Definition</th><th style="width:158px">Mode</th>'
            '<th style="width:118px">Uni.Addr #2</th><th>Mode #2</th></tr></thead>')
    rows = []
    for mark, fid, name, addr, pfx, defn, mode, a2, m2 in FIX_ROWS:
        g = ""
        if mark == "ovr":
            g = gl_ovr(12, "var(--sel)")
        elif mark == "nodef":
            g = gl_nodef(12, "var(--bad)")
        elif mark == "unpatched":
            g = gl_unpatched(12, "var(--lo)")
        cell_addr = addr
        if addr is None:
            cell_addr = ('<span style="display:inline-flex;align-items:center;gap:6px" '
                         'class="mut">%s Unpatched</span>' % gl_unpatched(12, "currentColor"))
        if mark == "conflict":
            cell_addr = ('<span style="display:inline-flex;align-items:center;gap:6px">%s%s</span>'
                         % (gl_conflict(12, "var(--bad)"), addr))
        dcell = ('<span class="pfx">%s</span>%s' % (pfx, defn)) if pfx else defn
        if mark == "nodef":
            dcell = ('<span class="pfx">%s</span><span class="mut">%s</span>'
                     '<span style="color:var(--bad);margin-left:8px;font-size:10px;'
                     'letter-spacing:.09em">NOT IN LIBRARY</span>' % (pfx, defn))
        c2 = ('<span class="mut">Unpatched</span>' if a2 is None else a2)
        c3 = ('<span class="mut">Unpatched</span>' if m2 is None else m2)
        cls = ' class="sel"' if fid == "−1" else ""
        rows.append('<tr%s><td style="text-align:center">%s</td><td class="m">%s</td>'
                    '<td class="name">%s</td><td class="m">%s</td><td>%s</td><td>%s</td>'
                    '<td class="m">%s</td><td>%s</td></tr>'
                    % (cls, g, fid, name, cell_addr, dcell, mode, c2, c3))
    return ('<div class="tbody"><table>%s<tbody>%s</tbody></table></div>'
            '<div class="pfoot"><span>21 fixtures</span><span>964 ch patched</span>'
            '<span>5 universes</span><span style="color:var(--bad)">1 overlap</span>'
            '<span style="color:var(--bad)">1 definition missing</span>'
            '<span style="color:var(--lo)">1 unpatched</span><span style="color:var(--sel)">1 override</span></div>' % (head, ''.join(rows)))


UNI_ROWS = [
    ("1", "sACN", "44 Hz", None, "100", "no", "0", "contended"),
    ("2", "sACN", "44 Hz", None, "100", "no", "0", None),
    ("3", "sACN", None, "4.1 s", "100", "no", "0", "stale"),
    ("4", "Art-Net", "39 Hz", None, None, None, "2", None),
    ("5", "Art-Net", "39 Hz", None, None, None, "0", None),
]


def universes_tab():
    head = ('<thead><tr><th style="width:96px">Universe</th><th style="width:110px">Transport</th>'
            '<th style="width:150px">Arriving</th><th style="width:210px">Stale</th>'
            '<th style="width:190px">Priority</th><th style="width:130px">Blind</th>'
            '<th>Drops</th></tr></thead>')
    rows = []
    for u, tr, rate, gap, pri, blind, drops, flag in UNI_ROWS:
        thr = "2.5 s" if tr == "sACN" else "6.0 s"
        if flag == "stale":
            stale = ('<span style="display:inline-flex;align-items:center;gap:7px;'
                     'color:var(--warn)">%s<b style="font-weight:600;font-size:9.5px;'
                     'letter-spacing:.11em">STALE</b></span>'
                     '<span class="mut" style="margin-left:9px;font-family:var(--mono);'
                     'font-size:10.5px">no frame %s · threshold %s</span>'
                     % (gl_stale(12, "var(--warn)"), gap, thr))
            arr = '<span class="mut">—</span>'
        else:
            stale = ('<span style="display:inline-flex;align-items:center;gap:7px">'
                     '<i style="width:6px;height:6px;border-radius:50%%;background:var(--ok);'
                     'display:block"></i><span class="mut" style="font-family:var(--mono);'
                     'font-size:10.5px">threshold %s</span></span>' % thr)
            arr = '<span style="font-family:var(--mono);color:var(--hi)">%s</span>' % rate
        if pri is None:
            pcell = '<span class="mut">—</span>'
        elif flag == "contended":
            pcell = ('<span style="font-family:var(--mono);color:var(--hi)">%s</span>'
                     '<span style="margin-left:9px;color:var(--bad);font-size:9.5px;'
                     'font-weight:600;letter-spacing:.11em">CONTENDED · 2 SOURCES</span>' % pri)
        else:
            pcell = '<span style="font-family:var(--mono);color:var(--hi)">%s</span>' % pri
        bcell = ('<span class="mut">—</span>' if blind is None
                 else '<span style="font-family:var(--mono);color:var(--hi)">%s</span>' % blind)
        rows.append('<tr><td class="m">%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td>'
                    '<td>%s</td><td class="m">%s</td></tr>'
                    % (u, tr, arr, stale, pcell, bcell, drops))
    return ('<div class="tbody"><table>%s<tbody>%s</tbody></table></div>'
            '<div class="pfoot"><span>5 universes subscribed</span>'
            '<span style="color:var(--warn)">1 stale</span>'
            '<span style="color:var(--bad)">1 contended</span>'
            '<span>Priority is observed, not enforced — nothing merges</span>'
            '<span style="margin-left:auto">— means unknown, not absent</span></div>'
            % (head, ''.join(rows)))


def overlay_frame(tab_name, content, chips, issues=0, editable=False, title="Rig", what=None):
    return ('<div class="app">' + chipbar(chips) +
            '<div class="body">' + rail() + '<div class="view">' +
            S.scene() + '<div class="scrim"></div>'
            '<div class="panel">' + phead(title, editable, what or tab_name.lower()) +
            tabs(tab_name, issues=issues) + content + '</div>'
            '</div></div></div>')


def a_overlay():
    c1 = [chip("Feed", "live"), chip("Univ", "5 · 1 stale", "warn"),
          chip("Patch", "warehouse.yml · 4", "bad"), chip("Sel", "1 · Tube FOH", "on"),
          chip("Render", "normal"), chip("Hold", "off", "mute"), chip("Snap", "0.1 m"),
          chip("Cam", "Front")]
    c2 = [chip("Feed", "live"), chip("Univ", "5 · 1 stale", "warn"),
          chip("Patch", "warehouse.yml · 4", "bad"), chip("Sel", "—", "mute"),
          chip("Render", "normal"), chip("Hold", "off", "mute"), chip("Snap", "0.1 m"),
          chip("Cam", "Front")]
    body = (overlay_frame("Fixtures", fixtures_tab(), c1, issues=4, editable=True) +
            overlay_frame("Universes", universes_tab(), c2, issues=4))
    return page(EXTRA_CSS, body, height=900)


HIST = [
    ("14:02:11", "agent", "Rotate 5 spokes 180° about their own mid-points", "5 fixtures"),
    ("14:01:47", "agent", "Radial array “star” · radius 2.40 m → 2.65 m", "10 fixtures"),
    ("14:00:12", "you", "Move Mover MR → 2.40, 5.10, −3.40", "1 fixture"),
    ("13:59:30", "you", "Place stage · 8.0 × 4.0 m", "1 object"),
    ("13:58:03", "ingest", "Read patch warehouse.yml", "20 fixtures · 3 issues"),
    ("13:57:10", "ingest", "Import stage-left.mvr", "3 fixtures · 1 issue"),
    ("13:55:20", "you", "Define bhs:tube60 · 60 px @ 65 mm", "1 definition"),
    ("13:54:02", "you", "New scene", ""),
]


def history_tab():
    rows = []
    for i, (t, org, d, n) in enumerate(HIST):
        if i == 2:
            rows.append('<div class="undoline"><span>Undo to here</span><i></i>'
                        '<span>2 commands ahead</span></div>')
        g, cls, lbl = ((gl_agent(11), "org agent", "Agent") if org == "agent"
                       else (gl_ingest(11), "org ing", "Ingest") if org == "ingest"
                       else (gl_person(11), "org", "You"))
        rows.append('<div class="hrow"><span class="t">%s</span>'
                    '<span class="%s">%s%s</span><span class="d">%s</span>'
                    '<span class="n">%s</span></div>' % (t, cls, g, lbl, d, n))
    return ('<div class="tbody">%s</div>'
            '<div class="pfoot"><span>8 commands</span>'
            '<span>Every mutation is one command — the gizmo, the array, the agent</span>'
            '<span style="margin-left:auto">⌘Z undoes one</span></div>' % ''.join(rows))


ISSUES = [
    ("bad", "conflict", "Patch overlap", "Dimmer A and Dimmer B are both at 1.100.",
     "Two fixtures claim the same channel. Beamhouse renders both; the console decides "
     "what actually lights.", "warehouse.yml · read 13:58:03",
     [("Show both", 0), ("Repatch in Mizer", 0)]),
    ("bad", "nodef", "Definition missing",
     "Mover BL names <code>gdtf:GLP impression 90 RGB</code>, which is not in the library.",
     "Not the same as a definition that ships no mesh — that one still declares a "
     "<code>PrimitiveType</code> and a beam angle, and renders as proxy geometry. With no "
     "definition at all there is no primitive, no beam angle and no emitter count, so this "
     "fixture draws as a placeholder at its patched position and nothing more.",
     "warehouse.yml · read 13:58:03",
     [("Locate profile…", 1), ("Keep placeholder", 0)]),
    ("warn", "unpatched", "Extent mismatch",
     "<code>bhs:tube60</code> declares 60 px (180 ch); the patch allots 120 ch at 4.400.",
     "The definition wins for rendering, the patch for addressing — so 20 px are drawn with "
     "no channel behind them. Not truncated silently.", "scene · bhs definition",
     [("Edit definition", 1), ("Repatch", 0)]),
    ("ovr", "ovr", "Fixture id synthesised",
     "<code>stage-left.mvr</code> omitted FixtureID for 3 fixtures; ids 1001–1003 were minted.",
     "Overrides were matched back by the stored uuid hint, so nothing was lost. A re-import "
     "without that hint would have dropped them.", "stage-left.mvr · imported 13:57:10",
     [("Review the three", 0)]),
]


def issues_tab():
    gmap = {"conflict": gl_conflict, "nodef": gl_nodef, "unpatched": gl_unpatched, "ovr": gl_ovr}
    cmap = {"bad": "var(--bad)", "warn": "var(--warn)", "ovr": "var(--sel)"}
    rows = []
    for sev, g, kind, title, para, src, acts in ISSUES:
        c = cmap[sev]
        a = ''.join('<div class="act%s">%s</div>' % (" pri" if p else "", t) for t, p in acts)
        rows.append('<div class="iss"><div class="gl">%s</div><div class="bd">'
                    '<div class="h"><b>%s</b><em style="color:%s">%s</em></div>'
                    '<p class="p">%s</p><div class="src">%s</div>'
                    '<div class="acts">%s</div></div></div>'
                    % (gmap[g](15, c), title, c, kind, para, src, a))
    return ('<div class="tbody">%s</div>'
            '<div class="pfoot"><span>4 open</span>'
            '<span>Everything the last ingest could not reconcile — surfaced, never truncated'
            '</span></div>' % ''.join(rows))


def a_history_issues():
    c1 = [chip("Feed", "live"), chip("Univ", "5 · 1 stale", "warn"),
          chip("Patch", "warehouse.yml · 4", "bad"), chip("Sel", "—", "mute"),
          chip("Render", "normal"), chip("Hold", "off", "mute"), chip("Snap", "0.1 m"),
          chip("Cam", "Front")]
    body = (overlay_frame("History", history_tab(), c1, issues=4) +
            overlay_frame("Issues", issues_tab(), c1, issues=4))
    return page(EXTRA_CSS, body, height=900)


# ------------------------------------------------------- the M3a phone viewer (#40)

VIEWER_MARK = 'Beamhouse&nbsp;\u00b7&nbsp;<b>demo</b>'

# The share link's own rig: OBF26, 20 fixtures across three universes. Colour keys
# match the viewport's beams.
FLIST = [
    ("Impression 1", "1.001", "14", S.AMBER), ("Impression 2", "1.015", "14", S.BLUE),
    ("Impression 3", "1.029", "14", S.MAG), ("Impression 4", "1.043", "14", S.MAG),
    ("Impression 5", "1.057", "14", S.BLUE), ("Impression 6", "1.071", "14", S.AMBER),
    ("Dimmerpack 4ch", "1.085", "4", S.AMBER), ("Dimmerpack 1ch", "1.089", "1", S.AMBER),
    ("Fog Fury Jett", "1.090", "7", S.GREEN),
    ("Spoke 1", "2.030", "69", S.MAG), ("Spoke 2", "2.099", "69", S.MAG),
    ("Spoke 3", "2.168", "69", S.MAG), ("Spoke 4", "2.237", "69", S.MAG),
]


def frow(name, addr, ch, col, sel=False):
    return ('<div class="frow%s"><i class="dot" style="background:%s"></i>'
            '<span class="nm">%s</span><span class="ad">%s</span>'
            '<span class="ct">%s ch</span></div>'
            % (" on" if sel else "", col, name, addr, ch))


def srow(k, v, cls=""):
    return ('<div class="srow%s"><span class="k">%s</span><span class="v">%s</span></div>'
            % ((" " + cls) if cls else "", k, v))


def _phone_page(body):
    return (HEAD + '<helmet>\n<style>\n' + BASE_CSS + EXTRA_CSS + PHONE_CSS +
            '\n</style>\n' + FONTS + '\n</helmet>\n' + body + '\n' + TAIL)


def _pframe(chips, band, below):
    return ('<div class="app phone">' + chipbar(chips, mark=VIEWER_MARK) +
            '<div class="body"><div class="pband">' + band + '</div>'
            '<div class="plist">' + below + '</div></div></div>')


def a_phone():
    # 1 - resting. Two chips, no tool rail, and the rig drawn exactly as the sender
    # sees it: every definition on this rig ships zero meshes, so proxy geometry is
    # the render path on both screens and there is no rung to announce (ADR-0031).
    band1 = (S.scene() + '<div class="ptag">Snapshot \u00b7 2 Sep 14:02</div>')
    list1 = ('<div class="lhead"><h3>Fixtures</h3><em>20 \u00b7 warehouse.yml</em></div>' +
             ''.join(frow(*f) for f in FLIST[:8]) +
             '<div class="sfoot">Light is <b>computed</b>, not the rig\u2019s \u2014 this link '
             'carries no network. Turn the phone sideways to give the rig the screen.</div>')
    f1 = _pframe([chip("Sel", "\u2014", "mute"), chip("Cam", "Front")], band1, list1)

    # 2 - one fixture tapped. Tap-to-select and orbit are the whole interaction
    # (ADR-0032); the sheet is a read-out, not an editor. The table and the viewport
    # are one selection, bound both ways (§14.2) - so the row is lit too.
    band2 = (S.scene(star_sel=True) +
             '<div class="tapdot" style="left:195px;top:150px"></div>')
    sheet2 = (
        '<div class="sheet"><div class="grip"></div>'
        '<div class="sh"><h3>Spoke 3</h3><em>id 103</em></div>' +
        srow("Patch", "2.168 <i>\u00b7 69 ch</i>") +
        srow("Mode", "23px RGB 69-channel") +
        srow("Emitters", "23 <i>@ 65 mm</i>") +
        srow("Beam", "120\u00b0 <i>\u00b7 strip</i>") +
        srow("Position", "1.84, 3.20, \u22120.62 <i>m</i>") +
        srow("Rotation", "0, 108, 180 <i>\u00b0</i>") +
        '<div class="sfoot">Read-only. This is a <b>shared snapshot</b>: the geometry, beam '
        'angle and emitter count travelled in the link, so nothing here needed a definition '
        'library to resolve.</div></div>')
    list2 = ('<div class="lhead"><h3>Fixtures</h3><em>20 \u00b7 warehouse.yml</em></div>' +
             ''.join(frow(*f, sel=(f[0] == "Spoke 3")) for f in FLIST[:8]) + sheet2)
    f2 = _pframe([chip("Sel", "1", "on"), chip("Cam", "Front")], band2, list2)

    return _phone_page(f1 + f2)


def a_phone_land():
    """844 x 390. A phone turned sideways is 2.16:1 against the rig's 1.63:1 - the
    only orientation in which the whole rig gets the whole screen."""
    body = ('<div class="app land">' + chipbar(
        [chip("Sel", "\u2014", "mute"), chip("Cam", "Front")], mark=VIEWER_MARK) +
        '<div class="body"><div class="view">' + S.scene() +
        '<div class="ptag">Snapshot \u00b7 2 Sep 14:02</div></div></div></div>')
    return _phone_page(body)


FILES = {
    "Empty.dc.html": a_empty,
    "Main.dc.html": a_main,
    "Trouble.dc.html": a_trouble,
    "Place.dc.html": a_place,
    "Array.dc.html": a_array,
    "Overlay.dc.html": a_overlay,
    "HistoryIssues.dc.html": a_history_issues,
    "Phone.dc.html": a_phone,
    "PhoneLandscape.dc.html": a_phone_land,
}

CANVAS = {
    "artboards": [
        {"file": "Empty.dc.html", "x": 0, "y": 0, "w": 1440, "h": 900, "title": "First run"},
        {"file": "Main.dc.html", "x": 1520, "y": 0, "w": 1440, "h": 900,
         "title": "Resting · bridge-local"},
        {"file": "Trouble.dc.html", "x": 3040, "y": 0, "w": 1440, "h": 900,
         "title": "The same screen, in trouble"},
        {"file": "Place.dc.html", "x": 0, "y": 1020, "w": 1440, "h": 900,
         "title": "Placing a fixture"},
        {"file": "Array.dc.html", "x": 1520, "y": 1020, "w": 1440, "h": 900,
         "title": "A live parametric array"},
        {"file": "Overlay.dc.html", "x": 3040, "y": 1020, "w": 1440, "h": 1800,
         "title": "The overlay · Fixtures, Universes"},
        {"file": "HistoryIssues.dc.html", "x": 1520, "y": 2040, "w": 1440, "h": 1800,
         "title": "The overlay · History, Issues"},
        {"file": "Phone.dc.html", "x": 0, "y": 2040, "w": 390, "h": 1688,
         "title": "The M3a viewer · 390 px portrait"},
        {"file": "PhoneLandscape.dc.html", "x": 0, "y": 3860, "w": 844, "h": 390,
         "title": "The M3a viewer · turned sideways"},
    ],
    "annotations": [
        {"id": "n-nav", "x": 1520, "y": -186, "w": 1440,
         "text": "Nothing is docked. Eight state chips are the navigation: each shows its "
                 "current value and opens the one overlay at its tab. The chip bar is also "
                 "the status line, so §13's signal inventory costs no layout.\n"
                 "grandMA3's title bar, generalised — the survey's strongest single steal."},
        {"id": "n-empty", "x": 0, "y": -186, "w": 1440,
         "text": "First run only: IndexedDB auto-save means the honest normal case is that the "
                 "app opens where you left it (§4.6).\n"
                 "The picker takes Mizer YAML and MVR. A BlinderKitten .olga or MagicQ CSV is "
                 "refused with the reason, not a parse error — ADR-0020 measured that neither "
                 "names its definitions resolvably."},
        {"id": "n-trouble", "x": 3040, "y": -186, "w": 1440,
         "text": "Every trust and provenance mark is ADDITIVE and drawn in screen space. "
                 "A fixture at zero and a fixture whose data stopped look identical (§13.3), so "
                 "any subtractive cue — dimming, greying, desaturating — is invisible in exactly "
                 "the case that matters. The stale spokes are still lit: frozen values, badged.\n"
                 "One badge per fixture, never per break (ADR-0011)."},
        {"id": "n-place", "x": 0, "y": 1938, "w": 1440,
         "text": "Beamhouse never sends DMX, so it cannot hold the rig still — no surveyed "
                 "product has this problem. HOLD pins the RENDER of the selection while you "
                 "place it; frames keep arriving and the feed never notices.\n"
                 "The override is the design's most load-bearing idea (§4.5) and was invisible. "
                 "It now reads as a mark, carries the patch's own value, and offers the way back."},
        {"id": "n-array", "x": 1520, "y": 1938, "w": 1440,
         "text": "The array stays live. Changing N re-places every member as ONE command — "
                 "ADR-0016's undo grain is 'one thing a person would say out loud', which is "
                 "also the agent's MCP vocabulary. Anything this canvas fails to draw, the "
                 "agent cannot do either.\n"
                 "The five flipped spokes are #23's real cabling, and Mizer cannot represent "
                 "them at all."},
        {"id": "n-notation", "x": 3040, "y": 2892, "w": 1440,
         "text": "The field's converged notation, adopted whole: universe.address as one token "
                 "(Capture and BlenderDMX arrived at it independently); a second break as a "
                 "SUFFIXED COLUMN SET with 'Unpatched' as a literal value, so a one-break "
                 "fixture shows empty columns rather than a different UI; patch errors as "
                 "in-cell glyphs, never modals; Editable as a toggle on the table itself.\n"
                 "Universes is §13.2 verbatim. '—' is a third state: Art-Net carries no "
                 "priority and no Preview_Data, and UNKNOWN is not the same claim as NOT BLIND."},
        {"id": "n-history", "x": 1520, "y": 3912, "w": 1440,
         "text": "History exists because of one scenario ADR-0016 names: it is 4pm and an agent "
                 "just rotated the wrong five spokes. Blind ⌘Z against an editor you don't have "
                 "your hands on is the panic; seeing how far back to go is the fix. Agent-driven "
                 "commands are marked — the only place the second editor is visible at all.\n"
                 "Issues is one inbox for everything an ingest could not reconcile: ADR-0012's "
                 "extent mismatch, ADR-0020's synthesised ids, orphaned overrides, patch overlaps."},
        {"id": "n-phone", "x": 0, "y": 4340, "w": 844,
         "text": "#40. There is no degradation ladder. Every GDTF on this rig ships ZERO "
                 "meshes, so proxy geometry is the render path on the sender\u2019s desktop "
                 "too — the recipient is not on a rung. And carrying the render-resolved "
                 "definition inline costs 211 characters of a 4096 budget (measured), so the "
                 "link never needs a definition library at all.\n"
                 "Two chips, not eight: 8 chips measure 1015px and §14.1\u2019s surviving 4 "
                 "still measure 561px into 390px. A chip earns its place by being ACTIONABLE. "
                 "No tool rail, because nothing here is editable. The viewer indication is the "
                 "wordmark slot, which also carries the feed — so \u2018this light is "
                 "computed\u2019 is stated where a Feed chip would not have fit.\nPortrait cannot give the rig the screen: 1.63:1 into 0.46:1 is a 240px strip on an 844px phone. So portrait spends 320px on the rig and the rest on the list, and the payoff frame is the phone turned sideways \u2014 844x390 is 2.16:1, the only orientation the rig actually fits."},
    ],
    "launch": {"view": "canvas"},
}

if __name__ == "__main__":
    for name, fn in FILES.items():
        with open(name, "w") as f:
            f.write(fn())
        print("wrote", name)
    with open("canvas.json", "w") as f:
        json.dump(CANVAS, f, indent=2)
    print("wrote canvas.json")
