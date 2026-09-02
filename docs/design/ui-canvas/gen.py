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


# ------------------------------------------- the recording transport (#45, ADR-0042)
# One component, three surfaces. It is ADR-0032's `Snapshot` tag grown a scrub track,
# in the same viewport slot - not a chip (a Time chip puts the 390px bar 93px over) and
# not a bottom bar (the sheet rises from there). The block is 44px tall so the drag
# target is honest at the touch floor, even though the track itself is 3px.
XPORT_CSS = """
.xport{position:absolute;left:10px;bottom:10px;padding:8px 11px 10px;border-radius:3px;
  background:color-mix(in oklab,var(--bg0) 87%,transparent);
  border:1px solid color-mix(in oklab,var(--beam) 44%,transparent)}
.xport .lbl{display:flex;align-items:baseline;gap:7px;height:13px;font-size:9.5px;
  font-weight:600;letter-spacing:.105em;text-transform:uppercase;color:var(--beam)}
.xport .lbl em{font-style:normal;font-family:var(--mono);font-size:10.5px;
  letter-spacing:.01em;text-transform:none;color:var(--hi)}
.xport .lbl i{font-style:normal;font-family:var(--mono);font-size:10.5px;
  letter-spacing:.01em;text-transform:none;color:var(--lo)}
.xport .trk{position:relative;height:3px;margin-top:10px;border-radius:2px;
  background:var(--line)}
.xport .trk .fill{position:absolute;left:0;top:0;bottom:0;border-radius:2px;
  background:var(--beam)}
.xport .trk .hd{position:absolute;top:50%;width:13px;height:13px;border-radius:50%;
  background:var(--beam);transform:translate(-50%,-50%);
  box-shadow:0 0 0 3px color-mix(in oklab,var(--bg0) 74%,transparent)}
.app.desk{height:900px}
.trio{display:flex;gap:0;align-items:flex-start}
.trio .gap{width:206px;flex:none}
.vgap{height:16px;background:var(--bg0)}
"""


def xport(w, lead, pos, total, pct):
    """The transport. ``lead`` is what you are watching: the snapshot's date on the
    viewer, the file on the desktop - the slot's own rule (ADR-0042 decision 6)."""
    return ('<div class="xport" style="width:%dpx">'
            '<div class="lbl">%s \u00b7<em>%s</em><i>/ %s</i></div>'
            '<div class="trk"><div class="fill" style="width:%.1f%%"></div>'
            '<div class="hd" style="left:%.1f%%"></div></div></div>'
            % (w, lead, pos, total, pct, pct))



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
        chip("Patch", "warehouse.yml · 3", "bad"), chip("Sel", "—", "mute"),
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

def tabs(active, issues=0, dim=(), objects=6):
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
        if n == "Objects":
            ct = ('<span class="ct">%d</span>' % objects) if objects else \
                 '<span class="ct">—</span>'
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


# The reference rig, as the console patches it, plus one local fixture.
#
# Fixture −1 "Tube FOH" is the only ILLUSTRATIVE row here: `bhs:` has no instance on
# this rig (ADR-0038's own consequence), so a gled2-driven tube stands in for the one
# case the format is scoped to — pixels on the wire that no console has patched. Its
# 35 px at 33 mm pitch are plausible, not measured: 35 px is DESIGN.md §05's worked
# example and 33 mm is a 30 LED/m strip. Nothing may cite them as a measurement.
#
# The ten spokes are the authored `Beamhouse@WLED STAR-TENT Spoke 23px`, which is
# what the Mizer patch names today — Mizer keys a GDTF by FixtureTypeID, so the row
# is `gdtf:1B9F1C2E-7A64-4C0D-9E33-5A2D8B47F016`. #46 wrote the definition and
# deleted the OFL entry (`ofl:beamhouse:wled-star-tent-spoke-23px`) it replaces.
# Before #46 landed, these rows named the OFL spoke — the prefix flipped only once
# the authored file existed, since a definition id that resolves to nothing is
# ADR-0034's marker case inflicted on purpose.
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
    ("", "101", "Spoke 1", "2.30", "gdtf:", "Beamhouse WLED STAR-TENT Spoke 23px",
     "23px RGB 69-channel", None, None),
    ("", "102", "Spoke 2", "2.99", "gdtf:", "Beamhouse WLED STAR-TENT Spoke 23px",
     "23px RGB 69-channel", None, None),
    ("", "107", "Spoke 7", "2.444", "gdtf:", "Beamhouse WLED STAR-TENT Spoke 23px",
     "23px RGB 69-channel", None, None),
    ("", "108", "Spoke 8", "3.1", "gdtf:", "Beamhouse WLED STAR-TENT Spoke 23px",
     "23px RGB 69-channel", None, None),
    ("", "−1", "Tube FOH", "4.400", "bhs:", "tube35", "3 ch/px · 35", None, None),
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
            '<div class="pfoot"><span>21 fixtures</span><span>889 ch patched</span>'
            '<span>4 universes</span><span style="color:var(--bad)">1 overlap</span>'
            '<span style="color:var(--bad)">1 definition missing</span>'
            '<span style="color:var(--lo)">1 unpatched</span><span style="color:var(--sel)">1 override</span></div>' % (head, ''.join(rows)))


