/**
 * Mock VTF Environment
 * Simulates VTF's DOM structure and global objects for testing
 */

window.setupMockVTF = function(options = {}) {
    console.log('[Mock VTF] Setting up environment with options:', options);
    
    // Create container if it doesn't exist
    if (!document.getElementById('topRoomDiv')) {
      const container = document.createElement('div');
      container.id = 'topRoomDiv';
      container.style.display = 'none';
      document.body.appendChild(container);
    }
    
    // Create globals at expected path
    window.appService = {
      globals: {
        audioVolume: options.volume !== undefined ? options.volume : 1.0,
        sessData: {
          currentState: options.sessionState || 'open',
          roomName: options.roomName || 'test-room',
          userName: options.userName || 'test-user'
        },
        preferences: {
          audioDeviceID: options.audioDeviceID || 'default',
          videoDeviceID: options.videoDeviceID || 'default',
          theme: options.theme || 'dark',
          autoStart: options.autoStart !== false,
          doNotDisturbOn: false,
          autoGainControl: true,
          noiseSuppression: true,
          echoCancellation: true
        },
        videoDeviceID: options.videoDeviceID || 'default',
        talkingUsers: new Map()
      },
      alertsService: {
        alert: function(message) {
          console.log('[Mock VTF] Alert:', message);
        },
        hideAll: function() {
          console.log('[Mock VTF] Hide all alerts');
        }
      }
    };
    
    // Also set at window.globals for some VTF versions
    window.globals = window.appService.globals;
    
    // Create MediaSoup service
    window.mediaSoupService = {
      consumers: new Map(),
      device: {
        canProduce: function(kind) {
          return kind === 'audio' || kind === 'video';
        }
      },
      
      startListeningToPresenter: function(userData) {
        console.log('[Mock VTF] startListeningToPresenter:', userData);
        
        // Simulate consumer creation
        const consumerId = `consumer-${userData.userID || userData.userId}`;
        this.consumers.set(consumerId, {
          id: consumerId,
          producerId: userData.producerID || userData.producerId,
          track: {
            kind: 'audio',
            readyState: 'live'
          }
        });
      },
      
      stopListeningToPresenter: function(userData) {
        console.log('[Mock VTF] stopListeningToPresenter:', userData);
        
        // Find and remove consumer
        const consumerId = `consumer-${userData.userID || userData.userId}`;
        this.consumers.delete(consumerId);
        
        // Pause audio element if exists
        const elementId = `msRemAudio-${userData.userID || userData.userId}`;
        const audioElement = document.getElementById(elementId);
        if (audioElement) {
          audioElement.pause();
          audioElement.currentTime = 0;
        }
      },
      
      reconnectAudio: function() {
        console.log('[Mock VTF] reconnectAudio called - removing all audio elements');
        
        // VTF pattern: remove all audio elements
        const elements = document.querySelectorAll('[id^="msRemAudio-"]');
        elements.forEach(el => el.remove());
        
        // Clear consumers
        this.consumers.clear();
        
        // Update topRoomDiv
        const container = document.getElementById('topRoomDiv');
        if (container) {
          container.innerHTML = '<div style="color: #999;">Reconnected - elements cleared</div>';
        }
      }
    };
    
    // Create VTF functions
    window.adjustVol = function(event) {
      const volumePercent = event ? event.target.value : (window.appService.globals.audioVolume * 100);
      const volumeDecimal = volumePercent / 100;
      
      console.log('[Mock VTF] adjustVol to:', volumeDecimal);
      window.appService.globals.audioVolume = volumeDecimal;
      
      // Apply to all audio elements (VTF pattern)
      if (window.jQuery) {
        window.jQuery("[id^='msRemAudio-']").prop('volume', volumeDecimal);
      } else {
        document.querySelectorAll('[id^="msRemAudio-"]').forEach(audio => {
          audio.volume = volumeDecimal;
        });
      }
    };
    
    window.mute = function() {
      console.log('[Mock VTF] mute called');
      window.appService.globals.previousVolume = window.appService.globals.audioVolume;
      window.appService.globals.audioVolume = 0;
      window.adjustVol();
    };
    
    window.unMute = function() {
      console.log('[Mock VTF] unMute called');
      window.appService.globals.audioVolume = window.appService.globals.previousVolume || 1.0;
      window.adjustVol();
    };
    
    // Add these to mediaSoupService too
    window.mediaSoupService.adjustVol = window.adjustVol;
    window.mediaSoupService.mute = window.mute;
    window.mediaSoupService.unMute = window.unMute;
    
    // Shortcut to reconnectAudio at window level
    window.reconnectAudio = window.mediaSoupService.reconnectAudio.bind(window.mediaSoupService);
    
    // Add jQuery if requested (minimal mock)
    if (options.includeJQuery !== false) {
      window.$ = window.jQuery = function(selector) {
        const elements = document.querySelectorAll(selector);
        
        // Return jQuery-like object
        return {
          length: elements.length,
          prop: function(property, value) {
            elements.forEach(el => {
              if (value !== undefined) {
                el[property] = value;
              }
            });
            return this;
          },
          remove: function() {
            elements.forEach(el => el.remove());
            return this;
          },
          each: function(callback) {
            elements.forEach((el, index) => callback.call(el, index, el));
            return this;
          }
        };
      };
      
      // jQuery should return elements array-like
      window.jQuery.fn = window.jQuery.prototype = {
        jquery: '3.6.0' // Mock version
      };
    }
    
    // Create test audio elements if requested
    if (options.createAudioElements) {
      const container = document.getElementById('topRoomDiv');
      container.innerHTML = ''; // Clear placeholder
      
      const users = options.users || ['user1', 'user2'];
      users.forEach(userId => {
        const audio = document.createElement('audio');
        audio.id = `msRemAudio-${userId}`;
        audio.autoplay = false;
        container.appendChild(audio);
        
        // Add to talking users
        window.appService.globals.talkingUsers.set(userId, {
          userID: userId,
          userName: `User ${userId}`,
          producerID: `producer-${userId}`
        });
        
        console.log(`[Mock VTF] Created audio element: ${audio.id}`);
      });
    }
    
    // Simulate VTF initialization log
    console.log('[Mock VTF] Environment ready');
    console.log('[Mock VTF] Globals at:', window.appService.globals);
    console.log('[Mock VTF] MediaSoup at:', window.mediaSoupService);
    
    return {
      globals: window.appService.globals,
      mediaSoupService: window.mediaSoupService
    };
  };
  
  // Helper to clean up mock environment
  window.cleanupMockVTF = function() {
    console.log('[Mock VTF] Cleaning up environment');
    
    // Remove globals
    delete window.appService;
    delete window.globals;
    delete window.mediaSoupService;
    delete window.adjustVol;
    delete window.mute;
    delete window.unMute;
    delete window.reconnectAudio;
    
    // Remove jQuery if it was mocked
    if (window.jQuery && window.jQuery.fn && window.jQuery.fn.jquery === '3.6.0') {
      delete window.$;
      delete window.jQuery;
    }
    
    // Clear DOM
    const container = document.getElementById('topRoomDiv');
    if (container) {
      container.innerHTML = '';
    }
  };
  
  // Helper to simulate VTF behaviors
  window.simulateVTFBehaviors = {
    // Simulate user joining
    userJoins: function(userId) {
      console.log(`[Mock VTF] User ${userId} joining`);
      
      // Add to talking users
      const userData = {
        userID: userId,
        userName: `User ${userId}`,
        producerID: `producer-${userId}`
      };
      window.appService.globals.talkingUsers.set(userId, userData);
      
      // Create audio element
      const audio = document.createElement('audio');
      audio.id = `msRemAudio-${userId}`;
      audio.autoplay = false;
      document.getElementById('topRoomDiv').appendChild(audio);
      
      // Call startListeningToPresenter
      window.mediaSoupService.startListeningToPresenter(userData);
      
      // Simulate stream assignment after delay
      setTimeout(() => {
        try {
          const ctx = new AudioContext();
          const dest = ctx.createMediaStreamDestination();
          audio.srcObject = dest.stream;
          console.log(`[Mock VTF] Stream assigned to ${userId}`);
        } catch (e) {
          console.log(`[Mock VTF] Could not create real stream for ${userId}`);
        }
      }, 500);
    },
    
    // Simulate user leaving
    userLeaves: function(userId) {
      console.log(`[Mock VTF] User ${userId} leaving`);
      
      // Remove from talking users
      const userData = window.appService.globals.talkingUsers.get(userId);
      window.appService.globals.talkingUsers.delete(userId);
      
      if (userData) {
        // Call stopListeningToPresenter
        window.mediaSoupService.stopListeningToPresenter(userData);
      }
      
      // Remove audio element
      const audio = document.getElementById(`msRemAudio-${userId}`);
      if (audio) {
        audio.remove();
      }
    },
    
    // Simulate network issues
    networkGlitch: function() {
      console.log('[Mock VTF] Simulating network glitch');
      
      // Change session state
      window.appService.globals.sessData.currentState = 'reconnecting';
      
      // After delay, reconnect
      setTimeout(() => {
        window.reconnectAudio();
        window.appService.globals.sessData.currentState = 'open';
      }, 2000);
    }
  };
  
  // Export for module usage
  export { setupMockVTF, cleanupMockVTF, simulateVTFBehaviors };