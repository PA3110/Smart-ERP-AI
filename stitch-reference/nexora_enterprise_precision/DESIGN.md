---
name: Nexora Enterprise Precision
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#44474c'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#75777d'
  outline-variant: '#c5c6cd'
  surface-tint: '#525f75'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#0e1c2f'
  on-primary-container: '#77849c'
  inverse-primary: '#bac7e1'
  secondary: '#006398'
  on-secondary: '#ffffff'
  secondary-container: '#5bb8fe'
  on-secondary-container: '#00476e'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#002113'
  on-tertiary-container: '#009668'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d6e3fe'
  primary-fixed-dim: '#bac7e1'
  on-primary-fixed: '#0e1c2f'
  on-primary-fixed-variant: '#3a475c'
  secondary-fixed: '#cce5ff'
  secondary-fixed-dim: '#93ccff'
  on-secondary-fixed: '#001d31'
  on-secondary-fixed-variant: '#004b73'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  headline-xl:
    fontFamily: Hanken Grotesk
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 34px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.015em
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Hanken Grotesk
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-lg:
    fontFamily: Hanken Grotesk
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 18px
    letterSpacing: 0.01em
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.04em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-mobile: 0.5rem
  margin: 1.5rem
  margin-mobile: 0.75rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style

This design system serves high-density operational workflows, enterprise resource planning, and mission-critical supply orchestration. Built around the ethos of transforming complex enterprise demand into immediate, verified action, the aesthetic balances corporate authority with precision-engineered agility.

### Visual Style & Direction
- **Style Mix:** High-Density Corporate Modernism with Technical Micro-Surfaces.
- **Tone:** Authoritative, vigilant, intelligent, and unshakeable.
- **Core Attributes:** Ultra-crisp data displays, strict optical hierarchy, and rapid status legibility under extreme cognitive load.
- **Emotional Response:** Inspires decisive confidence, clarity of operational truth, and frictionless operational control across desktop and mobile form factors.

## Colors

The palette employs deep naval infrastructure tones paired with high-frequency signal accents. It prioritizes semantic rigor, ensuring operators distinguish routine operations from critical supply anomalies instantly.

### Palette Architecture
- **Primary Deep Navy (`#0B192C`):** Base structural anchor. Dictates persistent shell headers, top-tier navigation, primary data labels, and commanding button states.
- **Slate Supporting Navy (`#1E293B`):** Secondary structural boundary tone, active table headers, and elevated grouping containers.
- **Electric Precision Blue (`#0284C7` & `#2563EB`):** Dynamic focal accents, active interactive selections, dynamic trend lines, and focused workflows.
- **Emerald Affirmation (`#10B981` / Dark: `#059669`):** Dedicated to verified stock confirmations, ledger seals, and atomic inventory allocations.
- **Vigilance Amber (`#F59E0B` / Dark: `#D97706`):** Dedicated to demand surges, threshold warnings, allocation bottlenecks, and critical expedites.
- **Subtle Alert Crimson (`#EF4444`):** Stockouts, systemic exceptions, and failed reconciliations.
- **Slate Canvas (`#F8FAFC` to `#F1F5F9`):** Crisp, low-fatigue workspace background layers ensuring zero optical glare.

## Typography

Typography balances rapid scanning and technical precision. **Hanken Grotesk** powers UI chrome, headings, and informational copy with sharp modern letterforms. **JetBrains Mono** handles data codes, SKUs, inventory metrics, allocation timestamps, and numerical tables to eliminate tracking misalignment.

### Usage Standards
- Headings use tightened letter spacing to ensure maximum word economy in dense dashboard headers.
- All numeric representations—including unit counts, lead times, and financial balances—must default to tabular figures (`tnum`) via OpenType features or the monospaced label tiers.
- High-density mobile data views drop text decoration and rely on weight transitions (500 to 700) to separate primary records from secondary metadata.

## Layout & Spacing

The layout is built for high information density across multi-screen control centers and handheld floor-management devices.

### Grid & Responsiveness
- **Desktop (1200px+):** 12-column adaptive fluid grid with 1rem gutters and 1.5rem exterior canvas margins. Left-rail navigation operates in persistent condensed (64px) or expanded (240px) states.
- **Tablet (768px - 1199px):** 8-column layout. Split-pane layouts compress secondary inspector drawers into slide-over panels.
- **Mobile (Under 768px):** 4-column layout with 0.5rem gutters and 0.75rem screen margins. Operational lists collapse into vertically stacked summary cards featuring fixed micro-actions anchored to bottom viewports.

