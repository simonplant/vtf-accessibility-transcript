#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

console.log('\x1b[36m[DEV]\x1b[0m Starting development mode...\n');

let buildProcess = null;
let buildTimeout = null;

function build() {
  if (buildTimeout) {
    clearTimeout(buildTimeout);
  }
  
  buildTimeout = setTimeout(() => {
    if (buildProcess) {
      buildProcess.kill();
    }
    
    console.log('\x1b[33m[DEV]\x1b[0m Changes detected, rebuilding...');
    
    buildProcess = spawn('node', ['scripts/build.js'], {
      stdio: 'inherit'
    });
    
    buildProcess.on('close', (code) => {
      if (code === 0) {
        console.log('\x1b[32m[DEV]\x1b[0m Build complete! Reload extension in Chrome.\n');
      }
    });
  }, 300);
}

// Watch src directory
const watcher = fs.watch('src', { recursive: true }, (eventType, filename) => {
  if (filename && !filename.includes('.swp') && !filename.includes('~')) {
    console.log(`\x1b[36m[DEV]\x1b[0m File changed: ${filename}`);
    build();
  }
});

// Initial build
build();

console.log('\x1b[36m[DEV]\x1b[0m Watching for changes... (Ctrl+C to stop)\n');

process.on('SIGINT', () => {
  console.log('\n\x1b[36m[DEV]\x1b[0m Stopping...');
  watcher.close();
  if (buildProcess) {
    buildProcess.kill();
  }
  process.exit(0);
});