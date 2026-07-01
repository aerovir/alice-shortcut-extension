#!/usr/bin/env python3
"""Generate PNG icons for the Alice browser extension."""

from PIL import Image, ImageDraw, ImageFont
import os

ICON_DIR = os.path.join(os.path.dirname(__file__), 'icons')

SIZES = [16, 32, 48, 128]

# Yandex yellow accent color
BG_COLOR = (255, 204, 0)
FG_COLOR = (51, 51, 51)  # Dark gray


def create_icon(size):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Padding
    p = max(1, size // 8)
    r = (size - 2 * p) // 2  # Circle radius
    cx = cy = size // 2

    # Draw filled circle
    draw.ellipse(
        [cx - r, cy - r, cx + r, cy + r],
        fill=BG_COLOR,
    )

    # Draw letter "A" in the center
    font_size = max(8, size // 2 + 2)
    try:
        # Try to find a system font
        font_paths = [
            '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
            '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
            '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf',
        ]
        font = None
        for fp in font_paths:
            if os.path.exists(fp):
                font = ImageFont.truetype(fp, font_size)
                break
        if font is None:
            font = ImageFont.load_default()
    except Exception:
        font = ImageFont.load_default()

    # Calculate text position for centering
    bbox = draw.textbbox((0, 0), 'A', font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = cx - tw // 2
    ty = cy - th // 2 - 1  # Slight vertical adjustment

    draw.text((tx, ty), 'A', fill=FG_COLOR, font=font)

    return img


def main():
    os.makedirs(ICON_DIR, exist_ok=True)

    for size in SIZES:
        img = create_icon(size)
        path = os.path.join(ICON_DIR, f'icon{size}.png')
        img.save(path, 'PNG')
        print(f'✅ Created {path} ({size}x{size})')

    print(f'\n🎉 All icons generated in {ICON_DIR}/')


if __name__ == '__main__':
    main()
