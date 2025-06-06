#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

async function clean() {
  console.log('Clean Build Artifacts');
  
  const toClean = [
    'dist',
    'node_modules/.cache'
  ];

  for (const item of toClean) {
    try {
      await fs.rm(path.resolve(__dirname, '..', item), { recursive: true, force: true });
      console.log(`✓ Removed ${item}`);
    } catch (error) {
      // Ignore errors for missing directories
    }
  }

  // Remove zip files
  try {
    const files = await fs.readdir(path.resolve(__dirname, '..'));
    for (const file of files) {
      if (file.match(/vtf-audio-extension.*\.zip$/)) {
        await fs.rm(path.resolve(__dirname, '..', file));
        console.log(`✓ Removed ${file}`);
      }
    }
  } catch (error) {
    // Ignore
  }

  console.log('✓ Clean complete');
}

clean().catch(console.error);