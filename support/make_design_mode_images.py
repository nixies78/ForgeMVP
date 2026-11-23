"""Generate the three home-screen "how do you want to design your game?" panels.

Spec source: UEFNGameGuide, images/design_modes/README.md
  * 900 x 600 (3:2), JPG (PNG fine)
  * consistent framing / colour temperature / busyness across the three
  * keep detail + text inside the middle ~90% (cover-crop safety)
  * dark, low-glare, fading to dark at the bottom to blend with the #1f232c card

Outputs:
  guided.jpg  randomise.jpg  ai_chat.jpg                  <- shared background
  guided-transparent.png  randomise-transparent.png
  ai_chat-transparent.png                                 <- same art, alpha only

Everything is drawn with Pillow at 2x and downsampled (anti-aliasing), from a
single fixed seed, so re-running reproduces byte-stable artwork.

Usage:
    python support/make_design_mode_images.py [--out DIR] [--check DIR]

The three panels share one background recipe (same ramp, pool centre, vignette,
lattice and grain); only the accent hue differs. This is what keeps them reading
as a set, so change background() rather than an individual panel.
"""
from __future__ import annotations

import argparse
import math
import random
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

# --------------------------------------------------------------------------
# scene constants - one shared recipe, so all three panels are a set
# --------------------------------------------------------------------------
W, H = 900, 600
S = 2                      # supersample factor
SW, SH = W * S, H * S

REPO = Path(__file__).resolve().parent.parent
DEFAULT_OUT = REPO / "support" / "design-mode-art"
DEFAULT_CHECK = REPO / "support"

SEED = 20260820
GRAIN_SIGMA = 3.0          # fixed grain level for all three

BG_TOP = (26, 31, 42)
BG_BOTTOM = (12, 15, 20)
POOL_CENTER = (0.42, 0.45)  # shared focal point for all three
VIGNETTE_POW = 1.35
ACCENT_VEIL = 0.085         # tiny per-accent colour shift over the shared base
GLOW_CUT = 0.55             # glow scale for the backdrop-free variants

ACCENTS = {
    "guided": (79, 216, 216),
    "randomise": (244, 172, 66),
    "ai_chat": (150, 169, 255),
}

FONT_DIR = Path(r"C:\Windows\Fonts")
FONT_UI = FONT_DIR / "segoeui.ttf"
FONT_SEMI = FONT_DIR / "seguisb.ttf"
FONT_BOLD = FONT_DIR / "segoeuib.ttf"

CHIP = (0.085, 0.102, 0.135)      # glass chip fill
CHIP_EDGE = (0.24, 0.28, 0.35)    # glass chip border
TEXT_HI = (238, 243, 250)
TEXT_LO = (196, 206, 220)


