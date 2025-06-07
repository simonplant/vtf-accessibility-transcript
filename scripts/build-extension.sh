#!/bin/bash

# VTF Audio Extension Build Script
# This script packages the Chrome extension for distribution

set -e  # Exit on error

echo "🚀 Building VTF Audio Extension..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

# Build directory
BUILD_DIR="$PROJECT_ROOT/dist"
TEMP_DIR="$PROJECT_ROOT/.build-temp"

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf "$BUILD_DIR"
rm -rf "$TEMP_DIR"
mkdir -p "$BUILD_DIR"
mkdir -p "$TEMP_DIR"

# Copy extension files
echo "📁 Copying extension files..."
cd "$PROJECT_ROOT"

# Create directory structure
mkdir -p "$TEMP_DIR/src"
mkdir -p "$TEMP_DIR/src/inject"
mkdir -p "$TEMP_DIR/src/workers"
mkdir -p "$TEMP_DIR/src/modules"
mkdir -p "$TEMP_DIR/src/icons"

# Copy manifest and core files
cp src/manifest.json "$TEMP_DIR/src/"
cp src/background.js "$TEMP_DIR/src/"
cp src/content.js "$TEMP_DIR/src/"
cp src/popup.js "$TEMP_DIR/src/"
cp src/popup.html "$TEMP_DIR/src/"
cp src/style.css "$TEMP_DIR/src/"
cp src/options.js "$TEMP_DIR/src/"
cp src/options.html "$TEMP_DIR/src/"

# Copy inject script
cp src/inject/inject.js "$TEMP_DIR/src/inject/"

# Copy workers
cp src/workers/audio-worklet.js "$TEMP_DIR/src/workers/"

# Copy modules
cp src/modules/vtf-audio-capture.js "$TEMP_DIR/src/modules/"
cp src/modules/vtf-audio-worklet-node.js "$TEMP_DIR/src/modules/"
cp src/modules/audio-data-transfer.js "$TEMP_DIR/src/modules/"
cp src/modules/audio-quality-monitor.js "$TEMP_DIR/src/modules/"
cp src/modules/circuit-breaker.js "$TEMP_DIR/src/modules/"
cp src/modules/adaptive-buffer.js "$TEMP_DIR/src/modules/"
cp src/modules/reconnection-handler.js "$TEMP_DIR/src/modules/"

# Copy icons (create dummy icons if they don't exist)
if [ -d "src/icons" ] && [ "$(ls -A src/icons)" ]; then
    cp src/icons/* "$TEMP_DIR/src/icons/"
else
    echo -e "${YELLOW}⚠️  No icons found, creating placeholders...${NC}"
    # Create placeholder icons (you should replace these with actual icons)
    echo "ICON" > "$TEMP_DIR/src/icons/icon16.png"
    echo "ICON" > "$TEMP_DIR/src/icons/icon48.png"
    echo "ICON" > "$TEMP_DIR/src/icons/icon128.png"
fi

# Validate manifest
echo "✅ Validating manifest..."
if ! python3 -m json.tool "$TEMP_DIR/src/manifest.json" > /dev/null 2>&1; then
    echo -e "${RED}❌ Invalid manifest.json${NC}"
    exit 1
fi

# Update version in manifest
VERSION=$(cat "$PROJECT_ROOT/version.txt" 2>/dev/null || echo "1.0.0")
echo "📌 Setting version to $VERSION"
if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" "$TEMP_DIR/src/manifest.json"
else
    sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" "$TEMP_DIR/src/manifest.json"
fi

# Create ZIP file
echo "📦 Creating extension package..."
cd "$TEMP_DIR"
zip -r "$BUILD_DIR/vtf-audio-extension-v$VERSION.zip" src/

# Create unpacked directory for development
cp -r "$TEMP_DIR/src" "$BUILD_DIR/unpacked"

# Clean up temp directory
rm -rf "$TEMP_DIR"

# Summary
echo ""
echo -e "${GREEN}✅ Build complete!${NC}"
echo ""
echo "📦 Extension package: $BUILD_DIR/vtf-audio-extension-v$VERSION.zip"
echo "📁 Unpacked extension: $BUILD_DIR/unpacked"
echo ""
echo "To install in Chrome:"
echo "1. Open chrome://extensions/"
echo "2. Enable 'Developer mode'"
echo "3. Click 'Load unpacked' and select: $BUILD_DIR/unpacked"
echo ""
echo "To distribute:"
echo "Upload $BUILD_DIR/vtf-audio-extension-v$VERSION.zip to Chrome Web Store" 