OBJ_ROWS = [
    ("−20", "Stage deck", "bhs:", "stage", "Cube", "8.00 × 4.00 × 0.60 m", "0.00, 0.00, 0.00"),
    ("−21", "Singer", "bhs:", "human", "Cube", "0.64 × 0.59 × 1.77 m", "0.00, 0.00, −1.20"),
    ("−22", "Guitar SL", "bhs:", "human", "Cube", "0.64 × 0.59 × 1.77 m", "−2.10, 0.00, −0.40"),
    ("−23", "Drums SR", "bhs:", "human", "Cube", "0.64 × 0.59 × 1.77 m", "2.30, 0.00, −0.10"),
    ("14", "Truss FOH", "gdtf:", "BakaCowpoke Truss 10ft 12x18in", "Cylinder · Cube",
     "3.05 × 0.46 × 0.30 m", "0.00, 5.60, 1.80"),
    ("15", "Backdrop", None, None, None, None, "0.00, 0.00, 4.20"),
]


def objects_tab():
    head = ('<thead><tr><th style="width:34px"></th><th style="width:56px">ID</th>'
            '<th style="width:196px">Name</th><th style="width:300px">Definition</th>'
            '<th style="width:132px">Primitive</th><th style="width:186px">Extent</th>'
            '<th>Position</th></tr></thead>')
    rows = []
    for fid, name, pfx, defn, prim, ext, pos in OBJ_ROWS:
        g = "" if defn else gl_nodef(12, "var(--bad)")
        if defn:
            dcell = '<span class="pfx">%s</span>%s' % (pfx, defn)
            pcell, ecell = prim, ext
        else:
            dcell = ('<span class="mut">No GDTFSpec</span><span style="color:var(--bad);'
                     'margin-left:8px;font-size:10px;letter-spacing:.09em">MARKER</span>')
            pcell = '<span class="mut">—</span>'
            ecell = '<span class="mut">—</span>'
        rows.append('<tr><td style="text-align:center">%s</td><td class="m">%s</td>'
                    '<td class="name">%s</td><td>%s</td><td>%s</td><td class="m">%s</td>'
                    '<td class="m">%s</td></tr>'
                    % (g, fid, name, dcell, pcell, ecell, pos))
    return ('<div class="tbody"><table>%s<tbody>%s</tbody></table></div>'
            '<div class="pfoot"><span>6 objects</span>'
            '<span style="color:var(--lo)">no address · never emits, occludes or receives</span>'
            '<span style="color:var(--bad)">1 marker</span>'
            '<span style="color:var(--lo)">2 from stage-left.mvr</span></div>'
            % (head, ''.join(rows)))


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
          chip("Patch", "warehouse.yml · 3", "bad"), chip("Sel", "1 · Tube FOH", "on"),
          chip("Render", "normal"), chip("Hold", "off", "mute"), chip("Snap", "0.1 m"),
          chip("Cam", "Front")]
    c2 = [chip("Feed", "live"), chip("Univ", "5 · 1 stale", "warn"),
          chip("Patch", "warehouse.yml · 3", "bad"), chip("Sel", "—", "mute"),
          chip("Render", "normal"), chip("Hold", "off", "mute"), chip("Snap", "0.1 m"),
          chip("Cam", "Front")]
    body = (overlay_frame("Fixtures", fixtures_tab(), c1, issues=3, editable=True) +
            overlay_frame("Universes", universes_tab(), c2, issues=3))
    return page(EXTRA_CSS, body, height=900)


