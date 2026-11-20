#!/usr/bin/env python3
"""Génère l'icône de l'appli (cadran de coffre-fort) :
- android/app/src/main/res/drawable/ic_launcher_foreground.xml (icône adaptative, vectorielle)
- PNG pour Android 7 (mipmap-*) et public/icon.svg pour la version web.
Usage : python3 tools/make_icons.py   (nécessite rsvg-convert)
"""
import math
import os
import subprocess
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, 'android/app/src/main/res')

STEEL = '#1D2B3A'
PLATE = '#2B3E53'
BRASS = '#D2A24F'
BRASS_DARK = '#A57A2C'

CX = CY = 54.0  # icône adaptative : 108 x 108, zone sûre de 66 au centre


def circle(cx, cy, r):
    return f'M{cx - r:.2f},{cy:.2f}a{r:.2f},{r:.2f} 0 1,0 {2 * r:.2f},0a{r:.2f},{r:.2f} 0 1,0 {-2 * r:.2f},0z'


def ring(cx, cy, r_out, r_in):
    return circle(cx, cy, r_out) + circle(cx, cy, r_in)


def ticks(cx, cy, r1, r2, n, w):
    parts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        dx, dy = math.sin(a), -math.cos(a)
        px, py = -dy * w / 2, dx * w / 2
        x1, y1 = cx + dx * r1, cy + dy * r1
        x2, y2 = cx + dx * r2, cy + dy * r2
        parts.append(
            f'M{x1 + px:.2f},{y1 + py:.2f}L{x2 + px:.2f},{y2 + py:.2f}L{x2 - px:.2f},{y2 - py:.2f}L{x1 - px:.2f},{y1 - py:.2f}z'
        )
    return ''.join(parts)


def rounded_rect(x, y, w, h, r):
    return (
        f'M{x + r:.2f},{y:.2f}h{w - 2 * r:.2f}a{r},{r} 0 0,1 {r},{r}v{h - 2 * r:.2f}'
        f'a{r},{r} 0 0,1 {-r},{r}h{-(w - 2 * r):.2f}a{r},{r} 0 0,1 {-r},{-r}v{-(h - 2 * r):.2f}a{r},{r} 0 0,1 {r},{-r}z'
    )


LAYERS = [
    (BRASS, ring(CX, CY, 27, 23), 'evenOdd'),
    (PLATE, circle(CX, CY, 23), 'nonZero'),
    (BRASS, ticks(CX, CY, 17.5, 21.5, 12, 1.6), 'nonZero'),
    (BRASS, circle(CX, CY, 10.5), 'nonZero'),
    (BRASS_DARK, rounded_rect(CX - 2.4, CY - 14, 4.8, 28, 2.4), 'nonZero'),
    (BRASS, f'M{CX:.2f},{CY - 28:.2f}l3.4,-4.5h-6.8z', 'nonZero'),
]


def vector_xml():
    paths = '\n'.join(
        f'    <path android:fillColor="{c}" android:fillType="{ft}" android:pathData="{d}"/>' for c, d, ft in LAYERS
    )
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<!-- Généré par tools/make_icons.py -->\n'
        '<vector xmlns:android="http://schemas.android.com/apk/res/android"\n'
        '    android:width="108dp" android:height="108dp"\n'
        '    android:viewportWidth="108" android:viewportHeight="108">\n'
        f'{paths}\n'
        '</vector>\n'
    )


def svg(background=True, round_bg=False, crop=0):
    """crop : marge retirée de chaque côté (l'icône adaptative a 18 de marge de chaque côté)."""
    vb = f'{crop} {crop} {108 - 2 * crop} {108 - 2 * crop}'
    bg = ''
    if background:
        if round_bg:
            bg = f'<circle cx="54" cy="54" r="{54 - crop}" fill="{STEEL}"/>'
        else:
            r = (108 - 2 * crop) * 0.18
            bg = f'<rect x="{crop}" y="{crop}" width="{108 - 2 * crop}" height="{108 - 2 * crop}" rx="{r:.1f}" fill="{STEEL}"/>'
    paths = ''.join(
        f'<path fill="{c}" fill-rule="{"evenodd" if ft == "evenOdd" else "nonzero"}" d="{d}"/>' for c, d, ft in LAYERS
    )
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}">{bg}{paths}</svg>'


def render(svg_text, size, out):
    with tempfile.NamedTemporaryFile('w', suffix='.svg', delete=False) as f:
        f.write(svg_text)
        tmp = f.name
    os.makedirs(os.path.dirname(out), exist_ok=True)
    subprocess.run(['rsvg-convert', '-w', str(size), '-h', str(size), '-o', out, tmp], check=True)
    os.unlink(tmp)


def main():
    os.makedirs(os.path.join(RES, 'drawable'), exist_ok=True)
    with open(os.path.join(RES, 'drawable/ic_launcher_foreground.xml'), 'w') as f:
        f.write(vector_xml())
    sizes = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
    for density, px in sizes.items():
        d = os.path.join(RES, f'mipmap-{density}')
        render(svg(crop=12), px, os.path.join(d, 'ic_launcher.png'))
        render(svg(round_bg=True, crop=12), px, os.path.join(d, 'ic_launcher_round.png'))
    os.makedirs(os.path.join(ROOT, 'public'), exist_ok=True)
    with open(os.path.join(ROOT, 'public/icon.svg'), 'w') as f:
        f.write(svg(crop=12))
    render(svg(crop=12), 512, os.path.join(ROOT, 'tools/icon-preview.png'))
    print('Icônes générées.')


if __name__ == '__main__':
    main()
