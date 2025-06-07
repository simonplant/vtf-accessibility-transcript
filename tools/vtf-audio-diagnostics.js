/**
 * VTF Audio Diagnostics Tool
 * 
 * A comprehensive diagnostic tool for testing VTF's audio system
 * Run this in Chrome DevTools console on vtf.t3live.com
 * 
 * @version 1.0.0
 * @author VTF Audio Extension Team
 */

(function() {
    'use strict';
    
    console.clear();
    console.log('%c🔊 VTF Audio Diagnostics Tool v1.0.0', 'font-size: 20px; color: #4CAF50; font-weight: bold');
    console.log('%cStarting comprehensive audio system analysis...', 'color: #888; font-style: italic');
    console.log('=' .repeat(60));
  
    // Diagnostic results container
    const diagnostics = {
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      results: {},
      errors: [],
      warnings: []
    };
  
    // Utility functions
    const log = {
      section: (title) => {
        console.log('\n' + '='.repeat(60));
        console.log(`%c${title}`, 'font-size: 16px; color: #2196F3; font-weight: bold');
        console.log('='.repeat(60));
      },
      success: (msg, data) => {
        console.log(`%c✓ ${msg}`, 'color: #4CAF50');
        if (data) console.log(data);
      },
      error: (msg, error) => {
        console.log(`%c✗ ${msg}`, 'color: #f44336');
        if (error) console.error(error);
        diagnostics.errors.push({ message: msg, error: error?.message || error });
      },
      warning: (msg, data) => {
        console.log(`%c⚠ ${msg}`, 'color: #ff9800');
        if (data) console.log(data);
        diagnostics.warnings.push({ message: msg, data });
      },
      info: (msg, data) => {
        console.log(`%cℹ ${msg}`, 'color: #2196F3');
        if (data) console.log(data);
      },
      table: (data) => {
        console.table(data);
      }
    };
  
    // Test 1: Browser Audio Capabilities
    async function testBrowserCapabilities() {
      log.section('1. BROWSER AUDIO CAPABILITIES');
      
      const capabilities = {
        webAudioAPI: false,
        getUserMedia: false,
        audioContext: false,
        audioWorklet: false,
        scriptProcessor: false,
        mediaDevices: false,
        enumerateDevices: false,
        webRTC: false
      };
  
      // Web Audio API
      try {
        capabilities.webAudioAPI = !!(window.AudioContext || window.webkitAudioContext);
        log.success('Web Audio API supported', {
          AudioContext: !!window.AudioContext,
          webkitAudioContext: !!window.webkitAudioContext
        });
      } catch (e) {
        log.error('Web Audio API not supported', e);
      }
  
      // getUserMedia
      try {
        capabilities.getUserMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
        log.success('getUserMedia supported');
      } catch (e) {
        log.error('getUserMedia not supported', e);
      }
  
      // AudioContext features
      if (capabilities.webAudioAPI) {
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          
          capabilities.audioContext = true;
          log.success('AudioContext created', {
            state: ctx.state,
            sampleRate: ctx.sampleRate,
            baseLatency: ctx.baseLatency,
            outputLatency: ctx.outputLatency
          });
  
          // AudioWorklet
          capabilities.audioWorklet = !!ctx.audioWorklet;
          if (capabilities.audioWorklet) {
            log.success('AudioWorklet supported');
          } else {
            log.warning('AudioWorklet not supported - will use ScriptProcessor fallback');
          }
  
          // ScriptProcessor
          capabilities.scriptProcessor = !!ctx.createScriptProcessor;
          log.info('ScriptProcessor support', { available: capabilities.scriptProcessor });
  
          ctx.close();
        } catch (e) {
          log.error('AudioContext creation failed', e);
        }
      }
  
      // MediaDevices
      try {
        capabilities.mediaDevices = !!navigator.mediaDevices;
        capabilities.enumerateDevices = !!(navigator.mediaDevices && navigator.mediaDevices.enumerateDevices);
        log.success('MediaDevices API supported');
      } catch (e) {
        log.error('MediaDevices API not supported', e);
      }
  
      // WebRTC
      try {
        capabilities.webRTC = !!(window.RTCPeerConnection || window.webkitRTCPeerConnection);
        log.success('WebRTC supported', {
          RTCPeerConnection: !!window.RTCPeerConnection,
          webkitRTCPeerConnection: !!window.webkitRTCPeerConnection
        });
      } catch (e) {
        log.error('WebRTC not supported', e);
      }
  
      diagnostics.results.browserCapabilities = capabilities;
      return capabilities;
    }
  
    // Test 2: Available Audio Devices
    async function testAudioDevices() {
      log.section('2. AUDIO DEVICES ENUMERATION');
      
      const devices = {
        inputs: [],
        outputs: [],
        permissions: null
      };
  
      try {
        // Check permissions
        if (navigator.permissions && navigator.permissions.query) {
          try {
            const micPermission = await navigator.permissions.query({ name: 'microphone' });
            devices.permissions = micPermission.state;
            log.info('Microphone permission', { state: micPermission.state });
          } catch (e) {
            log.warning('Cannot query microphone permission', e.message);
          }
        }
  
        // Enumerate devices
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        
        devices.inputs = allDevices.filter(d => d.kind === 'audioinput');
        devices.outputs = allDevices.filter(d => d.kind === 'audiooutput');
  
        log.success(`Found ${devices.inputs.length} audio inputs`);
        if (devices.inputs.length > 0) {
          log.table(devices.inputs.map(d => ({
            Label: d.label || `Input ${d.deviceId.substr(0, 8)}...`,
            ID: d.deviceId.substr(0, 16) + '...',
            Group: d.groupId.substr(0, 16) + '...'
          })));
        }
  
        log.success(`Found ${devices.outputs.length} audio outputs`);
        if (devices.outputs.length > 0) {
          log.table(devices.outputs.map(d => ({
            Label: d.label || `Output ${d.deviceId.substr(0, 8)}...`,
            ID: d.deviceId.substr(0, 16) + '...',
            Group: d.groupId.substr(0, 16) + '...'
          })));
        }
  
        // Test default devices
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const tracks = stream.getAudioTracks();
          if (tracks.length > 0) {
            const settings = tracks[0].getSettings();
            log.success('Default microphone accessible', {
              deviceId: settings.deviceId?.substr(0, 16) + '...',
              sampleRate: settings.sampleRate,
              channelCount: settings.channelCount,
              echoCancellation: settings.echoCancellation,
              noiseSuppression: settings.noiseSuppression,
              autoGainControl: settings.autoGainControl
            });
          }
          stream.getTracks().forEach(track => track.stop());
        } catch (e) {
          log.error('Cannot access default microphone', e.message);
        }
  
      } catch (e) {
        log.error('Device enumeration failed', e);
      }
  
      diagnostics.results.audioDevices = devices;
      return devices;
    }
  
    // Test 3: VTF Global Objects
    async function testVTFGlobals() {
      log.section('3. VTF GLOBAL OBJECTS & STATE');
      
      const vtfState = {
        globals: null,
        appService: null,
        mediaSoupService: null,
        audioVolume: null,
        sessionState: null,
        preferences: {},
        functions: {}
      };
  
      // Method 1: Direct window properties
      log.info('Searching for VTF globals...');
      
      // Common VTF global names
      const commonNames = ['E_', 'globals', 'appService', 'mediaSoupService'];
      for (const name of commonNames) {
        if (window[name]) {
          log.success(`Found window.${name}`);
          
          if (window[name].audioVolume !== undefined) {
            vtfState.globals = window[name];
            vtfState.audioVolume = window[name].audioVolume;
            log.success(`Audio volume: ${vtfState.audioVolume}`);
          }
        }
      }
  
      // Method 2: Search all window properties
      if (!vtfState.globals) {
        for (const key in window) {
          try {
            if (key.length <= 3 && typeof window[key] === 'object' && window[key]) {
              const obj = window[key];
              if (obj.audioVolume !== undefined && obj.sessData !== undefined) {
                vtfState.globals = obj;
                vtfState.audioVolume = obj.audioVolume;
                log.success(`Found globals at window.${key}`, {
                  audioVolume: obj.audioVolume,
                  sessionState: obj.sessData?.currentState
                });
                break;
              }
            }
          } catch (e) {
            // Skip protected properties
          }
        }
      }
  
      // Method 3: Angular context
      if (!vtfState.globals) {
        const webcam = document.getElementById('webcam');
        if (webcam && webcam.__ngContext__) {
          log.info('Checking Angular context...');
          for (let i = 0; i < webcam.__ngContext__.length; i++) {
            const ctx = webcam.__ngContext__[i];
            if (ctx && ctx.appService && ctx.appService.globals) {
              vtfState.globals = ctx.appService.globals;
              vtfState.appService = ctx.appService;
              vtfState.audioVolume = ctx.appService.globals.audioVolume;
              log.success('Found globals via Angular context', {
                audioVolume: vtfState.audioVolume
              });
              break;
            }
          }
        }
      }
  
      // Extract state information
      if (vtfState.globals) {
        vtfState.sessionState = vtfState.globals.sessData?.currentState;
        vtfState.preferences = {
          autoGainControl: vtfState.globals.preferences?.autoGainControl,
          noiseSuppression: vtfState.globals.preferences?.noiseSuppression,
          echoCancellation: vtfState.globals.preferences?.echoCancellation,
          doNotDisturbOn: vtfState.globals.preferences?.doNotDisturbOn
        };
        
        log.success('VTF state extracted', {
          sessionState: vtfState.sessionState,
          audioVolume: vtfState.audioVolume,
          preferences: vtfState.preferences
        });
      } else {
        log.error('Could not find VTF globals');
      }
  
      // Check for VTF functions
      const functions = [
        'startListeningToPresenter',
        'stopListeningToPresenter',
        'reconnectAudio',
        'adjustVol',
        'enableMic',
        'disableMic'
      ];
  
      for (const fn of functions) {
        if (typeof window[fn] === 'function') {
          vtfState.functions[fn] = true;
          log.success(`Found function: ${fn}`);
        }
      }
  
      diagnostics.results.vtfState = vtfState;
      return vtfState;
    }
  
    // Test 4: VTF Audio Elements
    async function testVTFAudioElements() {
      log.section('4. VTF AUDIO ELEMENTS ANALYSIS');
      
      const audioElements = {
        container: null,
        elements: [],
        activeStreams: 0,
        totalElements: 0
      };
  
      // Find container
      const container = document.getElementById('topRoomDiv');
      if (container) {
        audioElements.container = {
          id: 'topRoomDiv',
          hidden: container.style.display === 'none',
          childCount: container.children.length
        };
        log.success('Found audio container', audioElements.container);
      } else {
        log.warning('topRoomDiv container not found');
      }
  
      // Find all audio elements
      const allAudioElements = document.querySelectorAll('audio[id^="msRemAudio-"]');
      audioElements.totalElements = allAudioElements.length;
      
      if (allAudioElements.length > 0) {
        log.success(`Found ${allAudioElements.length} VTF audio elements`);
        
        const elementData = [];
        allAudioElements.forEach((audio, index) => {
          const userId = audio.id.replace('msRemAudio-', '');
          const hasStream = !!audio.srcObject;
          const streamInfo = {};
          
          if (hasStream) {
            audioElements.activeStreams++;
            const tracks = audio.srcObject.getTracks();
            streamInfo.id = audio.srcObject.id;
            streamInfo.active = audio.srcObject.active;
            streamInfo.tracks = tracks.length;
            
            if (tracks.length > 0) {
              streamInfo.trackInfo = tracks.map(t => ({
                kind: t.kind,
                label: t.label,
                enabled: t.enabled,
                muted: t.muted,
                readyState: t.readyState
              }));
            }
          }
          
          const elementInfo = {
            index: index + 1,
            id: audio.id,
            userId: userId.substr(0, 12) + '...',
            hasStream: hasStream,
            streamId: streamInfo.id || 'none',
            tracks: streamInfo.tracks || 0,
            paused: audio.paused,
            volume: audio.volume,
            muted: audio.muted,
            currentTime: audio.currentTime,
            duration: audio.duration,
            readyState: audio.readyState,
            networkState: audio.networkState
          };
          
          elementData.push(elementInfo);
          audioElements.elements.push({
            ...elementInfo,
            streamInfo: streamInfo
          });
        });
        
        log.table(elementData);
        log.info(`Active streams: ${audioElements.activeStreams}/${audioElements.totalElements}`);
      } else {
        log.warning('No VTF audio elements found');
      }
  
      diagnostics.results.audioElements = audioElements;
      return audioElements;
    }
  
    // Test 5: MediaSoup/WebRTC Analysis
    async function testMediaSoup() {
      log.section('5. MEDIASOUP/WEBRTC ANALYSIS');
      
      const mediaSoup = {
        consumers: [],
        producers: [],
        transports: [],
        device: null,
        rtcConnections: []
      };
  
      // Find MediaSoup service
      let service = null;
      
      // Check common locations
      if (window.mediaSoupService) {
        service = window.mediaSoupService;
      } else if (window.appService?.mediaSoupService) {
        service = window.appService.mediaSoupService;
      } else {
        // Search in globals
        for (const key in window) {
          try {
            if (window[key] && window[key].consumers instanceof Map) {
              service = window[key];
              break;
            }
          } catch (e) {
            // Skip
          }
        }
      }
  
      if (service) {
        log.success('Found MediaSoup service');
        
        // Consumers
        if (service.consumers instanceof Map) {
          mediaSoup.consumers = Array.from(service.consumers.entries()).map(([id, consumer]) => ({
            id: id.substr(0, 16) + '...',
            kind: consumer.kind,
            paused: consumer.paused,
            producerId: consumer.producerId?.substr(0, 16) + '...'
          }));
          log.info(`Active consumers: ${mediaSoup.consumers.length}`);
          if (mediaSoup.consumers.length > 0) {
            log.table(mediaSoup.consumers);
          }
        }
  
        // Device info
        if (service.device) {
          mediaSoup.device = {
            loaded: service.device.loaded,
            canProduce: {
              audio: service.device.canProduce('audio'),
              video: service.device.canProduce('video')
            }
          };
          log.success('MediaSoup device info', mediaSoup.device);
        }
      } else {
        log.warning('MediaSoup service not found');
      }
  
      // Find RTCPeerConnections
      try {
        // This is a bit hacky but helps find active connections
        const rtcStats = await Promise.all(
          Array.from({ length: 10 }, (_, i) => {
            try {
              const pc = window[`pc${i}`] || window[`peerConnection${i}`];
              if (pc && pc.connectionState) {
                return {
                  name: `pc${i}`,
                  connectionState: pc.connectionState,
                  iceConnectionState: pc.iceConnectionState,
                  signalingState: pc.signalingState
                };
              }
            } catch (e) {
              // Skip
            }
            return null;
          })
        );
        
        mediaSoup.rtcConnections = rtcStats.filter(Boolean);
        if (mediaSoup.rtcConnections.length > 0) {
          log.success(`Found ${mediaSoup.rtcConnections.length} RTCPeerConnections`);
          log.table(mediaSoup.rtcConnections);
        }
      } catch (e) {
        log.info('No RTCPeerConnections found in common locations');
      }
  
      diagnostics.results.mediaSoup = mediaSoup;
      return mediaSoup;
    }
  
    // Test 6: Audio Performance
    async function testAudioPerformance() {
      log.section('6. AUDIO PERFORMANCE METRICS');
      
      const performance = {
        audioContext: null,
        latency: {},
        processing: {},
        memory: {}
      };
  
      try {
        // Create test audio context
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        
        performance.audioContext = {
          sampleRate: ctx.sampleRate,
          baseLatency: ctx.baseLatency,
          outputLatency: ctx.outputLatency,
          currentTime: ctx.currentTime,
          state: ctx.state
        };
  
        // Estimate processing capability
        const bufferSize = 4096;
        const processor = ctx.createScriptProcessor(bufferSize, 1, 1);
        const startTime = performance.now();
        let processCount = 0;
        
        processor.onaudioprocess = () => {
          processCount++;
          if (processCount >= 10) {
            const elapsed = performance.now() - startTime;
            performance.processing = {
              bufferSize: bufferSize,
              processedBuffers: processCount,
              totalTime: elapsed.toFixed(2) + 'ms',
              avgTimePerBuffer: (elapsed / processCount).toFixed(2) + 'ms'
            };
            processor.disconnect();
          }
        };
  
        // Connect to trigger processing
        const oscillator = ctx.createOscillator();
        oscillator.connect(processor);
        processor.connect(ctx.destination);
        oscillator.start();
        
        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 500));
        oscillator.stop();
        
        // Memory usage (if available)
        if (performance.memory) {
          performance.memory = {
            usedJSHeapSize: (performance.memory.usedJSHeapSize / 1048576).toFixed(2) + ' MB',
            totalJSHeapSize: (performance.memory.totalJSHeapSize / 1048576).toFixed(2) + ' MB',
            jsHeapSizeLimit: (performance.memory.jsHeapSizeLimit / 1048576).toFixed(2) + ' MB'
          };
        }
  
        log.success('Performance metrics collected', performance);
        
        ctx.close();
      } catch (e) {
        log.error('Performance testing failed', e);
      }
  
      diagnostics.results.performance = performance;
      return performance;
    }
  
    // Test 7: Extension Compatibility
    async function testExtensionCompatibility() {
      log.section('7. EXTENSION COMPATIBILITY CHECK');
      
      const compatibility = {
        chromeAPIs: {},
        contentScriptReady: false,
        extensionDetected: false,
        messageChannel: false
      };
  
      // Check Chrome extension APIs
      compatibility.chromeAPIs = {
        runtime: !!chrome.runtime,
        storage: !!chrome.storage,
        tabs: !!chrome.tabs
      };
  
      // Check if extension is already injected
      compatibility.extensionDetected = !!(
        window.__vtfInjectState ||
        window.vtfBridge ||
        document.querySelector('script[src*="inject.js"]')
      );
  
      if (compatibility.extensionDetected) {
        log.success('VTF Audio Extension detected');
        
        // Check state if available
        if (window.__vtfInjectState) {
          log.info('Inject state:', window.__vtfInjectState);
        }
        if (window.__vtfInjectCaptures) {
          log.info('Active captures:', Array.from(window.__vtfInjectCaptures.keys()));
        }
      } else {
        log.info('VTF Audio Extension not detected');
      }
  
      // Test message channel
      try {
        const testMessage = { source: 'vtf-diagnostic', type: 'ping' };
        window.postMessage(testMessage, '*');
        compatibility.messageChannel = true;
        log.success('Message channel test passed');
      } catch (e) {
        log.error('Message channel test failed', e);
      }
  
      diagnostics.results.compatibility = compatibility;
      return compatibility;
    }
  
    // Run all tests
    async function runAllTests() {
      const startTime = performance.now();
      
      try {
        await testBrowserCapabilities();
        await testAudioDevices();
        await testVTFGlobals();
        await testVTFAudioElements();
        await testMediaSoup();
        await testAudioPerformance();
        await testExtensionCompatibility();
      } catch (e) {
        log.error('Test suite error', e);
      }
  
      const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
      
      // Summary
      log.section('DIAGNOSTIC SUMMARY');
      
      const summary = {
        totalTime: elapsed + 's',
        errors: diagnostics.errors.length,
        warnings: diagnostics.warnings.length,
        audioElements: diagnostics.results.audioElements?.totalElements || 0,
        activeStreams: diagnostics.results.audioElements?.activeStreams || 0,
        vtfGlobalsFound: !!diagnostics.results.vtfState?.globals,
        extensionCompatible: diagnostics.errors.length === 0
      };
  
      log.info('Test Summary', summary);
      
      if (diagnostics.errors.length > 0) {
        log.error(`${diagnostics.errors.length} errors found:`);
        diagnostics.errors.forEach((err, i) => {
          console.log(`  ${i + 1}. ${err.message}`);
        });
      }
      
      if (diagnostics.warnings.length > 0) {
        log.warning(`${diagnostics.warnings.length} warnings:`);
        diagnostics.warnings.forEach((warn, i) => {
          console.log(`  ${i + 1}. ${warn.message}`);
        });
      }
  
      // Save results
      window.vtfDiagnostics = diagnostics;
      
      console.log('\n' + '='.repeat(60));
      console.log('%c✅ Diagnostics complete!', 'font-size: 16px; color: #4CAF50; font-weight: bold');
      console.log('Full results saved to: window.vtfDiagnostics');
      console.log('Export with: copy(JSON.stringify(window.vtfDiagnostics, null, 2))');
      console.log('='.repeat(60));
      
      return diagnostics;
    }
  
    // Interactive commands
    window.vtfDiag = {
      run: runAllTests,
      browser: testBrowserCapabilities,
      devices: testAudioDevices,
      globals: testVTFGlobals,
      elements: testVTFAudioElements,
      mediasoup: testMediaSoup,
      performance: testAudioPerformance,
      compatibility: testExtensionCompatibility,
      
      // Utility functions
      exportResults: () => {
        const json = JSON.stringify(window.vtfDiagnostics, null, 2);
        console.log('Results copied to clipboard!');
        return json;
      },
      
      monitorAudio: (interval = 1000) => {
        console.log('Starting audio monitor... (Press Ctrl+C to stop)');
        const monitor = setInterval(() => {
          const elements = document.querySelectorAll('audio[id^="msRemAudio-"]');
          const active = Array.from(elements).filter(e => e.srcObject && !e.paused);
          console.clear();
          console.log(`[${new Date().toLocaleTimeString()}] Audio Monitor`);
          console.log(`Total elements: ${elements.length}, Active: ${active.length}`);
          active.forEach(audio => {
            const userId = audio.id.replace('msRemAudio-', '').substr(0, 8);
            console.log(`  ${userId}: vol=${audio.volume.toFixed(2)}, time=${audio.currentTime.toFixed(1)}s`);
          });
        }, interval);
        
        return () => clearInterval(monitor);
      },
      
      findGlobals: () => {
        const results = [];
        for (const key in window) {
          try {
            if (typeof window[key] === 'object' && window[key]) {
              if (window[key].audioVolume !== undefined || 
                  window[key].sessData !== undefined ||
                  window[key].consumers instanceof Map) {
                results.push({
                  name: key,
                  hasAudioVolume: window[key].audioVolume !== undefined,
                  hasSessionData: window[key].sessData !== undefined,
                  hasConsumers: window[key].consumers instanceof Map
                });
              }
            }
          } catch (e) {
            // Skip
          }
        }
        console.table(results);
        return results;
      },
      
      help: () => {
        console.log('%cVTF Diagnostic Commands:', 'font-size: 14px; color: #2196F3; font-weight: bold');
        console.log('  vtfDiag.run()         - Run all diagnostics');
        console.log('  vtfDiag.browser()     - Test browser capabilities');
        console.log('  vtfDiag.devices()     - List audio devices');
        console.log('  vtfDiag.globals()     - Find VTF global objects');
        console.log('  vtfDiag.elements()    - Analyze audio elements');
        console.log('  vtfDiag.mediasoup()   - Check MediaSoup/WebRTC');
        console.log('  vtfDiag.performance() - Test audio performance');
        console.log('  vtfDiag.compatibility() - Check extension compatibility');
        console.log('  vtfDiag.monitorAudio()  - Start live audio monitor');
        console.log('  vtfDiag.findGlobals()   - Search for all VTF objects');
        console.log('  vtfDiag.exportResults() - Export results as JSON');
      }
    };
  
    // Auto-run
    runAllTests();
    
    // Show help
    setTimeout(() => {
      console.log('\n%cType vtfDiag.help() for available commands', 'color: #888; font-style: italic');
    }, 100);
  
  })();