def a_objects():
    c = [chip("Feed", "live"), chip("Univ", "5 · 1 stale", "warn"),
         chip("Patch", "warehouse.yml · 3", "bad"), chip("Sel", "1 · Singer", "on"),
         chip("Render", "normal"), chip("Hold", "off", "mute"), chip("Snap", "0.1 m"),
         chip("Cam", "Front")]
    body = overlay_frame("Objects", objects_tab(), c, issues=3, editable=True,
                         what="objects")
    return page(EXTRA_CSS, body, height=900)


HIST = [
    ("14:02:11", "agent", "Rotate 5 spokes 180° about their own mid-points", "5 fixtures"),
    ("14:01:47", "agent", "Radial array “star” · radius 2.40 m → 2.65 m", "10 fixtures"),
    ("14:00:12", "you", "Move Mover MR → 2.40, 5.10, −3.40", "1 fixture"),
    ("13:59:30", "you", "Place stage · 8.0 × 4.0 m", "1 object"),
    ("13:58:03", "ingest", "Read patch warehouse.yml", "20 fixtures · 2 issues"),
    ("13:57:10", "ingest", "Import stage-left.mvr", "3 fixtures · 1 issue"),
    ("13:55:20", "you", "Add local fixture · bhs:tube35 · 35 px @ 33 mm",
     "1 fixture · 1 definition"),
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
            '<div class="pfoot"><span>3 open</span>'
            '<span>Everything the last ingest could not reconcile — surfaced, never truncated'
            '</span></div>' % ''.join(rows))


def a_history_issues():
    c1 = [chip("Feed", "live"), chip("Univ", "5 · 1 stale", "warn"),
          chip("Patch", "warehouse.yml · 3", "bad"), chip("Sel", "—", "mute"),
          chip("Render", "normal"), chip("Hold", "off", "mute"), chip("Snap", "0.1 m"),
          chip("Cam", "Front")]
    body = (overlay_frame("History", history_tab(), c1, issues=3) +
            overlay_frame("Issues", issues_tab(), c1, issues=3))
    return page(EXTRA_CSS, body, height=900)


# ------------------------------------------------------- the M3a phone viewer (#40)

VIEWER_MARK = 'Beamhouse&nbsp;\u00b7&nbsp;<b>demo</b>'
REC_MARK = 'Beamhouse&nbsp;\u00b7&nbsp;<b>opener</b>'

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
    """844 x 390. A phone turned sideways is the only orientation with room for the rig
    to dominate the frame."""
    # [corrected 2026-09-02 - #45] This drew S.scene() at the default "slice", which
    # scales to the 844 WIDTH and crops the floor away - the exact opposite of the claim
    # this artboard exists to make. 844x334 is 2.53:1 against the rig's 1.63:1, so the
    # rig fits by HEIGHT with room to spare: "meet" is what ADR-0032 decision 4 means.
    # [corrected 2026-09-02 - #55] But a full-canvas "meet" leaves the rig at 407 of
    # 844px (48%) - the claim "the rig gets the screen" measured false. Landscape frames
    # the rig's CONTENT BOX (x 174..1217 x y 190..716, everything drawn between truss
    # and stage lip) instead: the rig then takes 662px (78%), and the ~91px margins are
    # the honest residue of 1.98:1 content in a 2.53:1 frame. Fitting the whole canvas
    # here only adds empty sky and empty near-floor grid; the x-only crop of the
    # portrait band is a no-op in this orientation (the frame is height-bound at every
    # x-window), so the box is trimmed in y as well.
    body = ('<div class="app land">' + chipbar(
        [chip("Sel", "\u2014", "mute"), chip("Cam", "Front")], mark=VIEWER_MARK) +
        '<div class="body"><div class="view">' +
        S.scene(preserve="xMidYMid meet", vb=(174, 190, 1043, 526)) +
        '<div class="ptag">Snapshot \u00b7 2 Sep 14:02</div></div></div></div>')
    return _phone_page(body)


