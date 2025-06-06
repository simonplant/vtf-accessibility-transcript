#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

const log = {
  info: (msg) => console.log(`${colors.cyan}[BUILD]${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`)
};

async function clean() {
  log.info('Cleaning dist directory...');
  try {
    await fs.rm('dist', { recursive: true, force: true });
    await fs.mkdir('dist', { recursive: true });
    log.success('Cleaned dist directory');
  } catch (error) {
    log.error(`Failed to clean: ${error.message}`);
  }
}

async function copyStaticFiles() {
  log.info('Copying static files...');
  
  const staticFiles = [
    'manifest.json',
    'popup.html',
    'options.html',
    'style.css'
  ];
  
  for (const file of staticFiles) {
    try {
      await fs.copyFile(`src/${file}`, `dist/${file}`);
      log.success(`Copied ${file}`);
    } catch (error) {
      log.warn(`Could not copy ${file}: ${error.message}`);
    }
  }
}

async function copyIcons() {
  log.info('Copying icons...');
  
  try {
    await fs.mkdir('dist/icons', { recursive: true });
    const iconFiles = await fs.readdir('src/icons');
    
    for (const icon of iconFiles) {
      if (icon.endsWith('.png')) {
        await fs.copyFile(`src/icons/${icon}`, `dist/icons/${icon}`);
      }
    }
    log.success('Copied icons');
  } catch (error) {
    log.warn('No icons found, creating placeholders...');
    await createPlaceholderIcons();
  }
}

async function createPlaceholderIcons() {
  await fs.mkdir('dist/icons', { recursive: true });
  
  // Create simple placeholder files
  const sizes = [16, 48, 128];
  for (const size of sizes) {
    await fs.writeFile(`dist/icons/icon${size}.png`, '');
  }
  log.success('Created placeholder icons');
}

async function copyWorkers() {
  log.info('Copying workers...');
  
  try {
    await fs.mkdir('dist/workers', { recursive: true });
    await fs.copyFile('src/workers/audio-worklet.js', 'dist/workers/audio-worklet.js');
    log.success('Copied workers');
  } catch (error) {
    log.error(`Failed to copy workers: ${error.message}`);
  }
}

async function bundleContentScript() {
  log.info('Bundling content script...');
  
  // Module order matters - dependencies first
  const moduleFiles = [
    'vtf-globals-finder.js',
    'vtf-stream-monitor.js', 
    'vtf-state-monitor.js',
    'vtf-audio-worklet-node.js',
    'audio-data-transfer.js',
    'vtf-audio-capture.js'
  ];
  
  let bundled = '(function() {\n"use strict";\n\n';
  bundled += '// VTF Audio Extension - Bundled Content Script\n';
  bundled += '// Built: ' + new Date().toISOString() + '\n\n';
  
  // Process each module
  for (const file of moduleFiles) {
    try {
      let moduleContent = await fs.readFile(`src/modules/${file}`, 'utf8');
      
      // Remove all import/export statements
      moduleContent = moduleContent
        .replace(/^import\s+.*?from\s+['"].*?['"];?\s*$/gm, '')
        .replace(/^export\s+(default\s+)?(class|function|const|let|var)/gm, '$2')
        .replace(/^export\s*\{[^}]*\};\s*$/gm, '')
        .replace(/^export\s+default\s+(\w+);\s*$/gm, '');
      
      bundled += `// ===== ${file} =====\n${moduleContent}\n\n`;
    } catch (error) {
      log.error(`Failed to process ${file}: ${error.message}`);
    }
  }
  
  // Process main content script
  try {
    let mainContent = await fs.readFile('src/content.js', 'utf8');
    
    mainContent = mainContent
      .replace(/^import\s+.*?from\s+['"].*?['"];?\s*$/gm, '')
      .replace(/^export\s+.*?$/gm, '');
    
    bundled += `// ===== Main Content Script =====\n${mainContent}\n\n`;
  } catch (error) {
    log.error(`Failed to process content.js: ${error.message}`);
  }
  
  bundled += '})();';
  
  await fs.writeFile('dist/content.js', bundled);
  log.success('Bundled content script');
}

async function bundleBackground() {
  log.info('Bundling background script...');
  
  try {
    // For now, just copy it since it likely doesn't have imports
    await fs.copyFile('src/background.js', 'dist/background.js');
    log.success('Copied background script');
  } catch (error) {
    log.error(`Failed to copy background script: ${error.message}`);
  }
}

async function bundlePopupAndOptions() {
  log.info('Bundling popup and options scripts...');
  
  try {
    await fs.copyFile('src/popup.js', 'dist/popup.js');
    await fs.copyFile('src/options.js', 'dist/options.js');
    log.success('Copied popup and options scripts');
  } catch (error) {
    log.error(`Failed to copy scripts: ${error.message}`);
  }
}

async function createPackage() {
  log.info('Creating extension package...');
  
  try {
    execSync('cd dist && zip -r ../vtf-audio-extension.zip *', { stdio: 'inherit' });
    log.success('Created vtf-audio-extension.zip');
  } catch (error) {
    log.warn('Could not create zip file (zip command not found)');
  }
}

async function build() {
  console.log(`${colors.bright}${colors.cyan}
╔══════════════════════════════════════╗
║   VTF Audio Extension Build System   ║
╚══════════════════════════════════════╝${colors.reset}
`);
  
  const startTime = Date.now();
  
  try {
    await clean();
    await copyStaticFiles();
    await copyIcons();
    await copyWorkers();
    await bundleContentScript();
    await bundleBackground();
    await bundlePopupAndOptions();
    
    if (process.argv.includes('--package')) {
      await createPackage();
    }
    
    const elapsed = Date.now() - startTime;
    
    console.log(`\n${colors.green}${colors.bright}✨ Build completed in ${elapsed}ms${colors.reset}`);
    console.log(`\n${colors.cyan}Next steps:${colors.reset}`);
    console.log('1. Open chrome://extensions/');
    console.log('2. Click "Load unpacked" and select the "dist" folder');
    console.log('   OR reload the extension if already loaded\n');
    
  } catch (error) {
    console.error(`\n${colors.red}Build failed: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

// Run build
build();