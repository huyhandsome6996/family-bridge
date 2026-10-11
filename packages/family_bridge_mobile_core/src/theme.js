// Brand tokens (DEC-07 chốt 2026-10-10) + functional semantic colors.
// Not mood/color coding of emotions; contrast pairs per brand-identity.md:
//   #713D32 on #FFF4E8 = 8.01:1 (body OK)
//   #FFF4E8 on #A84733 = 5.36:1 (action OK)
//   #0F172A on #E4AB56 = 8.72:1 (accent text OK)

export const BRAND = Object.freeze({
  primary: "#C65B43",
  accent: "#E4AB56",
  background: "#FFF4E8",
  text: "#713D32",
  surface: "#FFFFFF",
});

export const FUNCTIONAL = Object.freeze({
  action: "#A84733",
  onAction: "#FFF4E8",
  success: "#166534",
  successBg: "#F0FDF4",
  warning: "#92400E",
  warningBg: "#FFFBEB",
  error: "#B91C1C",
  errorBg: "#FEF2F2",
  info: "#1E40AF",
  infoBg: "#EFF6FF",
  border: "#64748B",
  focus: "#A84733",
  textSecondary: "#475569",
});

export const SPACING = Object.freeze({ s4: 4, s8: 8, s12: 12, s16: 16, s24: 24, s32: 32 });
export const TOUCH = Object.freeze({ min: 44, target: 48 });
