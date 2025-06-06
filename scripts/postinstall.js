#!/usr/bin/env node

const { resolve, log, showHeader } = require('./shared');
const fs = require('fs');
const path = require('path');

async function postinstall() {
  showHeader('Post-Install Setup');
  
  try {
    // Create required directories
    const dirs = ['dist', 'src/icons'];
    
    for (const dir of dirs) {
      const fullPath = resolve(dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
        log.success(`Created ${dir}`);
      }
    }
    
    // Check for icon files
    const iconPath = resolve('src/icons');
    const icons = fs.readdirSync(iconPath).filter(f => f.endsWith('.png'));
    
    if (icons.length === 0) {
      log.warn('No icon files found!');
      log.info('Please add icon16.png, icon48.png, and icon128.png to src/icons/');
    }
    
    log.success('Post-install complete');
    log.info('Run "npm run dev" to start development');
    
  } catch (error) {
    log.error(`Post-install failed: ${error.message}`);
    process.exit(1);
  }
}

postinstall().catch(console.error); 