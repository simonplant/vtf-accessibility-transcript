# Changelog

## [0.5.0] - 2025-06-05

### Changed
- Complete refactor to eliminate srcObject monkey-patching
- Migrated from inject.js pattern to single content script
- Implemented AudioWorklet for better performance
- Added robust VTF globals detection

### Added
- Comprehensive error handling with retry logic
- State synchronization with VTF
- Automated testing framework
- Memory management improvements

### Removed
- inject.js (functionality merged into content.js)
- ScriptProcessorNode (moved to fallback only)

## [0.4.0] - 2025-05-20

### Current Stable Release
- Basic audio capture working
- Whisper API integration
- Known issues: timing dependencies, srcObject hack