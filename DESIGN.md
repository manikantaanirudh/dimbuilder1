---
name: OneStream Dimension Builder
description: A precision metadata workbench for OneStream XF dimensions.
colors:
  navy-deep: "#00204A"
  navy-midnight: "#001528"
  navy-wash: "#e6edf4"
  gold-brass: "#C5A961"
  gold-dark: "#a88d45"
  gold-wash: "#fdf6e3"
  slate-bg: "#f8f9fb"
  surface-white: "#ffffff"
  surface-subtle: "#f4f6f9"
  surface-muted: "#edf1f5"
  text-primary: "#00204A"
  text-muted: "#4b5c6f"
  text-muted-strong: "#3d4f63"
  border-default: "#dce3eb"
  border-strong: "#b8c4d0"
  signal-warning: "#dd5b00"
  signal-danger: "#e03131"
  signal-success: "#1aae39"
  signal-info: "#0075de"
typography:
  display:
    fontFamily: "Montserrat, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0"
  body:
    fontFamily: "Montserrat, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Montserrat, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.03em"
  mono:
    fontFamily: "SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.45
rounded:
  sm: "10px"
  md: "16px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.navy-deep}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "7px 11px"
  button-primary-hover:
    backgroundColor: "{colors.navy-midnight}"
  button-secondary:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.sm}"
    padding: "7px 11px"
  button-danger:
    backgroundColor: "{colors.signal-danger}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "7px 11px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-muted-strong}"
    rounded: "{rounded.sm}"
    padding: "7px 11px"
  input-default:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.sm}"
    padding: "8px 10px"
  chip-status:
    backgroundColor: "{colors.surface-subtle}"
    textColor: "{colors.text-muted-strong}"
    rounded: "{rounded.pill}"
    padding: "3px 8px"
---

# Design System: OneStream Dimension Builder

## 1. Overview

**Creative North Star: "The Control Room"**

A precision instrument for structured data work. The interface is clean, confident, and engineered. Every surface communicates clearly; nothing is decorative. The system earns trust through visual precision: aligned grids, consistent token usage, and predictable interaction patterns.

This is not a consumer app; it's a professional tool that respects the domain expertise of OneStream consultants and finance architects. The design is dense without being chaotic, modern without chasing trends, and quiet without being lifeless.

The system explicitly rejects playful SaaS energy, legacy enterprise gray-on-gray, ultra-minimal whitespace waste, neon/cyberpunk dark aesthetics, and generic Bootstrap/Material templates. It occupies a narrow lane: technical confidence with structured warmth from the brass-gold accent.

**Key Characteristics:**
- Information density served by structured whitespace, not by cramming
- Single-family typography (Montserrat) carrying all hierarchy through weight and scale
- Restrained color strategy: navy + tinted neutrals, with brass-gold accent at less than 10%
- Gently layered elevation conveying surface relationships without dramatic depth
- Tactile, engineered components that feel precise and responsive

## 2. Colors

A restrained palette grounded in deep navy and warm neutrals, with a distinctive brass-gold accent.

