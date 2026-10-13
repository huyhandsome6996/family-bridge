#!/usr/bin/env python3
"""Deterministic logo derivative extraction from the owner's concept board.

Source (immutable): docs/design/assets/family-bridge-logo-reference.png
  1254x1254 PNG, sha256 recorded in asset-manifest.json.

Outputs (zalo-mini-app/src/assets/logo/):
  - logo-mark.png      the two-bubble mark only (original cream background)
  - logo-lockup.png    mark + "Family Bridge" wordmark (original background)
  - app-icon.png       the rounded-square app icon, bottom-right region
  - logo-mark-transparent.png / logo-lockup-transparent.png
      deterministic background-removal derivative: alpha from color distance
      to the sampled corner background; recorded as DERIVED, not official.

All crops are computed from pixel projections (content bounding boxes),
never hand-tuned after the fact. Coordinates + hashes are printed for the
asset manifest.
"""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path("/home/z/my-project/repo-family-bridge")
SRC = ROOT / "docs/design/assets/family-bridge-logo-reference.png"
OUT = ROOT / "zalo-mini-app/src/assets/logo"

img = Image.open(SRC).convert("RGB")
W, H = img.size
arr = np.asarray(img).astype(np.int16)

# Background = median of the four 20x20 corners (the board is uniform cream).
corners = np.concatenate([
    arr[:20, :20].reshape(-1, 3), arr[:20, -20:].reshape(-1, 3),
    arr[-20:, :20].reshape(-1, 3), arr[-20:, -20:].reshape(-1, 3),
])
bg = np.median(corners, axis=0)
dist = np.sqrt(((arr - bg) ** 2).sum(axis=2))  # HxW distance from bg
content = dist > 40  # anything clearly not background

def bbox(mask, y0, y1, x0, x1, pad=0):
    """Bounding box of True pixels inside a region, with padding clamped."""
    sub = mask[y0:y1, x0:x1]
    rows = np.where(sub.any(axis=1))[0]
    cols = np.where(sub.any(axis=0))[0]
    if len(rows) == 0:
        raise SystemExit(f"empty region y{y0}:{y1} x{x0}:{x1}")
    top, bottom = y0 + rows[0], y0 + rows[-1] + 1
    left, right = x0 + cols[0], x0 + cols[-1] + 1
    return (max(0, left - pad), max(0, top - pad),
            min(W, right + pad), min(H, bottom + pad))

# Region priors from the board layout (quarter-grid analysis of 1254x1254):
# "03" number: top-left corner; mark+wordmark: middle band; app icon: bottom
# right. The exact mark/wordmark split = largest horizontal whitespace gap
# inside the middle band (the board has a clear gap between the two blocks).
box_num = bbox(content, 0, int(H * 0.12), 0, int(W * 0.25))
band_top, band_bottom = int(H * 0.20), int(H * 0.80)
# Column limit excludes the bottom-right app icon (x ≥ ~0.82W) so the band
# contains only the mark + wordmark blocks.
band = content[band_top:band_bottom, : int(W * 0.80)]
row_has_ink = band.any(axis=1)
# Find whitespace runs (consecutive rows without ink) inside the band.
runs, start = [], None
for idx, has in enumerate(row_has_ink):
    if not has and start is None:
        start = idx
    elif has and start is not None:
        runs.append((start, idx))
        start = None
if start is not None:
    runs.append((start, len(row_has_ink)))
# The mark/wordmark gap = largest whitespace run that has ink BOTH before
# and after it (interior gap, not the leading/trailing margin of the band).
big_gaps = [r for r in runs if (r[1] - r[0]) >= 8
            and r[0] > 0 and r[1] < len(row_has_ink)]
if not big_gaps:
    raise SystemExit("no mark/wordmark gap found")
gap = max(big_gaps, key=lambda r: r[1] - r[0])
split_y = band_top + gap[1]  # first ink row after the gap = wordmark top
mark_top = band_top + next(i for i, has in enumerate(row_has_ink) if has)
box_mark = bbox(content, mark_top, split_y, int(W * 0.10), int(W * 0.95))
box_word = bbox(content, split_y, int(H * 0.82), int(W * 0.10), int(W * 0.82))
box_icon = bbox(content, int(H * 0.78), H, int(W * 0.72), W)
# App icon: force square (max side), centered on the detected box.
iw, ih = box_icon[2] - box_icon[0], box_icon[3] - box_icon[1]
side = max(iw, ih)
cx, cy = (box_icon[0] + box_icon[2]) // 2, (box_icon[1] + box_icon[3]) // 2
half = side // 2
box_icon = (max(0, cx - half), max(0, cy - half),
            min(W, cx - half + side), min(H, cy - half + side))

# Lockup = union of mark and wordmark (tight, no extra padding).
lock_left = min(box_mark[0], box_word[0])
lock_top = box_mark[1]
lock_right = max(box_mark[2], box_word[2])
lock_bottom = box_word[3]
box_lock = (lock_left, lock_top, lock_right, lock_bottom)

def crop_save(box, name):
    piece = img.crop(box)
    path = OUT / name
    piece.save(path, optimize=True)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    print(f"{name}: box={box} size={piece.size} sha256={digest[:16]}…")
    return path

def transparent_variant(src_path, name):
    """Derived transparent PNG: alpha = smoothstep(distance to bg / 24..64).
    Deterministic; edge halo risk recorded in the manifest."""
    im = Image.open(src_path).convert("RGB")
    a = np.asarray(im).astype(np.int16)
    d = np.sqrt(((a - bg) ** 2).sum(axis=2))
    alpha = np.clip((d - 24.0) / (64.0 - 24.0), 0, 1) * 255
    out = np.dstack([np.asarray(im), alpha.astype(np.uint8)])
    path = OUT / name
    Image.fromarray(out, "RGBA").save(path, optimize=True)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    print(f"{name}: DERIVED transparent size={im.size} sha256={digest[:16]}…")

OUT.mkdir(parents=True, exist_ok=True)
crop_save(box_mark, "logo-mark.png")
crop_save(box_lock, "logo-lockup.png")
crop_save(box_icon, "app-icon.png")
transparent_variant(OUT / "logo-mark.png", "logo-mark-transparent.png")
transparent_variant(OUT / "logo-lockup.png", "logo-lockup-transparent.png")

print(f"source: {SRC.relative_to(ROOT)} {W}x{H} sha256="
      f"{hashlib.sha256(SRC.read_bytes()).hexdigest()}")
print(f"background rgb: {bg.astype(int).tolist()}")
print("number box (excluded):", box_num)
