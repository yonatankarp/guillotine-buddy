#!/usr/bin/env python3
"""Draws the README's images as SVG from the roster and the baked faces.

    python3 scripts/docs_images.py

Writes docs/images/band.svg (the band above the prompt), cast.svg (every character, by game) and
talking.svg (one face's mouth frames). Run it again whenever characters.ts or faces.generated.ts change.
SVG and not PNG: browsers lay Hebrew out right to left, and pixel art stays crisp at any size.
"""
import base64
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'docs' / 'images'
GAMES_HE = {'Piposh': 'פיפוש', 'Piposh 2': 'פיפוש 2', 'Rating': 'בתככי הרייטינג'}
HERO = ('p1-piposh', 'נו, איך? מפתיע, מה? חשבתי על זה לבד!')
FONT = "system-ui, -apple-system, 'Segoe UI', Arial, 'Noto Sans Hebrew', sans-serif"
INK, MUTED, PAPER, LINE = '#1f1e1b', '#6b6a63', '#faf9f5', '#e3e1d6'
MAX_BYTES = 500_000

# A JS string literal in either quote; characters.ts double-quotes the ones with an apostrophe (חבר'ה).
STR = r"""('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")"""


def js_str(s):
    return re.sub(r'\\(.)', r'\1', s[1:-1])


def roster():
    """Each character's id, game, names and lines, in roster order."""
    src = (ROOT / 'plugin/hooks/characters.ts').read_text()
    head = re.compile(rf"id:\s*{STR},\s*game:\s*{STR},\s*name:\s*{{\s*he:\s*{STR},\s*en:\s*{STR}\s*}}")
    found = list(head.finditer(src))
    out = []
    for i, m in enumerate(found):
        body = src[m.end():found[i + 1].start() if i + 1 < len(found) else len(src)]
        lines = re.search(r'lines:\s*\[(.*?)\]', body, re.S)
        out.append({
            'id': js_str(m[1]), 'game': js_str(m[2]), 'he': js_str(m[3]), 'en': js_str(m[4]),
            'lines': [js_str(s) for s in re.findall(STR, lines[1])] if lines else [],
        })
    assert len(out) == len(re.findall(r"\bid:\s*['\"]", src)), 'a roster entry did not parse: update roster() in docs_images.py'
    return out


def faces():
    src = (ROOT / 'plugin/hooks/data/faces.generated.ts').read_text()
    return json.loads(src[src.index('= ') + 2:])


def unpack(px, n):
    return [v for b in base64.b64decode(px) for v in (b >> 4, b & 15)][:n]


def frames(face):
    """The resting face, then each talk frame: the rest with its patch laid on, as in render/face.ts."""
    rest = unpack(face['rest'], face['w'] * face['h'])
    out = [rest]
    for p in face['talk']:
        f, px = rest[:], unpack(p['px'], p['w'] * p['h'])
        for y in range(p['h']):
            for x in range(p['w']):
                f[(p['y'] + y) * face['w'] + p['x'] + x] = px[y * p['w'] + x]
        out.append(f)
    return out


def pixels(face, px, x, y, scale):
    """One frame as a path per colour: each same-colour run is a 1-pixel stroke, which keeps the file small."""
    w = face['w']
    runs, pen = {}, {}
    for row in range(face['h']):
        col = 0
        while col < w:
            k, end = px[row * w + col], col + 1
            while end < w and px[row * w + end] == k:
                end += 1
            if k:
                # Moves relative to where this colour's last run ended are shorter than absolute ones.
                at = pen.get(k)
                runs.setdefault(k, []).append(f'M{col} {row}.5h{end - col}' if at is None else f'm{col - at[0]} {row - at[1]}h{end - col}')
                pen[k] = (end, row)
            col = end
    paths = ''.join(f'<path stroke="{face["palette"][k]}" d="{"".join(d)}"/>' for k, d in sorted(runs.items()))
    return f'<g transform="translate({x:g} {y:g}) scale({scale:g})" stroke-width="1" fill="none">{paths}</g>'


def text(x, y, s, size, fill=INK, weight='normal', anchor='middle'):
    return (f'<text x="{x:g}" y="{y:g}" font-size="{size}" font-weight="{weight}" fill="{fill}" '
            f'text-anchor="{anchor}" direction="rtl" unicode-bidi="embed">{html.escape(s)}</text>')


def svg(w, h, body, label):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
            f'shape-rendering="crispEdges" font-family="{FONT}" role="img" aria-label="{html.escape(label)}">'
            f'<title>{html.escape(label)}</title>'
            # Opaque, so it reads on GitHub's dark theme too.
            f'<rect width="{w}" height="{h}" rx="18" fill="{PAPER}" stroke="{LINE}" shape-rendering="geometricPrecision"/>'
            f'{body}</svg>\n')


def wrap(line, width=40):
    """Words to lines of at most `width` characters, as the band wraps its bubble."""
    out, cur = [], ''
    for word in line.split():
        if cur and len(cur) + 1 + len(word) > width:
            out.append(cur)
            cur = word
        else:
            cur = f'{cur} {word}'.strip()
    return out + [cur] if cur else out


