#!/usr/bin/env node

const fs = require('fs');
const { execSync } = require('child_process');

console.log('🚀 VTF Audio Extension - Initial Setup\n');

// Check Node version
const nodeVersion = process.version;
console.log(`✓ Node.js ${nodeVersion} detected`);

// Install dependencies
console.log('\n📦 Installing dependencies...');
try {
  execSync('npm install', { stdio: 'inherit' });
  console.log('✓ Dependencies installed');
} catch (error) {
  console.error('✗ Failed to install dependencies');
  process.exit(1);
}

// Create icons directory if missing
if (!fs.existsSync('src/icons')) {
  fs.mkdirSync('src/icons', { recursive: true });
  console.log('✓ Created icons directory');
}

// Initial build
console.log('\n🔨 Running initial build...');
try {
  execSync('npm run build', { stdio: 'inherit' });
} catch (error) {
  console.error('✗ Build failed');
  process.exit(1);
}

console.log('\n✨ Setup complete!\n');
console.log('Available commands:');
console.log('  npm run build    - Build the extension');
console.log('  npm run dev      - Start development mode (auto-rebuild)');
console.log('  npm run package  - Build and create .zip file');
console.log('\nNext steps:');
console.log('1. Open chrome://extensions/');
console.log('2. Enable "Developer mode"');
console.log('3. Click "Load unpacked" and select the "dist" folder\n');