---
name: Warm Sanctuary
colors:
  surface: '#fff8f6'
  surface-dim: '#ffcfc5'
  surface-bright: '#fff8f6'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#fff0ee'
  surface-container: '#ffe9e5'
  surface-container-high: '#ffe2dc'
  surface-container-highest: '#ffdad3'
  on-surface: '#360f07'
  on-surface-variant: '#56423e'
  inverse-surface: '#502319'
  inverse-on-surface: '#ffede9'
  outline: '#8a726c'
  outline-variant: '#ddc0ba'
  surface-tint: '#a03f2a'
  primary: '#9d3d27'
  on-primary: '#ffffff'
  primary-container: '#bd543d'
  on-primary-container: '#fffbff'
  inverse-primary: '#ffb4a3'
  secondary: '#9f402d'
  on-secondary: '#ffffff'
  secondary-container: '#ff8a72'
  on-secondary-container: '#762212'
  tertiary: '#7e5300'
  on-tertiary: '#ffffff'
  tertiary-container: '#9b6b1b'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdad2'
  primary-fixed-dim: '#ffb4a3'
  on-primary-fixed: '#3d0600'
  on-primary-fixed-variant: '#812815'
  secondary-fixed: '#ffdad3'
  secondary-fixed-dim: '#ffb4a4'
  on-secondary-fixed: '#3e0500'
  on-secondary-fixed-variant: '#802918'
  tertiary-fixed: '#ffddb2'
  tertiary-fixed-dim: '#f7bc65'
  on-tertiary-fixed: '#291800'
  on-tertiary-fixed-variant: '#624000'
  background: '#fff8f6'
  on-background: '#360f07'
  surface-variant: '#ffdad3'
typography:
  headline-lg:
    fontFamily: Be Vietnam Pro
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: '0'
  headline-lg-mobile:
    fontFamily: Be Vietnam Pro
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: '0'
  headline-md:
    fontFamily: Be Vietnam Pro
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: '0'
  headline-sm:
    fontFamily: Be Vietnam Pro
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: '0'
  body-lg:
    fontFamily: Be Vietnam Pro
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 24px
    letterSpacing: '0'
  body-md:
    fontFamily: Be Vietnam Pro
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: '0'
  body-sm:
    fontFamily: Be Vietnam Pro
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: '0'
  label-lg:
    fontFamily: Be Vietnam Pro
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: '0'
  label-md:
    fontFamily: Be Vietnam Pro
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: '0'
  label-sm:
    fontFamily: Be Vietnam Pro
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: '0'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-mobile: 0.75rem
  margin: 1rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style

### Personality & Emotional Atmosphere
The design system establishes a sanctuary for intergenerational understanding between Vietnamese high school students and their parents within a focused mobile context. The emotional atmosphere is intentionally grounded, warm, reassuring, and respectful of personal boundaries. It deliberately rejects cold clinical detachment, high-stress gamification (such as streak counters or social pressure rankings), and loud visual clutter. Every screen delivers psychological safety, emotional warmth, and unconditional respect for privacy.

### Visual Style
The aesthetic follows a modern, warm, human-centered minimalism specifically engineered for lightweight mobile performance (Zalo Mini App / React / standard 390px viewports):
- **Organic Warm Canvas:** Built upon a warm biscuit cream base that mimics tactile parchment and reduces visual fatigue during emotional reflection.
- **Crisp Structured Surfaces:** Pure white container cards create clarity and structural separation without needing harsh shadows or complex 3D claymorphism.
- **Privacy-First Clarity:** Explicit boundary indicators ("Chỉ mình bạn", "Đã chia sẻ", "Cần xem lại") ensure users always feel in control of their disclosures.
- **Restrained Motion:** Micro-interactions remain swift (150–200ms) with zero distracting loops or sensory overload.

## Colors

The color system clearly divides visual brand identity, accessible interactive controls, and semantic privacy cues.

