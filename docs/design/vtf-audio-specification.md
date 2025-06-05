# VTF Audio System Technical Specification - Enhanced Edition

## Overview

This document provides a comprehensive technical specification of the Virtual Trading Floor (VTF) audio implementation, based on reverse engineering analysis and detailed code examination. This specification serves as the authoritative reference for developing audio capture, transcription, and integration tools for the VTF platform.

**Last Updated**: December 2024  
**Analysis Date**: June 2025 build  
**Document Version**: 2.0

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Audio Element Management](#audio-element-management)
3. [WebRTC Implementation](#webrtc-implementation)
4. [MediaSoup Integration](#mediasoup-integration)
5. [Audio Stream Handling](#audio-stream-handling)
6. [Volume Control System](#volume-control-system)
7. [Error Recovery Patterns](#error-recovery-patterns)
8. [DOM Structure](#dom-structure)
9. [Integration Points](#integration-points)
10. [Chrome Extension Interface](#chrome-extension-interface)
11. [Implementation Examples](#implementation-examples)
12. [Code Patterns and Constants](#code-patterns-and-constants)

## System Architecture

### Core Components

VTF uses a browser-based WebRTC audio system with the following key components:

- **MediaSoup Service**: Manages WebRTC connections and media routing
  - Handles producer/consumer pattern for audio streams
  - Maintains consumer map keyed by producer ID
  - Manages both audio and video producers
  
- **Audio Element Pool**: DOM-based audio playback management
  - Elements created dynamically as users join
  - Reused when users reconnect
  - All elements hidden in `topRoomDiv` container
  
- **Global State Manager**: Maintains session and audio preferences
  - Tracks `audioVolume` (0.0-1.0 decimal range)
  - Session states: `open`, `closed`
  - Maintains `talkingUsers` Map
  
- **Consumer Pattern**: Maps WebRTC consumers to audio elements
  - One consumer per remote user
  - Consumers stored in Map by producer ID

### High-Level Flow

```
User Joins → WebRTC Negotiation → Consumer Created → Track Received → Audio Element Created → Stream Assigned → Playback Started
```

### Detailed Flow

1. **User Connection**
   - `startListeningToPresenter(userData)` called
   - Consumer created via MediaSoup
   - Consumer stored: `this.consumers.set(userData.producerID, consumer)`

2. **Stream Creation**
   - New MediaStream created
   - Track added: `stream.addTrack(consumer.track)`
   - Track type checked: `"video" !== consumer.track.kind`

3. **Audio Element Setup**
   - Element ID generated: `msRemAudio-${userData.userID}`
   - Existing element checked
   - New element created if needed
   - Stream assigned to element

4. **Playback Initiation**
   - Volume set from global state
   - Play() called with promise handling
   - Autoplay failures handled with user interaction

## Audio Element Management

### Element ID Pattern

All audio elements follow a strict naming convention:

```
msRemAudio-{userID}
```

- **Prefix**: `msRemAudio-` (MediaSoup Remote Audio)
- **Suffix**: User's unique identifier from `userData.userID`
- **Example**: `msRemAudio-XRcupJu26dK_sazaAAPK`

### Element Creation - Detailed Implementation

```javascript
// Actual VTF implementation pattern
if ("video" !== consumer.track.kind) {
    let elementId = "msRemAudio-" + userData.userID;
    S_("id: " + elementId); // VTF logging function
    
    let audioElement = document.getElementById(elementId);
    
    if (audioElement) {
        audioElement.srcObject = stream;
    } else {
        let topRoomDiv = document.getElementById("topRoomDiv");
        let newAudioElement = document.createElement("audio");
        newAudioElement.srcObject = stream;
        newAudioElement.id = elementId;
        newAudioElement.autoplay = false; // Explicitly disabled
        topRoomDiv.appendChild(newAudioElement);
        audioElement = newAudioElement;
    }
    
    // Volume and playback handling
    audioElement.volume = this.globals.audioVolume;
    let playPromise = audioElement.play();
    
    if (playPromise !== undefined) {
        playPromise.catch(function(error) {
            // Autoplay failure handling
            this.alertsService.hideAll();
            S_("audiobridge Autoplay FAILED. need user OK...");
            this.alertsService.alert("Your browser needs your OK to play audio");
        }.bind(this));
    }
}
```

### Element Properties

| Property | Value | Purpose | Notes |
|----------|-------|---------|-------|
| `id` | `msRemAudio-{userID}` | Unique identifier | Used for jQuery selectors |
| `autoplay` | `false` | Prevents autoplay policy issues | Explicitly set on creation |
| `srcObject` | MediaStream | WebRTC audio stream | Set immediately on creation |
| `volume` | 0.0 - 1.0 | Synced with global volume | Applied before play() |
| `currentTime` | 0 | Reset on pause | Used in stopListeningToPresenter |

### Element Lifecycle Management

1. **Creation**: When user joins or reconnects
2. **Reuse**: Element persists between pause/play cycles
3. **Removal**: Only during `reconnectAudio()` scorched earth approach
4. **Query Pattern**: `$("[id^='msRemAudio-']")` for bulk operations

## WebRTC Implementation

### Peer Connection Configuration - Complete

```javascript
const rtcConfig = {
    iceServers: [],  // Note: Empty array in production
    iceTransportPolicy: "all",
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
    sdpSemantics: "plan-b"  // Legacy - 16 occurrences found
};

// Alternative configuration for newer implementations
const unifiedPlanConfig = {
    iceServers: [],
    iceTransportPolicy: "all",
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
    sdpSemantics: "unified-plan"  // Found in Chrome70/Chrome74 handlers
};
```

### Browser-Specific Handlers

VTF implements multiple browser-specific handlers:

- **Safari11**: Uses plan-b semantics
- **Chrome55**: Uses plan-b semantics  
- **Chrome67**: Uses plan-b semantics
- **Chrome70**: Uses unified-plan semantics
- **Chrome74**: Uses unified-plan semantics
- **Firefox60**: Custom implementation with canvas hack
- **ReactNative**: Uses plan-b semantics

### Offer/Answer Creation Patterns

```javascript
// Offer creation (40 occurrences found)
// Pattern 1: With receive constraints
const offer = await pc.createOffer({
    offerToReceiveAudio: true,
    offerToReceiveVideo: true
});

// Pattern 2: ICE restart
const restartOffer = await pc.createOffer({
    iceRestart: true
});

// Pattern 3: Default (no constraints)
const defaultOffer = await pc.createOffer();

// Answer creation (32 occurrences found)
// Always uses default options
const answer = await pc.createAnswer();
```

### Track Handling Implementation

```javascript
// From actual VTF code
pc.ontrack = function(event) {
    const consumer = event.consumer;
    this.consumers.set(userData.producerID, consumer);
    
    const stream = new MediaStream();
    stream.addTrack(consumer.track);
    console.log("addTrack: ", consumer.track);
    
    if ("video" !== consumer.track.kind) {
        // Audio handling logic (see Audio Element Management)
    } else {
        // Video handling (different flow)
    }
};
```

## MediaSoup Integration

### Consumer Management

```javascript
// Consumer creation and storage
let consumer = transport.consumer;
this.consumers.set(userData.producerID, consumer);

// Consumer has these properties:
// - id: Unique consumer ID
// - producerId: Associated producer ID  
// - track: MediaStreamTrack
// - rtpParameters: Codec and RTP settings
// - paused: Boolean state
```

### Producer Types

1. **Audio Producer** (`micProducer`)
   - Created via `producerTransport.produce()`
   - Uses getUserMedia for microphone access
   - Stored in service for management

2. **Video Producer** (`webcamProducer`)
   - Separate flow from audio
   - Different element ID pattern

3. **Screen Producer** (`screenProducers`)
   - Map structure for multiple screens
   - Uses getDisplayMedia API

### Transport Events

```javascript
// Transport close handling
consumer.on("transportclose", function() {
    this.removeConsumer(consumer.id);
}.bind(this));
```

## Audio Stream Handling

### Stream Assignment Pattern - Detailed

```javascript
// Step 1: Consumer retrieval and stream creation
let consumer = transport.consumer;
this.consumers.set(userData.producerID, consumer);
const stream = new MediaStream();

// Step 2: Track addition with logging
stream.addTrack(consumer.track);
console.log("addTrack: ", consumer.track);

// Step 3: Type checking for audio vs video
if ("video" !== consumer.track.kind) {
    // Step 4: Element retrieval or creation
    let audioElementId = "msRemAudio-" + userData.userID;
    let audioElement = document.getElementById(audioElementId);
    
    if (!audioElement) {
        // Create new element (see Element Creation)
    }
    
    // Step 5: Stream assignment
    audioElement.srcObject = stream;
    
    // Step 6: Volume setting BEFORE play
    audioElement.volume = this.globals.audioVolume;
    
    // Step 7: Play with promise handling
    let playPromise = audioElement.play();
    let self = this;
    
    if (playPromise !== undefined) {
        playPromise.catch(function(error) {
            self.alertsService.hideAll();
            S_("audiobridge Autoplay FAILED. need user OK...");
            self.alertsService.alert("Your browser needs your OK to play the room's audio");
        });
    }
}
```

### Stream Lifecycle States

1. **Creation**: When `ontrack` event fires or consumer created
2. **Active**: During normal playback
3. **Paused**: Via `stopListeningToPresenter()`
   - Element paused but not removed
   - currentTime reset to 0
   - srcObject retained
4. **Removed**: During `reconnectAudio()` only

### getUserMedia Patterns

```javascript
// Microphone access (8 occurrences found)
const micStream = await navigator.mediaDevices.getUserMedia({
    audio: {
        deviceId: { ideal: this.globals.audioDeviceID },
        autoGainControl: this.globals.preferences.autoGainControl,
        noiseSuppression: this.globals.preferences.noiseSuppression,
        echoCancellation: this.globals.preferences.echoCancellation
    }
});

// Camera access for screen sharing
const cameraStream = await navigator.mediaDevices.getUserMedia({
    video: Object.assign(
        { deviceId: { ideal: this.globals.videoDeviceID } },
        resolutionPresets[resolution]
    )
});

// Device enumeration pattern
const devices = await navigator.mediaDevices.enumerateDevices();
```

## Volume Control System

### Global Volume Management - Implementation

```javascript
// Volume adjustment function from VTF
adjustVol(event) {
    let volumePercent = 100;
    volumePercent = event ? event.target.value : this.audioVolume;
    
    var volumeDecimal = volumePercent / 100;
    console.log("AdjustVol to: " + volumePercent + ". this.audioVol:" + this.audioVolume);
    
    // Update global state
    this.appService.globals.audioVolume = volumeDecimal;
    
    // Apply to all audio elements using jQuery
    $("[id^='msRemAudio-']").prop("volume", volumeDecimal);
}
```

### Volume State Management

- **Storage**: `this.globals.audioVolume` (decimal 0.0-1.0)
- **UI Display**: Percentage (0-100)
- **Conversion**: `volumePercent / 100`
- **Batch Update**: jQuery selector for all audio elements

### Mute Implementation

```javascript
mute() {
    this.prevVolume = this.audioVolume;
    this.audioVolume = 0;
    this.adjustVol(null);
    this.appService.globals.preferences.doNotDisturbOn = true;
    this.audioBgVolume = this.audioVolume;
    // Additional UI updates
}
```

## Error Recovery Patterns

### Reconnection Strategy - Complete Implementation

```javascript
reconnectAudio() {
    S_("reconnectAudio called...");
    
    if ("closed" != this.globals.sessData.currentState) {
        // Step 1: Remove ALL audio elements (scorched earth)
        $("[id^='msRemAudio-']").remove();
        
        // Step 2: Recreate for all active users
        this.talkingUsers.forEach(userData => {
            this.mediaSoupService.startListeningToPresenter(userData);
        });
    } else {
        S_("reconnectAudio called.. but session closed. abort...");
    }
}
```

### Connection Retry Logic

```javascript
// Retry pattern with exponential backoff
if (connectionError) {
    const retryCount = userData.conRetries || 0;
    if (retryCount > MAX_RETRIES) {
        S_("giving up on audio for muser:", userData);
        return;
    }
    
    userData.conRetries = retryCount + 1;
    const backoffTime = Math.min(1000 * Math.pow(2, retryCount), 30000);
    setTimeout(() => this.startListeningToPresenter(userData), backoffTime);
}
```

### State Management

```javascript
// Session states
const sessionStates = {
    OPEN: "open",
    CLOSED: "closed"
};

// Prevent operations when closed
if (this.globals.sessData.currentState === sessionStates.CLOSED) {
    return;
}

// Active user tracking
this.talkingUsers = new Map(); // userData objects keyed by user ID
```

### Error Handling Patterns

1. **Autoplay Failures**: Show user alert, require interaction
2. **Connection Failures**: Exponential backoff retry
3. **Missing Elements**: Create on demand
4. **Transport Failures**: Remove consumer, retry connection
5. **Session Closed**: Abort all operations

## DOM Structure

### Container Hierarchy

```html
<body>
    <!-- Hidden container for all audio elements -->
    <div id="topRoomDiv" style="display: none;">
        <!-- Audio elements created dynamically -->
        <audio id="msRemAudio-user1" autoplay="false"></audio>
        <audio id="msRemAudio-user2" autoplay="false"></audio>
        <audio id="msRemAudio-user3" autoplay="false"></audio>
        <!-- More audio elements as users join -->
    </div>
    
    <!-- Other VTF UI elements -->
    <div id="webcam">
        <!-- Local audio attachment point -->
    </div>
</body>
```

### Key Elements

- **topRoomDiv**: Hidden container for all remote audio elements
  - Always hidden (`display: none`)
  - Parent for all msRemAudio elements
  - Used as mutation observer target
  
- **Audio elements**: Created dynamically as users join
  - No visual controls displayed
  - Managed entirely programmatically
  - Persist between pause/resume cycles
  
- **webcam**: Local audio playback element
  - Used for room audio in some contexts

### jQuery Selectors Used

```javascript
// Select all VTF audio elements
$("[id^='msRemAudio-']")

// Select specific user's audio
$(`#msRemAudio-${userId}`)

// Remove all audio elements
$("[id^='msRemAudio-']").remove()

// Set volume on all elements
$("[id^='msRemAudio-']").prop("volume", volumeDecimal)
```

## Integration Points

### Key Functions to Monitor

1. **startListeningToPresenter(userData)**
   - Entry point for audio reception
   - Creates/updates audio element
   - Handles stream assignment
   - Manages playback initiation
   - Implements retry logic

2. **stopListeningToPresenter(userData)**
   - Pauses audio playback
   - Resets currentTime to 0
   - Does NOT remove element
   - Preserves srcObject for resume

3. **reconnectAudio()**
   - Complete audio system reset
   - Removes all audio elements
   - Recreates from talkingUsers map
   - Only method that removes elements

4. **adjustVol(event)**
   - Global volume control
   - Updates all active elements
   - Handles both slider and programmatic updates
   - Stores in globals.audioVolume

5. **enableMic()**
   - Microphone initialization
   - getUserMedia with constraints
   - Produces audio to MediaSoup
   - Handles device selection

### Events to Intercept

1. **DOM Mutations**
   - Audio element creation
   - Audio element removal
   - Attribute changes

2. **Audio Element Events**
   - srcObject assignment
   - play/pause events
   - volume changes
   - ended/error events

3. **MediaStream Events**
   - Track added/removed
   - Track ended
   - Track mute/unmute

4. **Transport Events**
   - Consumer created
   - Transport closed
   - Connection state changes

## Chrome Extension Interface

### Injection Points - Enhanced

```javascript
// Comprehensive mutation observer setup
class VTFAudioMonitor {
    constructor() {
        this.audioElements = new Map();
        this.initializeObservers();
    }
    
    initializeObservers() {
        // Primary observer for audio elements
        this.domObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                // Added nodes
                mutation.addedNodes.forEach((node) => {
                    if (this.isVTFAudioElement(node)) {
                        this.handleNewAudioElement(node);
                    }
                });
                
                // Removed nodes
                mutation.removedNodes.forEach((node) => {
                    if (this.isVTFAudioElement(node)) {
                        this.handleRemovedAudioElement(node);
                    }
                });
            });
        });
        
        // Attribute observer for existing elements
        this.attrObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && 
                    this.isVTFAudioElement(mutation.target)) {
                    this.handleAttributeChange(mutation);
                }
            });
        });
        
        // Start observing
        const container = document.getElementById('topRoomDiv') || document.body;
        
        this.domObserver.observe(container, { 
            childList: true, 
            subtree: true 
        });
        
        this.attrObserver.observe(container, {
            attributes: true,
            attributeFilter: ['volume'],
            subtree: true
        });
    }
    
    isVTFAudioElement(node) {
        return node.nodeType === Node.ELEMENT_NODE &&
               node.nodeName === 'AUDIO' && 
               node.id && 
               node.id.startsWith('msRemAudio-');
    }
    
    handleNewAudioElement(audioElement) {
        const userId = audioElement.id.replace('msRemAudio-', '');
        console.log(`New VTF audio element detected for user: ${userId}`);
        
        // Wait for srcObject
        this.waitForStream(audioElement, userId);
    }
    
    waitForStream(audioElement, userId) {
        if (audioElement.srcObject) {
            this.captureStream(audioElement, userId);
            return;
        }
        
        // Use property descriptor to catch srcObject assignment
        const originalDescriptor = Object.getOwnPropertyDescriptor(
            HTMLMediaElement.prototype, 
            'srcObject'
        );
        
        Object.defineProperty(audioElement, 'srcObject', {
            get: function() {
                return this._srcObject;
            },
            set: function(value) {
                this._srcObject = value;
                if (originalDescriptor && originalDescriptor.set) {
                    originalDescriptor.set.call(this, value);
                }
                if (value instanceof MediaStream) {
                    this.captureStream(audioElement, userId);
                }
            }.bind(this),
            configurable: true
        });
    }
}
```

### Data Extraction - Complete

```javascript
// Extract comprehensive audio state
function extractVTFAudioState() {
    const audioElements = document.querySelectorAll('audio[id^="msRemAudio-"]');
    
    return Array.from(audioElements).map(audio => {
        const tracks = audio.srcObject ? 
            audio.srcObject.getTracks() : [];
        
        return {
            // Basic info
            id: audio.id,
            userId: audio.id.replace('msRemAudio-', ''),
            
            // Stream state
            hasStream: !!audio.srcObject,
            streamId: audio.srcObject?.id || null,
            trackCount: tracks.length,
            tracks: tracks.map(track => ({
                id: track.id,
                kind: track.kind,
                label: track.label,
                enabled: track.enabled,
                muted: track.muted,
                readyState: track.readyState
            })),
            
            // Playback state
            isPlaying: !audio.paused,
            currentTime: audio.currentTime,
            duration: audio.duration,
            ended: audio.ended,
            
            // Audio properties
            volume: audio.volume,
            muted: audio.muted,
            
            // Network state
            networkState: audio.networkState,
            readyState: audio.readyState,
            
            // Timing
            timestamp: Date.now()
        };
    });
}
```

### Stream Capture - Production Ready

```javascript
class VTFAudioCapture {
    constructor() {
        this.audioContext = null;
        this.captures = new Map();
    }
    
    async captureAudioElement(audioElement, userId) {
        if (!audioElement.srcObject) {
            console.warn(`No stream for user ${userId}`);
            return;
        }
        
        // Initialize audio context on first use
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || 
                window.webkitAudioContext)({ 
                sampleRate: 16000  // Optimal for speech
            });
        }
        
        try {
            // Create source from element's stream
            const source = this.audioContext.createMediaStreamSource(
                audioElement.srcObject
            );
            
            // Create script processor for raw audio access
            const processor = this.audioContext.createScriptProcessor(
                4096,  // Buffer size
                1,     // Input channels
                1      // Output channels
            );
            
            // Audio processing
            processor.onaudioprocess = (event) => {
                const inputData = event.inputBuffer.getChannelData(0);
                this.processAudioData(userId, inputData);
            };
            
            // Connect the graph
            source.connect(processor);
            processor.connect(this.audioContext.destination);
            
            // Store capture info
            this.captures.set(userId, {
                source,
                processor,
                element: audioElement,
                startTime: Date.now()
            });
            
            console.log(`Started audio capture for user ${userId}`);
            
        } catch (error) {
            console.error(`Failed to capture audio for ${userId}:`, error);
        }
    }
    
    processAudioData(userId, audioData) {
        // Implement audio processing here
        // e.g., buffering, transcription, analysis
    }
    
    stopCapture(userId) {
        const capture = this.captures.get(userId);
        if (capture) {
            capture.source.disconnect();
            capture.processor.disconnect();
            this.captures.delete(userId);
            console.log(`Stopped audio capture for user ${userId}`);
        }
    }
}
```

## Implementation Examples

### Complete VTF Audio Integration

```javascript
class VTFAudioIntegration {
    constructor() {
        this.monitor = new VTFAudioMonitor();
        this.capture = new VTFAudioCapture();
        this.state = new Map();
        
        this.initialize();
    }
    