def a_recorded():
    """1440 x 1760. The same transport overlay in the desktop app, the landscape phone
    and the portrait phone - ADR-0042's one-component claim drawn rather than asserted.
    Nothing else on any of the three changed: eight chips on the desktop, two on the
    viewer, no tool rail on either phone."""
    # 1 - desktop, bridge-local, playing a .bhr off disk. There is no Snapshot date here:
    # a bridge-local page is not frozen, so the lead is the file (ADR-0042 decision 6).
    desk_chips = [chip("Feed", "recorded"), chip("Univ", "3 \u00b7 ok"),
                  chip("Patch", "warehouse.yml"), chip("Sel", "\u2014", "mute"),
                  chip("Render", "normal"), chip("Hold", "off", "mute"),
                  chip("Snap", "0.1 m"), chip("Cam", "Front")]
    desk = ('<div class="app desk">' + chipbar(desk_chips) +
            '<div class="body">' + rail() + '<div class="view">' + S.scene() +
            xport(430, "opener.bhr", "04:12", "18:30", 22.5) +
            '</div></div></div>')

    # 2 - the payoff frame. 844 x 390, full-bleed, the transport in the same corner.
    # The scene is framed to the rig's content box like PhoneLandscape's (x 174..1217 x
    # y 190..716) - #45 made the two one component, so #55's framing rule reaches both.
    land = ('<div class="app land">' + chipbar(
        [chip("Sel", "\u2014", "mute"), chip("Cam", "Front")], mark=REC_MARK) +
        '<div class="body"><div class="view">' +
        S.scene(preserve="xMidYMid meet", vb=(174, 190, 1043, 526)) +
        xport(392, "Snapshot \u00b7 2 Sep 14:02", "04:12", "18:30", 22.5) +
        '</div></div></div>')

    # 3 - portrait. The transport lives in the 320px BAND, which is where the sheet
    # never reaches; a bottom bar would land exactly under it (ADR-0032 decision 5).
    band = (S.scene() + xport(370, "Snapshot \u00b7 2 Sep 14:02", "04:12", "18:30", 22.5))
    plist = ('<div class="lhead"><h3>Fixtures</h3><em>20 \u00b7 warehouse.yml</em></div>' +
             ''.join(frow(*f) for f in FLIST[:8]) +
             '<div class="sfoot">A <b>recording</b>, playing. Signal health is unreachable '
             'here, not false \u2014 a recording is not silent, it is finished '
             '(\u00a713.1).</div>')
    port = ('<div class="app phone">' + chipbar(
        [chip("Sel", "\u2014", "mute"), chip("Cam", "Front")], mark=REC_MARK) +
        '<div class="body"><div class="pband">' + band + '</div>'
        '<div class="plist">' + plist + '</div></div></div>')

    body = (desk + '<div class="vgap"></div>'
            '<div class="trio">' + land + '<div class="gap"></div>' + port + '</div>')
    return (HEAD + '<helmet>\n<style>\n' + BASE_CSS + EXTRA_CSS + PHONE_CSS + XPORT_CSS +
            '\n</style>\n' + FONTS + '\n</helmet>\n' + body + '\n' + TAIL)


