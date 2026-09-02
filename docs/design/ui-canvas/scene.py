# The 3D viewport scene, drawn as inline SVG. One rig, drawn several ways.
import math

VW, VH = 1392, 856
VPX, VPY = 696, 300                     # vanishing point / horizon

AMBER = "oklch(0.80 0.160 72)"
BLUE = "oklch(0.78 0.150 250)"
MAG = "oklch(0.72 0.180 338)"
GREEN = "oklch(0.78 0.150 152)"

# six movers on the truss: x, floor target x/y, colour key
MOVERS = [
    (412, 458, 662, "a"), (526, 552, 622, "b"), (640, 642, 692, "c"),
    (754, 758, 616, "c"), (868, 852, 666, "b"), (982, 942, 630, "a"),
]
COL = {"a": AMBER, "b": BLUE, "c": MAG}

STAR_C = (696, 398)          # STAR-TENT hub
STAR_R = 94

MUSICIANS = [(560, 694, 76), (704, 704, 80), (846, 688, 74)]


def _defs():
    g = ['<defs>']
    for k, c in COL.items():
        g.append(
            '<linearGradient id="bm%s" x1="0" y1="0" x2="0" y2="1">'
            '<stop offset="0" stop-color="%s" stop-opacity="0.46"/>'
            '<stop offset="0.55" stop-color="%s" stop-opacity="0.17"/>'
            '<stop offset="1" stop-color="%s" stop-opacity="0.045"/></linearGradient>'
            % (k, c, c, c))
        g.append(
            '<radialGradient id="pl%s"><stop offset="0" stop-color="%s" stop-opacity="0.60"/>'
            '<stop offset="0.5" stop-color="%s" stop-opacity="0.26"/>'
            '<stop offset="1" stop-color="%s" stop-opacity="0"/></radialGradient>' % (k, c, c, c))
    g.append('<linearGradient id="gfade" x1="0" y1="0" x2="0" y2="1">'
             '<stop offset="0" stop-color="oklch(0.155 0.006 75)" stop-opacity="1"/>'
             '<stop offset="0.34" stop-color="oklch(0.155 0.006 75)" stop-opacity="0"/>'
             '</linearGradient>')
    g.append('<radialGradient id="haze" cx="0.5" cy="0.42" r="0.62">'
             '<stop offset="0" stop-color="oklch(0.62 0.03 70)" stop-opacity="0.115"/>'
             '<stop offset="1" stop-color="oklch(0.62 0.03 70)" stop-opacity="0"/>'
             '</radialGradient>')
    g.append('<filter id="glow" x="-30%" y="-30%" width="160%" height="160%">'
             '<feGaussianBlur stdDeviation="9"/></filter>')
    g.append('<filter id="glowS" x="-60%" y="-60%" width="220%" height="220%">'
             '<feGaussianBlur stdDeviation="4"/></filter>')
    g.append('</defs>')
    return ''.join(g)


def _grid():
    p = []
    # converging lines
    for i in range(-9, 12):
        x0 = -760 + i * 190
        p.append('<line x1="%d" y1="%d" x2="%d" y2="%d" stroke="oklch(0.315 0.008 75)" '
                 'stroke-width="1" opacity="0.5"/>' % (x0, VH, VPX, VPY))
    # depth lines
    for k in range(1, 13):
        t = k / 12.0
        y = VPY + (VH - VPY) * (t ** 2.05)
        op = 0.16 + 0.40 * t
        p.append('<line x1="0" y1="%.1f" x2="%d" y2="%.1f" stroke="oklch(0.315 0.008 75)" '
                 'stroke-width="1" opacity="%.2f"/>' % (y, VW, y, op))
    p.append('<rect x="0" y="%d" width="%d" height="%d" fill="url(#gfade)"/>'
             % (VPY - 40, VW, 240))
    return '<g>%s</g>' % ''.join(p)


def _stage():
    # trapezoid platform sitting on the implicit ground plane
    top = 'M430 520 L962 520 L1092 700 L300 700 Z'
    return ('<g><path d="%s" fill="oklch(0.228 0.008 75)"/>'
            '<path d="M300 700 L1092 700 L1092 716 L300 716 Z" fill="oklch(0.183 0.007 75)"/>'
            '<path d="%s" fill="none" stroke="oklch(0.335 0.009 75)" stroke-width="1.1"/>'
            '<line x1="300" y1="716" x2="1092" y2="716" stroke="oklch(0.315 0.008 75)" '
            'stroke-width="1"/></g>' % (top, top))


