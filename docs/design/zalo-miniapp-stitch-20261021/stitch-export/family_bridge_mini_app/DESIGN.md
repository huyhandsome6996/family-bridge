---
name: Family Bridge Mini App
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
  outline: '#89726d'
  outline-variant: '#ddc0ba'
  surface-tint: '#9f402d'
  primary: '#89301e'
  on-primary: '#ffffff'
  primary-container: '#a84733'
  on-primary-container: '#ffdcd5'
  inverse-primary: '#ffb4a4'
  secondary: '#a03f2a'
  on-secondary: '#ffffff'
  secondary-container: '#ff866b'
  on-secondary-container: '#741f0c'
  tertiary: '#6b4600'
  on-tertiary: '#ffffff'
  tertiary-container: '#895c09'
  on-tertiary-container: '#ffdeb4'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdad3'
  primary-fixed-dim: '#ffb4a4'
  on-primary-fixed: '#3e0500'
  on-primary-fixed-variant: '#802918'
  secondary-fixed: '#ffdad2'
  secondary-fixed-dim: '#ffb4a3'
  on-secondary-fixed: '#3d0600'
  on-secondary-fixed-variant: '#812815'
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
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Be Vietnam Pro
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 30px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Be Vietnam Pro
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  title-md:
    fontFamily: Be Vietnam Pro
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
  body-lg:
    fontFamily: Be Vietnam Pro
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
  body-md:
    fontFamily: Be Vietnam Pro
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 24px
  label-lg:
    fontFamily: Be Vietnam Pro
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  label-md:
    fontFamily: Be Vietnam Pro
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  caption:
    fontFamily: Be Vietnam Pro
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  metadata:
    fontFamily: Be Vietnam Pro
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  margin: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.25rem
  space-xl: 1.5rem
---

## Brand & Style

The design system is crafted specifically for mobile touchpoints inside the Zalo Mini App ecosystem, serving high-school students, parents, and caregivers. The brand ethos revolves around warmth, mutual trust, emotional safety, and open interpersonal dialogue.

### Aesthetic & Movement
- **Human Warmth over Clinical Control:** Avoid cold dashboard metrics, invasive tracking metaphors, or medicalized status widgets. The interface feels like stationery and personal notes passed between family members.
- **Editorial Simplicity & Clean Tactility:** Drawing from soft modernism and warm paper-like surfaces. Generous negative space gives breathing room to personal writing, reflection logs, and emotional updates without overwhelming teenage or elderly eyes.
- **Dignified & Age-Agnostic:** Balances youth appeal with adult authority—approachable and sincere without resorting to childish cartoonishness or corporate rigidity.

## Colors

The palette grounds the application in warm earth tones, ensuring clarity, readability, and comfort during emotionally vulnerable exchanges.

### Core Roles
- **Warm Canvas (`#FFF4E8`):** The foundational ambient background. Softens optical glare compared to stark white, creating a comforting space.
- **Paper Surface (`#FFFFFF`):** High-clarity sheet surfaces for cards, reflection inputs, long-form messages, and modal bottom sheets.
- **Accessible Action (`#A84733`):** Primary interactive touchpoints, primary buttons, and key focus states. Guarantees WCAG AA compliant contrast (~5.36:1) against `#FFF4E8` text.
- **Terracotta Brand (`#C65B43`):** Core visual markers, badge highlights, brand iconography, and active accent states.
- **Warm Gold (`#E4AB56`):** Gentle milestones, celebration stars, emotional resonance badges, and secondary highlights.
- **Cocoa Text (`#713D32`):** Primary typographic tone. Replaces harsh true black with an organic deep earth hue, delivering a contrast ratio exceeding 8:1 on warm light backgrounds.
- **Slate Secondary (`#475569`):** Subtitles, meta timestamps, and helper descriptions.
- **Control Border (`#64748B`):** Inputs, neutral dividing lines, and pill outlines, maintaining clear structural boundaries.

### Functional States
- **Success:** Text `#166534`, Tint Surface `#F0FDF4`
- **Warning:** Text `#92400E`, Tint Surface `#FFFBEB`
- **Error:** Text `#B91C1C`, Tint Surface `#FEF2F2`

## Typography

The design system exclusively utilizes **Be Vietnam Pro** for authentic Vietnamese diacritic rendering, optimal x-height, and legibility on mobile screens.

- **Body Text:** Scaled generously at 16px with a relaxed line-height (1.5–1.6) to guarantee effortless readability across both teenage and elder demographics during reflective reading.
- **Headings:** Ranging from 20px to 24px, maintaining clear narrative hierarchy without consuming excessive vertical space on standard 390px-wide devices.
- **Labels & Meta:** Kept between 12px and 16px, prioritizing legibility and tap target clarity over decorative scaling.

