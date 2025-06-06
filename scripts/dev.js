#!/usr/bin/env node

const chokidar = require('chokidar');
const { spawn } = require('child_process');
const path = require('path');

console.log(`
╔════════════════════════════════════════╗
║      VTF Extension Dev Mode 🚀         ║
╚════════════════════════════════════════╝

Watching for changes...
`);

let buildProcess = null;
let buildTimeout = null;
let lastBuildTime = 0;

function build(changedFile) {
  // Debounce rapid changes
  if (buildTimeout) {
    clearTimeout(buildTimeout);
  }
  
  buildTimeout = setTimeout(() => {
    const now = Date.now();
    if (now - lastBuildTime < 1000) return;
    lastBuildTime = now;
    
    if (buildProcess) {
      buildProcess.kill();
    }
    
    console.log(`\n🔄 Change detected: ${changedFile}`);
    console.time('Build time');
    
    buildProcess = spawn('node', ['scripts/build.js'], {
      stdio: 'inherit'
    });
    
    buildProcess.on('close', (code) => {
      console.timeEnd('Build time');
      if (code === 0) {
        console.log('✅ Ready! Reload extension in Chrome\n');
        console.log('Watching for changes...\n');
      }
    });
  }, 100);
}

// Watch configuration
const watcher = chokidar.watch('src', {
  ignored: [
    /(^|[\/\\])\../,  // Dotfiles
    /\.swp$/,         // Vim swap files
    /~$/              // Backup files
  ],
  persistent: true,
  ignoreInitial: true
});

// Watch events
watcher
  .on('add', path => build(path))
  .on('change', path => build(path))
  .on('unlink', path => build(path))
  .on('error', error => console.error('Watch error:', error));

// Initial build
build('initial');

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Stopping dev mode...');
  watcher.close();
  if (buildProcess) {
    buildProcess.kill();
  }
  process.exit(0);
});

// Keep process alive
process.stdin.resume();