#!/usr/bin/env python3
"""Visual verification: render the built app and capture the four Stitch
reference screens, then build side-by-side comparison sheets.

- Viewport: 390px (documented doc-baseline; DESIGN.md §4: fluid 320–430).
- Demo mode (?demo=1) for data states; fonts awaited via document.fonts.ready.
- Outputs: docs/design/stitch-ui-upgrade/verification/*.png + report.json
  (sampled colors from references vs app tokens, dims, notes).
"""
import json
import subprocess
import time
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

REPO = Path("/home/z/my-project/repo-family-bridge")
WWW = REPO / "zalo-mini-app/www"
OUT = REPO / "docs/design/stitch-ui-upgrade/verification"
REF = REPO / "docs/design/stitch-reference"
OUT.mkdir(parents=True, exist_ok=True)

PORT = 8899
BASE = f"http://127.0.0.1:{PORT}"

# (name, route, init_storage_role, scroll_note)
SHOTS = [
    ("u01-welcome", "/welcome", None),
    ("u08-home-student", "/home", "student"),
    ("u10-home-caregiver", "/home", "caregiver"),
    ("u34-compose", "/compose", "student"),
]

server = subprocess.Popen(
    ["python3", "-m", "http.server", str(PORT)],
    cwd=WWW,
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL,
)
time.sleep(1.0)

try:
    with sync_playwright() as p:
        browser = p.chromium.launch()

        for name, route, role in SHOTS:
            # Trang MỖI lần chụp: init script chỉ chạy khi tải document mới
            # (chuyển #hash trên cùng document không kích hoạt lại).
            page = browser.new_page(
                viewport={"width": 390, "height": 844},
                device_scale_factor=2,
            )
            if role:
                page.add_init_script(
                    "window.sessionStorage.setItem('fb.ui.session.v1', "
                    "JSON.stringify({role:'%s'}));" % role
                )
            page.goto(f"{BASE}/?demo=1#{route}", wait_until="networkidle")
            page.evaluate("document.fonts.ready.then(() => true)")
            page.wait_for_timeout(2500)  # mock latency + fonts + layout
            path = OUT / f"actual-{name}.png"
            page.screenshot(path=str(path), full_page=True)
            print(f"captured {name} -> {path.name}")
            page.close()

        browser.close()
finally:
    server.terminate()

# ---- Side-by-side sheets (reference scaled to same width for eyeballing) ----
report = {"viewport": "390x844@2x", "sheets": [], "notes": []}
for name, ref_dir in [
    ("u01-welcome", "u01_ch_o_m_ng_family_bridge"),
    ("u08-home-student", "u08_trang_ch_h_c_sinh"),
    ("u10-home-caregiver", "u10_trang_ch_ng_i_ch_m_s_c"),
    ("u34-compose", "u34_so_n_l_i_t_m_d_ng_5_ph_t"),
]:
    ref_path = REF / ref_dir / "screen.png"
    actual_path = OUT / f"actual-{name}.png"
    ref = Image.open(ref_path).convert("RGB")
    actual = Image.open(actual_path).convert("RGB")
    report["sheets"].append({
        "name": name,
        "reference_size": list(ref.size),
        "actual_size": list(actual.size),
    })
    # Composite: reference (scaled to 320 wide) | actual (scaled to 320 wide)
    W = 320
    ref_scaled = ref.resize((W, int(ref.height * W / ref.width)))
    act_scaled = actual.resize((W, int(actual.height * W / actual.width)))
    H = max(ref_scaled.height, act_scaled.height)
    sheet = Image.new("RGB", (W * 2 + 24, H + 40), "#ffffff")
    sheet.paste(ref_scaled, (8, 32))
    sheet.paste(act_scaled, (W + 16, 32))
    sheet.save(OUT / f"compare-{name}.png", optimize=True)
    print(f"sheet {name}: ref {ref.size} | actual {actual.size}")

# ---- Color sampling: reference regions vs app token values ----
def sample(img, fx, fy):
    px = img.convert("RGB")
    w, h = px.size
    return "#%02X%02X%02X" % px.getpixel((int(w * fx), int(h * fy)))

u01 = Image.open(REF / "u01_ch_o_m_ng_family_bridge/screen.png")
report["color_sampling"] = {
    "u01_background": {"sampled": sample(u01, 0.5, 0.97), "token": "#FFF8F6"},
    "u01_cta_area": {"sampled": sample(u01, 0.5, 0.763), "token": "#9D3D27"},
}
u08 = Image.open(REF / "u08_trang_ch_h_c_sinh/screen.png")
report["color_sampling"]["u08_amber_card"] = {"sampled": sample(u08, 0.5, 0.19), "token": "#FFDDB2"}
u34 = Image.open(REF / "u34_so_n_l_i_t_m_d_ng_5_ph_t/screen.png")
report["color_sampling"]["u34_background"] = {"sampled": sample(u34, 0.5, 0.98), "token": "#FFF8F6"}

report["notes"] = [
    "Reference exports differ in width (636/352/259/585) — Stitch exports, not one viewport. "
    "Sheets scale both to 320px for eyeball comparison; NOT a pixel-match claim.",
    "Actual rendered at 390px doc-baseline (DESIGN.md §4 fluid 320–430).",
    "Color verification: sampled reference pixels vs token values (recorded in report).",
    "Device screens require Zalo real-device run (US-049) — NOT claimed here.",
]
(OUT / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False))
print("wrote verification/report.json")
