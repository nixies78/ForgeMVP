# Webpage Specification: Unreal Forge

## Theme & Design Tokens
*   **Body Background Gradient:** 3-stop linear gradient (`#101014`, `#202024`, `#101014`)
*   **Header Background:** `#101014` at 95% opacity (`rgba(16, 16, 20, 0.95)`)
*   **Footer Background:** `#18181C`
*   **Panel Charcoal:** `#23253A`
*   **Outline Slate:** `#3A3D4D`
*   **Primary CTA Color:** `#26BBFF`
*   **Engine White:** `#FFFFFF`
*   **UI Gray:** `#B2B5C2`
*   **Typography:**
    *   **Headings (H1, H2):** `Inter` (Standard sentence case; no forced full capitalization)
    *   **Body & UI:** `Inter`

---

## Layout Structure
Classic three-part structure:
1. Header (Fixed / Always Visible)
2. Body (Web App Container)
3. Footer

---

## Header Specifications
*   **Positioning:** Fixed / persistent (`position: fixed; top: 0; width: 100%; z-index: 50`) — remains permanently visible at the top of the viewport across all scroll depths (does not hide or auto-collapse on scroll).
*   **Background:** `#101014` at 95% opacity (`rgba(16, 16, 20, 0.95)`)
*   **Height:** `72px`
*   **Border:** None (Clean edge)
*   **Features (Left to Right):**
    1. **Logo:** Sourced from `/public/assets/EGS-Logotype-2023-Vertical-White.svg`
    2. **Navigation:** Single item: `"Home"` (no additional links or "More" overflow menu)
    3. **Search Box:**
        *   Background: `#1e1e22`
        *   Border: `#404043`
    4. **CTA - Secondary:**
        *   Label: `"Dev mode"`
        *   Behavior: Toggles the dev mode state on and off
        *   Background: `#5B5B65`
        *   Border: None
    5. **CTA - Primary:**
        *   Label: `"Admin"`
        *   Fill Color: `#26BBFF`
        *   Text Contrast: Dark label (`#101014`) for optimal legibility

---

## Body Specifications
*   **Background:** 3-stop gradient (`#101014`, `#202024`, `#101014`)
*   **Hero Section:** Removed (The web app container sits directly below the fixed header with appropriate top offset).

### Web App Container
*   **Layout & Spacing:** Inset from the page edges by at least `64px` (with top padding/margin accounting for the `72px` fixed header).
*   **Sticky Sub-Header:** Remains visible while scrolling inside the workspace, featuring:
    *   **Interactive Breadcrumb Bar:** Clickable trail links that navigate directly to their corresponding wizard sections/steps.
    *   **Visual Progress Bar:** Linear gradient starting at `#26BBFF` and ending at `#F7FF19`.
*   **Wizard Navigation:** Every screen/step inside the web app wizard includes a visible `"Back"` button to return to the previous step.

---

## Footer Specifications
*   **Background Color:** `#18181C`
*   **Content:** Minimal utility bar containing only:
    *   **System Status** indicator
    *   **Admin Navigation Link:** `"Go to admin page"` placed directly within the system status section