# VTF Audio Extension Debugging Guide

## Quick Diagnostic Checklist

When the extension isn't working, check the Chrome DevTools console for these key indicators:

### 1. Context Verification
Look for: `[VTF Inject] Running in context: PAGE`
- ✅ `PAGE` = Good, running in page context
- ❌ `CONTENT_SCRIPT` = Bad, still sandboxed
- ❌ No log = Script didn't inject at all

### 2. AUDIO-FIRST Initialization 🎵
Look for immediate audio monitoring:
```
[VTF Inject] Starting AUDIO-FIRST initialization
[VTF Inject] DOM observer active, watching for audio elements
[VTF Inject] Audio scan: 5 total, 2 msRemAudio
[VTF Inject] Initial scan complete: 2 audio elements captured
```

The extension now captures audio IMMEDIATELY, without waiting for globals!

### 3. Optional Globals Discovery (Background)
Globals are now discovered in the background - NOT required for audio capture:
```
[VTF Inject] Starting OPTIONAL globals discovery in background...
[VTF Inject] BONUS: Found globals after 5 attempts!
```

If globals are never found, the extension still works perfectly for audio!

### 4. Navigation Events
On room changes or navigation:
```
[VTF Inject] SPA navigation detected, re-checking state
[VTF Inject] URL changed to: https://vtf.t3live.com/room/1234
```

## Common Issues & Solutions

### Issue 1: "Context: CONTENT_SCRIPT"
**Problem**: Script running in wrong context
**Solution**: Check CSP errors, ensure inject.js is in web_accessible_resources

### Issue 2: "No globals found yet" (forever)
**Problem**: VTF app hasn't initialized
**Debug**: Check for:
- Angular/React loaded
- topRoomDiv exists
- Single-letter globals present

### Issue 3: Audio elements exist but no capture
**Problem**: srcObject not ready
**Debug**: Look for:
```
[VTF Inject] Attempting to capture audio element: {
  hasSrcObject: false,  // ← Problem here
  audioTracks: 0
}
```

### Issue 4: Globals disappear after navigation
**Problem**: SPA navigation replaced globals
**Solution**: Extension should auto-detect and re-initialize

## Debug Commands in Console

Run these in the Chrome DevTools console:

```javascript
// Check extension state
window.__vtfInjectState

// Check found globals
window.__vtfInjectGlobals

// Check active audio captures
window.__vtfInjectCaptures

// Force re-check globals
window.postMessage({ source: 'vtf-content', type: 'refreshState' }, '*')

// Check VTF globals directly
window.E_
```

## Collecting Debug Logs

1. Open Chrome DevTools (F12)
2. Go to Console tab
3. Filter by "VTF" to see extension logs
4. Reproduce the issue
5. Copy all logs starting from page load

The comprehensive logging will show exactly where initialization fails! 