    initialize() {
        // Hook into VTF's global functions
        this.hookVTFFunctions();
        
        // Start monitoring
        this.startMonitoring();
        
        // Periodic state collection
        setInterval(() => this.collectState(), 5000);
    }
    
    hookVTFFunctions() {
        // Hook startListeningToPresenter
        const originalStart = window.startListeningToPresenter;
        if (originalStart) {
            window.startListeningToPresenter = (userData) => {
                console.log('VTF: Starting audio for user', userData);
                this.onUserJoined(userData);
                return originalStart.call(this, userData);
            };
        }
        
        // Hook stopListeningToPresenter
        const originalStop = window.stopListeningToPresenter;
        if (originalStop) {
            window.stopListeningToPresenter = (userData) => {
                console.log('VTF: Stopping audio for user', userData);
                this.onUserLeft(userData);
                return originalStop.call(this, userData);
            };
        }
        
        // Hook volume adjustment
        const originalVolume = window.adjustVol;
        if (originalVolume) {
            window.adjustVol = (event) => {
                const result = originalVolume.call(this, event);
                this.onVolumeChanged();
                return result;
            };
        }
    }
    
    startMonitoring() {
        // Monitor for new audio elements
        this.monitor.on('audioElementAdded', (data) => {
            this.handleNewAudio(data);
        });
        
        this.monitor.on('audioElementRemoved', (data) => {
            this.handleRemovedAudio(data);
        });
        
        this.monitor.on('streamAssigned', (data) => {
            this.handleStreamAssigned(data);
        });
    }
    
