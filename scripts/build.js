#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');
const esbuild = require('esbuild');
const { resolve, log, showHeader } = require('./shared');
const fsSync = require('fs');

async function clean() {
  log.step('Cleaning dist directory...');
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
  log.step('Copying static files...');
  
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
      await fs.copyFile(resolve('src', file.src), resolve('dist', file.src));
      log.success(`Copied ${file.src}`);
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
  log.step('Copying assets...');
  
  // Copy icons
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
  
  // Copy workers
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
}

async function bundleContentScript() {
  log.step('Bundling content script...');
  
  try {
    const result = await esbuild.build({
      entryPoints: [resolve('src/content.js')],
      bundle: true,
      outfile: resolve('dist/content.js'),
      format: 'iife',
      target: 'chrome102',
      sourcemap: process.env.NODE_ENV !== 'production',
      minify: process.env.NODE_ENV === 'production',
      metafile: true,
      loader: {
        '.js': 'js',
      },
      define: {
        'process.env.NODE_ENV': `"${process.env.NODE_ENV || 'development'}"`
      }
    });
    
    // Report bundle size
    const stats = await fs.stat(resolve('dist/content.js'));
    const sizeKB = (stats.size / 1024).toFixed(2);
    log.success(`Bundled content script (${sizeKB} KB)`);
    
    // Save metafile for analysis
    if (result.metafile) {
      await fs.writeFile(
        resolve('dist/meta.json'), 
        JSON.stringify(result.metafile, null, 2)
      );
    }
  } catch (error) {
    log.error(`Failed to bundle content script: ${error.message}`);
    throw error;
  }
}

async function validateBuild() {
  log.step('Validating build...');
  
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
    try {
      await fs.access(resolve('dist', file));
    } catch {
      errors.push(file);
    }
  }
  
  if (errors.length > 0) {
    log.error(`Missing required files: ${errors.join(', ')}`);
    throw new Error('Build validation failed');
  }
  
  log.success('Build validation passed');
}

async function createPackage() {
  log.step('Creating extension package...');
  
  try {
    // Get version from manifest
    const manifest = JSON.parse(
      await fs.readFile(resolve('dist/manifest.json'), 'utf8')
    );
    const filename = `vtf-audio-extension-v${manifest.version}.zip`;
    
    execSync(`cd "${resolve('dist')}" && zip -r "../${filename}" .`, { 
      stdio: 'pipe' 
    });
    
    const stats = await fs.stat(resolve(filename));
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    log.success(`Created ${filename} (${sizeMB} MB)`);
  } catch (error) {
    log.error(`Failed to create package: ${error.message}`);
    throw error;
  }
}

async function reportBuildInfo() {
  try {
    const manifest = JSON.parse(
      await fs.readFile(resolve('dist/manifest.json'), 'utf8')
    );
    // List output files and sizes
    const distFiles = await fs.readdir(resolve('dist'));
    const fileStats = await Promise.all(distFiles.map(async f => {
      const stat = await fs.stat(resolve('dist', f));
      return { name: f, size: stat.size };
    }));
    // List icons
    let iconCount = 0;
    try {
      iconCount = (await fs.readdir(resolve('dist/icons'))).length;
    } catch {}
    // List warnings
    let warnings = [];
    try {
      const icons = await fs.readdir(resolve('src/icons'));
      if (!icons.some(f => f.endsWith('.png'))) {
        warnings.push('No icon files found! Please add icon16.png, icon48.png, icon128.png to src/icons/');
      }
    } catch {
      warnings.push('No icon files found! Please add icon16.png, icon48.png, icon128.png to src/icons/');
    }
    // Print summary
    showHeader('VTF Audio Extension Build Report');
    console.log('Build Summary:');
    console.log(`  Version: ${manifest.version}`);
    console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`  Timestamp: ${new Date().toISOString()}`);
    console.log('\nOutput Files:');
    for (const f of fileStats) {
      console.log(`  dist/${f.name}`.padEnd(28) + `${(f.size/1024).toFixed(1)} KB`);
    }
    if (iconCount > 0) {
      console.log(`  dist/icons/`.padEnd(28) + `${iconCount} files`);
    }
    if (warnings.length) {
      console.log('\nWarnings:');
      for (const w of warnings) {
        log.warn(w);
      }
    }
    console.log('\nNext Steps:');
    console.log('  1. Open chrome://extensions/');
    console.log('  2. Click "Load unpacked" and select the "dist" folder');
    console.log('  3. Reload the extension if already loaded');
    if (process.argv.includes('--open')) {
      // macOS only: open chrome://extensions/
      try {
        execSync('open "chrome://extensions/"');
        log.info('Opened chrome://extensions/ in your default browser.');
      } catch {}
    }
  } catch (error) {
    // Ignore errors
  }
}

async function main() {
  showHeader('VTF Audio Extension Build');
  
  const startTime = Date.now();
  
  try {
    await clean();
    await copyStaticFiles();
    await copyAssets();
    await bundleContentScript();
    await validateBuild();
    
    if (process.argv.includes('--package')) {
      await createPackage();
    }
    
    await reportBuildInfo();
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    log.success(`Build completed in ${elapsed}s`);
    
    if (!process.argv.includes('--package')) {
      console.log(`
Next steps:
  1. Open chrome://extensions/
  2. Enable "Developer mode"
  3. Click "Load unpacked" → select the "dist" folder
  4. Or reload the extension if already loaded
`);
    }
    
    process.exit(0);
  } catch (error) {
    log.error(`Build failed: ${error.message}`);
    process.exit(1);
  }
}

// Run build
main().catch(console.error);