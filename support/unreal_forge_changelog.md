# Changelog: Unreal Forge Webpage Specification

All notable changes to this project's architecture, design tokens, and layout guidelines will be documented in this file.

## [1.2.2] - 2026-11-16

### Changed
* **Panels & Box Styling:**
    * **Border Thickness:** Reduced selected panel/box borders from `2px` down to `1px`.
    * **Panel Colors:** Aligned exact panel background and hover states with the official Unreal Engine metrics (`#1c1c20` for base panels, `#28282c` on hover, and `#343437` for subtle borders).
    * **Border Radius:** Updated Forge border radius metrics to match Unreal Engine (`16px`).
* **Header Navigation & Logo:**
    * **Backdrop Filter Blur:** Applied the same backdrop filter blur effect to the main navigation as the app sub-header.
    * **Epic Logo Hover State:** Removed the grey box container on mouse hover; applied a direct logo shade/opacity change matching `https://www.unrealengine.com/`.
* **Accessibility & DOM Structure:**
    * **H1 Element Cleanup:** Removed the `tabindex` property altogether from the `H1` element to prevent it from receiving focus or displaying a blue border on load/refresh (ensuring it is non-interactive).
* **Footer & Relocation:**
    * **Dev Mode Link:** Relocated "Dev mode" from the header into the footer as an operational link.

## [1.2.1] - 2026-11-16
* Standardized CTA heights to 32px, updated the Epic logo asset source, removed the top footer border, and updated the progress bar gradient to `-blue` to `-indigo`.

## [1.2.0] - 2026-11-16
* Transitioned from Fortnite blueprint styling to the authentic Unreal main color palette and updated layout elements.

## [1.1.0] - 2026-11-13
* Established fixed header positioning, 64px container insets, and interactive breadcrumbs.

## [1.0.0] - 2026-11-12
* Initial webpage specification setup based on Unreal Engine dark-mode aesthetic.