## Layout & Spacing

Designed specifically around a mobile baseline of **390 × 844 px** operating within the Zalo Mini App shell.

### Vertical Structure & Insets
- **Zalo Host Safe Header:** Reserve the top 44–48px alongside device status bar insets for native Zalo back buttons, brand title, and action menu anchors.
- **Zalo Bottom Safe Area:** Allocate bottom padding (`calc(env(safe-area-inset-bottom) + 56px)`) to accommodate the 5-item navigation tab bar without clipping on home indicator devices.
- **Horizontal Margins:** Strict 16px (`1rem`) outer screen margin. Content cards and input surfaces span the width within these boundaries to maximize reading and typing real estate.
- **Spacing Rhythm:** Standard 8pt-based rhythm (`0.25rem`, `0.5rem`, `1rem`, `1.25rem`, `1.5rem`) keeps component padding balanced and comfortable.

## Elevation & Depth

To avoid visual tension, depth relies on gentle tonal stacking and whisper-soft diffused shadows rather than heavy elevation models.

### Depth Hierarchy
1. **Base Tier (Ground):** `#FFF4E8` (Warm Canvas).
2. **Surface Tier (Content):** `#FFFFFF` (Paper Surface), bounded by a subtle `1px solid rgba(113, 61, 50, 0.08)` hairline border.
3. **Card Shadow:** `0 2px 8px -2px rgba(113, 61, 50, 0.06), 0 1px 3px 0 rgba(113, 61, 50, 0.04)`. The cocoa-tinted shadow prevents harsh grays on warm surfaces.
4. **Modal Bottom Sheets & Flyouts:** `0 -4px 20px 0 rgba(113, 61, 50, 0.12)`, paired with a tinted backdrop overlay (`rgba(113, 61, 50, 0.4)`).

## Shapes

The design system adheres to a moderate roundedness standard (8px–12px) that balances soft touch friendliness with clean, structured reading cards.

- **Cards & Sheets:** 12px corner radius (`rounded-lg`), softening paper cards while retaining structured margins.
- **Buttons & Interactive Controls:** 10px–12px radius, providing a tactile, pill-adjacent feel that invites interaction.
- **Small Chips & Badges:** Full pill-shaped radius (`9999px`) for contextual tags, emotional check-in pills, and date indicators.
- **Text Inputs:** 10px corner radius to harmonize with button geometry.

## Components

### Buttons
- **Primary Action Button:** 48px height (minimum 44px for accessibility). Background `#A84733`, text `#FFF4E8`, font weight 600. Corner radius 10px–12px. Active press state slightly darkens by 8%.
- **Secondary Button:** 48px height. Surface `#FFFFFF`, border `1.5px solid #C65B43`, text `#C65B43`.
- **Ghost/Tertiary Button:** Transparent background, text `#713D32`, minimum 44px touch container.

### Input Fields & Text Areas
- **Form Labels:** Explicitly placed top-aligned labels rendered in `Cocoa Text` (`#713D32`), 14px–15px font size, weight 600.
- **Input Container:** Min height 48px, background `#FFFFFF`, border `1.5px solid #64748B`, corner radius 10px, padding 12px 16px.
- **Focus State:** Border changes to `#A84733` with a soft 2px outer glow (`rgba(168, 71, 51, 0.2)`).
- **Text Area (Diary & Message):** Generous vertical min-height (120px–160px), line-height 1.6, clean placeholder in `#475569`.

### Cards & Writing Containers
- Standard background `#FFFFFF` over `#FFF4E8` canvas.
- Inner padding: 16px to 20px. Corner radius: 12px. Hairline border `rgba(113, 61, 50, 0.08)`.
- Cards for diary prompts feature a left-accent border in `Terracotta Brand` (`#C65B43`, 3px wide).

### Chips & Filter Tags
- **Selection Chips:** Height 36px, corner radius 9999px. Inactive: `#FFFFFF` surface with `#64748B` border, text `#713D32`. Active: `#A84733` background with `#FFF4E8` text.

### Checkboxes & Radio Controls
- Minimum 24×24px visual box centered within a 44×44px hit-area.
- Checked state: Fill `#A84733` with white checkmark. Border `#64748B` when unselected.

### Navigation Tab Bar (Bottom)
- Fixed bottom container matching device safe area with 5 equal items:
  1. **Trang chủ** (Home)
  2. **Đồng hành** (Companion / Shared Tasks)
  3. **Hộp thư** (Mailbox / Letters)
  4. **Nhật ký** (Reflective Diary)
  5. **Cá nhân** (Profile)
- Background `#FFFFFF` with a top divider line (`rgba(113, 61, 50, 0.1)`).
- Active item: Icon and label in `#A84733`. Inactive item: Icon and label in `#475569`. Label font size: 11px–12px.