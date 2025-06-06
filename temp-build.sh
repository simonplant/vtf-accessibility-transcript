#!/bin/bash
echo "🔨 Building VTF Audio Extension..."

# Clean
rm -rf dist *.zip

# Create directories
mkdir -p dist/icons dist/workers

# Copy static files
cp src/manifest.json dist/
cp src/popup.* dist/
cp src/options.* dist/
cp src/background.js dist/
cp src/style.css dist/

# Copy icons
cp src/icons/*.png dist/icons/ 2>/dev/null || echo "No icons found"

# Copy workers
cp src/workers/*.js dist/workers/ 2>/dev/null || echo "No workers found"

# Bundle content script
npx esbuild src/content.js --bundle --outfile=dist/content.js --format=iife --target=chrome102 --minify

echo "✅ Build complete!"
echo "Load the 'dist' folder in Chrome extensions"
