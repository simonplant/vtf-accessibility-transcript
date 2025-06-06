#!/usr/bin/env node

const chokidar = require('chokidar');
const { spawn } = require('child_process');
const { resolve, log, showHeader, colors } = require('./shared');

showHeader('VTF Extension Development Mode');

let buildProcess = null;
let buildTimeout = null;
let isBuilding = false;

function runBuild(trigger) {
  // Debounce rapid changes
  if (buildTimeout) {
    clearTimeout(buildTimeout);
  }
  
  buildTimeout = setTimeout(() => {
    if (isBuilding) {
      log.warn('Build already in progress, queuing...');
      return;
    }
    
    isBuilding = true;
    
    if (buildProcess) {
      buildProcess.kill();
    }
    
    console.log(`\n${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    log.info(`Change detected: ${trigger}`);
    console.time('Build completed in');
    
    buildProcess = spawn('node', [resolve('scripts/build.js')], {
      stdio: 'inherit',
      cwd: resolve()
    });
    
    buildProcess.on('close', (code) => {
      isBuilding = false;
      console.timeEnd('Build completed in');
      
      if (code === 0) {
        log.success('Ready! Reload extension in Chrome');
        console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);
      } else {
        log.error('Build failed! Check errors above');
      }
    });
  }, 100);
}

// Set up file watcher
const watcher = chokidar.watch(resolve('src'), {
  ignored: [
    /(^|[\/\\])\../,  // Dotfiles
    /node_modules/,
    /\.swp$/,
    /~$/
  ],
  persistent: true,
  ignoreInitial: true
});

// Watch events
watcher
  .on('add', path => runBuild(path.replace(resolve(), '')))
  .on('change', path => runBuild(path.replace(resolve(), '')))
  .on('unlink', path => runBuild(path.replace(resolve(), '')))
  .on('error', error => log.error(`Watcher error: ${error}`));

// Initial build
log.info('Starting initial build...');
runBuild('startup');

// Handle shutdown
process.on('SIGINT', () => {
  console.log('\n');
  log.info('Shutting down dev mode...');
  
  watcher.close();
  if (buildProcess) {
    buildProcess.kill();
  }
  
  log.success('Dev mode stopped');
  process.exit(0);
});

// Keep process alive
process.stdin.resume();

console.log(`\n${colors.yellow}Watching for changes...${colors.reset}\nPress Ctrl+C to stop\n`);