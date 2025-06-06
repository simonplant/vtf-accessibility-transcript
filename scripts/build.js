// scripts/build.js
import esbuild from 'esbuild';
import fs from 'fs/promises';
import path from 'path';

async function build() {
  const outdir = 'dist';
  
  // Ensure dist directory exists
  await fs.mkdir(outdir, { recursive: true });
  
  // Copy manifest
  await fs.copyFile('src/manifest.json', path.join(outdir, 'manifest.json'));
  
  // Bundle content script with all modules
  await esbuild.build({
    entryPoints: ['src/content.js'],
    bundle: true,
    outfile: path.join(outdir, 'content.js'),
    format: 'iife',
    target: 'chrome102',
    minify: process.env.NODE_ENV === 'production'
  });
  
  // Bundle background script
  await esbuild.build({
    entryPoints: ['src/background.js'],
    bundle: true,
    outfile: path.join(outdir, 'background.js'),
    format: 'esm',
    platform: 'browser',
    target: 'chrome102',
    minify: process.env.NODE_ENV === 'production'
  });
  
  // Copy workers directory
  await fs.cp('src/workers', path.join(outdir, 'workers'), { recursive: true });
  
  // Copy legacy files if they exist (popup.html, options.html)
  const legacyFiles = ['popup.html', 'options.html', 'popup.js', 'options.js', 'style.css'];
  for (const file of legacyFiles) {
    try {
      await fs.copyFile(`src/legacy/${file}`, path.join(outdir, file));
    } catch (e) {
      // File might not exist
    }
  }
  
  // Create basic icons if they don't exist
  await createIcons(outdir);
  
  console.log('Build complete! Extension ready in dist/');
}

async function createIcons(outdir) {
  const iconsDir = path.join(outdir, 'icons');
  await fs.mkdir(iconsDir, { recursive: true });
  
  // Check if icons already exist
  const sizes = [16, 48, 128];
  for (const size of sizes) {
    const iconPath = path.join(iconsDir, `icon${size}.png`);
    try {
      await fs.access(iconPath);
    } catch {
      // Create a simple colored square as placeholder
      console.log(`Creating placeholder icon${size}.png`);
      // You would use a library like canvas or sharp here
      // For now, just create empty files as placeholders
      await fs.writeFile(iconPath, '');
    }
  }
}

build().catch(console.error);