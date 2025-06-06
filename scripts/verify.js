#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const resolve = (...paths) => path.join(__dirname, '..', ...paths);

console.log('\n🔍 VTF Extension Build Verification\n');

// Check if dist exists
if (!fs.existsSync(resolve('dist'))) {
  console.log('❌ No dist folder found! Run: npm run build');
  process.exit(1);
}

// Check content.js
const contentPath = resolve('dist/content.js');
if (!fs.existsSync(contentPath)) {
  console.log('❌ No content.js found in dist!');
  process.exit(1);
}

const content = fs.readFileSync(contentPath, 'utf8');
const contentHash = crypto.createHash('md5').update(content).digest('hex').substring(0, 8);

console.log(`📦 content.js hash: ${contentHash}`);
console.log(`📏 content.js size: ${(content.length / 1024).toFixed(2)} KB`);

// Check for expected modules
const modules = [
  'VTFGlobalsFinder',
  'VTFStreamMonitor', 
  'VTFStateMonitor',
  'VTFAudioCapture',
  'AudioDataTransfer'
];

console.log('\n🧩 Module presence check:');
modules.forEach(module => {
  if (content.includes(module)) {
    console.log(`  ✅ ${module} found`);
  } else {
    console.log(`  ❌ ${module} MISSING!`);
  }
});

// Check for common issues
console.log('\n🚨 Common issues check:');

// Check for import statements (shouldn't be in bundle)
if (content.includes('import {') || content.includes('export {')) {
  console.log('  ⚠️  Found unbundled import/export statements!');
} else {
  console.log('  ✅ No unbundled imports found');
}

// Check for source maps in dev
if (process.env.NODE_ENV !== 'production' && !fs.existsSync(resolve('dist/content.js.map'))) {
  console.log('  ⚠️  No source map found (makes debugging harder)');
} else if (fs.existsSync(resolve('dist/content.js.map'))) {
  console.log('  ✅ Source map present');
}

// Compare to source
console.log('\n📊 Source vs Build comparison:');
const srcContent = fs.readFileSync(resolve('src/content.js'), 'utf8');
const srcModules = fs.readdirSync(resolve('src/modules')).filter(f => f.endsWith('.js'));

console.log(`  Source files: content.js + ${srcModules.length} modules`);
console.log(`  Source size: ${(srcContent.length / 1024).toFixed(2)} KB`);
console.log(`  Bundle size: ${(content.length / 1024).toFixed(2)} KB`);
console.log(`  Compression: ${((1 - content.length / (srcContent.length * (srcModules.length + 1))) * 100).toFixed(1)}%`);

// Check build info
const buildInfoPath = resolve('dist/build-info.json');
if (fs.existsSync(buildInfoPath)) {
  const buildInfo = JSON.parse(fs.readFileSync(buildInfoPath, 'utf8'));
  const buildAge = Date.now() - new Date(buildInfo.timestamp).getTime();
  const ageMinutes = Math.floor(buildAge / 60000);
  
  console.log(`\n🕐 Last build: ${ageMinutes} minutes ago`);
  
  if (buildInfo.contentHash !== contentHash) {
    console.log('  ⚠️  Hash mismatch! Build info might be stale.');
  }
} else {
  console.log('\n⚠️  No build-info.json found');
}

// Quick test - can we instantiate the extension?
console.log('\n🧪 Quick instantiation test:');
try {
  // Simple check - does the bundled code parse?
  new Function(content);
  console.log('  ✅ Bundle syntax is valid');
  
  // Check for window.vtfExtension assignment
  if (content.includes('window.vtfExtension')) {
    console.log('  ✅ Extension global assignment found');
  } else {
    console.log('  ⚠️  No window.vtfExtension assignment found');
  }
} catch (e) {
  console.log('  ❌ Bundle has syntax errors!', e.message);
}

console.log('\n✨ Verification complete\n');