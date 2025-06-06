# Build System Documentation

## Overview
The VTF Audio Extension uses a modern, automated build system designed for solo developers. It is optimized for Chrome extension development, with no enterprise bloat and maximum transparency.

## Why a Custom Build?
- Chrome content scripts don't support ES6 modules
- Need to maintain clean module structure during development
- Fast, reliable, and transparent builds

## Build & Development Workflow

### 1. One-Command Build & Setup
Run this after cloning:
```bash
npm run all
# Checks environment, cleans, installs, builds, and tests everything
```

### 2. Development Mode (Auto-Rebuild)
```bash
npm run dev
# Watches for changes and auto-rebuilds
```

### 3. Manual Build
```bash
npm run build
# Or: npm run build -- --open  # (macOS: auto-opens chrome://extensions/)
```

### 4. Packaging for Distribution
```bash
npm run package
# Creates vtf-audio-extension-v<version>.zip for Chrome Web Store/manual install
```

### 5. Clean All Artifacts
```bash
npm run clean
# Removes dist/ and all .zip files
```

### 6. Dependency & Security Check
```bash
npm run check
# Audits for outdated or vulnerable dependencies
```

### 7. Lint (Optional)
```bash
npm run lint
# Only runs if ESLint is configured
```

## Output Structure
- All build outputs go to `dist/`
- Main content script: `dist/content.js` (referenced in manifest.json)
- All static assets, icons, and workers are copied to `dist/`
- Zips are created in the project root for distribution

## Troubleshooting
- **Extension not loading:**
  - Make sure you selected the `dist` folder, not `src`
  - Check Chrome DevTools console for errors
  - Try: `npm run clean && npm run build`
- **Build errors:**
  - Check the build summary for missing files or warnings
  - Run `npm run check` to see if dependencies are outdated or vulnerable
- **Changes not showing:**
  - Make sure `npm run dev` is running
  - Refresh the extension in Chrome
  - Hard refresh the VTF page (Cmd+Shift+R)

## For More Info
See the main README for usage, project structure, and troubleshooting. 