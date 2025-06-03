// inject.js - Injected into VTF page context (CSP-compliant version)
(function() {
    'use strict';
    
    console.log('VTF Audio Capture: Initializing (CSP-safe)...');
    
    // Create audio context for capturing
    let captureContext;
    let masterGain;
    
    try {
        captureContext = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = captureContext.createGain();
        masterGain.connect(captureContext.destination);
    } catch (e) {
        console.error('VTF Audio Capture: Failed to create audio context:', e);
        return;
    }
    
    // Store references to audio sources
    const audioSources = new Map();
    const capturedStreams = new Set(); // Track stream IDs to prevent duplicates
    let sourceIdCounter = 0;
    
    // Helper function to safely capture audio source
    function captureAudioSource(source, type, metadata) {
        try {
            source.connect(masterGain);
            const id = ++sourceIdCounter;
            audioSources.set(id, {
                type: type,
                source: source,
                metadata: metadata,
                timestamp: Date.now()
            });
            // Only log first few captures and significant events
            if (sourceIdCounter <= 5 || type === 'howler-gain') {
                console.log(`VTF Audio Capture: Connected ${type} (source ${id})`);
            }
            return id;
        } catch (e) {
            console.error(`VTF Audio Capture: Failed to capture ${type}:`, e);
            return null;
        }
    }
    
    // Intercept Web Audio API - using prototype modification (CSP-safe)
    if (window.AudioContext || window.webkitAudioContext) {
        const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
        const originalCreateGain = AudioContextConstructor.prototype.createGain;
        const originalCreateMediaElementSource = AudioContextConstructor.prototype.createMediaElementSource;
        const originalCreateMediaStreamSource = AudioContextConstructor.prototype.createMediaStreamSource;
        
        // Override createGain to capture Howler audio
        AudioContextConstructor.prototype.createGain = function() {
            const gainNode = originalCreateGain.call(this);
            const originalConnect = gainNode.connect;
            const audioContext = this;
            
            gainNode.connect = function(destination) {
                // If connecting to speaker output, also capture
                if (destination === audioContext.destination) {
                    // Only log first occurrence
                    if (!AudioContextConstructor.prototype._vtfGainLogged) {
                        console.log('VTF Audio Capture: GainNode connecting to destination (further connections will be silent)');
                        AudioContextConstructor.prototype._vtfGainLogged = true;
                    }
                    try {
                        const streamDest = audioContext.createMediaStreamDestination();
                        originalConnect.call(this, streamDest);
                        
                        const captureSource = captureContext.createMediaStreamSource(streamDest.stream);
                        captureAudioSource(captureSource, 'howler-gain', {
                            context: 'intercepted'
                        });
                    } catch (e) {
                        console.error('VTF Audio Capture: GainNode capture failed:', e);
                    }
                }
                
                return originalConnect.apply(this, arguments);
            };
            
            return gainNode;
        };
        
        // Override createMediaElementSource
        AudioContextConstructor.prototype.createMediaElementSource = function(mediaElement) {
            const source = originalCreateMediaElementSource.call(this, mediaElement);
            
            try {
                if (!mediaElement.vtfCaptured) {
                    const captureSource = captureContext.createMediaElementSource(mediaElement);
                    captureAudioSource(captureSource, 'media-element', {
                        tagName: mediaElement.tagName,
                        id: mediaElement.id,
                        src: mediaElement.src
                    });
                    mediaElement.vtfCaptured = true;
                }
            } catch (e) {
                console.log('VTF Audio Capture: Media element already connected');
            }
            
            return source;
        };
        
        // Override createMediaStreamSource
        AudioContextConstructor.prototype.createMediaStreamSource = function(stream) {
            const source = originalCreateMediaStreamSource.call(this, stream);
            
            // Prevent duplicate stream captures
            if (!capturedStreams.has(stream.id)) {
                try {
                    capturedStreams.add(stream.id);
                    const captureSource = captureContext.createMediaStreamSource(stream);
                    captureAudioSource(captureSource, 'media-stream', {
                        streamId: stream.id,
                        trackCount: stream.getAudioTracks().length
                    });
                } catch (e) {
                    console.error('VTF Audio Capture: Stream capture failed:', e);
                }
            }
            
            return source;
        };
    }
    
    // Capture existing media elements
    function captureExistingMedia() {
        const mediaElements = document.querySelectorAll('audio, video');
        let captured = 0;
        
        mediaElements.forEach((element, index) => {
            if (!element.vtfCaptured && element.src) {
                try {
                    const source = captureContext.createMediaElementSource(element);
                    if (captureAudioSource(source, 'existing-media', {
                        tagName: element.tagName,
                        id: element.id || `media-${index}`,
                        src: element.src
                    })) {
                        element.vtfCaptured = true;
                        captured++;
                    }
                } catch (e) {
                    // Element might already be connected
                }
            }
        });
        
        if (captured > 0) {
            console.log(`VTF Audio Capture: Captured ${captured} existing media elements`);
        }
    }
    
    // Intercept RTCPeerConnection for WebRTC audio
    if (window.RTCPeerConnection) {
        const OriginalRTCPeerConnection = window.RTCPeerConnection;
        
        window.RTCPeerConnection = function() {
            const pc = new OriginalRTCPeerConnection(...arguments);
            
            pc.addEventListener('track', function(event) {
                if (event.track.kind === 'audio' && event.streams && event.streams[0]) {
                    const stream = event.streams[0];
                    
                    // Prevent duplicate captures
                    if (!capturedStreams.has(stream.id)) {
                        capturedStreams.add(stream.id);
                        
                        // Only log first few WebRTC tracks
                        if (!window._vtfWebRTCLogCount) window._vtfWebRTCLogCount = 0;
                        if (window._vtfWebRTCLogCount < 3) {
                            console.log('VTF Audio Capture: WebRTC audio track received');
                            window._vtfWebRTCLogCount++;
                        }
                        
                        try {
                            const source = captureContext.createMediaStreamSource(stream);
                            captureAudioSource(source, 'webrtc', {
                                trackId: event.track.id,
                                streamId: stream.id
                            });
                        } catch (e) {
                            console.error('VTF Audio Capture: WebRTC capture failed:', e);
                        }
                    }
                }
            });
            
            return pc;
        };
        
        // Copy static methods
        Object.setPrototypeOf(window.RTCPeerConnection, OriginalRTCPeerConnection);
        Object.setPrototypeOf(window.RTCPeerConnection.prototype, OriginalRTCPeerConnection.prototype);
    }
    
    // Monitor DOM for new media elements
    const observer = new MutationObserver(function(mutations) {
        let hasNewMedia = false;
        
        mutations.forEach(function(mutation) {
            mutation.addedNodes.forEach(function(node) {
                if (node.nodeName === 'AUDIO' || node.nodeName === 'VIDEO') {
                    hasNewMedia = true;
                }
            });
        });
        
        if (hasNewMedia) {
            setTimeout(captureExistingMedia, 100);
        }
    });
    
    // Start observing when DOM is ready
    function startObserving() {
        if (document.body) {
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
            console.log('VTF Audio Capture: DOM observer started');
        }
    }
    
    // Initialize capture
    function initialize() {
        console.log('VTF Audio Capture: Starting initialization...');
        
        // Capture existing media
        captureExistingMedia();
        
        // Start DOM observer
        startObserving();
        
        // Create master output stream
        try {
            const outputDest = captureContext.createMediaStreamDestination();
            masterGain.connect(outputDest);
            
            // Make stream accessible
            window.__vtfCaptureStream = outputDest.stream;
            
            // Notify extension
            window.postMessage({
                type: 'VTF_AUDIO_STREAM_READY',
                streamId: outputDest.stream.id,
                trackCount: outputDest.stream.getAudioTracks().length
            }, '*');
            
            console.log('VTF Audio Capture: Ready! Use __vtfAudioDebug() to see capture status');
        } catch (e) {
            console.error('VTF Audio Capture: Failed to create output stream:', e);
        }
    }
    
    // Debug function (CSP-safe)
    window.__vtfAudioDebug = function() {
        const info = {
            initialized: !!window.__vtfCaptureStream,
            sourceCount: audioSources.size,
            uniqueStreams: capturedStreams.size,
            sourceTypes: {}
        };
        
        // Count sources by type
        audioSources.forEach(function(source) {
            if (!info.sourceTypes[source.type]) {
                info.sourceTypes[source.type] = 0;
            }
            info.sourceTypes[source.type]++;
        });
        
        if (window.__vtfCaptureStream) {
            info.streamId = window.__vtfCaptureStream.id;
            info.audioTracks = window.__vtfCaptureStream.getAudioTracks().length;
        }
        
        console.log('=== VTF Audio Capture Debug ===');
        console.log('Status:', info.initialized ? 'Ready' : 'Not initialized');
        console.log('Total sources:', info.sourceCount);
        console.log('Unique streams:', info.uniqueStreams);
        console.log('Sources by type:', info.sourceTypes);
        if (info.streamId) {
            console.log('Master stream ID:', info.streamId);
            console.log('Audio tracks:', info.audioTracks);
        }
        console.log('===============================');
        
        return info;
    };
    
    // Initialize based on document state
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        // Small delay to ensure other scripts have loaded
        setTimeout(initialize, 100);
    }
    
    console.log('VTF Audio Capture: Script loaded (CSP-compliant)');
})();