#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const resolve = (...paths) => path.join(__dirname, '..', ...paths);

// Get hash of file
function getFileHash(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf8');
  return crypto.createHash('md5').update(content).digest('hex').substring(0, 8);
}

// Get last modified time
function getModifiedTime(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return fs.statSync(filePath).mtime;
}

console.log('\n🔄 What Changed Since Last Build?\n');

// Check git status first
try {
  const gitStatus = execSync('git status --porcelain src/', { encoding: 'utf8' });
  if (gitStatus) {
    console.log('📝 Git changes in src/:');
    console.log(gitStatus);
  } else {
    console.log('✅ No uncommitted changes in src/');
  }
} catch (e) {
  console.log('⚠️  Not a git repository or git not available');
}

// Compare source files to dist
const sourceFiles = [
  'content.js',
  'background.js',
  'popup.js',
  'options.js'
];

console.log('\n🕐 File modification times:');
console.log('File'.padEnd(20) + 'Source Modified'.padEnd(25) + 'Dist Modified');
console.log('-'.repeat(65));

sourceFiles.forEach(file => {
  const srcPath = resolve('src', file);
  const distPath = resolve('dist', file);
  
  const srcTime = getModifiedTime(srcPath);
  const distTime = getModifiedTime(distPath);
  
  if (!srcTime) return;
  
  const srcStr = srcTime ? srcTime.toLocaleString() : 'Not found';
  const distStr = distTime ? distTime.toLocaleString() : 'Not built';
  
  console.log(
    file.padEnd(20) +
    srcStr.padEnd(25) +
    distStr
  );
  
  if (srcTime && distTime && srcTime > distTime) {
    console.log(`  ⚠️  Source is newer than build!`);
  }
});

// Check modules
console.log('\n📦 Module changes:');
const modulesDir = resolve('src/modules');
const modules = fs.readdirSync(modulesDir).filter(f => f.endsWith('.js'));

const buildInfoPath = resolve('dist/build-info.json');
let previousHashes = {};
if (fs.existsSync(buildInfoPath)) {
  const buildInfo = JSON.parse(fs.readFileSync(buildInfoPath, 'utf8'));
  previousHashes = buildInfo.moduleHashes || {};
}

let changedModules = [];
modules.forEach(module => {
  const currentHash = getFileHash(path.join(modulesDir, module));
  const previousHash = previousHashes[module];
  
  if (!previousHash) {
    console.log(`  🆕 ${module} (new module)`);
    changedModules.push(module);
  } else if (currentHash !== previousHash) {
    console.log(`  🔄 ${module} (modified)`);
    changedModules.push(module);
  } else {
    console.log(`  ✅ ${module} (unchanged)`);
  }
});

// Check if bundle reflects changes
if (changedModules.length > 0 && fs.existsSync(resolve('dist/content.js'))) {
  console.log('\n🔍 Checking if changes are in bundle:');
  const bundleContent = fs.readFileSync(resolve('dist/content.js'), 'utf8');
  
  // Simple check: when was bundle last modified vs source files
  const bundleTime = getModifiedTime(resolve('dist/content.js'));
  const latestSourceTime = Math.max(
    ...modules.map(m => getModifiedTime(path.join(modulesDir, m))?.getTime() || 0)
  );
  
  if (latestSourceTime > bundleTime?.getTime()) {
    console.log('  ❌ Bundle is older than source files!');
    console.log('  🔨 Run: npm run build');
  } else {
    console.log('  ✅ Bundle is up to date');
  }
}

// Show build command reminder
if (changedModules.length > 0) {
  console.log(`\n💡 You have ${changedModules.length} changed modules.`);
  console.log('   Run: npm run build');
  console.log('   Or:  npm run dev (for auto-rebuild)\n');
}

console.log();