### Spacing Philosophy
Spacing operates on a strict 4px sub-grid. Compact tokens (`space-xs`, `space-sm`, `space-md`) dominate operational tables, status strips, and multi-input filters to minimize unnecessary vertical scrolling while maintaining optical comfort.

## Elevation & Depth

This design system rejects heavy, muddy drop shadows in favor of crisp tonal layering paired with razor-sharp micro-borders.

### Depth Hierarchy
- **Level 0 (Canvas Base):** Clean slate foundation (`#F8FAFC`). Flat, unbordered.
- **Level 1 (Data Cards & Standard Rows):** Solid pure white (`#FFFFFF`) with a 1px structural stroke (`#E2E8F0`). Flat surface, no shadow.
- **Level 2 (Dropdowns, Filter Flyouts, Hovered Cards):** `#FFFFFF` with a 1px border (`#CBD5E1`) and an ambient, low-spread diffused shadow: `0 4px 12px -2px rgba(11, 25, 44, 0.06), 0 2px 4px -1px rgba(11, 25, 44, 0.04)`.
- **Level 3 (Modals, Operational Drawers, Critical Action Sheets):** `#FFFFFF` with a 1px border (`#94A3B8`) supported by a high-clarity positioning shadow: `0 20px 25px -5px rgba(11, 25, 44, 0.12), 0 8px 10px -6px rgba(11, 25, 44, 0.08)`.

### Layer Boundaries
In dark mode or inverted context panels (such as executive night-monitoring modes), depth is maintained exclusively by shifting background luminance upward by 4% increments per elevation step, preserving crisp borders without glow bleeding.

## Shapes

The design system maintains a calibrated, technical shape language (`roundedness: 1`). Radii are deliberately restrained to reinforce the system's focus on engineering precision, structure, and tabular compactness.

### Corner Radii Specifications
- **Micro UI & Indicators (Tags, Badges, Tooltips):** 2px (`rounded-sm`).
- **Standard Controls (Inputs, Buttons, Dropdowns, Checkboxes):** 4px (`rounded-default`).
- **Cards & Data Panels:** 8px (`rounded-lg`).
- **Overlays, Drawers & Modals:** 12px (`rounded-xl`).
- **Floating Status Pucks:** Fully circular only for standalone avatar nodes or icon-only counter markers.

## Components

### Buttons
- **Primary Action:** Solid Deep Navy (`#0B192C`) with white label. Transitions to `#1E293B` on hover with a 1px inset electric blue rim. Minimum mobile touch target of 44px with a 36px visual boundary.
- **Secondary (Direct Action):** Solid Electric Blue (`#0284C7`) with white text. Reserved for workflow triggers (e.g., "Allocate Batch", "Confirm Transfer").
- **Subtle / Ghost:** Transparent surface with 1px slate border (`#CBD5E1`) and navy typography.

### Intelligent Badges & Operational Chips
- **Atomic Stock Confirmation:** Emerald background tint (`#ECFDF5`), deep emerald text (`#065F46`), and a 1px border (`#A7F3D0`). Prefixed by a solid 6px status beacon dot.
- **Demand Alert:** Amber tint (`#FFFBEB`), deep amber text (`#92400E`), and a 1px border (`#FDE68A`).
- **SKU & Metadata Badges:** Slate tint (`#F1F5F9`), slate text (`#334155`), JetBrains Mono font (`label-sm`).

### Cards & Data Tables
- **High-Density Data Row:** Default height of 40px on desktop and 52px on touch devices. Alternating rows use subtle tonal striping (`#F8FAFC`). Inline indicators show real-time synchronization state.
- **KPI Summary Cards:** Feature a 3px vertical status accent along the left edge (Emerald, Amber, or Electric Blue) indicating category health without cluttering content space.

### Form Inputs & Selectors
- **Input Fields:** 36px desktop height, 44px mobile height. Surface is `#FFFFFF`, outlined by a 1px neutral stroke (`#CBD5E1`). Focus produces a 1px `#0284C7` border and a 2px semi-transparent electric blue ring (`rgba(2, 132, 199, 0.15)`).
- **Checkboxes & Radios:** Sharp 4px and circular geometries respectively, filled with Deep Navy when selected, containing high-contrast white glyphs.

### Domain-Specific Components
- **Allocation Drawer:** Split-view bottom sheet on mobile, slide-in right rail on desktop. Displays real-time delta between demanded volume and locked physical stock.
- **Verification Seal:** An emerald-tinted confirmation card containing a cryptographic ledger hash, an immutable timestamp in JetBrains Mono, and the signing agent ID for enterprise accountability.