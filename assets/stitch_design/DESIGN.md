---
name: Twilight Mauve Glass
colors:
  surface: '#18111a'
  surface-dim: '#18111a'
  surface-bright: '#3f3641'
  surface-container-lowest: '#130c15'
  surface-container-low: '#201923'
  surface-container: '#251d27'
  surface-container-high: '#2f2731'
  surface-container-highest: '#3b323c'
  on-surface: '#eddeec'
  on-surface-variant: '#d2c2c7'
  inverse-surface: '#eddeec'
  inverse-on-surface: '#362e38'
  outline: '#9b8d91'
  outline-variant: '#4f4448'
  surface-tint: '#eab9cd'
  primary: '#f1c0d4'
  on-primary: '#472635'
  primary-container: '#d4a5b8'
  on-primary-container: '#5d3a4a'
  inverse-primary: '#7a5364'
  secondary: '#ffb4a7'
  on-secondary: '#551f17'
  secondary-container: '#74372d'
  on-secondary-container: '#f7a394'
  tertiary: '#d3c8e6'
  on-tertiary: '#342d44'
  tertiary-container: '#b7adca'
  on-tertiary-container: '#484059'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffd8e7'
  primary-fixed-dim: '#eab9cd'
  on-primary-fixed: '#2f1220'
  on-primary-fixed-variant: '#603c4c'
  secondary-fixed: '#ffdad4'
  secondary-fixed-dim: '#ffb4a7'
  on-secondary-fixed: '#3a0b05'
  on-secondary-fixed-variant: '#71352b'
  tertiary-fixed: '#e9ddfc'
  tertiary-fixed-dim: '#ccc2e0'
  on-tertiary-fixed: '#1e182e'
  on-tertiary-fixed-variant: '#4a435b'
  background: '#18111a'
  on-background: '#eddeec'
  surface-variant: '#3b323c'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 40px
    fontWeight: '600'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 30px
    fontWeight: '600'
    lineHeight: 38px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '500'
    lineHeight: 30px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '500'
    lineHeight: 26px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.03em
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  gutter: 1.25rem
  margin: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.25rem
---

## Brand & Style

This design system blends **Frosted Glassmorphism** with an **Ethereal Twilight Minimalist** aesthetic, derived directly from cinematic avatar customization suites and ambient next-generation interfaces. It evokes intimacy, refined precision, and atmospheric calm. 

The visual personality balances warm, soft-lit dusk with high-tech tactile controls:
- **Atmospheric & Ethereal:** Surfaces breathe through translucent, frosted glass layers that reflect soft, warm twilight gradients rather than harsh flat backdrops.
- **Sculpted & Tactile:** Interactive controls, radial sliders, and segment selectors feel smoothly machined from polished resin or frosted polycarbonate.
- **Intimate Warmth:** Violet-gray undercurrents, warm plum undertones, and subtle peach/coral glows remove the cold sterility often found in modern software.

Target audiences include creative digital artists, interactive character designers, luxury lifestyle technology users, and high-end creative computing applications.

## Colors

The palette is tuned around a dark, warm twilight baseline where ambient glows and translucent glass tiers create natural depth:

- **Primary (`#D4A5B8` - Dusky Mauve / Soft Rose):** Used for focal interactive states, primary focus rings, active indicator needles, and illuminated highlights.
- **Secondary (`#E08F81` - Warm Peach Coral):** Provides warm luminescence for active accent selections, warm tone sliders, and high-priority interactive badges.
- **Tertiary (`#B1A7C4` - Dusty Lavender):** Functions as secondary label highlights, unselected interactive tracks, and subtle icons.
- **Neutral Surface & Background (`#2B232D` - Warm Plum / Violet-Gray):** Forms the foundational deep atmosphere. Canvas backdrops transition through an ambient radial gradient from deep plum-tinted charcoal (`#1F1A22`) to soft illuminated mauve (`#3D323F`).
- **Glass Panel Surface:** Translucent white overlays `rgba(255, 255, 255, 0.07)` to `rgba(255, 255, 255, 0.12)` accompanied by soft interior borders `rgba(255, 255, 255, 0.18)` and `backdrop-filter: blur(28px)`.
- **Text & Icon Tones:** High-contrast text uses soft porcelain (`#F7EFF3`), secondary metadata uses muted dusty violet (`#A69CA8`), and inactive track lines leverage translucent muted plum (`rgba(255, 255, 255, 0.2)`).

## Typography

**Plus Jakarta Sans** is utilized throughout all hierarchy levels to create a clean, modern, and humanized presence that harmonizes with softly rounded forms and liquid translucent containers.

- **Weight Disciplines:** Display and primary titles rely on `600` (SemiBold) for clean presence without harsh black weights. Body copy remains at `400` (Regular) for airy legibility over frosted backdrops. Controls, section headers, and micro-labels leverage `500` or `600`.
- **Legibility Over Translucency:** Whenever labels overlay semi-transparent glass or twilight gradients, apply slight text contrast shadows (`0 1px 2px rgba(18, 13, 20, 0.4)`) or enforce sufficient tint difference to guarantee WCAG AA conformance.
- **Numbers & Metrics:** Radial arc percentages and slider data counters maintain tabular figures (`font-variant-numeric: tabular-nums`) to prevent layout jitter during dynamic adjustments.

## Layout & Spacing

