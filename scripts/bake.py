"""Bakes each character's talking face out of the original game files into plugin/hooks/data/faces.generated.ts.

    python3 scripts/bake.py --player ~/Projects/godot-director-player [--work /tmp/gb-casts]

`--player` is a checkout of godot-director-player with the games under games/<title>/: its
tools/director_extract.gd decodes the Director casts. scripts/faces.json names, per character, the
container, the resting face and its talk frames: whole faces with another mouth (`talk`), mouth
patches laid over the face where they match it best (`patches`), or, for a face the game assembles from
parts in its score, a bare `face` with fixed `layers` (eyes; `"ink": 36` makes all of a layer's white clear), a `rest` mouth and talk `mouths`, each at the
offset the score puts it (sprite position minus registration point), then an optional `crop` box. A duo is one
`pair` of two such specs, drawn side by side, one of them talking at a time.

Each character comes out twice: `big`, the game's own pixels for surfaces that draw SVG, and `small`,
SMALL_H pixels tall for the terminal's half-block cells. Talk frames keep only the box where they differ
from the resting face. Needs Pillow and numpy.
"""
import argparse, base64, json, os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'plugin', 'hooks', 'data', 'faces.generated.ts')
SMALL_H = 36
# A face drawn bigger than this (a whole close-up scene) is scaled down for the app too.
BIG_MAX_H = 160
OUTLINE = (24, 16, 24)


def extract(player, work, game, file):
    out = os.path.join(work, game, file.replace('/', '_'))
    if not os.path.isdir(os.path.join(out, 'bitmaps')):
        subprocess.run(['godot', '--headless', '--script', 'tools/director_extract.gd', '--', '--root', f'res://games/{game}',
                        '--file', file, '--out', out], cwd=player, check=True, stdout=subprocess.DEVNULL)
    return os.path.join(out, 'bitmaps')


def member(bitmaps, n):
    name = next(f for f in os.listdir(bitmaps) if f.startswith(f'{n:04d}_'))
    return Image.open(os.path.join(bitmaps, name)).convert('RGBA')


def clear_paper(im):
    """The white paper that reaches the border becomes clear; white inside the drawing (eyes, teeth) stays."""
    im = im.copy()
    w, h = im.size
    for xy in [(x, 0) for x in range(w)] + [(x, h - 1) for x in range(w)] + [(0, y) for y in range(h)] + [(w - 1, y) for y in range(h)]:
        if im.getpixel(xy) == (255, 255, 255, 255):
            ImageDraw.floodfill(im, xy, (255, 255, 255, 0), thresh=12)
    return im


def clear_white(im):
    """Director's background-transparent ink (36): every pure white pixel is clear, enclosed ones too."""
    px = np.asarray(im).copy()
    px[(px[:, :, :3] == 255).all(axis=2), 3] = 0
    return Image.fromarray(px)


def lay_patch(face, patch):
    """The face with the patch's drawn pixels where they agree most with the face (the mouth's surroundings line up)."""
    f, p = np.asarray(face).astype(int), np.asarray(clear_paper(patch)).astype(int)
    ink = p[:, :, 3] > 0
    ph, pw = ink.shape
    best = None
    for y in range(f.shape[0] - ph + 1):
        for x in range(f.shape[1] - pw + 1):
            agree = (np.abs(f[y:y + ph, x:x + pw, :3] - p[:, :, :3]).sum(axis=2)[ink] < 40).mean()
            if best is None or agree > best[0]:
                best = (agree, x, y)
    agree, x, y = best
    # a wide-open mouth changes most of its patch, so a right fit can still agree on little more than half
    if agree < 0.55:
        sys.exit(f'a patch fits its face poorly (agree {agree:.2f})')
    out = f.copy()
    out[y:y + ph, x:x + pw][ink] = p[ink]
    return Image.fromarray(out.astype('uint8'))


def layered(bitmaps, s):
    """Frames of a face the score assembles: the bare face, its fixed layers, then each mouth, every part drawn with
    matte ink (its paper see-through), cropped last since the offsets are the bare face's. A part may reach past the bare
    face (a beak): the canvas grows to hold it, and `crop` stays in the bare face's coordinates."""
    face = member(bitmaps, s['face'])
    load = lambda p: (p, clear_white(member(bitmaps, p['member'])) if p.get('ink') == 36 else clear_paper(member(bitmaps, p['member'])))
    layers = [load(l) for l in s.get('layers', [])]
    mouths = [load(m) for m in [s['rest'], *s['mouths']]]
    x0 = min([0] + [p['x'] for p, _ in layers + mouths])
    y0 = min([0] + [p['y'] for p, _ in layers + mouths])
    x1 = max([face.width] + [p['x'] + im.width for p, im in layers + mouths])
    y1 = max([face.height] + [p['y'] + im.height for p, im in layers + mouths])
    base = Image.new('RGBA', (x1 - x0, y1 - y0), (0, 0, 0, 0))
    base.alpha_composite(face, (-x0, -y0))
    for p, im in layers:
        base.alpha_composite(im, (p['x'] - x0, p['y'] - y0))
    frames = []
    for p, im in mouths:
        f = base.copy()
        f.alpha_composite(im, (p['x'] - x0, p['y'] - y0))
        if 'crop' in s:
            cx0, cy0, cx1, cy1 = s['crop']
            f = f.crop((cx0 - x0, cy0 - y0, cx1 - x0, cy1 - y0))
        frames.append(f)
    return frames


