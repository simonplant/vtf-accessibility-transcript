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
  else 
  
  const toClean = [
    'dist',
    'node_modules/.cache'
  ];

  for (const item of toClean) {
    try {
      await fs.rm(item, { recursive: true, force: true });
      log ? log.success(`Removed ${item}`) : 
    } catch (error) {
      
    }
  }

  
  const zipFiles = glob.sync('vtf-audio-extension*.zip');
  for (const zip of zipFiles) {
    try {
      await fs.rm(zip, { force: true });
      log ? log.success(`Removed ${zip}`) : 
    } catch (error) {
      
    }
  }

  if (log) log.success('Clean complete');
  else 
}

clean();