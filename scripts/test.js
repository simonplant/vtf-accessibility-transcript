#!/usr/bin/env node

const { resolve, log, showHeader } = require('./shared');
const fs = require('fs').promises;
const path = require('path');

async function findTestFiles() {
  const testDirs = ['test/unit', 'test/integration'];
  const testFiles = [];
  
  for (const dir of testDirs) {
    try {
      const files = await fs.readdir(resolve(dir));
      const tests = files.filter(f => f.startsWith('test-') && f.endsWith('.js'));
      testFiles.push(...tests.map(f => path.join(dir, f)));
    } catch (error) {
      // Directory doesn't exist
    }
  }
  
  return testFiles;
}

async function runTests() {
  showHeader('VTF Extension Test Suite');
  
  const testFiles = await findTestFiles();
  
  if (testFiles.length === 0) {
    log.warn('No test files found');
    log.info('Test files should be named test-*.js in test/unit/ or test/integration/');
    return;
  }
  
  log.info(`Found ${testFiles.length} test files`);
  console.log('');
  
  // Since tests are browser-based, provide instructions
  console.log('To run tests:');
  console.log('1. Build the extension: npm run build');
  console.log('2. Load in Chrome: chrome://extensions/');
  console.log('3. Navigate to: https://vtf.t3live.com/');
  console.log('4. Open Chrome DevTools (F12)');
  console.log('5. In Console, copy and paste test files:\n');
  
  for (const file of testFiles) {
    console.log(`   • ${file}`);
  }
  
  console.log('\nTest files are designed to run in the browser console.');
  console.log('They test the actual extension modules in their runtime environment.');
}

runTests().catch(error => {
  log.error(`Test runner failed: ${error.message}`);
  process.exit(1);
});