def shrink(im, h):
    """Area average to `h` rows; a pixel that was mostly outline goes back to the outline colour so the line work survives."""
    w = round(im.width * h / im.height)
    small = im.resize((w, h), Image.BOX)
    # outline is near-black in every channel: a deep red or blue is a colour, not a line
    rgb = np.asarray(im)[:, :, :3]
    dark = Image.fromarray(np.where((rgb < 70).all(axis=2), 255, 0).astype('uint8')).resize((w, h), Image.BOX)
    px, dp = small.load(), dark.load()
    for y in range(h):
        for x in range(w):
            if dp[x, y] >= 75 and px[x, y][3] >= 128:
                px[x, y] = OUTLINE + (255,)
    return small


def index_frames(frames):
    """One palette for all frames (index 0 clear, at most 15 colours), so only the mouth changes between them."""
    opaque = [np.asarray(f)[:, :, 3] >= 128 for f in frames]
    colours = {tuple(c) for f, o in zip(frames, opaque) for c in np.asarray(f)[:, :, :3][o]}
    if len(colours) <= 15:
        palette = sorted(colours)
        lookup = {c: i + 1 for i, c in enumerate(palette)}
        idx = [np.array([[lookup[tuple(c)] if o[y, x] else 0 for x, c in enumerate(row)] for y, row in enumerate(np.asarray(f)[:, :, :3])]) for f, o in zip(frames, opaque)]
    else:
        strip = Image.new('RGB', (sum(f.width for f in frames), frames[0].height), OUTLINE)
        x = 0
        for f in frames:
            strip.paste(f.convert('RGB'), (x, 0)); x += f.width
        q = strip.quantize(15, method=Image.Quantize.MEDIANCUT)
        raw = q.getpalette()[:45]
        palette = [tuple(raw[i:i + 3]) for i in range(0, 45, 3)]
        idx = [np.where(o, np.asarray(f.convert('RGB').quantize(palette=q, dither=Image.Dither.NONE)) + 1, 0) for f, o in zip(frames, opaque)]
    return ['', *('#%02x%02x%02x' % c for c in palette)], idx


def pack(indexes):
    flat = [int(v) for v in np.asarray(indexes).flatten()]
    if len(flat) % 2:
        flat.append(0)
    return base64.b64encode(bytes((flat[i] << 4) | flat[i + 1] for i in range(0, len(flat), 2))).decode()


def face_data(frames):
    palette, idx = index_frames(frames)
    rest = idx[0]
    talk = []
    for t in idx[1:]:
        ys, xs = np.nonzero(t != rest)
        if len(ys) == 0:
            sys.exit('a talk frame is the resting face')
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        talk.append({'x': int(x0), 'y': int(y0), 'w': int(x1 - x0), 'h': int(y1 - y0), 'px': pack(t[y0:y1, x0:x1])})
    return {'w': int(rest.shape[1]), 'h': int(rest.shape[0]), 'palette': palette, 'rest': pack(rest), 'talk': talk}


def face_frames(a, cid, s):
    """One face's frames, the resting face first, paper cleared."""
    bitmaps = extract(os.path.expanduser(a.player), a.work, s['game'], s['file'])
    if 'mouths' in s:
        frames = layered(bitmaps, s)
    else:
        face = member(bitmaps, s['face'])
        frames = [face] + [member(bitmaps, n) for n in s.get('talk', [])] + [lay_patch(face, member(bitmaps, n)) for n in s.get('patches', [])]
    if any(f.size != frames[0].size for f in frames):
        sys.exit(f'{cid}: a talk frame is not the size of its face')
    return [clear_paper(f) for f in frames]


def pair_frames(a, cid, s):
    """A duo as one buddy: both faces side by side on their chins, at rest, then each one talking while the other rests."""
    left, right = (face_frames(a, cid, p) for p in s['pair'])
    gap = s.get('gap', 6)
    w = left[0].width + gap + right[0].width
    h = max(left[0].height, right[0].height)
    def side_by_side(l, r):
        canvas = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        canvas.alpha_composite(l, (0, h - l.height))
        canvas.alpha_composite(r, (l.width + gap, h - r.height))
        return canvas
    return [side_by_side(left[0], right[0])] + [side_by_side(l, right[0]) for l in left[1:]] + [side_by_side(left[0], r) for r in right[1:]]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--player', required=True)
    ap.add_argument('--work', default=os.path.join(ROOT, '.casts'))
    a = ap.parse_args()
    spec = json.load(open(os.path.join(ROOT, 'scripts', 'faces.json')))
    faces = {}
    for cid, s in spec.items():
        frames = pair_frames(a, cid, s) if 'pair' in s else face_frames(a, cid, s)
        big = frames if frames[0].height <= BIG_MAX_H else [shrink(f, BIG_MAX_H) for f in frames]
        faces[cid] = {'big': face_data(big), 'small': face_data([shrink(f, SMALL_H) for f in frames])}
        print(f"{cid}: {big[0].width}x{big[0].height}, {len(frames) - 1} talk frames, {len(faces[cid]['big']['palette']) - 1} colours")
    with open(OUT, 'w') as out:
        out.write('// Generated by scripts/bake.py from the games\' own casts; do not edit. Art © Guillotine, see NOTICE.\n')
        out.write("import type { Face } from '../render/face'\n\n")
        out.write('export const FACES: Record<string, { big: Face; small: Face }> = ')
        out.write(json.dumps(faces, separators=(',', ':')))
        out.write('\n')
    print(f'{OUT}: {os.path.getsize(OUT) // 1024} KB')


if __name__ == '__main__':
    main()
