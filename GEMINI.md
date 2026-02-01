# Gitzen Project Context

## Project Overview
Gitzen is a modern Git GUI application built with Electron, React, and TypeScript. It aims to provide a clean, efficient interface for managing Git repositories.

**Key Technologies:**
- **Runtime:** Electron (Main Process), Node.js
- **Frontend:** React, Vite, TypeScript, Tailwind CSS
- **UI Components:** Radix UI, Lucide React (Icons), Sonner (Toasts)
- **Git Integration:** Direct execution of `git` binary via `child_process` (Note: Documentation mentioning `nodegit` is outdated; the actual implementation shells out to the system git).
- **State/Data:** Local `git` commands for data, `keytar` for secure credential storage.

## Architecture

### Directory Structure
- **`/src`** (Main Process): Contains the backend logic running in Node.js.
    - `main.ts`: Application entry point, window creation, IPC handler setup.
    - `gitService.ts`: Core logic for executing git commands. Wraps `child_process` calls to the local `git` binary.
    - `CredentialManager.ts`: Handles secure storage of git credentials using system keychains.
    - `settingsService.ts` & `recentReposService.ts`: manage persistent user data.
- **`/renderer`** (Renderer Process): The React frontend application.
    - `src/App.tsx`: Main component structure.
    - `src/components/`: Functional UI components (CommitPanel, BranchPanel, etc.).
    - `src/lib/`: Utilities and helpers.
- **`/dist`**: Compiled main process code.
- **`/release`**: Packaged application output.

### IPC Bridge
Communication between the React frontend and Electron backend is handled via `contextBridge` in `preload.js`.
- **Renderer:** Calls `window.gitAPI.someMethod()`.
- **Main:** Listens via `ipcMain.handle('git:someMethod', ...)` and delegates to `gitService`.

## Building and Running

### Prerequisites
- Node.js (v16+)
- npm or yarn
- Git installed and available in the system PATH.

### Commands
- **Install Dependencies:** `npm install`
- **Development Mode:** `npm run dev`
    - Runs the Vite dev server and Electron app concurrently.
    - TSC watches for changes in `src/`.
- **Build for Production:** `npm run build`
    - Compiles TypeScript.
    - Builds the Vite renderer.
    - Packages the Electron app using `electron-builder`.
    - **Note:** For quick code verification, use `npx electron-builder --linux AppImage` to avoid building multiple targets (like .deb).
- **Compile Main Process:** `npm run compile`

## Development Conventions

### Git Commit Policy (CRITICAL)
**Never commit changes without asking the user first.**
- Do not automatically commit changes.
- Always ask for a commit message or confirmation before executing `git commit`.

### Git Implementation Details
- **Execution:** Git commands are executed as child processes (`execFile` / `spawn`).
- **Parsing:** Output from commands like `git status --porcelain` or `git log` is parsed manually in `gitService.ts` to return structured data to the frontend.
- **Security:** Credentials should be managed via the `CredentialManager` to avoid logging secrets. Command logging in `gitService.ts` includes masking for sensitive URLs.

### UI/UX
- **Styling:** Use Tailwind CSS for styling.
- **Components:** Prefer creating small, modular components in `renderer/src/components/`.
- **Icons:** Use `lucide-react` for iconography.

## Troubleshooting
- **Git Errors:** If git commands fail, ensure the `git` executable is in the system PATH. The app relies on the system's git installation.
- **IPC Errors:** Check `preload.js` to ensure new methods in `gitService` are properly exposed to the renderer.