def mix(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


# --------------------------------------------------------------------------
# masks & primitives
# --------------------------------------------------------------------------
def radial_mask(cx, cy, rmax, pow_=1.0, src=None):
    """Round radial ramp: 255 at the centre -> 0 at `rmax`. Built small then
    upscaled so the ramp is smooth without per-pixel Python over the canvas.

    `src` is chosen from the radius so big glows are not ring-banded."""
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
    m = g.resize((r, r), Image.BICUBIC)
    return m, (int(cx - rmax), int(cy - rmax), int(cx + rmax), int(cy + rmax))


def paste_radial(base, cx, cy, rmax, colour, opacity, pow_=1.0):
    """Composite a smooth radial glow onto `base` (its own alpha is untouched)."""
    m, box = radial_mask(cx, cy, rmax, pow_)
    m = m.point(lambda v: int(v * opacity))
    w, h = base.size
    x0, y0, x1, y1 = box
    # clip the glow to the canvas
    cx0, cy0 = max(0, x0), max(0, y0)
    cx1, cy1 = min(w, x1), min(h, y1)
    if cx1 <= cx0 or cy1 <= cy0:
        return
    m = m.crop((cx0 - x0, cy0 - y0, cx1 - x0, cy1 - y0))
    layer = Image.new("RGBA", (cx1 - cx0, cy1 - cy0), colour + (0,))
    layer.putalpha(m)
    base.alpha_composite(layer, dest=(cx0, cy0))


def trace_layer(size, pt_list, widths, colour, glow_colour, glow_blur,
                glow_alpha, knot_mode="bend", knots=None, len_px=46, widen=10,
                core_max=0.62):
    """A rounded-circuit path: line + optional soft glow, returned as RGBA.

    The glow is built from a dilated, blurred copy of the line mask so corners
    stay smooth (blurring the line itself would fade its own length too), and
    its core is capped below full opacity so it stays a halo behind the line
    instead of becoming a solid slab of accent colour."""
    ss = 2
    big = (size[0] // ss, size[1] // ss)

    def scaled(pts):
        return [(p[0] / ss, p[1] / ss) for p in pts]

    line = Image.new("L", big, 0)
    ImageDraw.Draw(line).line(scaled(pt_list), fill=255,
                              width=max(1, round(widths[0] / ss)),
                              joint="curve")

    glow = Image.new("L", big, 0)
    gd = ImageDraw.Draw(glow)
    if knot_mode == "bend" and knots:
        for cx, cy in knots:
            r = len_px / 2 + widen / 2
            gd.ellipse([(cx - r) / ss, (cy - r) / ss, (cx + r) / ss, (cy + r) / ss],
                       fill=255)
    else:
        for x, y in scaled(pt_list):
            rr = (max(widths) / 2 + (len_px if knot_mode == "dilate" else 0)) / ss
            gd.ellipse([x - rr, y - rr, x + rr, y + rr], fill=255)
    glow = ImageChops.lighter(
        ImageChops.lighter(glow, line).filter(ImageFilter.GaussianBlur(glow_blur / ss)),
        line.filter(ImageFilter.GaussianBlur((glow_blur * 1.9) / ss)).point(
            lambda v: int(v * 0.55)))
    line_big = line.resize(size, Image.LANCZOS)
    glow_big = glow.resize(size, Image.LANCZOS)
    out = Image.new("RGBA", size, colour + (0,))
    out.putalpha(line_big)
    g = Image.new("RGBA", size, glow_colour + (0,))
    g.putalpha(glow_big.point(lambda v: min(int(v * glow_alpha),
                                             int(255 * core_max))))
    g.alpha_composite(out)
    return g


def round_cap(draw, p1, p2, width, fill):
    draw.line([p1, p2], fill=fill, width=int(width))
    r = width / 2
    for (x, y) in (p1, p2):
        draw.ellipse([x - r, y - r, x + r, y + r], fill=fill)


def silhouette_outline(art, width=5, blur=3, strength=0.55, colour=(6, 8, 12)):
    """A soft dark outline hugging the artwork's silhouette.

    Needed for the transparent PNGs: without it a bright shape on a light
    backdrop has no edge, and soft drop shadows would bloom into dark blobs
    outside the artwork. Only the silhouette is outlined, never the interior."""
    m = art.getchannel("A").filter(ImageFilter.MaxFilter(2 * width + 1))
    interior = art.getchannel("A").filter(
        ImageFilter.MaxFilter(2 * max(0, width - 4) + 1))
    ring = ImageChops.subtract(m, interior).filter(ImageFilter.GaussianBlur(blur))
    out = Image.new("RGBA", art.size, colour + (0,))
    out.putalpha(ring.point(lambda v: int(v * strength)))
    return out


def draw_chip(size, x, y, text, font, accent=None, dot=False,
              radius=22, pad=26):
    """Small glass label chip - shared across all three panels.

    Fully opaque on purpose: a translucent chip fill leaves a dark ring around
    itself in the transparent cut-outs."""
    tmp = ImageDraw.Draw(Image.new("RGBA", (8, 8)))
    tb = tmp.textbbox((0, 0), text, font=font)
    tw, th = tb[2] - tb[0], tb[3] - tb[1]
    dot_w = 26 if dot else 0
    w = tw + pad * 2 + dot_w
    h = th + 22
    box = (x - w / 2, y - h / 2, x + w / 2, y + h / 2)

    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle(box, radius=radius,
                        fill=tuple(int(c * 255) for c in CHIP) + (255,),
                        outline=tuple(int(c * 255) for c in CHIP_EDGE) + (235,),
                        width=max(1, int(1.4 * S)))
    tx = box[0] + pad
    if dot and accent:
        cy = (box[1] + box[3]) / 2
        r = 6 * S
        d.ellipse([tx - r, cy - r, tx + r, cy + r], fill=accent + (255,))
        paste_radial(layer, tx, cy, 26 * S, accent, 0.55, pow_=1.6)
        tx += dot_w
    d.text((tx, (box[1] + box[3]) / 2), text, font=font, fill=TEXT_HI + (255,),
           anchor="lm")
    return layer, box


def vertical_fade(size, top=0.98, bottom=0.34, start=0.68, end=1.02):
    """Shared bottom fade so every image dissolves into the dark card."""
    g = Image.new("L", (1, size[1]), 0)
    px = g.load()
    for y in range(size[1]):
        t = (y / size[1] - start) / (end - start)
        t = min(1.0, max(0.0, t))
        t = t * t * (3 - 2 * t)
        px[0, y] = int(255 * (top + (bottom - top) * t))
    return g.resize(size, Image.BILINEAR)


def gl(glow_scale, value):
    """Scale a glow opacity for the transparent pass - a glow tuned against the
    dark backdrop is too heavy once the backdrop is gone."""
    return value * glow_scale


# --------------------------------------------------------------------------
# shared background
# --------------------------------------------------------------------------
def background(accent):
    # 1. base: linear vertical ramp, upsampled from a few rows
    ramp = Image.new("RGB", (1, 64))
    rp = ramp.load()
    for y in range(64):
        rp[0, y] = mix(BG_TOP, BG_BOTTOM, y / 63)
    base = ramp.resize((SW, SH), Image.BICUBIC).convert("RGBA")

    # 2. faint dot lattice (the shared "studio texture")
    lattice = Image.new("RGBA", (SW, SH), (0, 0, 0, 0))
    ld = ImageDraw.Draw(lattice)
    r = 1.6 * S
    for gy in range(0, SH + 40, 40 * S):
        for gx in range(0, SW + 40, 40 * S):
            ld.ellipse([gx - r, gy - r, gx + r, gy + r], fill=(255, 255, 255, 12))
    base.alpha_composite(lattice)

    # 3. accent veil: identical geometry, only the hue differs per panel
    veil = Image.new("RGBA", (SW, SH), accent + (0,))
    veil.putalpha(int(255 * ACCENT_VEIL))
    base.alpha_composite(veil)

    # 4. shared focal pool behind the artwork
    paste_radial(base, POOL_CENTER[0] * SW, POOL_CENTER[1] * SH, 0.46 * SW,
                 accent, 0.15, pow_=1.5)
    paste_radial(base, POOL_CENTER[0] * SW, POOL_CENTER[1] * SH, 0.28 * SW,
                 (255, 255, 255), 0.05, pow_=1.6)

    # 5. vignette from the very same pool centre
    m, box = radial_mask(POOL_CENTER[0] * SW, POOL_CENTER[1] * SH,
                         0.72 * SW, VIGNETTE_POW)
    x0, y0 = max(0, box[0]), max(0, box[1])
    m = m.crop((x0 - box[0], y0 - box[1], x0 - box[0] + SW, y0 - box[1] + SH))
    dark = Image.new("RGBA", base.size, (0, 0, 0, 0))
    dark.putalpha(ImageChops.invert(m).point(lambda v: int(v * 0.50)))
    base.alpha_composite(dark, dest=(x0, y0))

    # 6. fixed grain
    rnd = random.Random(SEED)
    noise = Image.new("L", (SW, SH))
    noise.putdata([128 + int(rnd.gauss(0, GRAIN_SIGMA)) for _ in range(SW * SH)])
    grain = Image.new("RGBA", base.size, (255, 255, 255, 0))
    grain.putalpha(ImageChops.difference(
        noise, Image.new("L", noise.size, 128)).point(lambda v: int(v * 0.55)))
    base.alpha_composite(grain)

    # 7. final downsample: same filter for all three
    return base.convert("RGB").resize((W, H), Image.LANCZOS)


# --------------------------------------------------------------------------
# panel 1 - guided  (an orderly branching path)
# --------------------------------------------------------------------------
def art_guided(size, accent, glow_scale=1.0):
    s = size[0] / 900.0
    P = lambda x, y: (x * s, y * s)
    art = Image.new("RGBA", size, (0, 0, 0, 0))
    glow_c = (90, 240, 235)

    main_w = 13 * s
    trunk = [P(450, 556), P(450, 150)]
    art.alpha_composite(trace_layer(size, trunk, [main_w], (206, 246, 246),
                                    glow_c, 16 * s, gl(glow_scale, 0.95),
                                    core_max=0.34))
    bus_r = 12 * s

    branches = {
        "left": [P(450, 468), P(392, 468), P(352, 428), P(352, 352)],
        "mid": [P(450, 420), P(450, 352)],
        "right": [P(450, 300), P(512, 300), P(552, 260), P(552, 190)],
    }
    for pts in branches.values():
        art.alpha_composite(trace_layer(size, pts, [bus_r] * 2, (194, 240, 242),
                                        glow_c, 13 * s, gl(glow_scale, 0.85),
                                        core_max=0.30))

    # top bus heading out to the right
    top = [P(450, 150), P(556, 150)]
    art.alpha_composite(trace_layer(size, top, [main_w], (206, 246, 246),
                                    glow_c, 15 * s, gl(glow_scale, 0.9),
                                    core_max=0.32))
    for x, y in (P(450, 150), P(556, 150)):
        paste_radial(art, x, y, 40 * s, accent, gl(glow_scale, 0.5), pow_=1.6)

    # nodes
    nodes = [
        (P(450, 468), 15), (P(392, 468), 9), (P(450, 420), 9),
        (P(450, 300), 9), (P(512, 300), 9), (P(450, 150), 12),
        (P(352, 352), 15), (P(450, 352), 15), (P(552, 190), 15),
        (P(450, 556), 13), (P(556, 150), 9),
    ]
    nd = ImageDraw.Draw(art)
    for (x, y), r in nodes:
        r = r * s
        nd.ellipse([x - r * 2.1, y - r * 2.1, x + r * 2.1, y + r * 2.1],
                   fill=(255, 255, 255, 26))
        nd.ellipse([x - r, y - r, x + r, y + r], fill=(246, 252, 255, 255))

    # milestone halos
    for (x, y) in (P(352, 352), P(450, 352), P(552, 190)):
        paste_radial(art, x, y, 34 * s, accent, gl(glow_scale, 0.40), pow_=1.9)

    f_lbl = ImageFont.truetype(FONT_SEMI, int(24 * s))
    chips = [
        (234, 352, "SCENE", f_lbl),     # just right of the left branch node
        (712, 190, "POLISH", f_lbl),    # just right of the right branch node
        (668, 410, "GAMEPLAY", f_lbl),  # clear of the trunk, below the hub
        (256, 556, "IDEAS", f_lbl),     # lower left, on the faded band
    ]
    for cx, cy, text, font in chips:
        chip, _ = draw_chip(size, cx * s, cy * s, text, font, accent=accent,
                            dot=(text == "GAMEPLAY"))
        art.alpha_composite(chip)

    # "?" badge above the start node
    bx, by = P(450, 556)
    r = 17 * s
    nd.ellipse([bx - r, by - r, bx + r, by + r], fill=(11, 15, 21, 235),
               outline=(150, 200, 205, 235), width=int(2 * s))
    f_q = ImageFont.truetype(FONT_BOLD, int(22 * s))
    nd.text((bx, by), "?", font=f_q, fill=(226, 246, 248, 255), anchor="mm")
    return art


# --------------------------------------------------------------------------
# panel 2 - randomise  (the wheel itself)
# --------------------------------------------------------------------------
WHEEL_C = (420, 300)
WHEEL_R = 256
SEG_COLOURS = [
    (232, 88, 92), (241, 126, 74), (246, 168, 62), (240, 208, 74),
    (162, 214, 88), (76, 200, 140), (56, 196, 194), (70, 158, 226),
    (96, 122, 226), (140, 106, 220), (190, 100, 200), (224, 88, 152),
]


def art_randomise(size, accent, glow_scale=1.0):
    s = size[0] / 900.0
    art = Image.new("RGBA", size, (0, 0, 0, 0))
    c = (WHEEL_C[0] * s, WHEEL_C[1] * s)
    R = WHEEL_R * s

    # ---- motion blur: blurred wedges scaled up about the hub
    mb_scale = 1.07
    mb_src = Image.new("RGBA", (size[0] // 2, size[1] // 2), (0, 0, 0, 0))
    md = ImageDraw.Draw(mb_src)
    half_c = (c[0] / 2, c[1] / 2)
    half_R = R / 2
    for i, col in enumerate(SEG_COLOURS):
        a0 = i * 30.0 - 90.0
        md.pieslice([half_c[0] - half_R, half_c[1] - half_R,
                     half_c[0] + half_R, half_c[1] + half_R],
                    a0, a0 + 30.0, fill=col + (170,))
    mb_src = mb_src.filter(ImageFilter.GaussianBlur(16 * s / 2))
    big = (int(mb_src.width * mb_scale * 2), int(mb_src.height * mb_scale * 2))
    mb_up = mb_src.resize(big, Image.BICUBIC)
    # keep it centred on the hub as it grows, then clip back to the canvas
    off = (int(half_c[0] * 2 - c[0] * mb_scale), int(half_c[1] * 2 - c[1] * mb_scale))
    mb = Image.new("RGBA", size, (0, 0, 0, 0))
    mb.alpha_composite(mb_up.convert("RGBA"), dest=off)
    mb.putalpha(mb.getchannel("A").point(lambda v: int(v * 0.24)))
    art.alpha_composite(mb)

    # ---- orbit rings (two arcs, broken so they read as rotation not decoration)
    rings = Image.new("RGBA", size, (0, 0, 0, 0))
    for r_frac, w_px, a0, a1, alpha in ((1.30, 1.6, 200, 330, 120),
                                        (1.42, 1.4, 20, 150, 100)):
        steps = 200
        rr = R * r_frac
        pts = [(c[0] + rr * math.cos(math.radians(a0 + (a1 - a0) * i / steps)),
                c[1] + rr * math.sin(math.radians(a0 + (a1 - a0) * i / steps)))
               for i in range(steps + 1)]
        rings.alpha_composite(trace_layer(size, pts, [w_px * s], (234, 240, 250),
                                          accent, 4 * s,
                                          gl(glow_scale, alpha / 255.0 * 0.5)))
    art.alpha_composite(rings)
    # orbiting spark: breaks the symmetry, tells you it is moving
    ang = math.radians(24)
    sx, sy = c[0] + R * 1.42 * math.cos(ang), c[1] + R * 1.42 * math.sin(ang)
    sd = ImageDraw.Draw(art)
    rr = 8 * s
    sd.ellipse([sx - rr, sy - rr, sx + rr, sy + rr], fill=(255, 248, 228, 255))
    paste_radial(art, sx, sy, 34 * s, accent, gl(glow_scale, 0.45), pow_=1.8)

    # ---- the wheel
    wheel = Image.new("RGBA", size, (0, 0, 0, 0))
    wd = ImageDraw.Draw(wheel)
    seg_hi = []
    gap = 1.4
    for i, col in enumerate(SEG_COLOURS):
        a0 = i * 30.0 - 90.0
        wd.pieslice([c[0] - R, c[1] - R, c[0] + R, c[1] + R],
                    a0 + gap, a0 + 30.0 - gap, fill=col + (255,))
        seg_hi.append((math.radians(a0 + 15.0), col))
    # inner shading for depth
    shade = Image.new("RGBA", size, (0, 0, 0, 0))
    shd = ImageDraw.Draw(shade)
    shd.ellipse([c[0] - R, c[1] - R, c[0] + R, c[1] + R], fill=(0, 0, 0, 70))
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).ellipse([c[0] - R * 1.02, c[1] - R * 1.02,
                               c[0] + R * 1.02, c[1] + R * 1.02], fill=255)
    inv = m.filter(ImageFilter.GaussianBlur(60 * s))
    shade.putalpha(ImageChops.multiply(shade.getchannel("A"), inv))
    wheel.alpha_composite(shade)
    # soft top light
    paste_radial(wheel, c[0], c[1] - R * 0.45, R * 0.95, (255, 255, 255),
                 0.16, pow_=1.5)

    # rim
    wd.ellipse([c[0] - R - 7 * s, c[1] - R - 7 * s,
                c[0] + R + 7 * s, c[1] + R + 7 * s],
               outline=(18, 22, 30, 235), width=int(15 * s))
    wd.ellipse([c[0] - R - 1 * s, c[1] - R - 1 * s,
                c[0] + R + 1 * s, c[1] + R + 1 * s],
               outline=(255, 255, 255, 235), width=int(3 * s))

    # spokes
    for i in range(12):
        a = math.radians(i * 30.0 - 90.0 + 15.0)
        p1 = (c[0] + 34 * s * math.cos(a), c[1] + 34 * s * math.sin(a))
        p2 = (c[0] + (R - 10 * s) * math.cos(a), c[1] + (R - 10 * s) * math.sin(a))
        wd.line([p1, p2], fill=(255, 255, 255, 46), width=int(2 * s))

    # ---- labels on pale wedges (dark ink) so they are readable small
    f_seg = ImageFont.truetype(FONT_BOLD, int(21 * s))
    labels = ["PACE", "SCOPE", "TONE", "CAST", "MOOD", "RISK",
              "STAKES", "SIZE", "STYLE", "THEME", "GOAL", "TWIST"]
    for i, (a, col) in enumerate(seg_hi):
        lum = 0.299 * col[0] + 0.587 * col[1] + 0.114 * col[2]
        ink = (26, 24, 20, 255) if lum > 168 else (255, 255, 255, 255)
        rr = R * 0.73
        tx, ty = c[0] + rr * math.cos(a), c[1] + rr * math.sin(a)
        tw, th = int(200 * s), int(46 * s)
        tile = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
        td = ImageDraw.Draw(tile)
        td.text((tw / 2, th / 2), labels[i], font=f_seg, fill=ink, anchor="mm")
        rot = tile.rotate(-math.degrees(a), resample=Image.BICUBIC, expand=True,
                          center=(tw / 2, th / 2))
        wheel.alpha_composite(rot, dest=(int(tx - rot.width / 2),
                                         int(ty - rot.height / 2)))

    # ---- hub
    hub = 62 * s
    wd.ellipse([c[0] - hub, c[1] - hub, c[0] + hub, c[1] + hub],
               fill=(22, 26, 34, 245), outline=accent + (235,), width=int(4 * s))
    wd.ellipse([c[0] - hub * 0.42, c[1] - hub * 0.42,
                c[0] + hub * 0.42, c[1] + hub * 0.42], fill=accent + (255,))
    paste_radial(wheel, c[0], c[1], hub * 2.4, accent, gl(glow_scale, 0.55),
                 pow_=1.5)

    # ---- pointer
    tip = (c[0], c[1] - R + 4 * s)
    wd.polygon([tip, (c[0] - 30 * s, c[1] - R - 46 * s),
                (c[0] + 30 * s, c[1] - R - 46 * s)], fill=(250, 252, 255, 255))
    wd.polygon([(tip[0], tip[1] - 10 * s),
                (c[0] - 20 * s, c[1] - R - 40 * s),
                (c[0] + 20 * s, c[1] - R - 40 * s)], fill=accent + (255,))
    paste_radial(wheel, c[0], c[1] - R - 20 * s, 90 * s, accent,
                 gl(glow_scale, 0.5), pow_=1.6)

    art.alpha_composite(silhouette_outline(wheel, width=9, blur=4, strength=0.6))
    art.alpha_composite(wheel)

    # ---- chips
    f_lbl = ImageFont.truetype(FONT_SEMI, int(24 * s))
    f_big = ImageFont.truetype(FONT_BOLD, int(30 * s))
    for cx, cy, text, font, dot in ((790, 452, "12 PICKS", f_lbl, True),
                                    (790, 506, "SPIN", f_big, False)):
        chip, _ = draw_chip(size, cx * s, cy * s, text, font, accent=accent, dot=dot)
        art.alpha_composite(chip)
    return art


# --------------------------------------------------------------------------
# panel 3 - chat with AI
# --------------------------------------------------------------------------
def art_ai_chat(size, accent, glow_scale=1.0):
    s = size[0] / 900.0
    art = Image.new("RGBA", size, (0, 0, 0, 0))
    warm = (252, 176, 104)

    # ---- panel: lifted well clear of the shared dark base so it reads at 257px
    px0, py0, px1, py1 = 96, 62, 804, 560
    box = [px0 * s, py0 * s, px1 * s, py1 * s]

    # glow sits behind the panel, tight enough that it never becomes a visible
    # disc inside the transparent cut-out
    paste_radial(art, 450 * s, 400 * s, 480 * s, accent,
                 gl(glow_scale, 0.10), pow_=2.2)

    panel = Image.new("RGBA", size, (0, 0, 0, 0))
    pd = ImageDraw.Draw(panel)
    pd.rounded_rectangle(box, radius=44 * s, fill=(41, 48, 63, 246),
                         outline=(126, 138, 164, 220), width=int(2 * s))
    # glass sheen across the top third
    sheen = Image.new("RGBA", size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(sheen)
    sd.rounded_rectangle(box, radius=44 * s, fill=(255, 255, 255, 22))
    grad = Image.new("L", (1, size[1]), 0)
    gp = grad.load()
    for y in range(size[1]):
        t = min(1.0, max(0.0, (y - box[1]) / (box[3] - box[1])))
        gp[0, y] = int(255 * max(0.0, 1.0 - t * 2.1))
    sheen.putalpha(ImageChops.multiply(sheen.getchannel("A"),
                                       grad.resize(size, Image.BILINEAR)))
    panel.alpha_composite(sheen)

    # title bar + status dots + a "new chat" pill on the right
    pd.line([box[0] + 26 * s, box[1] + 66 * s, box[2] - 26 * s, box[1] + 66 * s],
            fill=(255, 255, 255, 34), width=int(2 * s))
    for i, col in enumerate(((236, 108, 100), (240, 190, 96), (110, 208, 140))):
        cx, cy = box[0] + (46 + i * 34) * s, box[1] + 34 * s
        r = 10 * s
        pd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col + (245,))
    pd.rounded_rectangle([box[2] - 210 * s, box[1] + 20 * s, box[2] - 44 * s,
                          box[1] + 50 * s], radius=15 * s, fill=(255, 255, 255, 30))

    f_role = ImageFont.truetype(FONT_SEMI, int(20 * s))
    td = ImageDraw.Draw(panel)
    td.text((230 * s, box[1] + 34 * s), "DESIGN ASSISTANT", font=f_role,
            fill=(206, 214, 230, 235), anchor="lm")

    art.alpha_composite(silhouette_outline(panel, width=10, blur=5, strength=0.5))
    art.alpha_composite(panel)

    # ---- bubbles
    def bubble(bb, fill, outline, tail, radius=30, shadow=True):
        layer = Image.new("RGBA", size, (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        d.rounded_rectangle(bb, radius=radius * s, fill=fill, outline=outline,
                            width=int(2 * s))
        tipy = (bb[1] + bb[3]) / 2
        if tail == "left":
            d.polygon([(bb[0] + 2 * s, tipy - 15 * s), (bb[0] - 22 * s, tipy + 5 * s),
                       (bb[0] + 2 * s, tipy + 15 * s)], fill=fill)
        else:
            d.polygon([(bb[2] - 2 * s, tipy - 15 * s), (bb[2] + 22 * s, tipy + 5 * s),
                       (bb[2] - 2 * s, tipy + 15 * s)], fill=fill)
        if shadow:
            art.alpha_composite(silhouette_outline(layer, width=5, blur=3,
                                                   strength=0.40))
        art.alpha_composite(layer)
        return layer

    def lines_block(layer, x, ys, widths, colour, thickness=21):
        d = ImageDraw.Draw(layer)
        for y, w in zip(ys, widths):
            round_cap(d, (x, y), (x + w, y), thickness * s, colour + (255,))

    # assistant bubble (light, so it is unmistakable against the panel)
    bubble([132 * s, 160 * s, 566 * s, 330 * s], (238, 241, 248, 255),
           (255, 255, 255, 255), "left")
    a1 = Image.new("RGBA", size, (0, 0, 0, 0))
    lines_block(a1, 172 * s, [202 * s, 240 * s, 278 * s],
                [318, 352, 250], (86, 96, 116))
    art.alpha_composite(a1)
    # highlighted pick on the second line
    d = ImageDraw.Draw(art)
    r = 10 * s
    hx = 172 * s + 352 * s + 26 * s
    d.ellipse([hx - r, 240 * s - r, hx + r, 240 * s + r], fill=warm + (255,))
    paste_radial(art, hx, 240 * s, 46 * s, warm, gl(glow_scale, 0.5), pow_=1.7)

    # user bubble (accent fill, dark ink)
    ub = [368 * s, 356 * s, 768 * s, 464 * s]
    bubble(ub, accent + (255,), mix(accent, (255, 255, 255), 0.45) + (255,), "right")
    u1 = Image.new("RGBA", size, (0, 0, 0, 0))
    lines_block(u1, 404 * s, [394 * s, 428 * s], [248, 176],
                mix(accent, (10, 14, 22), 0.82))
    art.alpha_composite(u1)

    # assistant reply, still arriving: three dots. Kept fairly dark - at card
    # size a mid-tone dot loses the contrast that makes them read as "typing".
    bubble([132 * s, 482 * s, 470 * s, 546 * s], (238, 241, 248, 255),
           (255, 255, 255, 255), "left", radius=26)
    d = ImageDraw.Draw(art)
    for i in range(3):
        cx, cy = (170 + i * 36) * s, 514 * s
        r = 11 * s
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(70, 78, 96, 255))

    # ---- action chip, inside the frame, clear of the bottom fade
    f_lbl = ImageFont.truetype(FONT_SEMI, int(24 * s))
    chip, _ = draw_chip(size, 706 * s, 514 * s, "SEND", f_lbl, accent=accent,
                        dot=True)
    art.alpha_composite(chip)
    return art


# --------------------------------------------------------------------------
# render
# --------------------------------------------------------------------------
def render_one(mode, art_fn, accent, out_dir):
    base = background(accent)
    fade = vertical_fade((W, H))

    def finish(art):
        # BICUBIC (not LANCZOS) for alpha-bearing art: LANCZOS overshoots where
        # opaque pixels meet transparent ones and leaves a coloured fringe.
        art = art.resize((W, H), Image.BICUBIC)
        art.putalpha(ImageChops.multiply(art.getchannel("A"), fade))
        return art

    art = finish(art_fn((SW, SH), accent, 1.0))
    opaque = base.convert("RGBA")
    opaque.alpha_composite(art)
    jpg = out_dir / f"{mode}.jpg"
    opaque.convert("RGB").save(jpg, quality=94, subsampling=0, optimize=True,
                               progressive=True)

    # transparent cut-out: same art re-rendered with a lighter glow (nothing
    # behind it to absorb the bloom) plus a silhouette outline so it holds its
    # edge on a light backdrop
    cut_art = finish(art_fn((SW, SH), accent, GLOW_CUT))
    cut = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    cut.alpha_composite(silhouette_outline(cut_art))
    cut.alpha_composite(cut_art)
    png = out_dir / f"{mode}-transparent.png"
    cut.save(png, optimize=True)

    return jpg, png, art


def contact_sheet(items, check_dir):
    """QA sheets: the set as a JPG row, the cut-outs over the card colour, and
    the set at the real 257x171 card size."""
    cw, ch = 460, 307
    sheet = Image.new("RGB", (cw * 3 + 40, ch * 2 + 190), (16, 19, 25))
    d = ImageDraw.Draw(sheet)
    for row, (label, a, b) in enumerate(items):
        y = 20 + row * (ch + 30)
        for i, im in enumerate((a, b)):
            x = 20 + i * (cw + 10)
            sheet.paste(im.resize((cw, ch), Image.LANCZOS), (x, y))
        d.text((20, y - 22), label, fill=(220, 226, 236))

    # real display size, matching the 3-column card layout
    ty = 20 + 2 * (ch + 30)
    d.text((20, ty - 22),
           "actual card size: 257x171 images on 285x300 cards, #1f232c",
           fill=(220, 226, 236))
    card = Image.new("RGB", (285 * 3 + 40, 300 + 20), (24, 27, 34))
    cd = ImageDraw.Draw(card)
    for i, (label, a, b) in enumerate(items):
        cx = 20 + i * 285
        cd.rounded_rectangle([cx, 10, cx + 265, 290], radius=14,
                             fill=(31, 35, 44), outline=(52, 58, 70))
        card.paste(a.resize((257, 171), Image.LANCZOS), (cx + 4, 10))
        cd.text((cx + 8, 196), label, fill=(232, 237, 244))
        cd.text((cx + 8, 226), "description line one", fill=(150, 160, 176))
        cd.text((cx + 8, 248), "description line two", fill=(150, 160, 176))
        cd.rounded_rectangle([cx + 8, 258, cx + 96, 282], radius=12,
                             fill=(64, 74, 96))
    sheet.paste(card, (20, ty))
    sheet.save(check_dir / "design-mode-art-check.png", quality=92)
    card.save(check_dir / "design-mode-art-cardsize.png", quality=95)

    # transparent set, checked over the card colour it would sit on
    ts = Image.new("RGB", (420 * 3 + 40, 300 + 30), (31, 35, 44))
    td = ImageDraw.Draw(ts)
    td.text((20, 8), "transparent PNGs over card panel #1f232c",
            fill=(220, 226, 236))
    for i, (label, a, b) in enumerate(items):
        ts.paste(b.resize((420, 280), Image.LANCZOS), (20 + i * (420 + 10), 30))
    ts.save(check_dir / "design-mode-art-check-transparent.png", quality=92)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT,
                    help="where to write the six images")
    ap.add_argument("--check", type=Path, default=DEFAULT_CHECK,
                    help="where to write the QA contact sheets")
    args = ap.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    args.check.mkdir(parents=True, exist_ok=True)

    pair = {}
    for mode, fn in (("guided", art_guided), ("randomise", art_randomise),
                     ("ai_chat", art_ai_chat)):
        jpg, png, _ = render_one(mode, fn, ACCENTS[mode], args.out)
        pair[mode] = (Image.open(jpg).convert("RGB"),
                      Image.open(png).convert("RGBA"))
        print(f"{mode}: {jpg.name} {jpg.stat().st_size // 1024} KB | "
              f"{png.name} {png.stat().st_size // 1024} KB")

    items = [(m,) + pair[m] for m in ("guided", "randomise", "ai_chat")]
    contact_sheet(items, args.check)
    print(f"wrote {args.out}")
    print(f"checks: {args.check / 'design-mode-art-check.png'}")


if __name__ == "__main__":
    main()