def _truss():
    y = 190
    p = ['<line x1="340" y1="%d" x2="1052" y2="%d" stroke="oklch(0.355 0.009 75)" '
         'stroke-width="2"/>' % (y, y),
         '<line x1="340" y1="%d" x2="1052" y2="%d" stroke="oklch(0.30 0.008 75)" '
         'stroke-width="1.6"/>' % (y + 11, y + 11)]
    x = 340
    while x < 1046:
        p.append('<line x1="%d" y1="%d" x2="%d" y2="%d" stroke="oklch(0.285 0.008 75)" '
                 'stroke-width="1"/>' % (x, y, x + 26, y + 11))
        p.append('<line x1="%d" y1="%d" x2="%d" y2="%d" stroke="oklch(0.285 0.008 75)" '
                 'stroke-width="1"/>' % (x + 26, y, x, y + 11))
        x += 26
    return '<g>%s</g>' % ''.join(p)


def _mover_body(x, sel=False, ghost=False):
    st = "oklch(0.78 0.150 220)" if sel else "oklch(0.40 0.009 75)"
    fill = "none" if ghost else "oklch(0.255 0.008 75)"
    dash = ' stroke-dasharray="3 2.5"' if ghost else ''
    return ('<g><rect x="%d" y="201" width="13" height="9" fill="oklch(0.30 0.008 75)"/>'
            '<path d="M%d 210 L%d 210 L%d 234 L%d 234 Z" fill="%s" stroke="%s" '
            'stroke-width="%s"%s/></g>'
            % (x - 6, x - 11, x + 11, x + 13, x - 13, fill, st, "1.6" if sel else "1.1", dash))


def _beams(skip=(), stale=(), sel=None):
    out = []
    for i, (x, fx, fy, ck) in enumerate(MOVERS):
        if i in skip:
            continue
        c = COL[ck]
        poly = 'M%d 234 L%d 234 L%d %d L%d %d Z' % (x - 11, x + 11, fx + 47, fy, fx - 47, fy)
        op = '0.55' if i in stale else '1'
        out.append('<g opacity="%s"><path d="%s" fill="url(#bm%s)" filter="url(#glow)" '
                   'opacity="0.55"/><path d="%s" fill="url(#bm%s)"/>'
                   '<ellipse cx="%d" cy="%d" rx="54" ry="16" fill="url(#pl%s)"/>'
                   '<ellipse cx="%d" cy="%d" rx="21" ry="6.2" fill="%s" opacity="0.34" '
                   'filter="url(#glowS)"/></g>'
                   % (op, poly, ck, poly, ck, fx, fy, ck, fx, fy, c))
    return ''.join(out)


def _star(sel=False, stale_idx=(), handles=False):
    cx, cy = STAR_C
    out = []
    for i in range(10):
        a = math.radians(-90 + i * 36)
        x2 = cx + STAR_R * math.cos(a)
        y2 = cy + STAR_R * 0.42 * math.sin(a)          # squashed = seen at an angle
        hue = 60 + i * 26
        c = "oklch(0.78 0.155 %d)" % (hue % 360)
        out.append('<line x1="%d" y1="%d" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="7" '
                   'stroke-linecap="round" opacity="0.44" filter="url(#glowS)"/>'
                   % (cx, cy, x2, y2, c))
        out.append('<line x1="%d" y1="%d" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="3.2" '
                   'stroke-linecap="round"/>' % (cx, cy, x2, y2, c))
    out.append('<circle cx="%d" cy="%d" r="5" fill="oklch(0.30 0.008 75)" '
               'stroke="oklch(0.40 0.009 75)" stroke-width="1"/>' % (cx, cy))
    if sel:
        out.append('<ellipse cx="%d" cy="%d" rx="%d" ry="%d" fill="none" '
                   'stroke="oklch(0.78 0.150 220)" stroke-width="1.2" stroke-dasharray="5 4" '
                   'opacity="0.85"/>' % (cx, cy, STAR_R + 14, int(STAR_R * 0.42) + 14))
    if handles:
        for hx, hy in ((cx + STAR_R + 14, cy), (cx, cy - int(STAR_R * 0.42) - 14)):
            out.append('<rect x="%d" y="%d" width="8" height="8" fill="oklch(0.155 0.006 75)" '
                       'stroke="oklch(0.78 0.150 220)" stroke-width="1.4"/>' % (hx - 4, hy - 4))
    return '<g>%s</g>' % ''.join(out)


