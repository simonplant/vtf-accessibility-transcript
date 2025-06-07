#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');
const esbuild = require('esbuild');
const crypto = require('crypto');
const fsSync = require('fs');

// Simple but effective logging
const log = {
  info: (msg) => console.log(`ℹ️  ${msg}`),
  success: (msg) => console.log(`✅ ${msg}`),
  error: (msg) => console.log(`❌ ${msg}`),
  warn: (msg) => console.log(`⚠️  ${msg}`),
  debug: (msg) => console.log(`🔍 ${msg}`)
};

// Project paths
const resolve = (...paths) => path.join(__dirname, '..', ...paths);

// Build state tracking
const buildState = {
  contentHash: null,
  moduleHashes: new Map(),
  errors: [],
  warnings: []
};

// Calculate file hash for change detection
async function getFileHash(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return crypto.createHash('md5').update(content).digest('hex').substring(0, 8);
  } catch (e) {
    return null;
  }
}

// Track which modules are included in the bundle
async function trackModules() {
  const modulesDir = resolve('src/modules');
  const modules = await fs.readdir(modulesDir);
  
  for (const module of modules) {
    if (module.endsWith('.js')) {
      const hash = await getFileHash(path.join(modulesDir, module));
      buildState.moduleHashes.set(module, hash);
    }
  }
}

async function clean() {
  log.info('Cleaning dist directory...');
  try {
    await fs.rm(resolve('dist'), { recursive: true, force: true });
    await fs.mkdir(resolve('dist'), { recursive: true });
    log.success('Cleaned dist directory');
  } catch (error) {
    log.error(`Failed to clean: ${error.message}`);
    throw error;
  }
}

async function copyStaticFiles() {
  log.info('Copying static files...');
  
  const staticFiles = [
    { src: 'manifest.json', required: true },
    { src: 'popup.html', required: true },
    { src: 'popup.js', required: true },
    { src: 'options.html', required: true },
    { src: 'options.js', required: true },
    { src: 'style.css', required: true },
    { src: 'background.js', required: true }
  ];
  
  for (const file of staticFiles) {
    try {
      const srcPath = resolve('src', file.src);
      const destPath = resolve('dist', file.src);
      
      await fs.copyFile(srcPath, destPath);
      const hash = await getFileHash(srcPath);
      log.success(`Copied ${file.src} [${hash}]`);
    } catch (error) {
      if (file.required) {
        log.error(`Failed to copy required file ${file.src}: ${error.message}`);
        throw error;
      } else {
        log.warn(`Could not copy optional file ${file.src}`);
      }
    }
  }
}

async function copyAssets() {
  log.info('Copying assets...');
  
  // Icons
  try {
    await fs.mkdir(resolve('dist/icons'), { recursive: true });
    const iconFiles = await fs.readdir(resolve('src/icons'));
    
    let iconCount = 0;
    for (const icon of iconFiles) {
      if (icon.endsWith('.png')) {
        await fs.copyFile(resolve('src/icons', icon), resolve('dist/icons', icon));
        iconCount++;
      }
    }
    
    if (iconCount > 0) {
      log.success(`Copied ${iconCount} icon files`);
    } else {
      log.warn('No icon files found - extension may not display correctly');
    }
  } catch (error) {
    log.warn('Icons directory not found');
  }
  
  // Workers
  try {
    await fs.mkdir(resolve('dist/workers'), { recursive: true });
    await fs.copyFile(
      resolve('src/workers/audio-worklet.js'), 
      resolve('dist/workers/audio-worklet.js')
    );
    log.success('Copied audio worklet');
  } catch (error) {
    log.error(`Failed to copy workers: ${error.message}`);
    throw error;
  }

  // Inject scripts
  try {
    await fs.mkdir(resolve('dist/inject'), { recursive: true });
    const injectFiles = await fs.readdir(resolve('src/inject'));
    let injectCount = 0;
    for (const file of injectFiles) {
      if (file.endsWith('.js')) {
        await fs.copyFile(
          resolve('src/inject', file),
          resolve('dist/inject', file)
        );
        injectCount++;
      }
    }
    if (injectCount > 0) {
      log.success(`Copied ${injectCount} inject scripts`);
    } else {
      log.error('No inject scripts found!');
      throw new Error('Missing inject scripts');
    }
  } catch (error) {
    log.error(`Failed to copy inject scripts: ${error.message}`);
    throw error;
  }
}

