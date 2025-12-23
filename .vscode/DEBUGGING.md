# Debugging Gitzen

## Quick Start

### Option 1: Automatic (Recommended)
1. Press F5 or use "Debug Main Process" from the Run and Debug panel
2. When prompted, select "Start Vite server + Compile TypeScript"
3. Wait for Vite to start (you'll see "Local: http://localhost:5173" in the terminal)
4. Electron will start automatically

### Option 2: Manual (More Control)
1. Open a terminal and run: `npm run dev:renderer`
2. Wait for Vite to start (you'll see "Local: http://localhost:5173")
3. Press F5 or use "Debug Main Process" from the Run and Debug panel
4. When prompted, select "Compile TypeScript only"

### Option 3: Using npm dev script
1. Open a terminal and run: `npm run dev`
2. This starts both Vite and Electron automatically
3. Note: This won't allow debugging the main process, but is useful for quick testing

## Troubleshooting

**Error: ERR_CONNECTION_REFUSED**
- Make sure the Vite dev server is running on http://localhost:5173
- Check the terminal output for Vite startup messages
- Try Option 2 (Manual) above

**Breakpoints not hitting**
- Make sure source maps are enabled (they are by default)
- Check that TypeScript compilation completed successfully
- Verify the file path in the breakpoint matches the source file

