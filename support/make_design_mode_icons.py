"""Home-screen design-mode icons, in the app's own visual language.

Style brief (from the review of the first batch):
  * white outline, minimal - no filled panels, no glass cards, no text chips
  * colour used ONLY for accent: node fills, one highlighted branch, the sparkle
  * colours come from support/library.html (see PALETTE below), not invented
  * canvas is the library's #101014, so the cards sit on their own background

Four panels:
  guided      a small process tree - one root, three steps, one goal
  randomise   wheel of fortune (reference wheel, redrawn in line art)
  slots       slot machine - the repo's own randomiser-1-slots concept
  ai_chat     two speech bubbles: one "…", one with the AI sparkle

Outputs land in public/images/design_modes (JPG + transparent PNG).

Usage:
    python support/make_design_mode_icons.py [--out DIR] [--check DIR] [--only NAME]
"""
from __future__ import annotations

import argparse
import math
import random
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

# --------------------------------------------------------------------------
# palette - every value lifted from support/library.html
# --------------------------------------------------------------------------
CANVAS = (0x10, 0x10, 0x14)          # --color-background-default
SURFACE = (0x18, 0x18, 0x1C)         # elevated-low
SURFACE_2 = (0x20, 0x20, 0x24)       # elevated-medium
LINE = (0x30, 0x30, 0x34)            # neutral-300
LINE_2 = (0x40, 0x40, 0x44)          # neutral-400 / boundary

WHITE = (0xFF, 0xFF, 0xFF)
DIM = (0x76, 0x76, 0x76)
TEXT_2 = (0xAC, 0xAC, 0xAD)

UE_BLUE = (0x26, 0xBB, 0xFF)         # Unreal Engine accent
BLUE = (0x33, 0xBF, 0xFF)            # store accent
BLUE_200 = (0x18, 0x59, 0x77)
GREEN = (0x5F, 0xE3, 0x67)           # success
LIME = (0xAA, 0xE7, 0x55)
YELLOW = (0xF7, 0xD8, 0x2B)          # warning
AMBER = (0xF9, 0xA9, 0x1F)           # UEFN amber: spin / locked
ORANGE = (0xFE, 0x85, 0x39)
RED = (0xFD, 0x5E, 0x5E)             # critical
PINK = (0xE1, 0x66, 0xB6)
PURPLE = (0xBB, 0x6B, 0xF0)
INDIGO = (0x86, 0x8A, 0xFD)
CYAN = (0x44, 0xD5, 0xBF)

# accent set per panel: never more than three in one image
PANEL_ACCENTS = {
    "guided": (BLUE, GREEN),
    "randomise": (AMBER, YELLOW),
    "slots": (AMBER,),
    "ai_chat": (INDIGO, BLUE),
}

W, H = 900, 600
S = 2
SW, SH = W * S, H * S

REPO = Path(__file__).resolve().parent.parent
DEFAULT_OUT = REPO / "public" / "images" / "design_modes"
DEFAULT_CHECK = REPO / "support"

SEED = 20261123
GLOW_CUT = 0.6

# per-panel draw scale, to keep detail clear of the object-fit: cover crop
SLOT_FIT = {"randomise": 0.94, "slots": 0.95}

FONT_DIR = Path(r"C:\Windows\Fonts")
FONT_SEMI = FONT_DIR / "seguisb.ttf"
FONT_BOLD = FONT_DIR / "segoeuib.ttf"