def band_svg(cast, all_faces):
    who = next((c for c in cast if c['id'] == HERO[0]), cast[0])
    line = HERO[1] if HERO[1] in who['lines'] else (who['lines'] or [who['he']])[0]
    face = all_faces[who['id']]['big']
    scale = 176 / face['h']
    fw = face['w'] * scale
    rows = wrap(line)
    W, pad = 860, 36
    bx = pad + fw + 34
    bw = min(W - pad - bx, 480)
    bh = 30 * len(rows) + 30
    face_y, band_h = 34, 176
    by = face_y + (band_h - bh) / 2
    soft = 'shape-rendering="geometricPrecision"'
    body = [
        pixels(face, frames(face)[0], pad, face_y, scale),
        f'<rect x="{bx:g}" y="{by:g}" width="{bw:g}" height="{bh}" rx="14" fill="#fff" stroke="#c9c6b8" stroke-width="1.5" {soft}/>',
        f'<path d="M{bx + 0.75:g} {by + bh / 2 - 9:g}l-14 9l14 9z" fill="#fff" stroke="#c9c6b8" stroke-width="1.5" stroke-linejoin="round" {soft}/>',
        f'<rect x="{bx - 1:g}" y="{by + bh / 2 - 7.5:g}" width="2.5" height="15" fill="#fff"/>',
    ]
    # Right-aligned, as the band aligns a Hebrew line; rtl's text-anchor start is the right edge.
    body += [text(bx + bw - 22, by + 38 + 30 * i, r, 21, anchor='start') for i, r in enumerate(rows)]
    py = face_y + band_h + 26
    body += [
        f'<rect x="{pad}" y="{py}" width="{W - 2 * pad}" height="96" rx="16" fill="#fff" stroke="{LINE}" stroke-width="1.5" {soft}/>',
        f'<text x="{pad + 22}" y="{py + 34}" font-size="17" fill="{MUTED}">Reply to Claude…</text>',
        f'<circle cx="{W - pad - 30}" cy="{py + 66}" r="16" fill="#d97757" {soft}/>',
        f'<path d="M{W - pad - 30} {py + 74}v-15m-6 6l6-6l6 6" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" {soft}/>',
    ]
    return svg(W, py + 96 + 30, ''.join(body), f'{who["he"]}: {line}')


def cast_svg(cast, all_faces):
    """Every character's resting face with the name under it, right to left, a section per game."""
    W, pad, face_h, gap = 860, 36, 120, 30
    games = list(dict.fromkeys(c['game'] for c in cast))
    body, y = [], 22
    for game in games:
        y += 34
        body.append(text(W / 2, y, GAMES_HE.get(game, game), 26, weight='bold'))
        y += 22
        people = [c for c in cast if c['game'] == game]
        row = []

        def flush(row, y):
            # A row is centred, its first character on the right.
            total = sum(cw for _, cw in row) + gap * (len(row) - 1)
            x = W / 2 + total / 2
            for c, cw in row:
                face = all_faces[c['id']]['big']
                scale = face_h / face['h']
                x -= cw
                body.append(pixels(face, frames(face)[0], x + (cw - face['w'] * scale) / 2, y, scale))
                body.append(text(x + cw / 2, y + face_h + 28, c['he'], 18, weight='bold'))
                x -= gap
            return y + face_h + 52

        for c in people:
            face = all_faces[c['id']]['big']
            cw = max(face['w'] * face_h / face['h'], 18 * 0.62 * len(c['he']), 110)
            if row and sum(r[1] for r in row) + gap * len(row) + cw > W - 2 * pad:
                y = flush(row, y)
                row = []
            row.append((c, cw))
        y = flush(row, y)
    return svg(W, y + 10, ''.join(body), 'הדמויות של guillotine-buddy, לפי משחק')


def talking_svg(cast, all_faces):
    who = next((c for c in cast if c['id'] == HERO[0]), cast[0])
    face = all_faces[who['id']]['big']
    fs = frames(face)
    scale = 2 if face['h'] <= 100 else 200 / face['h']
    fw, fh, gap, pad = face['w'] * scale, face['h'] * scale, 20, 36
    W = int(2 * pad + len(fs) * fw + (len(fs) - 1) * gap)
    # Rest on the right, as Hebrew reads, and the mouth frames after it to the left.
    body = [pixels(face, f, W - pad - fw - i * (fw + gap), 30, scale) for i, f in enumerate(fs)]
    body.append(text(W - pad - fw / 2, 30 + fh + 34, 'במנוחה', 20, MUTED))
    body.append(text((pad + W - pad - fw - gap) / 2, 30 + fh + 34, 'מדבר', 20, MUTED))
    return svg(W, int(30 + fh + 62), ''.join(body), f'{who["he"]} במנוחה ובזמן שהוא מדבר')


def main():
    all_faces = faces()
    cast = [c for c in roster() if c['id'] in all_faces]
    assert cast, 'no character has a face'
    OUT.mkdir(parents=True, exist_ok=True)
    for name, make in (('band.svg', band_svg), ('cast.svg', cast_svg), ('talking.svg', talking_svg)):
        out = make(cast, all_faces)
        assert len(out.encode()) < MAX_BYTES, f'{name} is {len(out.encode())} bytes, over {MAX_BYTES}'
        (OUT / name).write_text(out)
        print(f'{name}: {len(out.encode()) // 1024} KB')
    drawn = (OUT / 'cast.svg').read_text()
    assert all(html.escape(c['he']) in drawn for c in cast), 'a character is missing from cast.svg'
    print(f'{len(cast)} characters in {len(dict.fromkeys(c["game"] for c in cast))} games')


if __name__ == '__main__':
    main()
