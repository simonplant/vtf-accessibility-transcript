# VTF Audio System Technical Specification

## Overview

This document provides a comprehensive technical specification of the Virtual Trading Floor (VTF) audio implementation, based on reverse engineering analysis. This specification serves as the authoritative reference for developing audio capture, transcription, and integration tools for the VTF platform.

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Audio Element Management](#audio-element-management)
3. [WebRTC Implementation](#webrtc-implementation)
4. [Audio Stream Handling](#audio-stream-handling)
5. [Volume Control System](#volume-control-system)
6. [Error Recovery Patterns](#error-recovery-patterns)
7. [DOM Structure](#dom-structure)
8. [Integration Points](#integration-points)
9. [Chrome Extension Interface](#chrome-extension-interface)
10. [Implementation Examples](#implementation-examples)

## System Architecture

### Core Components

VTF uses a browser-based WebRTC audio system with the following key components:

- **MediaSoup Service**: Manages WebRTC connections and media routing
- **Audio Element Pool**: DOM-based audio playback management
- **Global State Manager**: Maintains session and audio preferences
- **Consumer Pattern**: Maps WebRTC consumers to audio elements

### High-Level Flow

```
User Joins → WebRTC Negotiation → Track Received → Audio Element Created → Playback Started
```

## Audio Element Management

### Element ID Pattern

All audio elements follow a strict naming convention:

```
msRemAudio-{userID}
```

- **Prefix**: `msRemAudio-` (likely stands for "MediaSoup Remote Audio")
- **Suffix**: User's unique identifier
- **Example**: `msRemAudio-XRcupJu26dK_sazaAAPK`

### Element Creation

```javascript
// VTF's audio element creation pattern
const audioElementId = `msRemAudio-${userData.userID}`;
let audioElement = document.getElementById(audioElementId);

if (!audioElement) {
    const topRoomDiv = document.getElementById('topRoomDiv');
    audioElement = document.createElement('audio');
    audioElement.id = audioElementId;
    audioElement.autoplay = false;  // Important: explicitly disabled
    topRoomDiv.appendChild(audioElement);
}
```

### Element Properties

| Property | Value | Purpose |
|----------|-------|---------|
| `id` | `msRemAudio-{userID}` | Unique identifier |
| `autoplay` | `false` | Prevents autoplay policy issues |
| `srcObject` | MediaStream | WebRTC audio stream |
| `volume` | 0.0 - 1.0 | Synced with global volume |

## WebRTC Implementation

### Peer Connection Configuration

```javascript
const rtcConfig = {
    iceServers: [],
    iceTransportPolicy: "all",
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
    sdpSemantics: "plan-b"  // Legacy, should migrate to "unified-plan"
};
```

### Offer/Answer Parameters

```javascript
// Offer creation
const offerOptions = {
    offerToReceiveAudio: true,
    offerToReceiveVideo: true
};

// Answer creation uses default options
pc.createAnswer();
```

### Track Handling

VTF processes incoming tracks through the `ontrack` event:

1. Creates a new MediaStream
2. Adds the track to the stream
3. Assigns stream to audio element
4. Initiates playback with error handling

## Audio Stream Handling

### Stream Assignment Pattern

```javascript
// 1. Create MediaStream with single track
const stream = new MediaStream();
stream.addTrack(event.track);

// 2. Assign to audio element
audioElement.srcObject = stream;

// 3. Set volume before playback
audioElement.volume = this.globals.audioVolume;

// 4. Play with promise handling
const playPromise = audioElement.play();
if (playPromise !== undefined) {
    playPromise.catch(error => {
        console.error('Error playing audio:', error);
        // Retry logic here
    });
}
```

### Stream Lifecycle

1. **Creation**: When `ontrack` event fires
2. **Active**: During normal playback
3. **Paused**: Via `stopListeningToPresenter()`
4. **Removed**: During `reconnectAudio()` or cleanup

## Volume Control System

### Global Volume Management

```javascript
// Volume is stored as decimal (0.0 - 1.0)
this.globals.audioVolume = volumeDecimal;

// Applied to all audio elements using jQuery selector
$("[id^='msRemAudio-']").prop('volume', volumeDecimal);

// Or vanilla JS
document.querySelectorAll("[id^='msRemAudio-']").forEach(elem => {
    elem.volume = volumeDecimal;
});
```

### Volume Adjustment Function

```javascript
adjustVol(event) {
    let volumePercent = event ? event.target.value : (this.globals.audioVolume * 100);
    const volumeDecimal = volumePercent / 100;
    
    this.globals.audioVolume = volumeDecimal;
    // Update all audio elements
}
```

## Error Recovery Patterns

### Reconnection Strategy

VTF implements a "scorched earth" reconnection approach:

```javascript
reconnectAudio() {
    if (this.globals.sessData.currentState !== 'closed') {
        // 1. Remove ALL audio elements
        $("[id^='msRemAudio-']").remove();
        
        // 2. Recreate for all active users
        this.talkingUsers.forEach(userData => {
            this.startListeningToPresenter(userData);
        });
    }
}
```

### State Management

- Session states: `open`, `closed`
- Maintains `talkingUsers` Map for active participants
- Prevents operations when session is closed

## DOM Structure

### Container Hierarchy

```html
<body>
    <div id="topRoomDiv" style="display: none;">
        <audio id="msRemAudio-user1" autoplay="false"></audio>
        <audio id="msRemAudio-user2" autoplay="false"></audio>
        <!-- More audio elements as users join -->
    </div>
</body>
```

### Key Elements

- **topRoomDiv**: Hidden container for all audio elements
- **Audio elements**: Created dynamically as users join
- **No visual representation**: Audio-only, no controls displayed

## Integration Points

### Key Functions to Monitor

1. **startListeningToPresenter(userData)**
   - Creates/updates audio element
   - Handles stream assignment
   - Manages playback

2. **stopListeningToPresenter(userData)**
   - Pauses audio
   - Resets currentTime
   - Does NOT remove element

3. **reconnectAudio()**
   - Complete audio system reset
   - Removes and recreates all elements

4. **adjustVol(event)**
   - Global volume control
   - Updates all active elements

### Events to Intercept

- Audio element creation (DOM mutation)
- srcObject assignment
- Play/pause events
- Volume changes

## Chrome Extension Interface

### Injection Points

```javascript
// Monitor for audio element creation
const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
            if (node.nodeName === 'AUDIO' && node.id?.startsWith('msRemAudio-')) {
                // New VTF audio element detected
                handleVTFAudioElement(node);
            }
        });
    });
});

// Observe the container
const container = document.getElementById('topRoomDiv') || document.body;
observer.observe(container, { childList: true, subtree: true });
```

### Data Extraction

```javascript
// Extract from audio element
const vtfAudioData = {
    userId: audioElement.id.replace('msRemAudio-', ''),
    streamId: audioElement.id,
    hasStream: !!audioElement.srcObject,
    isPlaying: !audioElement.paused,
    volume: audioElement.volume,
    timestamp: Date.now()
};
```

### Stream Capture

```javascript
// Capture audio for transcription
if (audioElement.srcObject instanceof MediaStream) {
    const audioContext = new AudioContext({ sampleRate: 16000 });
    const source = audioContext.createMediaStreamSource(audioElement.srcObject);
    // Process audio data...
}
```

## Implementation Examples

### Complete Audio Manager

```javascript
class VTFAudioCapture {
    constructor() {
        this.audioElements = new Map();
        this.initializeObserver();
    }
    
    initializeObserver() {
        // Watch for VTF audio elements
        this.observer = new MutationObserver(this.handleMutations.bind(this));
        
        const target = document.getElementById('topRoomDiv') || document.body;
        this.observer.observe(target, {
            childList: true,
            subtree: true
        });
    }
    
    handleMutations(mutations) {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (this.isVTFAudioElement(node)) {
                    this.captureAudioElement(node);
                }
            });
            
            mutation.removedNodes.forEach(node => {
                if (this.isVTFAudioElement(node)) {
                    this.cleanupAudioElement(node);
                }
            });
        });
    }
    
    isVTFAudioElement(node) {
        return node.nodeName === 'AUDIO' && 
               node.id && 
               node.id.startsWith('msRemAudio-');
    }
    
    captureAudioElement(audioElement) {
        const userId = audioElement.id.replace('msRemAudio-', '');
        console.log(`Capturing VTF audio for user: ${userId}`);
        
        // Wait for srcObject
        const checkInterval = setInterval(() => {
            if (audioElement.srcObject) {
                clearInterval(checkInterval);
                this.startTranscription(audioElement, userId);
            }
        }, 100);
    }
    
    startTranscription(audioElement, userId) {
        // Implementation for audio capture and transcription
    }
}
```

### Monitoring Audio State

```javascript
// Monitor all VTF audio elements
function monitorVTFAudio() {
    const audioElements = document.querySelectorAll('audio[id^="msRemAudio-"]');
    
    const audioState = Array.from(audioElements).map(audio => ({
        id: audio.id,
        userId: audio.id.replace('msRemAudio-', ''),
        hasStream: !!audio.srcObject,
        isPlaying: !audio.paused,
        volume: audio.volume,
        currentTime: audio.currentTime
    }));
    
    console.table(audioState);
    return audioState;
}

// Run periodically
setInterval(monitorVTFAudio, 5000);
```

## Best Practices

1. **Always check for existing elements** before creating new ones
2. **Handle play() promise rejections** for autoplay policy compliance
3. **Monitor parent container** (`topRoomDiv`) for efficient mutation observation
4. **Respect VTF's volume model** - sync with their global volume state
5. **Don't remove elements on pause** - VTF reuses them
6. **Implement reconnection handling** - audio may be reset at any time

## Known Limitations

1. **SDP Semantics**: VTF uses deprecated "plan-b" semantics
2. **No ICE Servers**: Configuration shows empty ICE servers array
3. **jQuery Dependency**: Some operations use jQuery selectors
4. **Hidden Container**: All audio elements are in a hidden div

## Version History

- **v1.0** (2024-12): Initial specification based on reverse engineering
- Analysis based on VTF build from June 2025

---

This specification is subject to change as VTF updates their implementation. Regular analysis of their codebase is recommended to maintain compatibility.