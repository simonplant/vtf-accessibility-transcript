#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const glob = require('glob');
let log, showHeader;
try {
  ({ log, showHeader } = require('./shared'));
} catch {}

async function clean() {
  if (showHeader) showHeader('Clean Build Artifacts');
  else console.log('🧹 Cleaning build artifacts...\n');

  // Remove dist and node_modules/.cache
  const toClean = [
    'dist',
    'node_modules/.cache'
  ];

  for (const item of toClean) {
    try {
      await fs.rm(item, { recursive: true, force: true });
      log ? log.success(`Removed ${item}`) : console.log(`  ✓ Removed ${item}`);
    } catch (error) {
      // Ignore if doesn't exist
    }
  }

  // Remove all vtf-audio-extension*.zip files in root
  const zipFiles = glob.sync('vtf-audio-extension*.zip');
  for (const zip of zipFiles) {
    try {
      await fs.rm(zip, { force: true });
      log ? log.success(`Removed ${zip}`) : console.log(`  ✓ Removed ${zip}`);
    } catch (error) {
      // Ignore
    }
  }

  if (log) log.success('Clean complete');
  else console.log('\n✨ Clean complete');
}

clean();