### Palette Roles
- **Primary (`#C65B43` - Terracotta Clay):** Serves as the primary brand identity token, used for brand marks, logotypes, gentle dialogue emblem illustrations, and key narrative focal points.
- **Secondary / Action (`#A84733` - Deep Rust Clay):** The primary interactive driver. Delivers an accessible 5.36:1 contrast ratio against the warm biscuit background. Applied to primary CTA buttons, active state indicators, and focus outlines.
- **On-Action (`#FFF4E8` - Warm Biscuit):** High-contrast readable foreground text and glyphs rendered over `#A84733` action fills.
- **Tertiary / Accent (`#E4AB56` - Honey Amber):** Gentle decorative highlights, milestone badges, and soft highlights. Paired exclusively with dark text (`#713D32`).
- **Neutral Canvas (`#FFF4E8` - Warm Biscuit Cream):** Default global background canvas across the entire application.
- **Neutral Surface (`#FFFFFF` - Pure Cloud White):** Content containers, cards, sheets, and form surfaces.
- **Neutral Text (`#713D32` - Warm Chestnut Brown):** Primary typographic tone. Reaches an 8.01:1 contrast ratio against the cream background while feeling gentler and warmer than pure pitch-black.
- **Secondary Text (`#475569` - Slate Neutral):** Subtitles, timestamps, helper text, and secondary details. Never washed out or reduced to unreadable opacities.
- **Control Border (`#64748B` - Slate Neutral):** Structural borders for input controls, outlines, and inactive states.

### Semantic Status Colors
Functional feedback states never label raw adolescent emotions as "good" or "bad". Colors convey system operation and privacy state:
- **Success (`#166534` on `#F0FDF4`):** Confirmed states ("Đã lưu nháp", "Đã gửi", "Đã chia sẻ").
- **Warning / Review Needed (`#92400E` on `#FFFBEB`):** Gentle revision alerts, cooling-off indicators, and "Cần xem lại".
- **Error / Destructive (`#B91C1C` on `#FEF2F2`):** Form alerts, draft revocation, and crisis triggers. Accompanied by clear recovery steps.
- **Info (`#1E40AF` on `#EFF6FF`):** Contextual explanations, guidance, and consent notes.

## Typography

### Font Selection & Language Support
The typography is centered on **Be Vietnam Pro** (with fallbacks to **Inter** and native system sans-serif fonts). It offers full native rendering for complex Vietnamese diacritics and tonal marks without vertical clipping or awkward glyph shifts.

### Rules & Hierarchy
- **Body Base Size (16px):** Standard body and form inputs utilize 16px to prevent iOS Safari and webview auto-zooming on focus.
- **Line Heights:** Set comfortably between 1.4 and 1.5 to maintain an unhurried, readable rhythm when reviewing personal reflections.
- **Letter Spacing:** Standard neutral tracking (`0`). Uppercase transformations and letter-spacing squishing are avoided to keep multi-accented Vietnamese words legible.
- **Graceful Wrapping:** Vietnamese compounds (e.g., "Đang tạm dừng", "Lắng nghe") must wrap naturally without truncation or automated text downsizing.

## Layout & Spacing

### Layout Model
The layout adopts a mobile-first, fluid single-column flow optimized specifically for a 390px baseline viewport (Zalo Mini App runtime). Content conforms to a fluid container scaling between 320px and 430px.

### Breakpoints & Safe Areas
- **Baseline Viewport:** 390px width.
- **Compact Viewport (<= 360px):** Gutter shifts down to `gutter-mobile` (12px / 0.75rem) to preserve content width.
- **Safe Area Insets:** Integrated with `env(safe-area-inset-top)` for top header navigation and `env(safe-area-inset-bottom)` for bottom navigation and action sheets.
- **Scroll Buffer:** A mandatory bottom clearance padding of 96px (`pb-24`) is required on all scrollable screens so floating CTAs or fixed bars do not hide content.

### Spacing Scale & Rhythm
Built on a strict 4px/8px modular cadence:
- `space-xs` (4px): Micro-spacing between icon and badge label.
- `space-sm` (8px): Gaps between inline buttons, tags, or segmented tabs.
- `space-md` (12px): Internal card group spacing and compact list row gaps.
- `space-lg` (16px): Standard container padding and standard card gutters.
- `space-xl` (24px): Structural gaps between major content sections and modular cards.

## Elevation & Depth

The design uses a clean, flat-layered aesthetic to avoid sensory overload. Heavy drop shadows, skeuomorphic bevels, and blurry glass effects are avoided.