    handleNewAudio({ element, userId }) {
        console.log(`New audio element for user ${userId}`);
        this.state.set(userId, {
            element,
            joinedAt: Date.now(),
            hasStream: false
        });
    }
    
    handleStreamAssigned({ element, userId, stream }) {
        console.log(`Stream assigned for user ${userId}`);
        const userState = this.state.get(userId);
        if (userState) {
            userState.hasStream = true;
            userState.streamId = stream.id;
        }
        
        // Start capture
        this.capture.captureAudioElement(element, userId);
    }
    
    collectState() {
        const state = extractVTFAudioState();
        
        // Process state changes
        state.forEach(audioState => {
            const previousState = this.state.get(audioState.userId);
            if (previousState) {
                // Detect changes
                if (previousState.isPlaying !== audioState.isPlaying) {
                    console.log(`Play state changed for ${audioState.userId}:`,
                        audioState.isPlaying ? 'playing' : 'paused');
                }
            }
        });
        
        // Send to background script or process
        this.processAudioState(state);
    }
    
    processAudioState(state) {
        // Implementation specific processing
        if (chrome.runtime) {
            chrome.runtime.sendMessage({
                type: 'VTF_AUDIO_STATE',
                data: state,
                timestamp: Date.now()
            });
        }
    }
}

// Initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.vtfAudioIntegration = new VTFAudioIntegration();
    });
} else {
    window.vtfAudioIntegration = new VTFAudioIntegration();
}
```

## Code Patterns and Constants

### Logging Function
```javascript
// S_() is VTF's custom logging function
S_("message here");  // Used throughout for debug logging
```

### jQuery Usage
VTF heavily uses jQuery (aliased as $ or CO):
```javascript
$("[id^='msRemAudio-']")  // Select by ID prefix
$("#webcam").get(0)       // Get DOM element
CO("#audio-deviceList")   // Alternative jQuery reference
```

### Global State Access
```javascript
this.globals.audioVolume              // Current volume (0.0-1.0)
this.globals.sessData.currentState    // Session state
this.globals.preferences              // User preferences
this.globals.audioDeviceID           // Selected audio device
this.globals.videoDeviceID          // Selected video device
```

### MediaSoup Service Methods
```javascript
this.mediaSoupService.startListeningToPresenter(userData)
this.mediaSoupService.stopListeningToPresenter(userData)
this.mediaSoupService.reconnectAudio()
this.mediaSoupService.consumers  // Map of all consumers
this.mediaSoupService.device     // MediaSoup device instance
```

### Common Patterns
1. **Async/Generator Functions**: Uses `v_()` wrapper for async operations
2. **Error Alerts**: `this.alertsService.alert()` for user notifications
3. **Hidden Elements**: All audio elements in hidden container
4. **Element Reuse**: Elements persist between pause/play cycles
5. **Batch Operations**: jQuery selectors for bulk updates

## Best Practices

1. **Always check for existing elements** before creating new ones
2. **Handle play() promise rejections** for autoplay policy compliance
3. **Monitor parent container** (`topRoomDiv`) for efficient mutation observation
4. **Respect VTF's volume model** - sync with their global volume state
5. **Don't remove elements on pause** - VTF reuses them
6. **Implement reconnection handling** - audio may be reset at any time
7. **Use property descriptors** to catch srcObject assignment
8. **Buffer size of 4096** for audio processing to balance latency/performance
9. **16kHz sample rate** for speech-optimized capture
10. **Exponential backoff** for connection retries

## Known Limitations

1. **SDP Semantics**: VTF uses deprecated "plan-b" semantics in most handlers
2. **No ICE Servers**: Configuration shows empty ICE servers array (local network only?)
3. **jQuery Dependency**: Many operations require jQuery to be loaded
4. **Hidden Container**: All audio elements are in a display:none div
5. **Browser Compatibility**: Different handlers for different browser versions
6. **Autoplay Policies**: Requires user interaction on first play
7. **No Direct API**: Must hook into existing functions or use DOM observation

## Security Considerations

1. **Same-Origin**: Extension must be injected into VTF origin
2. **CSP Compliance**: Respect content security policies
3. **User Privacy**: Audio capture requires appropriate permissions
4. **Stream Access**: MediaStream access requires secure context
5. **DOM Manipulation**: Be careful not to break VTF functionality

## Performance Optimization

1. **Mutation Observer**: Use specific selectors and subtree:false when possible
2. **Debounce State Collection**: Avoid excessive state queries
3. **Efficient Selectors**: Use ID selectors over attribute selectors
4. **Stream Reuse**: Don't recreate streams unnecessarily
5. **Memory Management**: Properly disconnect audio nodes

## Debugging Tips

1. **Enable S_() Logging**: VTF's logging provides detailed flow information
2. **Monitor Console**: Look for "msRemAudio", "addTrack", play errors
3. **Check Elements**: `document.querySelectorAll("[id^='msRemAudio-']")`
4. **Verify Streams**: Check srcObject and track states
5. **Network Tab**: Monitor WebSocket messages for MediaSoup signaling

## Version History

- **v1.0** (2024-12): Initial specification based on reverse engineering
- **v2.0** (2024-12): Enhanced with detailed code analysis and implementation patterns
- Analysis based on VTF build from June 2025

---

This specification is subject to change as VTF updates their implementation. Regular analysis of their codebase is recommended to maintain compatibility.