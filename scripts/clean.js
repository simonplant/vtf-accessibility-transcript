#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

async function clean() {
  console.log('🧹 Cleaning build artifacts...\n');
  
  const toClean = [
    'dist',
    'vtf-audio-extension.zip',
    'node_modules/.cache'
  ];
  
  for (const item of toClean) {
    try {
      await fs.rm(item, { recursive: true, force: true });
      console.log(`  ✓ Removed ${item}`);
    } catch (error) {
      // Ignore if doesn't exist
    }
  }
  
  console.log('\n✨ Clean complete');
}

clean();