def _musician(x, y, h):
    """A human proxy: a box at EMEX7's own measured dimensions.

    ADR-0035: `PrimitiveType="Undefined"` plus a `.3ds` renders as an empty transform node
    and v1 has no mesh loader, so the proxy is the bounding box the `<Model>` declares --
    0.64 x 0.59 x 1.77 m. Width and depth are that ratio against the drawn height; the top
    face is what keeps it reading as a box rather than a rectangle.
    """
    w = h * (0.644898 / 1.769315) / 2      # half width  -- 0.182 h
    d = h * (0.593438 / 1.769315) * 0.42   # foreshortened depth of the top face
    top = y - h
    face = ('<path d="M%.1f %.1f L%.1f %.1f L%.1f %.1f L%.1f %.1f Z"'
            % (x - w, top, x + w, top, x + w, y, x - w, y))
    lid = ('<path d="M%.1f %.1f L%.1f %.1f L%.1f %.1f L%.1f %.1f Z"'
           % (x - w, top, x - w + d * 0.62, top - d, x + w + d * 0.62, top - d, x + w, top))
    side = ('<path d="M%.1f %.1f L%.1f %.1f L%.1f %.1f L%.1f %.1f Z"'
            % (x + w, top, x + w + d * 0.62, top - d, x + w + d * 0.62, y - d, x + w, y))
    return ('<g stroke="oklch(0.475 0.013 75)" stroke-width="0.9" stroke-linejoin="round">'
            '%s fill="oklch(0.330 0.011 75)"/>'
            '%s fill="oklch(0.288 0.010 75)"/>'
            '%s fill="oklch(0.372 0.012 75)"/></g>' % (face, side, lid))


def _dimmers():
    # two generic dimmer pars on floor stands, stage left / right
    out = []
    for x, y in ((228, 692), (268, 686), (1198, 684)):
        out.append('<g><line x1="%d" y1="%d" x2="%d" y2="%d" stroke="oklch(0.32 0.008 75)" '
                   'stroke-width="1.4"/><path d="M%d %d l14 0 l-2 -13 l-10 0 Z" '
                   'fill="oklch(0.255 0.008 75)" stroke="oklch(0.40 0.009 75)" '
                   'stroke-width="1"/></g>' % (x + 7, y, x + 7, y - 34, x, y - 34))
    return ''.join(out)


def scene(*, skip_beams=(), stale_beams=(), star_stale=(), star_sel=False, star_handles=False,
          sel_mover=None, ghost_mover=None, empty=False, extra="",
          preserve="xMidYMid slice", vb=None):
    """Assemble the viewport SVG.

    ``preserve`` is the SVG preserveAspectRatio. The desktop artboards slice, because the
    viewport is wider than it is tall and cropping loses nothing. A portrait phone frame
    must ``meet`` instead: slicing a 1392x856 rig into a 390-wide column would crop away
    everything but the middle 428 units, which is most of the rig.

    ``vb`` optionally narrows the viewBox to ``(minx, miny, w, h)``. The landscape phone
    frames the rig's content box (x 174..1217 x y 190..716) rather than the whole canvas,
    because at 2.53:1 the frame is height-bound and the canvas's own margins -- the sky
    above the truss, the empty floor below the stage lip -- are pure dead weight there.
    """
    box = vb or (0, 0, VW, VH)
    p = ['<svg class="scene" viewBox="%d %d %d %d" preserveAspectRatio="%s">'
         % (box[0], box[1], box[2], box[3], preserve),
         _defs(),
         '<rect width="%d" height="%d" fill="oklch(0.155 0.006 75)"/>' % (VW, VH),
         _grid()]
    if not empty:
        p.append(_stage())
        for mx, my, mh in MUSICIANS:
            p.append(_musician(mx, my, mh))
        p.append(_dimmers())
        p.append(_truss())
        p.append(_star(sel=star_sel, stale_idx=star_stale, handles=star_handles))
        p.append(_beams(skip=skip_beams, stale=stale_beams))
        for i, (x, fx, fy, ck) in enumerate(MOVERS):
            p.append(_mover_body(x, sel=(i == sel_mover), ghost=(i == ghost_mover)))
        p.append('<rect width="%d" height="%d" fill="url(#haze)"/>' % (VW, VH))
    p.append(extra)
    p.append('</svg>')
    return ''.join(p)