The interface employs a contextual **Dock & Canvas Architecture**, pairing a centralized hero stage (viewport for avatar or canvas rendering) with floating peripheral glass control panels:

- **Grid & Panels:** Desktop layouts split into bilateral floating tool modules (280px–360px width) framing the focal stage, anchored with a `2rem` outer canvas boundary. Floating panels maintain a `1.25rem` gutter between module blocks.
- **Internal Spatial Rhythm:** Card paddings maintain a strict `1.25rem` to `1.5rem` (`space-lg`) perimeter, with internal micro-controls spaced at `0.5rem` (`space-sm`) and section item stacks at `1rem` (`space-md`).
- **Responsive Adaptations:**
  - **Desktop (>1024px):** Symmetrical glass panels hover laterally over the ambient canvas with a centralized bottom floating dock for quick actions.
  - **Tablet (768px - 1023px):** Panels consolidate into a unified slide-out glass drawer or collapsable side rail with `1.5rem` outer margins.
  - **Mobile (<768px):** Lateral panels transform into an interactive bottom sheet modal with smooth snap points (`40vh` and `85vh`), utilizing `1rem` safe margins.

## Elevation & Depth

Visual hierarchy is communicated through **Multi-Tiered Frosted Glassmorphism** and **Ambient Twilight Illumination** rather than structural drop shadows:

1. **Ambient Canvas (Base Tier):** A rich, radial-lit dark plum gradient background with subtle central light diffusion (`#3A2F3D` center fading outwards to `#1A151D`).
2. **Frosted Glass Containers (Tier 1):** Floating cards and control groups feature `backdrop-filter: blur(28px) saturate(140%)`, background fills of `rgba(255, 255, 255, 0.08)`, and a pristine sub-pixel border of `1px solid rgba(255, 255, 255, 0.16)`. Ambient shadow: `0 12px 40px -10px rgba(15, 10, 20, 0.45)`.
3. **Elevated Floating Controls & Docks (Tier 2):** Bottom toolbars and active popup pickers raise density with `backdrop-filter: blur(36px)`, filled with `rgba(255, 255, 255, 0.14)` and illuminated highlights: `inset 0 1px 1px 0 rgba(255, 255, 255, 0.3)`.
4. **Active Illuminations & Radial Glows (Tier 3):** Focus states, active swatch halos, and slider thumbs emit a delicate peach-coral diffuse glow: `box-shadow: 0 0 16px 2px rgba(224, 143, 129, 0.45), 0 2px 8px rgba(0, 0, 0, 0.3)`.

## Shapes

The shape system adopts a **Pill-shaped (Level 3)** geometry, reinforcing the organic, soft-focus quality of twilight glass:

- **Containers & Glass Panels:** Rounded corners default to `1.5rem` (24px) up to `2rem` (32px), creating smooth, pebble-like glass enclosures.
- **Interactive Controls & Buttons:** Buttons, chips, navigation toggles, and floating dock bars use complete pill radii (`rounded-full` / `9999px`).
- **Input Indicators & Swatches:** Color swatches and circular avatar selector tokens are geometric circles (`50%`), surrounded by concentric soft-ring indicators when active.
- **Sliders & Gauges:** Slider tracks have rounded ends matching their height, and circular gauges use smoothly terminated caps.

## Components

### Buttons & Docks
- **Primary Pill Action:** High-illumination porcelain-white background (`#FFFFFF`) with dark plum text (`#2B232D`), rounded fully (`rounded-full`), padded `0.625rem 1.5rem`. Subtle peach hover glow.
- **Glass Secondary Button:** Translucent white surface `rgba(255, 255, 255, 0.12)` with `1px solid rgba(255, 255, 255, 0.22)`, soft mauve icon or text.
- **Bottom Tool Dock:** A floating pill capsule hosting icon-only actions with frosted backdrop blur (`blur(32px)`), separated by hairline dividers `rgba(255, 255, 255, 0.1)`.

### Sliders & Arc Gauges
- **Radial Voice Arc:** Frosted background ring `rgba(255, 255, 255, 0.1)` with a glowing stroke in dusty mauve or porcelain white (`rgba(255, 255, 255, 0.85)`). Center badge displays tabular metric values (`64%`) inside a floating translucent pill.
- **Linear Parameter Sliders:** Slim 4px track in `rgba(255, 255, 255, 0.15)` with filled value track in solid white/mauve, accompanied by a glowing 14px circular thumb. Left-aligned parameter icon and right-aligned numeric readouts.

### Swatches & Selector Chips
- **Palette Swatches (Skin, Eyes, Lips):** Circular tokens (28px - 36px diameter). Selected swatch is wrapped in an offset concentric glow ring (`outline: 2px solid #E08F81; outline-offset: 3px`).
- **Feature Chips:** Segmented pill selectors with subtle horizontal scrolling on compact viewports.

### Cards & Control Modules
- Frosted glass containers encapsulating grouped controls (e.g., "Face form", "Eyes color", "Lip color"). Each card displays a delicate uppercase or title-case label in dusty lavender (`#B1A7C4`), followed by comfortable `space-md` distributed controls.
- Hairline top edge highlight: `linear-gradient(90deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.05) 100%)`.

### Inputs & Text Fields
- Recessed pill fields with background `rgba(0, 0, 0, 0.18)` and `1px solid rgba(255, 255, 255, 0.1)`. Focus state reveals a smooth border transition to primary mauve (`#D4A5B8`) with a soft 4px exterior glow.