# VTF Audio Transcription Extension

Chrome extension that captures and transcribes audio from the VTF trading floor.

## Current Status

✅ **Working:**
- Audio capture from VTF (Howler.js streams)
- Extension infrastructure (popup, background, content scripts)
- Audio data flow to offscreen document
- Settings and transcript storage
- Export functionality

❌ **Not Working:**
- Speech recognition (Vosk.js incompatible with Manifest V3)

## Architecture

```
VTF Page → inject.js → content.js → background.js → offscreen.js → [Speech Recognition]
                ↑                                            ↓
            Howler.js                                  Transcripts
```

## Files

- `manifest.json` - Extension configuration
- `background.js` - Service worker, manages state
- `content.js` - Captures audio from page
- `inject.js` - Injected into VTF page to hook Howler
- `offscreen.js` - Processes audio (TODO: add speech recognition)
- `popup.js/html` - User interface
- `options.js/html` - Settings page

## Known Issues

1. **Vosk.js doesn't work in Manifest V3** due to CSP restrictions (no eval allowed)
2. Need alternative speech recognition library that:
   - Works offline
   - No eval() or Function() usage
   - Can process Float32Array audio chunks
   - Runs in browser environment

## Setup

1. Clone repository
2. Open Chrome Extensions (chrome://extensions/)
3. Enable Developer Mode
4. Click "Load unpacked"
5. Select the extension directory

## Usage

1. Navigate to VTF (https://vtf.t3live.com)
2. Click extension icon
3. Click "Start Transcription"
4. Audio is being captured (check debug console)
5. Transcripts will appear once speech recognition is implemented

## Development

To add speech recognition:
1. Edit `offscreen.js`
2. Replace the TODO section with a working library
3. Process Float32Array chunks at 16kHz
4. Send results via chrome.runtime.sendMessage

## Testing

Use test-audio.js utilities in VTF console:
```javascript
// Inject test utilities
window.postMessage({ type: 'INJECT_TEST_SCRIPT' }, '*');

// Play test sounds
vtfTest.tone(440, 1000);
vtfTest.vtfSound(7);
```


### Run
```bash
__vtfAudioDebug()
```