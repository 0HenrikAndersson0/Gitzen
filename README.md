# Gitzen

Gitzen is a modern, fast, and beautifully designed Git GUI application built with Electron, React, and TypeScript. It aims to provide a reliable and efficient interface for managing Git repositories by directly utilizing your system's native Git binary.

## Key Features

- **Commit History:** Intuitive and clear commit history tree with branch and tag visualization.
- **Rich Diff Viewer:** Inspect file changes with the fluid, conditionally resizable side-by-side or unified diff viewer, featuring full character and word-level diffing.
- **Selective Staging:** Easily stage and unstage specific hunks, or even individual lines of code directly from the UI.
- **Repository Graphs & Analytics:** Visualize repository churn, file types, and code activity using built-in interactive charts.
- **Dark & Light Themes:** Hand-crafted, modern themes optimized for minimal eye strain, built with Tailwind CSS.
- **Native Git Integration:** Gitzen explicitly shells out to your local system's `git` binary, guaranteeing absolute compatibility with your configurations (no outdated NodeGit dependencies).

## Architecture & Tech Stack

- **Runtime (Main Process):** Electron, Node.js (`/src`)
  - Handles the file system accesses, `gitService` command operations, and secure `CredentialManager`.
- **Frontend (Renderer Process):** React, TypeScript, Vite, Tailwind CSS (`/renderer/src`)
  - Features functional modular UI components for panes.
- **Components & Icons:** Radix UI, Lucide React, Sonner (for localized toasts).
- **Bridge:** Secure IPC via `contextBridge` in `preload.js`.

## Prerequisites

- Node.js (v16 or higher)
- npm (or yarn)
- **Git** must be installed and accessible in your system's `PATH`.

## Installation & Development

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Run Development Mode:**
   Runs the Vite dev server for the frontend and the Electron app concurrently. TSC automatically watches for changes in the main process.
   ```bash
   npm run dev
   ```

3. **Compile Main Process (Standalone):**
   ```bash
   npm run compile
   ```

## Building for Production

Compile the TypeScript main process, build the Vite renderer bundle, and package the overall Electron app using `electron-builder`:

```bash
# General production build
npm run build

# Platform-specific builds
npm run build:mac
npm run build:linux
npm run build:win
```

## Security

This project implements Electron's recommended security and sandboxing best practices:
- **Context Isolation:** Enabled
- **Node Integration:** Disabled in renderer
- **Preload Script:** Used to expose a strictly controlled, secure API layer to the renderer environment, masking command logs for sensitive URLs or credentials.
