# Gitzen

A modern Git GUI application built with Electron for Linux and Windows.

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn

## Installation

Install dependencies:

```bash
npm install
```

## Development

Run the application in development mode:

```bash
npm start
```

or

```bash
npm run dev
```

## Building

Build for your current platform:

```bash
npm run build
```

Build specifically for Linux:

```bash
npm run build:linux
```

Build specifically for Windows:

```bash
npm run build:win
```

## Project Structure

- `main.js` - Main Electron process (entry point)
- `preload.js` - Preload script for secure context bridge
- `index.html` - Main application window HTML
- `package.json` - Project configuration and dependencies

## Security

This project uses Electron's recommended security practices:
- Context isolation enabled
- Node integration disabled in renderer
- Preload script for secure API exposure
