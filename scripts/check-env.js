#!/usr/bin/env node

// Quick environment check before builds
const nodeVersion = process.version;
const major = parseInt(nodeVersion.split('.')[0].substring(1));

if (major < 18) {
  console.error(`❌ Node.js 18+ required (you have ${nodeVersion})`);
  console.error('   Please upgrade Node.js: https://nodejs.org/');
  process.exit(1);
}

// Check if in correct directory
const fs = require('fs');
if (!fs.existsSync('package.json')) {
  console.error('❌ Not in project root directory');
  console.error('   Please run from vtf-audio-extension folder');
  process.exit(1);
}