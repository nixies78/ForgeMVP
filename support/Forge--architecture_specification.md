# Webpage Architecture & UI Specification

## 1. Visual Theme & Style Tokens

* **Aesthetic:** Cinematic dark-mode developer aesthetic (inspired by Unreal Engine).

* **Primary Backgrounds:** Unreal Navy (`#0E1128`) for the header; 3-stop gradient (`#101014`, `#202024`, `#101014`) for the main body workspace; Dark Charcoal (`#18181C`) for the footer.

* **Surfaces & Borders:** Panel Charcoal (`#23253A`) for dropdowns/inputs; Outline Slate (`#3A3D4D`) for `1px` structural borders and dividers.

* **Accent Colors:** Blueprint Cyan (`#1CB0F6`) / Sky Cyan (`#26BBFF`) for active states and highlights; Electric Yellow (`#F7FF19`) for primary actions and progress completion.

* **Typography:** 
  * **Headings (`H1` & `H2`):** `"Archivo"` font family for bold, high-impact display titles.
  * **Body & UI:** Clean geometric sans-serif (e.g., Inter, Roboto) using Engine White (`#FFFFFF`) for primary elements and UI Gray (`#B2B5C2`) for secondary links.

## 2. Page Structure Overview

The page follows a classic vertical flex-column layout (`min-height: 100vh`) divided into three core regions:

1. **Header** (Sticky top bar)

2. **Body** (Hero section + inset web application viewport)

3. **Footer** (Bottom structural anchor)

## 3. Section Specifications

### A. Header (`<header>`)

* **Layout:** Full-width sticky container (`height: 72px`), horizontal flexbox (`align-items: center`), deep navy background (`#0E1128`) with subtle backdrop blur, and no bottom border.

* **Element Order (Left to Right):**

  1. **Logo:** Sourced from `/assets/Header--Logo.png` on the far left; acts as a home reset link.

  2. **Navigation (`<nav>`):**

     * Primary horizontal link list (e.g., *Overview, Documentation, Marketplace, Community, Support*).

     * **Responsive Priority+ Pattern:** Uses a resize observer to measure available horizontal width. As the viewport shrinks, overflowing navigation items progressively collapse from right to left into a **"More ▾"** dropdown menu.

  3. **Search Box:** Compact input field (`#1e1e22` background, `#404043` border) with a magnifying glass icon and keyboard shortcut hint (e.g., `Ctrl+K`), positioned to the right of the navigation.

  4. **CTA — Secondary (`Dev mode`):**

     * **Label:** `"Dev mode"`

     * **Behaviour:** Toggles the dev mode state on and off (with clear active/inactive visual feedback).

     * **Styling:** Secondary button with `#5B5B65` background, no border, and Engine White (`#FFFFFF`) text.

  5. **CTA — Primary (`Admin`):**

     * **Label:** `"Admin"`

     * **Styling:** Primary high-emphasis button with solid Yellow (`#F7FF19`) fill, bold dark label for high contrast, and subtle hover glow.

### B. Body (`<main>`)

* **Layout:** Flex-grow container (`flex: 1`) featuring a 3-stop background gradient (`#101014`, `#202024`, `#101014`).

* **1. Hero Section (Positioned above the web app container):**

  * **Background Media:**

    * Primary looping video sourced from `/assets/Hero--Video.mp4`

    * Static fallback image sourced from `/assets/Hero--Fallback.png`

  * **Content & Typography:**

    * **H1:** `"Forge"` (Font: `"Archivo"`)

    * **Subtitle (H2):** `"THINK, DESIGN, BUILD."` (Font: `"Archivo"`, full capitalization)

    * **Body Text:** `"Take your game from idea to executable. Design in Forge, let AI tools bring it to life in Unreal Engine and tap into Fortnite's vibrant developer economy."`

* **2. Web App Container:**

  * **Purpose:** Dedicated mounting canvas and workspace container for the AI-generated web application.

  * **Layout & Spacing:** Inset from the page edges by at least `64px` (`padding` or `margin` $\ge 64\text{px}$).

  * **Sticky Container Header:**

    * **Positioning:** Sticky at the top of the container (`position: sticky`, positioned below the main 72px site header) so workflow progress remains visible while scrolling.

    * **Breadcrumb Bar:** Displays the user's current navigation path and workflow stage.

    * **Visual Progress Bar:** Horizontal progress indicator featuring a linear gradient from `#26BBFF` (start) to `#F7FF19` (end).

### C. Footer (`<footer>`)

* **Layout:** Full-width container (`#18181C` background).

* **Content:** Placeholder container reserved for future copyright notices, legal links, social icons, and system status indicators.