// scripts/build.js
const fs = require('fs').promises;
const path = require('path');
const { existsSync } = require('fs');

async function build() {
  const outdir = 'dist';
  
  console.log('🏗️  Building VTF Audio Extension...\n');
  
  try {
    // Ensure dist directory exists
    await fs.mkdir(outdir, { recursive: true });
    console.log('📁 Created dist directory');
    
    // Copy manifest
    await fs.copyFile('src/manifest.json', path.join(outdir, 'manifest.json'));
    console.log('📄 Copied manifest.json');
    
    // Bundle content script (simple copy for now, no bundling)
    // In production, use esbuild or webpack
    await fs.copyFile('src/content.js', path.join(outdir, 'content.js'));
    console.log('📄 Copied content.js');
    
    // Copy background script
    await fs.copyFile('src/background.js', path.join(outdir, 'background.js'));
    console.log('📄 Copied background.js');
    
    // Copy modules directory
    await fs.cp('src/modules', path.join(outdir, 'modules'), { recursive: true });
    console.log('📁 Copied modules directory');
    
    // Copy workers directory
    await fs.cp('src/workers', path.join(outdir, 'workers'), { recursive: true });
    console.log('📁 Copied workers directory');
    
    // Copy UI files
    const uiFiles = ['popup.html', 'popup.js', 'options.html', 'options.js', 'style.css'];
    for (const file of uiFiles) {
      try {
        await fs.copyFile(`src/${file}`, path.join(outdir, file));
        console.log(`📄 Copied ${file}`);
      } catch (e) {
        console.warn(`⚠️  Warning: ${file} not found in src/`);
      }
    }
    
    // Handle icons
    await createIcons(outdir);
    
    console.log('\n✅ Build complete! Extension ready in dist/');
    console.log('\nTo load the extension:');
    console.log('1. Open Chrome and go to chrome://extensions/');
    console.log('2. Enable "Developer mode"');
    console.log('3. Click "Load unpacked" and select the dist/ directory\n');
    
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

async function createIcons(outdir) {
  const iconsDir = path.join(outdir, 'icons');
  await fs.mkdir(iconsDir, { recursive: true });
  
  // Check if icons already exist in src
  const srcIconsDir = 'src/icons';
  const sizes = [16, 24, 32, 48, 128];
  
  if (existsSync(srcIconsDir)) {
    // Copy existing icons
    try {
      await fs.cp(srcIconsDir, iconsDir, { recursive: true });
      console.log('📁 Copied icons directory');
      return;
    } catch (e) {
      console.warn('⚠️  Warning: Could not copy icons directory');
    }
  }
  
  // Create placeholder icons if they don't exist
  console.log('🎨 Creating placeholder icons...');
  
  for (const size of sizes) {
    const iconPath = path.join(iconsDir, `icon${size}.png`);
    
    if (!existsSync(iconPath)) {
      // Create a simple SVG as placeholder
      const svg = createPlaceholderSVG(size);
      const svgPath = path.join(iconsDir, `icon${size}.svg`);
      await fs.writeFile(svgPath, svg);
      
      // Create empty PNG as placeholder
      await fs.writeFile(iconPath, '');
      console.log(`   Created placeholder icon${size}.png`);
    }
  }
  
  console.log('   ⚠️  Note: Using placeholder icons. Replace with proper icons for production.');
}

function createPlaceholderSVG(size) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="#375a7f" rx="${size/8}"/>
  <text x="${size/2}" y="${size/2 + size/8}" text-anchor="middle" fill="#ffffff" font-family="Arial, sans-serif" font-size="${size/2}" font-weight="bold">VTF</text>
</svg>`;
}

// Handle command line arguments
const args = process.argv.slice(2);
const watch = args.includes('--watch');
const production = process.env.NODE_ENV === 'production';

if (production) {
  console.log('🚀 Building for production...\n');
}

// Run build
build().catch(console.error);

// Watch mode (simple implementation)
if (watch) {
  console.log('\n👁️  Watching for changes...\n');
  
  const { watch: fsWatch } = require('fs');
  const srcDir = 'src';
  
  fsWatch(srcDir, { recursive: true }, (eventType, filename) => {
    if (filename && !filename.includes('.DS_Store')) {
      console.log(`\n🔄 ${filename} changed, rebuilding...`);
      build().catch(console.error);
    }
  });
}