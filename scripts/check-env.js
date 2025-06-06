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

// Dependency and security checks
const { execSync } = require('child_process');
console.log('\n🔍 Checking dependencies...');
try {
  const outdated = execSync('npm outdated --json', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
  const outdatedObj = JSON.parse(outdated);
  if (Object.keys(outdatedObj).length === 0) {
    console.log('  ✓ All dependencies are up to date');
  } else {
    console.warn('  ⚠ Some dependencies are outdated:');
    for (const dep in outdatedObj) {
      const info = outdatedObj[dep];
      console.warn(`    ${dep}: current ${info.current}, latest ${info.latest}`);
    }
  }
} catch (e) {
  if (e.stdout) {
    try {
      const outdatedObj = JSON.parse(e.stdout);
      if (Object.keys(outdatedObj).length === 0) {
        console.log('  ✓ All dependencies are up to date');
      } else {
        console.warn('  ⚠ Some dependencies are outdated:');
        for (const dep in outdatedObj) {
          const info = outdatedObj[dep];
          console.warn(`    ${dep}: current ${info.current}, latest ${info.latest}`);
        }
      }
    } catch {}
  }
}
try {
  const audit = execSync('npm audit --omit=dev --json', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
  const auditObj = JSON.parse(audit);
  if (auditObj.metadata && auditObj.metadata.vulnerabilities && auditObj.metadata.vulnerabilities.total === 0) {
    console.log('  ✓ No known vulnerabilities');
  } else {
    console.warn('  ⚠ Vulnerabilities found:');
    if (auditObj.metadata && auditObj.metadata.vulnerabilities) {
      for (const [sev, count] of Object.entries(auditObj.metadata.vulnerabilities)) {
        if (sev !== 'total' && count > 0) {
          console.warn(`    ${sev}: ${count}`);
        }
      }
    }
  }
} catch (e) {
  if (e.stdout) {
    try {
      const auditObj = JSON.parse(e.stdout);
      if (auditObj.metadata && auditObj.metadata.vulnerabilities && auditObj.metadata.vulnerabilities.total === 0) {
        console.log('  ✓ No known vulnerabilities');
      } else {
        console.warn('  ⚠ Vulnerabilities found:');
        if (auditObj.metadata && auditObj.metadata.vulnerabilities) {
          for (const [sev, count] of Object.entries(auditObj.metadata.vulnerabilities)) {
            if (sev !== 'total' && count > 0) {
              console.warn(`    ${sev}: ${count}`);
            }
          }
        }
      }
    } catch {}
  }
}