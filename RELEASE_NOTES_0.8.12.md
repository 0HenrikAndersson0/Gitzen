# Release Notes 0.8.12

## 🎨 New Theme System: LaPom
Gitzen has received a major visual overhaul with the introduction of the **LaPom** theme system, inspired by Apple's Human Interface Guidelines.

- **Light & Dark Modes:** Fully supported system-wide themes. Toggle between them via `Layout > Theme`.
- **Refined Aesthetics:**
  - **Dark Mode:** Moved from a pitch-black background to a professional "Space Gray" palette (`#1C1C1E`) for reduced eye strain and better depth.
  - **Light Mode:** A clean, "Platinum" look (`#F5F5F7`) with high-contrast text and crisp borders.
- **Consistent Styling:** All UI components, including the diff viewer, commit graph, and dialogs, have been refactored to adapt seamlessly to the active theme.

## 📝 Diff Viewer Enhancements
Reading code changes is now smoother and more intuitive.

- **Synchronized Scrolling:** Scrolling in Split View now keeps both panes perfectly aligned.
- **Unified by Default:** The diff viewer now defaults to the Unified view for a more standard reading experience.
- **Improved Readability:** Diff colors (additions/deletions) have been optimized for both light and dark backgrounds, preventing "washed out" colors in light mode.

## 🔒 Authentication & UX
- **Auth Feedback:** Updated how the user is informed about authentication states, making it clearer when credentials are active or missing.

## 🛠 Fixes & Improvements
- Fixed alignment issues in diff headers and hunks.
- General UI polish and color consistency fixes across the application.
