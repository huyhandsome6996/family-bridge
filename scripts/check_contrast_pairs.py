#!/usr/bin/env python3
"""Compute WCAG contrast ratios for the Stitch palette pairs used by the UI.

Records the result into docs/design/stitch-ui-upgrade/contrast-checks.json
so the PR carries measured evidence (ui-rules: contrast per pair, exceptions
recorded, never color alone).
"""
import json
from pathlib import Path

def srgb_to_lin(c):
    c /= 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def luminance(hex_color):
    h = hex_color.lstrip("#")
    r, g, b = (int(h[i:i+2], 16) for i in (0, 2, 4))
    return 0.2126 * srgb_to_lin(r) + 0.7152 * srgb_to_lin(g) + 0.0722 * srgb_to_lin(b)

def ratio(fg, bg):
    l1, l2 = sorted([luminance(fg), luminance(bg)], reverse=True)
    return (l1 + 0.05) / (l2 + 0.05)

PAIRS = [
    # (fg, bg, role, minimum)
    ("#360F07", "#FFF8F6", "on-surface trên nền trang", 4.5),
    ("#56423E", "#FFF8F6", "on-surface-variant trên nền trang", 4.5),
    ("#56423E", "#FFFFFF", "on-surface-variant trên card trắng", 4.5),
    ("#FFFFFF", "#9D3D27", "on-primary trên CTA primary", 4.5),
    ("#FFFBFF", "#BD543D", "on-primary-container trên header logo box", 4.5),
    ("#713D32", "#E4AB56", "nhãn trên nút amber (Stitch gốc)", 4.5),
    ("#5F3227", "#E4AB56", "nhãn trên nút amber (biến thể tối hơn — đề xuất)", 4.5),
    ("#291800", "#FFDDB2", "on-tertiary-fixed trên card amber nhạt", 4.5),
    ("#802918", "#FFDAD3", "on-secondary-fixed-variant trên badge hồng", 4.5),
    ("#7E5300", "#FFF8F6", "tertiary text trên nền trang", 4.5),
    ("#9D3D27", "#FFF8F6", "primary text/link trên nền trang", 4.5),
    ("#9D3D27", "#FFFFFF", "primary text trên card trắng", 4.5),
    ("#8A726C", "#FFF8F6", "outline/micro-copy trên nền trang", 4.5),
    ("#FFEDE9", "#502319", "inverse-on-surface trên gradient ảnh", 4.5),
    ("#FFFFFF", "#502319", "caption trắng trên gradient ảnh (60-80%)", 4.5),
    ("#360F07", "#FFE9E5", "on-surface trên surface-container", 4.5),
    ("#56423E", "#FFF0EE", "on-surface-variant trên surface-container-low", 4.5),
    ("#9D3D27", "#FFDAD2", "primary trên primary-fixed (badge 1/4)", 4.5),
]

results = []
for fg, bg, role, minimum in PAIRS:
    r = ratio(fg, bg)
    results.append({
        "fg": fg, "bg": bg, "role": role, "minimum": minimum,
        "ratio": round(r, 2), "pass": bool(r >= minimum),
    })
    print(f"{'PASS' if r >= minimum else 'FAIL'}  {r:5.2f}:1  {fg} on {bg}  {role}")

# Đề xuất màu thay thế cho cặp amber nếu cặp gốc fail
print("\nĐề xuất: tìm màu nâu đậm nhất gần #713D32 đạt ≥4.5 trên #E4AB56")
for cand in ["#713D32", "#6B392E", "#663629", "#613429", "#5C3125", "#5F3227"]:
    print(f"  {cand}: {ratio(cand, '#E4AB56'):.2f}:1")

out = Path("/home/z/my-project/repo-family-bridge/docs/design/stitch-ui-upgrade/contrast-checks.json")
out.write_text(json.dumps({
    "method": "WCAG 2.x relative luminance, sRGB, solid hex",
    "thresholds": {"normal_text": 4.5, "large_text": 3.0, "ui_components": 3.0},
    "pairs": results,
}, indent=2, ensure_ascii=False))
print(f"\nwrote {out}")