### Primary
- **Navy Deep** (#00204A): The primary brand color. Used for headings, primary button fills, and text. Conveys authority and precision.
- **Navy Midnight** (#001528): Hover/pressed state for primary actions. Deeper, more grounded.
- **Navy Wash** (#e6edf4): Soft primary tint for subtle backgrounds, badges, and selected states.

### Secondary
- **Brass Gold** (#C5A961): The sole accent color. Used exclusively for the brand mark, accent indicators, and selected emphasis. Carries warmth without playfulness.
- **Gold Dark** (#a88d45): Hover state for gold accents.
- **Gold Wash** (#fdf6e3): Soft gold tint for subtle accent backgrounds.

### Neutral
- **Slate Background** (#f8f9fb): Page-level background. Cool-tinted, never pure white.
- **Surface White** (#ffffff): Card/panel surface. The lightest layer.
- **Surface Subtle** (#f4f6f9): Secondary surfaces (sidebars, hover states). Slightly cooler than white.
- **Surface Muted** (#edf1f5): Tertiary surfaces (loading skeletons, disabled backgrounds).
- **Text Primary** (#00204A): Body text. Same as primary; navy doubles as text.
- **Text Muted** (#4b5c6f): Secondary text, labels, descriptions.
- **Text Muted Strong** (#3d4f63): Slightly more prominent secondary text.
- **Border Default** (#dce3eb): Panel borders, dividers. Subtle, cool-tinted.
- **Border Strong** (#b8c4d0): Input borders, stronger separators.

### Signal Colors
- **Warning** (#dd5b00): Export blocked, attention needed. Warm orange.
- **Danger** (#e03131): Errors, destructive actions. Clear red.
- **Success** (#1aae39): Clean validation, healthy states. Green.
- **Info** (#0075de): Informational badges, links. Blue.

Each signal color has a `-soft` background tint and a `-border` token for bordered containers.

### Named Rules
**The Restraint Rule.** Brass Gold appears on less than 10% of any given surface. Its rarity is the point. Primary actions are navy, not gold; gold is reserved for brand presence and selected emphasis.

## 3. Typography

**Display/Body Font:** Montserrat (with Inter, system-ui fallback)
**Monospace Font:** SFMono-Regular, Consolas, Liberation Mono, Menlo

**Character:** A single geometric sans-serif carries the entire interface through weight contrast (400 regular, 700 bold, 750 extra-bold, 800 ultra-bold). The font is wide and confident; hierarchy comes from scale and weight alone, never from switching families.

### Hierarchy
- **Display** (700, 24px, 1.2): Page titles (h1). Project name, workspace name.
- **Headline** (700, 16px, 1.25): Section headings (h2, h3). Panel titles, list headings.
- **Body** (400, 14px, 1.5): Paragraph text, descriptions, help text. Implicit everywhere.
- **Label** (700, 12px, 1.2, 0.03em tracking, uppercase): Section kickers, metric labels, form labels. Small but assertive.
- **Mono** (400, 12px, 1.45): Code blocks, JSON preview, blueprint drafts. Monospace for structured data.

### Named Rules
**The Single Voice Rule.** One font family everywhere. No display/body pairing. Montserrat carries headings, buttons, labels, and body text. Hierarchy is weight and size, not family contrast.

## 4. Elevation

Gently layered. Surfaces have ambient shadows that create a sense of physical layering without dramatic depth. Panels and cards float slightly above the background; modals float above everything.

### Shadow Vocabulary
- **Shadow SM** (`0 1px 2px rgba(0, 0, 0, 0.05)`): Subtle baseline. Cards at rest, input borders.
- **Shadow MD** (`0 4px 6px rgba(0, 0, 0, 0.07)`): Slight lift. Hovered cards, dropdown menus.
- **Shadow LG** (`0 10px 15px rgba(0, 0, 0, 0.08)`): Modal elevation. Popovers, floating panels.
- **Shadow XL** (`0 20px 25px rgba(0, 0, 0, 0.1)`): Maximum elevation. Rare; only for critical overlays.

### Named Rules
**The Ambient Rule.** Shadows are ambient, never crisp. Black opacity never exceeds 10% in light mode. In dark mode, shadows deepen (20-35% opacity) but remain diffuse. No hard drop-shadows; no inset shadows for decoration.

## 5. Components

Tactile and engineered. Every interactive element feels precise and responsive. Components communicate state through border, background, and subtle motion; never through color alone.

### Buttons
- **Shape:** Gently curved edges (10px radius)
- **Primary:** Navy fill (#00204A), white text, 13px bold. Used for main actions (New Project, Validate, Export).
- **Hover:** Darkens to midnight (#001528). Transition: 160ms ease on background-color and border-color.
- **Focus:** 2px outline, offset 2px, primary at 72% opacity via color-mix.
- **Secondary:** White fill, navy text, border-strong outline. For supporting actions.
- **Ghost:** Transparent background, muted-strong text, no border. For tertiary actions.
- **Danger:** Red fill (#e03131), white text. For destructive actions only.
- **Disabled:** 50% opacity, pointer-events none. Universal across variants.

### Status Badges
- **Shape:** Pill (999px radius), 12px bold text
- **Variants:** Neutral (subtle bg), success (green tint), warning (orange tint), danger (red tint), info (blue tint)
- **Role:** Inline status communication. Always paired with text, never standalone color.

### Cards / Containers
- **Corner Style:** Gently curved (16px radius for panels, 10px for inner elements)
- **Background:** Surface white (#ffffff) over slate background
- **Shadow Strategy:** SM at rest; ambient layering establishes hierarchy
- **Border:** 1px solid border-default. Subtle, cool-tinted.
- **Internal Padding:** 16px (--space-md). Consistent across panels.

### Inputs / Fields
- **Style:** 1px border-strong border, surface-white background, 10px radius
- **Height:** 34px minimum (38px for selects in forms)
- **Focus:** Border shifts to primary; 3px box-shadow glow at 8% opacity
- **Disabled:** Surface-muted background, muted-strong text, not-allowed cursor

### Navigation
- **Sidebar:** Surface-subtle background, vertical nav items with padding 8px 12px
- **Active state:** Bold text, no background shift (state communicated by weight)
- **Secondary nav:** Horizontal button row below toolbar, active item bold + underlined
- **Search:** Icon + input in a bordered container, focus-within ring on container

### Score Ring (Signature Component)
An animated SVG ring gauge (88px featured, 64-120px range). Ease-out cubic animation fills from 0 to score over 800ms. Color shifts by threshold: green above 80, warning 50-80, danger below 50. Respects `prefers-reduced-motion`.

## 6. Do's and Don'ts

### Do:
- **Do** use the spacing token scale (4/8/16/24/32/48px) for all gaps and padding. No arbitrary values.
- **Do** use `gap` for sibling spacing. Eliminate margin-collapse hacks.
- **Do** use the single Montserrat family with weight contrast (400/700/750/800) for all hierarchy.
- **Do** use `aria-live="polite"` on all inline status messages that update asynchronously.
- **Do** add `title` tooltips on metric labels to explain what each measurement represents.
- **Do** use `<details>` for progressive disclosure of secondary tools and advanced options.
- **Do** persist user preferences (theme, disclosure state) in localStorage.
- **Do** provide keyboard shortcuts for frequent actions (e.g., `/` to focus search).

### Don't:
- **Don't** use playful SaaS energy: no confetti, emoji-heavy UI, rounded bubbly cards, or startup aesthetics.
- **Don't** use legacy enterprise patterns: no gray-on-gray density, tiny fonts, 2005-era tab bars, or overwhelming form grids.
- **Don't** waste space with ultra-minimal whitespace. Users work with large datasets; density matters.
- **Don't** use neon accents, gradients-for-decoration, or dark-mode-as-aesthetic. Dark theme serves function.
- **Don't** use Bootstrap defaults, Material cookie-cutter components, or generic admin panel templates.
- **Don't** use `border-left` or `border-right` greater than 1px as a colored accent stripe on cards or alerts.
- **Don't** use gradient text (`background-clip: text` with gradients).
- **Don't** use glassmorphism or blur effects decoratively.
- **Don't** use identical card grids (same-sized cards with icon + heading + text repeated).
- **Don't** use `cursor: pointer` on non-interactive elements. If it looks clickable, it must be clickable.
- **Don't** use `transition: all`. Always specify exact properties.
- **Don't** use hardcoded hex colors outside the token system. Every color must come from a CSS variable.
- **Don't** use em dashes in UI copy. Use commas, colons, semicolons, or periods.