async function bundleContentScript() {
  log.info('Bundling content script...');
  
  // Track modules before bundling
  await trackModules();
  
  try {
    // First, let's verify the entry point exists
    const entryPoint = resolve('src/content.js');
    if (!fsSync.existsSync(entryPoint)) {
      throw new Error('Entry point src/content.js not found!');
    }
    
    const entryHash = await getFileHash(entryPoint);
    log.debug(`Entry point hash: ${entryHash}`);
    
    // Log module hashes
    log.debug('Module hashes:');
    for (const [module, hash] of buildState.moduleHashes) {
      log.debug(`  ${module}: ${hash}`);
    }
    
    const result = await esbuild.build({
      entryPoints: [entryPoint],
      bundle: true,
      outfile: resolve('dist/content.js'),
      format: 'iife',
      target: 'chrome102',
      sourcemap: process.env.NODE_ENV !== 'production',
      minify: process.env.NODE_ENV === 'production',
      metafile: true,
      logLevel: 'info', // Show what esbuild is doing
      loader: {
        '.js': 'js',
      },
      define: {
        'process.env.NODE_ENV': `"${process.env.NODE_ENV || 'development'}"`
      },
      // Add plugin to track what's being bundled
      plugins: [{
        name: 'bundle-tracker',
        setup(build) {
          build.onLoad({ filter: /\.js$/ }, async (args) => {
            const relativePath = path.relative(resolve('src'), args.path);
            log.debug(`  Bundling: ${relativePath}`);
            return null; // Let esbuild handle the actual loading
          });
        }
      }]
    });
    
    // Verify output exists
    const outputPath = resolve('dist/content.js');
    if (!fsSync.existsSync(outputPath)) {
      throw new Error('Bundle was not created!');
    }
    
    // Get output stats
    const stats = await fs.stat(outputPath);
    const sizeKB = (stats.size / 1024).toFixed(2);
    buildState.contentHash = await getFileHash(outputPath);
    
    log.success(`✨ Bundled content.js [${sizeKB} KB, hash: ${buildState.contentHash}]`);
    
    // Analyze what was bundled
    if (result.metafile) {
      const meta = result.metafile;
      const bundledModules = Object.keys(meta.inputs)
        .filter(p => p.includes('modules/'))
        .map(p => path.basename(p));
      
      log.info('Bundled modules:');
      bundledModules.forEach(m => log.success(`  ✓ ${m}`));
      
      // Check for missing modules
      const expectedModules = Array.from(buildState.moduleHashes.keys());
      const missing = expectedModules.filter(m => !bundledModules.includes(m));
      if (missing.length > 0) {
        log.warn('⚠️  Missing modules:');
        missing.forEach(m => log.warn(`  ✗ ${m}`));
      }
      
      // Save build info
      await fs.writeFile(
        resolve('dist/build-info.json'),
        JSON.stringify({
          timestamp: new Date().toISOString(),
          contentHash: buildState.contentHash,
          moduleHashes: Object.fromEntries(buildState.moduleHashes),
          bundledModules,
          stats: {
            size: stats.size,
            modules: bundledModules.length
          }
        }, null, 2)
      );
    }
  } catch (error) {
    log.error(`Failed to bundle content script: ${error.message}`);
    if (error.errors) {
      error.errors.forEach(e => log.error(`  ${e.text}`));
    }
    throw error;
  }
}