FILES = {
    "Empty.dc.html": a_empty,
    "Main.dc.html": a_main,
    "Trouble.dc.html": a_trouble,
    "Place.dc.html": a_place,
    "Array.dc.html": a_array,
    "Overlay.dc.html": a_overlay,
    "Objects.dc.html": a_objects,
    "HistoryIssues.dc.html": a_history_issues,
    "Phone.dc.html": a_phone,
    "PhoneLandscape.dc.html": a_phone_land,
    "Recorded.dc.html": a_recorded,
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
        {"file": "Objects.dc.html", "x": 3040, "y": 2940, "w": 1440, "h": 900,
         "title": "The overlay · Objects"},
        {"file": "Phone.dc.html", "x": 0, "y": 2040, "w": 390, "h": 1688,
         "title": "The M3a viewer · 390 px portrait"},
        {"file": "PhoneLandscape.dc.html", "x": 0, "y": 3860, "w": 844, "h": 390,
         "title": "The M3a viewer · turned sideways"},
        {"file": "Recorded.dc.html", "x": 1520, "y": 3960, "w": 1440, "h": 1760,
         "title": "A recording · the transport, on all three surfaces"},
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
                 "priority and no Preview_Data, and UNKNOWN is not the same claim as NOT BLIND.\n"
                 "Fixture \u22121 is the one LOCAL FIXTURE: a negative id in mono with a real "
                 "minus sign, allocated and never typed (ADR-0039), naming a bhs: definition "
                 "that only it can reach \u2014 bhs: binds one way and never appears on a "
                 "positive id (ADR-0038). It carries ONE universe and address, so the second "
                 "break reads Unpatched; 35 px x 3 ch from 4.400 ends at slot 504. The 35 and "
                 "the 33 mm pitch are ILLUSTRATIVE: bhs: has no instance on this rig.\n"
                 "The two counts differ on purpose: the patch spans 4 universes, 5 are "
                 "subscribed. The bridge listens to what the show network carries."},
        {"id": "n-history", "x": 1520, "y": 3912, "w": 1440,
         "text": "History exists because of one scenario ADR-0016 names: it is 4pm and an agent "
                 "just rotated the wrong five spokes. Blind ⌘Z against an editor you don't have "
                 "your hands on is the panic; seeing how far back to go is the fix. Agent-driven "
                 "commands are marked — the only place the second editor is visible at all.\n"
                 "Issues is one inbox for everything AN INGEST could not reconcile: ADR-0020's "
                 "synthesised ids, orphaned overrides, patch overlaps.\n"
                 "ADR-0012's extent mismatch was the third row and is gone (ADR-0038): it "
                 "needed a patch and a bhs: definition disagreeing, and that binding is "
                 "removed. Its replacement, a universe over-run on a local fixture, is caught "
                 "WHEN THE ADDRESS IS TYPED \u2014 nothing has ingested it, and \u00a714.1 rides "
                 "the count on Patch precisely because every issue class originates in an "
                 "ingest. So no row replaces it."},
        {"id": "n-objects", "x": 3040, "y": 3872, "w": 1440,
         "text": "#43. There is no object model. EMEX7 publishes seven human proxies on GDTF "
                 "Share whose own Description is 'Environment from MVR' and whose bodies are "
                 "empty everywhere a lamp is full \u2014 zero attributes, zero emitters, an "
                 "empty <DMXChannels/>. So a SCENE OBJECT IS A FIXTURE WITH AN EMPTY DMX MODE, "
                 "and this is not a second table: it is the fixtures table filtered on 'has no "
                 "address', with the patch columns replaced by the definition ones.\n"
                 "Ids follow from that: negative for what Beamhouse minted (ADR-0012), the "
                 "MVR-supplied id for what a design tool authored. Backdrop is an MVR Fixture "
                 "node with NO GDTFSpec at all \u2014 a name and a matrix \u2014 so it renders "
                 "ADR-0034's fixed marker, because there is no definition to size it from.\n"
                 "The human proxy is a 0.64 x 0.59 x 1.77 m BOX, EMEX7's own measured bounding "
                 "box: PrimitiveType='Undefined' plus a .3ds renders as an empty transform node, "
                 "v1 has no mesh loader, and ADR-0001 forbids shipping their profile. A truss "
                 "needs nothing \u2014 it is 46 Geometry nodes over Cylinder cords and Cube "
                 "gusset plates, drawn by the proxy path already. An object NEVER EMITS, "
                 "OCCLUDES OR RECEIVES; the ground plane is the only surface light reaches."},
        {"id": "n-recorded", "x": 1520, "y": 5760, "w": 1440,
         "text": "One component, three surfaces. The transport is ADR-0032's Snapshot tag "
                 "grown a scrub track, in the same viewport slot on every screen \u2014 not a "
                 "chip and not a bottom bar.\n"
                 "A Time chip puts the 390px bar 93px over, and 25px over even after deleting "
                 "the feed from the wordmark to pay for it. A bottom bar lands exactly where "
                 "the fixture sheet rises. The one slot left is the one that already said what "
                 "you are watching \u2014 and \u00a713.1 had already put timeline position "
                 "there, next to snapshot age, which is the same question asked of a moving "
                 "thing.\n"
                 "The lead states WHAT you are watching, so it is the file on the desktop and "
                 "the snapshot's date on the viewer. A .bhr has no date of its own: t_ms is u32, "
                 "so it is relative by construction."},
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
