# DimBuilder Notion-Inspired Workbench Design

## Approval

The user approved continuing with the recommended **Notion-Inspired Metadata Workspace** direction on 2026-05-18. The design source is the Notion design analysis pasted from `DESIGN.md` in the IDE context. The on-disk `DESIGN.md` file was empty at the time this spec was written, so this spec records the extracted app-specific direction.

Concept reference:

`docs/superpowers/assets/2026-05-18-notion-workbench-concept.png`

## Goal

Restyle DimBuilder as a calm, Notion-inspired enterprise metadata workspace while preserving the Clean Workbench information architecture and all existing OneStream metadata behavior.

## Design System

Use the Notion analysis as product inspiration, not as a literal Notion clone.

- Canvas: true white `#ffffff`.
- App surface: warm gray `#f6f5f4`.
- Soft surface: `#fafaf9`.
- Borders: `#e5e3df`, stronger controls `#c8c4be`.
- Text: ink `#1a1a1a`, charcoal `#37352f`, slate `#5d5b54`, steel `#787671`.
- Primary: purple `#5645d4`, pressed `#4534b3`, soft lavender `#e6e0f5`.
- Status tints: mint `#d9f3e1`, peach `#ffe8d4`, rose `#fde0ec`, sky `#dcecfa`, yellow `#fef7d6`.
- Typography: Notion Sans style via Inter/system fallback. No external font dependency is required.
- Shape: 8px buttons and controls; 12px panels; status badges may remain fully rounded.
- Shadows: avoid heavy dashboard shadows; use hairline borders and low elevation only.

## App Layout

The current workbench architecture remains:

- A global top command bar.
- A compact searchable dimension navigation rail.
- A central selected dimension workspace.
- A large editable table surface.
- A slim readiness/details rail.

The visual hierarchy changes:

- The top bar becomes the product anchor: DimBuilder mark/name, current project/source context, then global commands.
- The left rail starts with `Dimensions`; project context moves out of the rail.
- `Import`, `Validate`, and `Export` remain in one global command cluster only.
- `Import` uses the purple primary action.
- Secondary actions use white/transparent rectangular buttons with warm hairline borders.
- `Save`, undo, and redo stay disabled and visually quiet unless real behavior exists.

## Workspace

The selected dimension workspace is the main product surface.

- Main heading: configured display label, for example `Account - GLAccounts`.
- Readiness badge is compact and pastel.
- Dimension facts render as small rectangular tags.
- Tabs remain: `Overview`, `Members`, `Relationships`, `Hierarchy`, `XML`, `Issues`.
- The active tab uses a Notion-like purple underline.

## Tables

Members and relationships tables remain dominant.

- Keep virtualization and stable row height.
- Keep sticky headers.
- Keep horizontal overflow inside the grid only.
- Use warm hairline grid borders.
- Use lavender selection states and one row-level selected stripe.
- Local toolbar actions remain table-specific only: add, duplicate, delete, columns, search/filter.
- No project lifecycle commands appear in local table toolbars.

## Rail

The rail becomes a quiet Notion-style details panel:

- Header: `Readiness`.
- Pastel readiness chip.
- Compact error/warning chips.
- `Dimension details` with label/value rows.
- No full issue list duplication; full lists stay in the Issues tab.

## Project Overview

The dashboard remains a compact project overview.

- No hero treatment.
- No oversized KPI card grid.
- Facts are small Notion-like tags.
- Dimension list is a clean selectable list.
- No lifecycle command duplication.

## Responsive Behavior

- At `<=1024px`, the sidebar hides and mobile workspace select appears in the top bar.
- The rail collapses below the main workspace.
- At `<=640px`, the toolbar stacks without creating tall empty space.
- No horizontal overflow on the page; wide grids scroll inside their own surface.

## Accessibility

- All controls keep visible focus states.
- Disabled lifecycle actions expose useful titles.
- Color is not the only signal for export blocking or issue status.
- Touch targets stay near 40-44px on mobile.

## Non-Goals

- No changes to workbook parsing, validation logic, XML/export semantics, persistence, backend APIs, or YAML schema.
- No Notion logo, Notion product names, or copied Notion page content.
- No marketing hero page.
- No decorative blobs, gradients, or illustration system.
- No dark-mode pass.

## Verification

Required before handoff:

- `npm.cmd test`
- `npm.cmd run build`
- Browser QA at desktop `1440x900`, tablet `768x900`, and mobile `390x844`.
- `view_image` comparison of the concept and latest implementation screenshots.
- Check command duplication count, top bar, nav density, table dominance, rail hierarchy, mobile overflow, and selected-row styling.
