#!/usr/bin/env node

const path = require('path');

// Resolve paths relative to project root
const projectRoot = path.resolve(__dirname, '..');
const resolve = (...paths) => path.join(projectRoot, ...paths);

// Consistent console colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

// Consistent logging
const log = {
  info: (msg) => console.log(`${colors.cyan}ℹ${colors.reset}  ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset}  ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset}  ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset}  ${msg}`),
  step: (msg) => console.log(`${colors.magenta}▸${colors.reset}  ${msg}`)
};

// Header for scripts
const showHeader = (title) => {
  console.log(`${colors.bright}${colors.cyan}
╔${'═'.repeat(title.length + 4)}╗
║  ${title}  ║
╚${'═'.repeat(title.length + 4)}╝${colors.reset}
`);
};

module.exports = {
  projectRoot,
  resolve,
  colors,
  log,
  showHeader
}; 