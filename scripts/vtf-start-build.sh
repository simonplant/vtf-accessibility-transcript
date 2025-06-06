#!/bin/zsh
# VTF Audio Extension - Development Commands
# ==========================================
# Uncomment the commands you need

# FIRST TIME SETUP (only run once per machine)
# ============================================
cd ~/Documents/code/vtf-audio-extension

# Step 1: Install dependencies and run setup wizard
# npm install
# npm run setup

# DAILY DEVELOPMENT
# =================
# This is what you'll use 99% of the time

# Start development mode (watches for changes, auto-rebuilds)
npm run dev

# After running dev mode:
# 1. Load in Chrome: chrome://extensions/ → "Load unpacked" → select 'dist' folder
# 2. Make code changes
# 3. When you see "✅ Ready!" in terminal → Refresh extension in Chrome
# 4. Test on vtf.t3live.com
# 5. Hit Ctrl+C to stop dev mode

# BUILD & DEPLOY
# ==============

# Create a production build (one-time build, no watching)
# npm run build

# Create distribution package (vtf-audio-extension.zip)
# npm run package

# MAINTENANCE
# ===========

# Run tests
# npm run test

# Clean all build artifacts (if things get weird)
# npm run clean

# Clean and rebuild everything fresh
# npm run clean && npm run build

# TROUBLESHOOTING
# ===============

# If extension won't load:
# - Make sure you selected 'dist' folder, not 'src'
# - Check Chrome DevTools console for errors
# - Try: npm run clean && npm run build

# If changes aren't showing:
# - Make sure npm run dev is still running
# - Refresh extension in chrome://extensions/
# - Hard refresh VTF page (Cmd+Shift+R)

# QUICK REFERENCE
# ===============
# npm run dev      → Development mode (auto-rebuild)
# npm run build    → Single production build
# npm run package  → Create .zip for distribution
# npm run clean    → Remove all build files
# npm run test     → Run test suite