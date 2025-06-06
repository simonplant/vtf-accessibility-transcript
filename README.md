# VTF Audio Extension

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-green.svg)](https://www.google.com/chrome/)
[![Version](https://img.shields.io/badge/version-0.5.0.0-blue.svg)](https://github.com/simonplant/vtf-audio-extension)
[![License](https://img.shields.io/badge/license-MIT-orange.svg)](LICENSE)
[![Chrome Version](https://img.shields.io/badge/Chrome-102%2B-yellow.svg)](https://www.google.com/chrome/)
[![Manifest](https://img.shields.io/badge/Manifest-V3-purple.svg)](https://developer.chrome.com/docs/extensions/mv3/)

Real-time audio transcription for Virtual Trading Floor using OpenAI's Whisper API.

## 🎉 Features

### 🎯 Core Functionality
- **Real-time Audio Capture**: Automatically captures audio from all VTF participants
- **Speaker Identification**: Maps and tracks individual speakers with custom naming
- **Live Transcription**: Converts speech to text using OpenAI's Whisper API
- **Smart Buffering**: Intelligent audio chunking with silence detection
- **Session Persistence**: Maintains transcription history across sessions

### 🚀 New in Version 0.5.0
- **Modern Architecture**: Complete refactor eliminating all fragile hacks
- **AudioWorklet Support**: High-performance audio processing on dedicated thread
- **Enhanced UI**: Real-time status updates, speaker cards, and buffer visualization
- **Robust Error Handling**: Automatic recovery from VTF reconnections
- **Manifest V3**: Future-proof Chrome extension architecture
- **Zero Monkey-Patching**: Clean implementation without property overrides

## 📦 Installation

### Prerequisites
- Chrome browser (version 102 or higher)
- OpenAI API key ([Get one here](https://platform.openai.com/api-keys))
- Access to VTF (vtf.t3live.com)

### Install from Source

1. **Clone the repository:**
   ```bash
   git clone https://github.com/simonplant/vtf-audio-extension.git
   cd vtf-audio-extension
   ```

2. **Load in Chrome:**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `src` directory from the cloned repository

3. **Configure API Key:**
   - Click the extension icon in Chrome toolbar
   - Click the settings (⚙️) button
   - Enter your OpenAI API key
   - Click "Save API Settings"

## 🎮 Usage

### Basic Operation

1. **Navigate to VTF**: Go to [vtf.t3live.com](https://vtf.t3live.com)
2. **Start Capture**: Click the extension icon and press "Start Capture"
3. **Monitor Status**: View real-time speaker activity and transcriptions
4. **Stop Capture**: Click "Stop Capture" when done

### Features Guide

#### Speaker Identification
The extension automatically identifies speakers and allows custom naming:
- Go to **Options → Speaker Identification**
- Add custom mappings for user IDs
- Import/export speaker configurations
- Enable Auto-Learn to automatically save new speakers

#### Auto-Start
Enable automatic capture when visiting VTF:
- **Options → Capture Settings → Auto-start capture**

#### Buffer Configuration
Fine-tune transcription timing:
- **Options → Capture Settings → Buffer Duration**
  - Lower (0.5s) = Faster transcription, more API calls
  - Higher (5s) = Better context, fewer API calls
  - Default: 1.5s (recommended)

#### Silence Detection
Adjust sensitivity for speech detection:
- **Options → Capture Settings → Silence Detection Sensitivity**
  - High: Captures quiet speech
  - Low: Filters out background noise

## 🏗️ Architecture

### System Overview
```
VTF Web Page
    ├── content.js (Main Orchestrator)
    │   ├── VTFGlobalsFinder - Locates VTF global objects
    │   ├── VTFStreamMonitor - Monitors audio stream assignment
    │   ├── VTFStateMonitor - Tracks VTF state changes
    │   └── VTFAudioCapture - Captures audio data
    │       └── AudioDataTransfer - Sends to service worker
    │
    └── background.js (Service Worker)
        ├── UserBufferManager - Manages per-user buffers
        ├── Whisper API Client - Handles transcription
        └── Storage Manager - Persists settings/history
```

### Key Components

#### Foundation Modules
- **VTFGlobalsFinder**: Robustly locates VTF's global objects without timing assumptions
- **VTFStreamMonitor**: Detects audio stream assignment using polling (no monkey-patching)
- **VTFStateMonitor**: Monitors volume changes, session state, and reconnection events

#### Audio Pipeline
- **AudioWorklet**: High-performance audio processing on a separate thread
- **VTFAudioCapture**: Manages capture from multiple audio elements simultaneously
- **AudioDataTransfer**: Efficient data transfer with Int16 compression

#### Service Worker
- **Intelligent Buffering**: Per-user audio buffers with silence detection
- **Retry Logic**: Exponential backoff for API failures
- **Legacy Support**: Compatible with v1.x message formats during migration

## 👨‍💻 Development

### Project Structure
```
vtf-audio-extension/
├── src/
│   ├── content.js          # Main content script
│   ├── background.js       # Service worker
│   ├── manifest.json       # Extension manifest v3
│   ├── popup.html/js       # Extension popup UI
│   ├── options.html/js     # Settings page
│   ├── style.css          # Unified styles
│   ├── modules/           # Core modules
│   │   ├── vtf-globals-finder.js
│   │   ├── vtf-stream-monitor.js
│   │   ├── vtf-state-monitor.js
│   │   ├── vtf-audio-capture.js
│   │   ├── vtf-audio-worklet-node.js
│   │   └── audio-data-transfer.js
│   └── workers/
│       └── audio-worklet.js  # Audio processing worker
├── test/                  # Test files
├── docs/                  # Documentation
│   ├── design/           # Architecture documents
│   └── legacy/           # Migration guides
└── README.md             # This file
```

### Building from Source

Currently, the extension runs directly from source. For production builds:

```bash
# Install dependencies (optional - for build tools)
npm install

# Run tests
npm test

# Build for production (coming soon)
npm run build
```

### Testing

Run the test harness:
1. Load the extension in Chrome
2. Open DevTools Console
3. Run module tests:
   ```javascript
   // Test individual modules
   window.vtfExtension.debug()
   ```

## 🔧 Troubleshooting

### Common Issues

#### Extension Not Initializing
- **Symptom**: "Unable to initialize" or "VTF globals not found" message
- **Solution**: 
  1. Ensure you're on vtf.t3live.com
  2. Wait for VTF to fully load
  3. Refresh the page
  4. Check console for specific error messages

#### No Audio Capture
- **Symptom**: Status shows "Capturing" but no audio activity
- **Solution**: 
  1. Check Chrome site permissions for vtf.t3live.com
  2. Ensure VTF audio is not muted
  3. Verify users have joined with audio
  4. Try VTF's "Reconnect Audio" feature
  5. Check console for stream detection errors

#### API Key Errors
- **Symptom**: "No API key configured" or transcription failures
- **Solution**: 
  1. Verify API key starts with "sk-"
  2. Check OpenAI account has available credits
  3. Ensure API key has audio model permissions
  4. Test key at [platform.openai.com](https://platform.openai.com)

#### High CPU Usage
- **Symptom**: Chrome using excessive CPU during capture
- **Solution**: 
  1. Check if AudioWorklet is supported: `chrome://gpu`
  2. Reduce buffer duration in settings
  3. Disable debug mode if enabled
  4. Close unnecessary VTF video streams

### Debug Mode

Enable comprehensive logging:
1. **Options → Advanced Settings → Enable debug logging**
2. Open Chrome DevTools Console (F12)
3. Look for logs prefixed with module names:
   ```
   [VTF Extension] Initializing...
   [VTF Globals] Found after 500ms
   [Audio Capture] Starting capture for user123
   ```

### Performance Monitoring

Check extension performance:
```javascript
// In DevTools Console
window.vtfExtension.debug()
// Shows detailed state of all modules
```

## 📊 Technical Details

### Audio Processing
- **Sample Rate**: 16kHz (optimal for Whisper)
- **Buffer Size**: 4096 samples (256ms @ 16kHz)
- **Format**: Float32 → Int16 conversion for efficiency
- **Channels**: Mono
- **Silence Threshold**: 0.001 (configurable)

### API Integration
- **Endpoint**: `https://api.openai.com/v1/audio/transcriptions`
- **Model**: whisper-1
- **Audio Format**: WAV (16-bit PCM)
- **Max File Size**: 25MB (approximately 25 minutes)
- **Retry Strategy**: Exponential backoff (1s, 2s, 4s, 8s, 16s)

### Performance Metrics
| Metric | Typical Value | Maximum |
|--------|--------------|---------|
| Startup Time | <500ms | 2s |
| Audio Latency | <50ms | 100ms |
| CPU Usage (AudioWorklet) | 2-3% | 5% |
| CPU Usage (Fallback) | 5-8% | 15% |
| Memory Baseline | 40MB | 60MB |
| Memory per Speaker | 5MB | 10MB |
| Network Usage | 100KB/min | 200KB/min |

## 🔄 Migration from v1.x

### Upgrading Steps

1. **Export your data** (if using v1.x):
   - Use old extension's export feature
   - Save the JSON file

2. **Remove old extension**:
   - Go to `chrome://extensions`
   - Remove VTF Audio Extension v1.x

3. **Install v0.5.0**:
   - Follow installation steps above

4. **Import your data**:
   - Options → Data Management → Import Data
   - Select your exported JSON file

### Breaking Changes
- New message format (legacy support included)
- Different storage structure (automatic migration)
- Completely redesigned UI
- No more inject.js (integrated into content.js)

### What's Preserved
- API keys (migrated automatically)
- Speaker mappings
- Capture settings
- Transcription history (if exported/imported)

## 🤝 Contributing

### Development Setup

1. Fork the repository
2. Create a feature branch:
   ```bash
   git checkout -b feature/amazing-feature
   ```
3. Make your changes
4. Add tests for new functionality
5. Commit with clear messages:
   ```bash
   git commit -m "Add amazing feature"
   ```
6. Push to your fork:
   ```bash
   git push origin feature/amazing-feature
   ```
7. Submit a pull request

### Code Style Guidelines
- ES6+ JavaScript (const/let, arrow functions, async/await)
- Comprehensive error handling with try/catch
- Detailed logging with module prefixes: `[Module Name]`
- JSDoc comments for public methods
- Meaningful variable names (no single letters except loop indices)

### Testing Requirements
- Each module must have a test file
- Test both success and failure cases
- Include edge cases (empty data, network errors)
- Document manual testing steps

## 📜 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- VTF Trading Community for feedback and testing
- OpenAI for the powerful Whisper API
- Chrome Extension developer community
- All contributors and testers

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/simonplant/vtf-audio-extension/issues)
- **Discussions**: [GitHub Discussions](https://github.com/simonplant/vtf-audio-extension/discussions)
- **Wiki**: [Project Wiki](https://github.com/simonplant/vtf-audio-extension/wiki)

## 🚀 Roadmap

### Version 2.1 (Planned)
- [ ] Local Whisper model support
- [ ] Real-time transcription display overlay
- [ ] Keyboard shortcuts
- [ ] Export to various formats (SRT, VTT, TXT)

### Version 2.2 (Future)
- [ ] Multi-language support
- [ ] Custom vocabulary/terminology
- [ ] Speaker diarization improvements
- [ ] Integration with note-taking apps

---

**Disclaimer**: This extension is an independent project and is not affiliated with, endorsed by, or associated with T3 Trading Group, Virtual Trading Floor (VTF), or T3 Live. All trademarks belong to their respective owners.