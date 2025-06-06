# Build System Documentation

## Overview
The VTF Audio Extension uses a custom build system to handle Chrome's content script limitations.

## Why Custom Build?
- Chrome content scripts don't support ES6 modules
- Need to maintain clean module structure during development
- Automatic dependency resolution and bundling

## Build Process

### 1. Module Bundling
The build system processes modules in this order:
```javascript
const moduleFiles = [
  'vtf-globals-finder.js',
  'vtf-stream-monitor.js', 
  'vtf-state-monitor.js',
  'vtf-audio-worklet-node.js',
  'audio-data-transfer.js',
  'vtf-audio-capture.js'
];
```

### 2. Import/Export Stripping
- Removes all `import` statements
- Removes all `export` statements
- Preserves class and function declarations

### 3. IIFE Wrapping
Entire bundle is wrapped to prevent global pollution:
```javascript
(function() {
  'use strict';
  // All modules here
})();
```

### 4. Known Issues Resolved
- **ES6 Module Loading**: Fixed by bundling
- **Circular Dependencies**: Fixed by stubbing AudioDataTransfer
- **Chrome Context**: Fixed by using proper content script format

## Development Workflow

1. Edit source files in `src/modules/`
2. Run `npm run dev` for auto-rebuild
3. Reload extension in Chrome
4. Test changes

## Debugging

If modules aren't loading:
1. Check `dist/content-bundle.js` exists
2. Look for syntax errors in the bundle
3. Verify module order in build script
4. Check Chrome console for specific errors 