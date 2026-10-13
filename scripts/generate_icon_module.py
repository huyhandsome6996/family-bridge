#!/usr/bin/env python3
"""Fetch the Material Symbols used by the Stitch reference screens and
generate a single local icon module (Apache-2.0, license pointer kept).

Source: google/material-design-icons @ master, symbols/web/<name>/
materialsymbolsoutlined/<name>_24px.svg (+ _fill1_ variant when the design
sets font-variation-settings 'FILL' 1).

Output: zalo-mini-app/src/components/icon.js
  - ICONS: { name: { viewBox, d } }  (outlined, weight 400)
  - ICONS_FILL: { name: d }          (fill variant where used)
  - createIcon({name, size, fill, className, label}) DOM builder.
"""
import hashlib
import json
import urllib.request
from pathlib import Path

BASE = ("https://raw.githubusercontent.com/google/material-design-icons/"
        "master/symbols/web/{name}/materialsymbolsoutlined/{variant}")

# name -> set of variants needed per the four reference screens
SPEC = {
    "verified_user": {"o", "f"},
    "lock": {"o"},
    "timer": {"o", "f"},
    "favorite": {"o", "f"},
    "info": {"o"},
    "phone_in_talk": {"o", "f"},
    "forum": {"o", "f"},
    "chat": {"o", "f"},
    "arrow_forward": {"o"},
    "psychology_alt": {"o"},
    "check_circle": {"o", "f"},
    "family_restroom": {"o"},
    "shield": {"o", "f"},
    "play_circle": {"o"},
    "edit_note": {"o", "f"},
    "style": {"o", "f"},
    "drafts": {"o", "f"},
    "call": {"o"},
    "support_agent": {"o"},
    "person": {"o", "f"},
    "diversity_1": {"o"},
    "home": {"o", "f"},
    "explore": {"o"},
    "mark_email_unread": {"o", "f"},
    "menu_book": {"o"},
    "account_circle": {"o", "f"},
    "spa": {"o", "f"},
    "volunteer_activism": {"o"},
    "send": {"o", "f"},
    "hourglass_top": {"o"},
    "bookmark_add": {"o"},
    "auto_awesome": {"o"},
    "tips_and_updates": {"o"},
    "headset_mic": {"o"},
    "calendar_month": {"o"},
    "chevron_right": {"o"},
    "expand_more": {"o"},
    "hearing": {"o", "f"},
    "tune": {"o"},
    "wb_sunny": {"o", "f"},
    "arrow_back_ios_new": {"o"},
    "history_edu": {"o"},
    "add_reaction": {"o"},
    "cloud_off": {"o"},
    "wifi_off": {"o"},
    "error": {"o", "f"},
    "more_horiz": {"o"},
    "play_arrow": {"o"},
    "close": {"o"},
}

import re
PATH_RE = re.compile(r'<path d="([^"]+)"')


def fetch(name: str, variant: str) -> str:
    url = BASE.format(name=name, variant=variant)
    with urllib.request.urlopen(url, timeout=20) as r:
        svg = r.read().decode()
    paths = PATH_RE.findall(svg)
    if not paths:
        raise SystemExit(f"no path in {url}")
    return " ".join(paths)


def sha(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:12]


icons, icons_fill = {}, {}
for name, variants in sorted(SPEC.items()):
    icons[name] = fetch(name, f"{name}_24px.svg")
    if "f" in variants:
        icons_fill[name] = fetch(name, f"{name}_fill1_24px.svg")
    print(f"{name}: ok ({'o+f' if 'f' in variants else 'o'})")

module = f"""// createIcon — local Material Symbols (Outlined, weight 400, 24px grid).
// Nguồn: google/material-design-icons (Apache-2.0) — path data nhúng tĩnh,
// không nạp font/icon CDN runtime (PROMPT Stitch §5, ui-rules §1).
// Giữ nguyên silhouette/stroke của biểu tượng gốc; đổi màu bằng currentColor.
// icon-only usage PHẢI truyền label (aria-label tiếng Việt).

const ICONS = {json.dumps(icons, indent=2, sort_keys=True)};

const ICONS_FILL = {json.dumps(icons_fill, indent=2, sort_keys=True)};

import {{ h }} from "../app/dom.js";

/**
 * createIcon({{ name, size = 20, fill = false, className = "", label }})
 * - name: khóa trong ICONS (Material Symbols name).
 * - fill: dùng biến thể FILL 1 khi mẫu thiết kế yêu cầu (mặc định outlined).
 * - label: aria-label cho icon-only; bỏ qua khi icon kèm text (aria-hidden).
 */
export function createIcon({{ name, size = 20, fill = false, className = "", label = null }} = {{}}) {{
  const source = fill ? (ICONS_FILL[name] ?? ICONS[name]) : ICONS[name];
  if (!source) {{
    throw new Error(`Unknown icon: ${{name}}`);
  }}
  const cls = ["fb-icon", className].filter(Boolean).join(" ");
  const attrs = {{
    class: cls,
    viewBox: "0 -960 960 960",
    width: String(size),
    height: String(size),
    "aria-hidden": label ? "true" : "false",
    focusable: "false",
  }};
  if (label) {{
    attrs.role = "img";
    attrs["aria-label"] = label;
  }}
  const svg = h("svg", attrs);
  svg.innerHTML = `<path d="${{source}}"></path>`; // path tĩnh từ ICONS ở trên
  return svg;
}}
"""

out = Path("/home/z/my-project/repo-family-bridge/zalo-mini-app/src/components/icon.js")
out.write_text(module)
print(f"wrote {out} ({out.stat().st_size} bytes)")
manifest = {
    "source": "google/material-design-icons symbols/web (Apache-2.0)",
    "retrieved": "2026-10-14",
    "icons": sorted(icons.keys()),
    "fill_variants": sorted(icons_fill.keys()),
    "sha256_prefixes": {n: sha(d) for n, d in sorted(icons.items())},
}
Path("/tmp/icon-manifest.json").write_text(json.dumps(manifest, indent=2))
print("icon manifest → /tmp/icon-manifest.json")