def mix(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


def with_alpha(c, a):
    return c + (int(a),)


def gl(glow_scale, value):
    return value * glow_scale


# --------------------------------------------------------------------------
# canvas: dark, soft centre glow, quiet grid, vignette - shared by all four
# --------------------------------------------------------------------------
def radial_mask(cx, cy, rmax, pow_=1.0, src=None):
    r = max(2, int(rmax * 2))
    if src is None:
        src = int(min(512, max(96, r / 8)))
    g = Image.new("L", (src, src), 0)
    px = g.load()
    half = (src - 1) / 2.0
    for y in range(src):
        dy = (y - half) / half
        for x in range(src):
            dx = (x - half) / half
            d = math.hypot(dx, dy)
            px[x, y] = 0 if d >= 1.0 else int(255 * ((1.0 - d) ** pow_))
    return g.resize((r, r), Image.BICUBIC), (int(cx - rmax), int(cy - rmax),
                                             int(cx + rmax), int(cy + rmax))


def paste_radial(base, cx, cy, rmax, colour, opacity, pow_=1.0):
    m, box = radial_mask(cx, cy, rmax, pow_)
    m = m.point(lambda v: int(v * opacity))
    w, h = base.size
    x0, y0, x1, y1 = box
    cx0, cy0 = max(0, x0), max(0, y0)
    cx1, cy1 = min(w, x1), min(h, y1)
    if cx1 <= cx0 or cy1 <= cy0:
        return
    m = m.crop((cx0 - x0, cy0 - y0, cx1 - x0, cy1 - y0))
    layer = Image.new("RGBA", (cx1 - cx0, cy1 - cy0), colour + (0,))
    layer.putalpha(m)
    base.alpha_composite(layer, dest=(cx0, cy0))


def background(glow_colour, grid=True):
    base = Image.new("RGBA", (SW, SH), CANVAS + (255,))

    if grid:
        g = Image.new("RGBA", (SW, SH), (0, 0, 0, 0))
        gd = ImageDraw.Draw(g)
        step = 60 * S
        for x in range(0, SW + step, step):
            gd.line([(x, 0), (x, SH)], fill=WHITE + (7,), width=max(1, S // 2))
        for y in range(0, SH + step, step):
            gd.line([(0, y), (SW, y)], fill=WHITE + (7,), width=max(1, S // 2))
        base.alpha_composite(g)

    # a single soft pool behind the artwork, same place in all four
    paste_radial(base, SW * 0.5, SH * 0.47, SW * 0.52, glow_colour, 0.13, pow_=1.7)
    paste_radial(base, SW * 0.5, SH * 0.47, SW * 0.26, WHITE, 0.045, pow_=1.8)

    m, box = radial_mask(SW * 0.5, SH * 0.47, SW * 0.74, 1.3)
    x0, y0 = max(0, box[0]), max(0, box[1])
    m = m.crop((x0 - box[0], y0 - box[1], x0 - box[0] + SW, y0 - box[1] + SH))
    dark = Image.new("RGBA", base.size, (0, 0, 0, 0))
    dark.putalpha(ImageChops.invert(m).point(lambda v: int(v * 0.42)))
    base.alpha_composite(dark, dest=(x0, y0))

    rnd = random.Random(SEED)
    noise = Image.new("L", (SW, SH))
    noise.putdata([128 + int(rnd.gauss(0, 2.6)) for _ in range(SW * SH)])
    grain = Image.new("RGBA", base.size, WHITE + (0,))
    grain.putalpha(ImageChops.difference(
        noise, Image.new("L", noise.size, 128)).point(lambda v: int(v * 0.5)))
    base.alpha_composite(grain)

    return base.convert("RGB").resize((W, H), Image.LANCZOS)


# --------------------------------------------------------------------------
# line-art primitives
# --------------------------------------------------------------------------
def smooth_path(pts, samples=48):
    """Catmull-Rom through pts, so connector runs bend instead of kinking."""
    pts = [pts[0]] + list(pts) + [pts[-1]]
    out = []
    for i in range(len(pts) - 3):
        p0, p1, p2, p3 = pts[i], pts[i + 1], pts[i + 2], pts[i + 3]
        for j in range(samples):
            t = j / samples
            t2, t3 = t * t, t * t * t
            x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t
                       + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2
                       + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3)
            y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t
                       + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2
                       + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
            out.append((x, y))
    out.append(pts[-1])
    return out


def rstroke(size, pts, width, colour, alpha=255, glow=0.0, glow_colour=None,
            glow_blur=None):
    """Rounded-cap, rounded-join polyline, optionally with a soft glow."""
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    w = max(1, int(round(width)))
    d.line(list(pts), fill=colour + (alpha,), width=w, joint="curve")
    r = w / 2.0
    for (x, y) in (pts[0], pts[-1]):
        d.ellipse([x - r, y - r, x + r, y + r], fill=colour + (alpha,))

    if glow <= 0:
        return layer

    gc = glow_colour or colour
    blur = glow_blur if glow_blur is not None else width * 3.2
    m = layer.getchannel("A").filter(ImageFilter.MaxFilter(7)).filter(
        ImageFilter.GaussianBlur(blur))
    g = Image.new("RGBA", size, gc + (0,))
    g.putalpha(m.point(lambda v: min(int(v * glow), int(255 * 0.5))))
    g.alpha_composite(layer)
    return g


def stroke_ring(size, cx, cy, r, width, colour, alpha=255, glow=0.0,
                glow_colour=None, glow_blur=None, start=0.0, end=360.0,
                dash=None):
    """Circle / arc outline as a smooth polyline."""
    if dash:
        pts = []
        n = max(8, int(abs(end - start) / 3))
        for i in range(n + 1):
            pts.append((cx + r * math.cos(math.radians(start + (end - start) * i / n)),
                        cy + r * math.sin(math.radians(start + (end - start) * i / n))))
        layer = Image.new("RGBA", size, (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        on, off = dash
        # walk the polyline, turning the stroke on and off
        acc = 0.0
        seg, drawing = [pts[0]], True
        for i in range(1, len(pts)):
            acc += math.dist(pts[i - 1], pts[i])
            limit = on if drawing else off
            if acc >= limit:
                acc = 0.0
                seg.append(pts[i])
                if drawing:
                    rstroke_into(d, seg, width, colour, alpha)
                seg = [pts[i]]
                drawing = not drawing
            else:
                seg.append(pts[i])
        if drawing:
            rstroke_into(d, seg, width, colour, alpha)
        if glow > 0:
            gc = glow_colour or colour
            blur = glow_blur if glow_blur is not None else width * 3.2
            m = layer.getchannel("A").filter(ImageFilter.MaxFilter(7)).filter(
                ImageFilter.GaussianBlur(blur))
            g = Image.new("RGBA", size, gc + (0,))
            g.putalpha(m.point(lambda v: min(int(v * glow), int(255 * 0.5))))
            g.alpha_composite(layer)
            return g
        return layer

    pts = []
    n = max(16, int(abs(end - start) / 2))
    for i in range(n + 1):
        a = math.radians(start + (end - start) * i / n)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return rstroke(size, pts, width, colour, alpha, glow, glow_colour, glow_blur)


def rstroke_into(draw, pts, width, colour, alpha=255):
    if len(pts) < 2:
        return
    w = max(1, int(round(width)))
    draw.line(list(pts), fill=colour + (alpha,), width=w, joint="curve")


def rrect(size, box, radius, width, colour, alpha=255, glow=0.0,
          glow_colour=None, fill=None, fill_alpha=255):
    """Rounded-rect outline (drawn as a rounded shape minus an inner shape)."""
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    if fill is not None:
        f = Image.new("RGBA", size, (0, 0, 0, 0))
        ImageDraw.Draw(f).rounded_rectangle(box, radius=radius,
                                            fill=fill + (fill_alpha,))
        layer.alpha_composite(f)
    outer = Image.new("L", size, 0)
    ImageDraw.Draw(outer).rounded_rectangle(box, radius=radius, fill=255)
    inset = width
    inner = Image.new("L", size, 0)
    ImageDraw.Draw(inner).rounded_rectangle(
        [box[0] + inset, box[1] + inset, box[2] - inset, box[3] - inset],
        radius=max(0, radius - inset), fill=255)
    ring = ImageChops.subtract(outer, inner)
    stroke = Image.new("RGBA", size, colour + (0,))
    stroke.putalpha(ring.point(lambda v: int(v * alpha / 255)))
    layer.alpha_composite(stroke)
    if glow > 0:
        gc = glow_colour or colour
        m = ring.filter(ImageFilter.GaussianBlur(width * 2.6))
        g = Image.new("RGBA", size, gc + (0,))
        g.putalpha(m.point(lambda v: min(int(v * glow), int(255 * 0.5))))
        g.alpha_composite(layer)
        return g
    return layer


def dot(size, cx, cy, r, colour, alpha=255, glow=0.0, glow_colour=None):
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).ellipse([cx - r, cy - r, cx + r, cy + r],
                                  fill=colour + (alpha,))
    if glow > 0:
        gc = glow_colour or colour
        m = layer.getchannel("A").filter(ImageFilter.GaussianBlur(r * 1.6))
        g = Image.new("RGBA", size, gc + (0,))
        g.putalpha(m.point(lambda v: min(int(v * glow), int(255 * 0.4))))
        g.alpha_composite(layer)
        return g
    return layer


# --- small glyphs, all stroked so they read as one family ----------------
def glyph_check(size, cx, cy, s, colour, width, alpha=255):
    return rstroke(size, [(cx - s * 0.52, cy + s * 0.05),
                          (cx - s * 0.13, cy + s * 0.44),
                          (cx + s * 0.55, cy - s * 0.42)],
                   width, colour, alpha)


def glyph_dots(size, cx, cy, s, colour, width, alpha=255, n=3):
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    r = width * 1.15
    for i in range(n):
        x = cx + (i - (n - 1) / 2) * s
        ImageDraw.Draw(layer).ellipse([x - r, cy - r, x + r, cy + r],
                                      fill=colour + (alpha,))
    return layer


def glyph_question(size, cx, cy, s, colour, width, alpha=255):
    """Stroked question mark: short stem, bowl sweeping up the left, over the
    top and down the right, then a detatched dot below."""
    pts = [(cx + s * 0.02, cy + s * 0.26)]              # stem foot
    cbx, cby, rb = cx, cy - s * 0.26, s * 0.44
    for i in range(22):
        a = math.radians(108 - 208 * (i / 21))          # left, over top, right
        pts.append((cbx + rb * math.cos(a), cby + rb * math.sin(a)))
    pts.append((cx + s * 0.34, cy + s * 0.18))          # tail into the stem
    layer = rstroke(size, pts, width, colour, alpha)
    r = width * 1.2
    ImageDraw.Draw(layer).ellipse([cx - r, cy + s * 0.78 - r, cx + r,
                                   cy + s * 0.78 + r], fill=colour + (alpha,))
    return layer


def glyph_bars(size, cx, cy, s, colour, width, alpha=255):
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    for i, frac in enumerate((0.62, 1.0, 0.78)):
        y = cy + (i - 1) * s * 0.42
        layer.alpha_composite(rstroke(layer.size,
                                      [(cx - s * 0.5, y), (cx - s * 0.5 + s * frac, y)],
                                      width, colour, alpha))
    return layer


def glyph_sparkle(size, cx, cy, s, colour, alpha=255):
    """The four-point AI sparkle, as a filled concave star."""
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    pts = []
    n = 4
    for i in range(n * 2):
        a = math.radians(-90 + i * (360 / (n * 2)))
        r = s if i % 2 == 0 else s * 0.24
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    # curve the inner points for the classic concave look
    smooth = []
    for i, p in enumerate(pts):
        nxt = pts[(i + 1) % len(pts)]
        smooth.append(p)
        smooth.append(((p[0] + nxt[0]) / 2, (p[1] + nxt[1]) / 2))
    ImageDraw.Draw(layer).polygon(smooth, fill=colour + (alpha,))
    return layer


def glyph_star5(size, cx, cy, s, colour, alpha=255):
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    pts = []
    for i in range(10):
        a = math.radians(-90 + i * 36)
        r = s if i % 2 == 0 else s * 0.42
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    ImageDraw.Draw(layer).polygon(pts, fill=colour + (alpha,))
    return layer


def glyph_diamond(size, cx, cy, s, colour, width, alpha=255, hollow=True):
    pts = [(cx, cy - s), (cx + s * 0.62, cy), (cx, cy + s), (cx - s * 0.62, cy),
           (cx, cy - s)]
    if hollow:
        return rstroke(size, pts, width, colour, alpha)
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).polygon(pts, fill=colour + (alpha,))
    return layer


def glyph_cherry(size, cx, cy, s, colour, width, alpha=255):
    """Two berries and a stalk - the jackpot symbol."""
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    layer.alpha_composite(rstroke(layer.size,
                                  [(cx - s * 0.34, cy + s * 0.22),
                                   (cx - s * 0.1, cy - s * 0.5),
                                   (cx + s * 0.34, cy - s * 0.62)],
                                  width, colour, alpha))
    layer.alpha_composite(rstroke(layer.size,
                                  [(cx + s * 0.34, cy + s * 0.22),
                                   (cx + s * 0.22, cy - s * 0.3)],
                                  width, colour, alpha))
    r = s * 0.30
    for (bx, by) in ((cx - s * 0.34, cy + s * 0.34), (cx + s * 0.34, cy + s * 0.34)):
        ImageDraw.Draw(layer).ellipse([bx - r, by - r, bx + r, by + r],
                                      fill=colour + (alpha,))
    return layer


# --------------------------------------------------------------------------
# shared: a white outlined node with a glyph
# --------------------------------------------------------------------------
def node(size, cx, cy, r, stroke_w, accent=None, glyph=None, alpha=255,
         glow=0.0, ring_alpha=255):
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    if accent is not None:
        layer.alpha_composite(dot(size, cx, cy, r - stroke_w * 0.4, accent,
                                  alpha=int(alpha * 0.92), glow=glow,
                                  glow_colour=accent))
    else:
        layer.alpha_composite(dot(size, cx, cy, r - stroke_w * 0.4, CANVAS,
                                  alpha=alpha))
    layer.alpha_composite(stroke_ring(size, cx, cy, r - stroke_w / 2, stroke_w,
                                      WHITE, alpha=int(alpha * 0.94)))
    if glyph is not None:
        layer.alpha_composite(glyph)
    return layer


# --------------------------------------------------------------------------
# panel 1 - guided: a small process tree
# --------------------------------------------------------------------------
def art_guided(size, accent, glow_scale=1.0):
    s = size[0] / 900.0
    P = lambda x, y: (x * s, y * s)
    blue, green = BLUE, GREEN
    art = Image.new("RGBA", size, (0, 0, 0, 0))

    root = P(172, 300)
    stepL = P(436, 172)
    stepM = P(436, 300)
    stepR = P(436, 428)
    goal = P(660, 300)
    lw = 5.5 * s

    # connectors: root fans out, each step converges on the goal. Generated
    # geometrically so the fan is even and the runs bend rather than kink.
    def connector(a, b, ctrl1, ctrl2, samples=60):
        pts = []
        for i in range(samples + 1):
            t = i / samples
            mt = 1 - t
            x = (mt ** 3 * a[0] + 3 * mt * mt * t * ctrl1[0]
                 + 3 * mt * t * t * ctrl2[0] + t ** 3 * b[0])
            y = (mt ** 3 * a[1] + 3 * mt * mt * t * ctrl1[1]
                 + 3 * mt * t * t * ctrl2[1] + t ** 3 * b[1])
            pts.append((x, y))
        return pts

    for step in (stepL, stepM, stepR):
        art.alpha_composite(rstroke(
            size, connector(root, step, (300 * s, root[1]), (330 * s, step[1])),
            lw, WHITE, alpha=205))

    # one branch highlighted, the others stay white
    art.alpha_composite(rstroke(
        size, connector(stepL, goal, (540 * s, stepL[1]), (556 * s, goal[1])),
        lw, blue, alpha=240, glow=gl(glow_scale, 0.55), glow_colour=blue))
    for step in (stepM, stepR):
        art.alpha_composite(rstroke(
            size, connector(step, goal, (540 * s, step[1]), (556 * s, goal[1])),
            lw, WHITE, alpha=185))

    art.alpha_composite(rstroke(
        size, [(goal[0] + 52 * s, goal[1]), (782 * s, goal[1])], lw, WHITE,
        alpha=195))

    # root: the starting point
    art.alpha_composite(dot(size, root[0], root[1], 30 * s, blue, alpha=80,
                            glow=gl(glow_scale, 0.45), glow_colour=blue))
    art.alpha_composite(node(size, root[0], root[1], 26 * s, lw, accent=blue,
                             glyph=dot(size, root[0], root[1], 7 * s, WHITE)))

    # the three steps
    art.alpha_composite(node(size, stepL[0], stepL[1], 30 * s, lw,
                             glyph=glyph_question(size, stepL[0], stepL[1],
                                                  12 * s, WHITE, 3.4 * s)))
    art.alpha_composite(node(size, stepM[0], stepM[1], 30 * s, lw,
                             glyph=glyph_bars(size, stepM[0], stepM[1],
                                              14 * s, WHITE, 3.4 * s)))
    art.alpha_composite(node(size, stepR[0], stepR[1], 30 * s, lw,
                             glyph=glyph_question(size, stepR[0], stepR[1],
                                                  12 * s, WHITE, 3.4 * s)))

    # goal: the one green accent, kept tight so it reads as a solid dot
    art.alpha_composite(dot(size, goal[0], goal[1], 44 * s, green, alpha=72,
                            glow=gl(glow_scale, 0.4), glow_colour=green))
    art.alpha_composite(node(size, goal[0], goal[1], 32 * s, lw, accent=green,
                             glyph=glyph_check(size, goal[0], goal[1], 24 * s,
                                               WHITE, 5.4 * s)))
    return art


# --------------------------------------------------------------------------
# panel 2 - randomise: wheel of fortune
# --------------------------------------------------------------------------
WEDGE_COLOURS = [
    (BLUE, 0.80), (None, 0.0), (AMBER, 0.80), (None, 0.0),
    (CYAN, 0.74), (None, 0.0), (YELLOW, 0.78), (None, 0.0),
    (INDIGO, 0.78), (None, 0.0), (ORANGE, 0.78), (None, 0.0),
]


def art_randomise(size, accent, glow_scale=1.0):
    s = size[0] / 900.0
    art = Image.new("RGBA", size, (0, 0, 0, 0))
    cx, cy = WHEEL_CX * s, WHEEL_CY * s
    R = WHEEL_R * s
    lw = 6 * s
    n = len(WEDGE_COLOURS)
    seg = 360.0 / n

    # ---- wedge fills: colour, with empty gaps so the wheel still breathes
    fills = Image.new("RGBA", size, (0, 0, 0, 0))
    fd = ImageDraw.Draw(fills)
    for i, (col, a) in enumerate(WEDGE_COLOURS):
        if col is None:
            continue
        a0 = -90 + i * seg
        fd.pieslice([cx - R, cy - R, cx + R, cy + R], a0 + 1.0, a0 + seg - 1.0,
                    fill=col + (int(255 * a),))
    art.alpha_composite(fills)

    # a soft white sweep over the top so the disc does not read as flat colour
    paste_radial(art, cx, cy - R * 0.55, R * 1.15, WHITE, 0.05, pow_=1.6)

    # ---- spokes: thin white radii
    spokes = Image.new("RGBA", size, (0, 0, 0, 0))
    for i in range(n):
        a = math.radians(-90 + i * seg)
        spokes.alpha_composite(rstroke(
            size, [(cx + 58 * s * math.cos(a), cy + 58 * s * math.sin(a)),
                   (cx + (R - 6 * s) * math.cos(a), cy + (R - 6 * s) * math.sin(a))],
            2.6 * s, WHITE, alpha=95))
    art.alpha_composite(spokes)

    # ---- rim: outer + inner white rings, dots at each spoke
    art.alpha_composite(stroke_ring(size, cx, cy, R, lw, WHITE, alpha=235,
                                    glow=gl(glow_scale, 0.35), glow_colour=WHITE))
    art.alpha_composite(stroke_ring(size, cx, cy, R - 20 * s, 2.4 * s, WHITE,
                                    alpha=90))
    for i in range(n):
        a = math.radians(-90 + i * seg + seg / 2)
        rr = R - 10 * s
        art.alpha_composite(dot(size, cx + rr * math.cos(a), cy + rr * math.sin(a),
                                5.2 * s, WHITE, alpha=200))

    # ---- hub
    art.alpha_composite(stroke_ring(size, cx, cy, 56 * s, lw, WHITE, alpha=235))
    art.alpha_composite(dot(size, cx, cy, 26 * s, AMBER, alpha=235,
                            glow=gl(glow_scale, 0.65), glow_colour=AMBER))
    art.alpha_composite(stroke_ring(size, cx, cy, 26 * s, 2.6 * s, WHITE,
                                    alpha=210))

    # ---- pointer: a wedge that bites into the rim, as in the reference wheel
    tip = (cx, cy - R + 34 * s)
    art.alpha_composite(rstroke(size, [(cx - 30 * s, cy - R - 74 * s),
                                     (cx - 30 * s, cy - R - 30 * s)], lw, WHITE,
                                alpha=230))
    art.alpha_composite(rstroke(size, [(cx + 30 * s, cy - R - 74 * s),
                                     (cx + 30 * s, cy - R - 30 * s)], lw, WHITE,
                                alpha=230))
    art.alpha_composite(rstroke(size, [(cx - 30 * s, cy - R - 74 * s),
                                     (cx + 30 * s, cy - R - 74 * s)], lw, WHITE,
                                alpha=230))
    art.alpha_composite(rstroke(size, [(cx - 28 * s, cy - R - 56 * s), tip,
                                     (cx + 28 * s, cy - R - 56 * s)], lw, AMBER,
                                alpha=248, glow=gl(glow_scale, 0.75),
                                glow_colour=AMBER))

    # ---- motion: two dashed arcs sweeping the rim
    for a0, a1 in ((-96, -34), (-20, 44)):
        art.alpha_composite(stroke_ring(size, cx, cy, R + 34 * s, 3.6 * s, WHITE,
                                        alpha=120, start=a0, end=a1,
                                        dash=(26 * s, 20 * s)))
    return art


WHEEL_CX, WHEEL_CY, WHEEL_R = 430, 300, 232


# --------------------------------------------------------------------------
# panel 3 - slots: the repo's own randomiser concept, in line art
# --------------------------------------------------------------------------
def art_slots(size, accent, glow_scale=1.0):
    s = size[0] / 900.0
    art = Image.new("RGBA", size, (0, 0, 0, 0))
    lw = 6.5 * s

    # cabinet: a rounded body, drawn so the marquee can sit on top of it
    body = [246 * s, 132 * s, 690 * s, 468 * s]
    art.alpha_composite(rrect(size, body, 30 * s, lw, WHITE, alpha=235,
                              glow=gl(glow_scale, 0.28), glow_colour=WHITE))

    # marquee dome: rises from the body's top edge, capped and rounded
    dome = [286 * s, 54 * s, 650 * s, 132 * s]
    dome_layer = Image.new("RGBA", size, (0, 0, 0, 0))
    dome_layer.alpha_composite(rrect(size, [286 * s, 44 * s, 650 * s, 220 * s],
                                     52 * s, lw - 1 * s, WHITE, alpha=215))
    # cut away everything below the body's top edge so it reads as one shape
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rectangle([0, 0, size[0], 132 * s], fill=255)
    dome_layer.putalpha(ImageChops.multiply(dome_layer.getchannel("A"), mask))
    art.alpha_composite(dome_layer)
    # light strip inside the marquee
    art.alpha_composite(dot(size, 468 * s, 96 * s, 9 * s, WHITE, alpha=210))
    art.alpha_composite(rstroke(size, [(374 * s, 96 * s), (562 * s, 96 * s)],
                                2.6 * s, WHITE, alpha=80))

    # base: a plinth that steps in under the cabinet
    art.alpha_composite(rstroke(
        size, [(246 * s, 468 * s), (224 * s, 536 * s), (712 * s, 536 * s),
               (690 * s, 468 * s)], lw - 0.5 * s, WHITE, alpha=222))

    # three reel windows
    win_w, gap = 122 * s, 24 * s
    x0 = 468 * s - (win_w * 3 + gap * 2) / 2
    top, bot = 190 * s, 400 * s
    symbols = [("star", YELLOW), ("diamond", AMBER), ("cherry", ORANGE)]
    for i, (kind, col) in enumerate(symbols):
        bx0 = x0 + i * (win_w + gap)
        box = [bx0, top, bx0 + win_w, bot]
        art.alpha_composite(rrect(size, box, 18 * s, lw - 0.5 * s, WHITE,
                                  alpha=228, glow=gl(glow_scale, 0.24),
                                  glow_colour=col))
        mx, my = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
        r = 42 * s
        art.alpha_composite(dot(size, mx, my, r * 1.5, col, alpha=20,
                                glow=gl(glow_scale, 0.34), glow_colour=col))
        if kind == "star":
            art.alpha_composite(glyph_star5(size, mx, my, r * 1.0, col, alpha=250))
        elif kind == "diamond":
            art.alpha_composite(glyph_diamond(size, mx, my, r * 1.04, col,
                                              7 * s, alpha=250))
        else:
            art.alpha_composite(glyph_cherry(size, mx, my, r * 1.05, col,
                                             6.5 * s, alpha=250))

    # lever on the right: a bolt, a stalk and an amber ball
    lever_x = 748 * s
    art.alpha_composite(rstroke(size, [(690 * s, 292 * s), (lever_x, 292 * s)],
                                3 * s, WHITE, alpha=115))
    art.alpha_composite(rstroke(size, [(lever_x, 292 * s), (lever_x, 158 * s)],
                                lw, WHITE, alpha=235))
    art.alpha_composite(stroke_ring(size, lever_x, 128 * s, 28 * s, lw, WHITE,
                                    alpha=235))
    art.alpha_composite(dot(size, lever_x, 128 * s, 14 * s, AMBER, alpha=250,
                            glow=gl(glow_scale, 0.85), glow_colour=AMBER))

    # payline stubs: one on each side of the reel block, never crossing it
    art.alpha_composite(rstroke(size, [(258 * s, 300 * s), (x0 - 12 * s, 300 * s)],
                                3 * s, WHITE, alpha=105))
    right = x0 + win_w * 3 + gap * 2
    art.alpha_composite(rstroke(size, [(right + 12 * s, 300 * s),
                                     (678 * s, 300 * s)], 3 * s, WHITE, alpha=105))
    for i in range(3):
        bx0 = x0 + i * (win_w + gap)
        art.alpha_composite(stroke_ring(size, (bx0 + win_w / 2), 118 * s,
                                        win_w * 1.25, 2.2 * s, WHITE, alpha=55,
                                        start=58, end=122))
    return art


# --------------------------------------------------------------------------
# panel 4 - ai_chat: two bubbles, one "…" and one with the AI sparkle
# --------------------------------------------------------------------------
def art_ai_chat(size, accent, glow_scale=1.0):
    s = size[0] / 900.0
    art = Image.new("RGBA", size, (0, 0, 0, 0))
    lw = 6.5 * s
    indigo, blue = INDIGO, BLUE

    # bubble 1 (back, right, indigo accent): the AI reply, with a sparkle
    b1 = [392 * s, 176 * s, 766 * s, 356 * s]
    art.alpha_composite(rrect(size, b1, 46 * s, lw, WHITE, alpha=232,
                              glow=gl(glow_scale, 0.3), glow_colour=indigo))
    # its tail, bottom-right
    art.alpha_composite(rstroke(size, [(688 * s, 352 * s), (712 * s, 394 * s),
                                     (652 * s, 354 * s)], lw, WHITE, alpha=232))
    sx, sy = 508 * s, 262 * s
    art.alpha_composite(dot(size, sx, sy, 66 * s, indigo, alpha=52,
                            glow=gl(glow_scale, 0.6), glow_colour=indigo))
    art.alpha_composite(glyph_sparkle(size, sx, sy, 44 * s, indigo, alpha=252))
    art.alpha_composite(glyph_sparkle(size, 630 * s, 214 * s, 17 * s, WHITE,
                                      alpha=235))
    art.alpha_composite(glyph_sparkle(size, 700 * s, 300 * s, 11 * s, WHITE,
                                      alpha=190))

    # bubble 2 (front, left, blue accent): the person, mid-sentence.
    # Drawn with NO interior fill - a near-opaque dark fill would hide the bubble
    # behind it here, but would show up as a black block in the transparent cut-out.
    b2 = [128 * s, 268 * s, 528 * s, 464 * s]
    art.alpha_composite(rrect(size, b2, 46 * s, lw, WHITE, alpha=245,
                              glow=gl(glow_scale, 0.34), glow_colour=blue))
    # bubble 2's tail, drawn after its body so the join is hidden by the stroke
    art.alpha_composite(rstroke(size, [(210 * s, 460 * s), (186 * s, 502 * s),
                                     (258 * s, 462 * s)], lw, WHITE, alpha=245))
    art.alpha_composite(glyph_dots(size, 262 * s, 366 * s, 46 * s, WHITE,
                                   7 * s, alpha=250, n=3))
    # the two bubbles overlap: mask the front one's fill over the back outline
    return art


# --------------------------------------------------------------------------
# render
# --------------------------------------------------------------------------
def _fit(art, scale):
    if scale == 1.0:
        return art
    shrunk = art.resize((int(SW * scale), int(SH * scale)), Image.LANCZOS)
    out = Image.new("RGBA", (SW, SH), (0, 0, 0, 0))
    out.alpha_composite(shrunk, dest=(int((SW - shrunk.width) / 2),
                                      int((SH - shrunk.height) / 2)))
    return out


def make(mode, fn, out_dir, glow_scale=1.0, scale=1.0):
    """Render one panel; returns (jpg path, png path).

    `scale` pulls the drawing in slightly: at card size the image is cropped
    with object-fit: cover, so anything at the very top or bottom edge is at
    risk on a narrow window."""
    acc = PANEL_ACCENTS[mode]
    base = background(acc[0], grid=(mode != "slots"))

    art = _fit(fn((SW, SH), acc, glow_scale), scale).resize((W, H), Image.BICUBIC)

    opaque = base.convert("RGBA")
    opaque.alpha_composite(art)
    jpg = out_dir / f"{mode}.jpg"
    opaque.convert("RGB").save(jpg, quality=94, subsampling=0, optimize=True,
                               progressive=True)

    # cut-out: same art with the glow dialled back, since nothing sits behind it
    # to absorb the bloom, plus an outline so it holds an edge on light ground
    cut_art = _fit(fn((SW, SH), acc, glow_scale * GLOW_CUT), scale).resize(
        (W, H), Image.BICUBIC)
    cut = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    cut.alpha_composite(silhouette_outline(cut_art))
    cut.alpha_composite(cut_art)
    png = out_dir / f"{mode}-transparent.png"
    cut.save(png, optimize=True)
    return jpg, png


def silhouette_outline(art, width=4, blur=3, strength=0.5, colour=(6, 6, 8)):
    m = art.getchannel("A").filter(ImageFilter.MaxFilter(2 * width + 1))
    inner = art.getchannel("A").filter(
        ImageFilter.MaxFilter(2 * max(0, width - 3) + 1))
    ring = ImageChops.subtract(m, inner).filter(ImageFilter.GaussianBlur(blur))
    out = Image.new("RGBA", art.size, colour + (0,))
    out.putalpha(ring.point(lambda v: int(v * strength)))
    return out


def check_sheets(pairs, check_dir):
    cw, ch = 430, 287
    sheet = Image.new("RGB", (cw * 2 + 60, ch * 2 + 90), (16, 16, 20))
    d = ImageDraw.Draw(sheet)
    f = ImageFont.truetype(FONT_SEMI, 18)
    for i, (mode, jpg, png) in enumerate(pairs):
        col, row = i % 2, i // 2
        x, y = 20 + col * (cw + 20), 30 + row * (ch + 40)
        d.text((x, y - 22), mode, font=f, fill=(220, 220, 226))
        sheet.paste(Image.open(jpg).convert("RGB").resize((cw, ch), Image.LANCZOS),
                    (x, y))
    sheet.save(check_dir / "design-mode-icons-check.png", quality=92)

    # at real card size, on a card
    card = Image.new("RGB", (285 * 4 + 40, 300 + 20), (24, 24, 28))
    cd = ImageDraw.Draw(card)
    for i, (mode, jpg, png) in enumerate(pairs):
        cx = 20 + i * 285
        cd.rounded_rectangle([cx, 10, cx + 265, 290], radius=14,
                             fill=(0x18, 0x18, 0x1C), outline=(0x30, 0x30, 0x34))
        card.paste(Image.open(jpg).convert("RGB").resize((257, 171), Image.LANCZOS),
                   (cx + 4, 10))
        cd.text((cx + 8, 196), mode, font=f, fill=(232, 232, 238))
        cd.text((cx + 8, 226), "description line one", fill=(150, 150, 158))
        cd.text((cx + 8, 248), "description line two", fill=(150, 150, 158))
        cd.rounded_rectangle([cx + 8, 258, cx + 96, 282], radius=12,
                             fill=(0x30, 0x30, 0x34))
    card.save(check_dir / "design-mode-icons-cardsize.png", quality=95)

    # transparent cut-outs over the canvas
    ts = Image.new("RGB", (420 * 4 + 50, 300 + 30), (0x10, 0x10, 0x14))
    td = ImageDraw.Draw(ts)
    td.text((20, 8), "transparent PNGs over #101014", font=f, fill=(220, 220, 226))
    for i, (mode, jpg, png) in enumerate(pairs):
        im = Image.open(png).convert("RGBA").resize((420, 280), Image.LANCZOS)
        ts.paste(im, (20 + i * (420 + 8), 30), im)
    ts.save(check_dir / "design-mode-icons-check-transparent.png", quality=92)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--check", type=Path, default=DEFAULT_CHECK)
    ap.add_argument("--only", type=str, default=None)
    ap.add_argument("--glow", type=float, default=1.0)
    args = ap.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    args.check.mkdir(parents=True, exist_ok=True)

    items = [("guided", art_guided), ("randomise", art_randomise),
             ("slots", art_slots), ("ai_chat", art_ai_chat)]
    if args.only:
        items = [i for i in items if i[0] == args.only]

    pairs = []
    for mode, fn in items:
        jpg, png = make(mode, fn, args.out, args.glow,
                        scale=SLOT_FIT.get(mode, 1.0))
        pairs.append((mode, jpg, png))
        print(f"{mode}: {jpg.name} {jpg.stat().st_size // 1024} KB | "
              f"{png.name} {png.stat().st_size // 1024} KB")
    check_sheets(pairs, args.check)
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