### Hierarchy & Surfaces
- **Foundation Layer (Level 0):** The global canvas in warm biscuit cream (`#FFF4E8`).
- **Surface Layer (Level 1):** Solid white (`#FFFFFF`) card containers with a 1px subtle boundary (`#E5E7EB` or `#E2E8F0`) and an ambient, low-contrast shadow: `0 2px 8px rgba(113, 61, 50, 0.04)`. The shadow is tinted with warm chestnut tone rather than cold black.
- **Raised Interactive Layer (Level 2):** Dropdown popovers, recipient pickers, and tooltips use a soft warm shadow: `0 4px 16px rgba(113, 61, 50, 0.08)`.
- **Overlay & Sheets (Level 3):** Modal bottom sheets and cooling-off dialogs rest above a 40% warm dimmed backdrop (`rgba(113, 61, 50, 0.4)`), preserving visual grounding without cold detachment.

## Shapes

The geometric personality balances soft friendliness with structured clarity:
- **Interactive Controls (8px):** Buttons, text inputs, textareas, and form selectors use a consistent 8px radius (`rounded-md`), offering clear clickable boundaries.
- **Cards & Modules (12px):** Activity blocks, journal entry containers, and information panels use a 12px radius (`rounded-lg`) to balance warmth and layout stability.
- **Bottom Sheets & Dialogs (16px):** Modals and bottom sheets use 16px rounded top corners (`rounded-t-2xl`).
- **Pill Elements (9999px):** Privacy badges, status chips, and cooldown tags use fully rounded pill geometry (`rounded-full`) to contrast against structural card shapes.

## Components

### Buttons
- **Touch Targets:** Minimum height of 48px on mobile viewports for primary actions; 44px for secondary and tertiary triggers.
- **Primary Action Button:** Solid `#A84733` fill with `#FFF4E8` text. 8px border radius. Active/press state darkens to `#8F3B2A` (or 0.92 opacity). 
- **Secondary Outlined Button:** `#FFFFFF` background, 1.5px `#64748B` border, `#713D32` text.
- **Ghost / Text Button:** Transparent background, `#713D32` or `#A84733` text with clear touch area.
- **Safety Invariant:** Disabling "Chia sẻ" (Share) or "Gửi" (Send) must never disable or hide "Hủy" (Cancel) or "Tìm trợ giúp" (Get Help).

### Form Inputs & Textareas
- **Input Fields:** `#FFFFFF` fill, 1px `#64748B` border, 8px radius, 12px vertical by 16px horizontal internal padding. Text rendered in `#713D32` (16px).
- **Labels:** Persistent, visible top labels in `#713D32` (14px medium). Never rely solely on placeholder text for labeling.
- **Focus State:** 2px solid `#A84733` focus border with 1px outline offset.
- **Error State:** 1.5px `#B91C1C` border with inline explanation text placed immediately below. Inputs must retain user content during validation failures.

### Privacy Status Chips (Badges)
Pill-shaped containers (`rounded-full`, 9999px) with explicit icon and text:
- **"Chỉ mình bạn" (Private):** `#F1F5F9` background, `#475569` slate text, lock glyph.
- **"Đã chia sẻ" (Shared):** `#F0FDF4` background, `#166534` emerald text, checkmark glyph.
- **"Cần xem lại" (Review Needed):** `#FFFBEB` background, `#92400E` warm ochre text, alert/refresh glyph.

### Checkboxes & Radio Buttons
- **Touch Size:** 44×44px click target bounding box; actual selector symbol sized at 20×20px.
- **Selection State:** Active fill `#A84733` with `#FFF4E8` check/dot mark. Unchecked state uses 1.5px `#64748B` border over `#FFFFFF`.

### Cards & Reflection Containers
- **Standard Card:** `#FFFFFF` background, 12px border radius, 16px internal padding, paired with a 1px soft hairline border or warm ambient elevation (`rgba(113, 61, 50, 0.04)`).
- **Emergency Listening Card ("Con cần được lắng nghe"):** High-priority card with `#FFFFFF` background, 12px radius, and a 1.5px `#C65B43` boundary border. Houses direct hotlines and counselor contact triggers.

### Cooling-Off Pause Indicator
- Dedicated reflection component displaying a non-intrusive 300-second pause state ("Đang tạm dừng 5 phút để bạn cân nhắc"). Features an amber-tinted progress indicator, an instant cancellation button, and an immediate confirmed release trigger.