async function validateBuild() {
  log.info('Validating build...');
  
  const requiredFiles = [
    'manifest.json',
    'content.js',
    'background.js',
    'popup.html',
    'popup.js',
    'options.html',
    'options.js',
    'style.css',
    'workers/audio-worklet.js'
  ];
  
  const errors = [];
  for (const file of requiredFiles) {
    const filePath = resolve('dist', file);
    try {
      await fs.access(filePath);
      const stats = await fs.stat(filePath);
      if (stats.size === 0) {
        errors.push(`${file} is empty!`);
      }
    } catch {
      errors.push(`${file} is missing!`);
    }
  }
  
  if (errors.length > 0) {
    log.error('Build validation failed:');
    errors.forEach(e => log.error(`  ${e}`));
    throw new Error('Build validation failed');
  }
  
  // Check if content.js actually contains our modules
  const content = await fs.readFile(resolve('dist/content.js'), 'utf8');
  const expectedStrings = [
    'VTFGlobalsFinder',
    'VTFStreamMonitor',
    'VTFStateMonitor',
    'VTFAudioCapture',
    'AudioDataTransfer'
  ];
  
  const missing = expectedStrings.filter(s => !content.includes(s));
  if (missing.length > 0) {
    log.warn('⚠️  Missing expected content in bundle:');
    missing.forEach(m => log.warn(`  ${m}`));
  }
  
  log.success('Build validation passed');
}

async function compareToPrevious() {
  try {
    const buildInfoPath = resolve('dist/build-info.json');
    if (fsSync.existsSync(buildInfoPath)) {
      const prevBuild = JSON.parse(await fs.readFile(buildInfoPath, 'utf8'));
      
      if (prevBuild.contentHash === buildState.contentHash) {
        log.warn('⚠️  Bundle hash unchanged - your changes might not be included!');
        log.warn('   Previous build: ' + new Date(prevBuild.timestamp).toLocaleString());
      } else {
        log.success('Bundle hash changed - new content detected');
      }
    }
  } catch (e) {
    // First build, no comparison
  }
}

async function reportBuildInfo() {
  console.log('\n' + '='.repeat(60));
  console.log('🏗️  VTF Audio Extension Build Complete');
  console.log('='.repeat(60));
  
  const buildInfo = resolve('dist/build-info.json');
  if (fsSync.existsSync(buildInfo)) {
    const info = JSON.parse(await fs.readFile(buildInfo, 'utf8'));
    console.log(`📦 Bundle Hash: ${info.contentHash}`);
    console.log(`📊 Bundle Size: ${(info.stats.size / 1024).toFixed(2)} KB`);
    console.log(`🧩 Modules Bundled: ${info.stats.modules}`);
    console.log(`🕐 Built: ${new Date(info.timestamp).toLocaleTimeString()}`);
  }
  
  if (buildState.warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    buildState.warnings.forEach(w => console.log(`  ${w}`));
  }
  
  console.log('\n📋 Next steps:');
  console.log('  1. Open chrome://extensions/');
  console.log('  2. Click reload button on VTF Audio Extension');
  console.log('  3. Check DevTools console for initialization');
  console.log('  4. Verify your changes are working');
  
  if (process.argv.includes('--open')) {
    console.log('\n🚀 Opening Chrome extensions page...');
    execSync('open -a "Google Chrome" chrome://extensions/');
  }
}

async function main() {
  const startTime = Date.now();
  
  try {
    await clean();
    await copyStaticFiles();
    await copyAssets();
    await bundleContentScript();
    await validateBuild();
    await compareToPrevious();
    await reportBuildInfo();
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n✅ Build completed in ${elapsed}s`);
    
    process.exit(0);
  } catch (error) {
    log.error(`Build failed: ${error.message}`);
    process.exit(1);
  }
}

// Run with --watch flag for basic watching
if (process.argv.includes('--watch')) {
  const chokidar = require('chokidar');
  let building = false;
  
  const watcher = chokidar.watch(resolve('src'), {
    ignored: /node_modules/,
    persistent: true
  });
  
  watcher.on('change', async (path) => {
    if (!building) {
      building = true;
      console.log(`\n🔄 Change detected: ${path}`);
      await main();
      building = false;
    }
  });
  
  console.log('👀 Watching for changes...\n');
  main();
} else {
  main().catch(console.error);
}