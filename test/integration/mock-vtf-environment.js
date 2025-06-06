

window.setupMockVTF = function(options = {}) {
    
    
    if (!document.getElementById('topRoomDiv')) {
      const container = document.createElement('div');
      container.id = 'topRoomDiv';
      container.style.display = 'none';
      document.body.appendChild(container);
    }
    
    
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
          
        },
        hideAll: function() {
          
        }
      }
    };
    
    
    window.globals = window.appService.globals;
    
    
    window.mediaSoupService = {
      consumers: new Map(),
      device: {
        canProduce: function(kind) {
          return kind === 'audio' || kind === 'video';
        }
      },
      
      startListeningToPresenter: function(userData) {
        
        
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
        
        
        const consumerId = `consumer-${userData.userID || userData.userId}`;
        this.consumers.delete(consumerId);
        
        
        const elementId = `msRemAudio-${userData.userID || userData.userId}`;
        const audioElement = document.getElementById(elementId);
        if (audioElement) {
          audioElement.pause();
          audioElement.currentTime = 0;
        }
      },
      
      reconnectAudio: function() {
        
        
        const elements = document.querySelectorAll('[id^="msRemAudio-"]');
        elements.forEach(el => el.remove());
        
        
        this.consumers.clear();
        
        
        const container = document.getElementById('topRoomDiv');
        if (container) {
          container.innerHTML = '<div style="color: #999;">Reconnected - elements cleared</div>';
        }
      }
    };
    
    
    window.adjustVol = function(event) {
      const volumePercent = event ? event.target.value : (window.appService.globals.audioVolume * 100);
      const volumeDecimal = volumePercent / 100;
      
      
      window.appService.globals.audioVolume = volumeDecimal;
      
      
      if (window.jQuery) {
        window.jQuery("[id^='msRemAudio-']").prop('volume', volumeDecimal);
      } else {
        document.querySelectorAll('[id^="msRemAudio-"]').forEach(audio => {
          audio.volume = volumeDecimal;
        });
      }
    };
    
    window.mute = function() {
      
      window.appService.globals.previousVolume = window.appService.globals.audioVolume;
      window.appService.globals.audioVolume = 0;
      window.adjustVol();
    };
    
    window.unMute = function() {
      
      window.appService.globals.audioVolume = window.appService.globals.previousVolume || 1.0;
      window.adjustVol();
    };
    
    
    window.mediaSoupService.adjustVol = window.adjustVol;
    window.mediaSoupService.mute = window.mute;
    window.mediaSoupService.unMute = window.unMute;
    
    
    window.reconnectAudio = window.mediaSoupService.reconnectAudio.bind(window.mediaSoupService);
    
    
    if (options.includeJQuery !== false) {
      window.$ = window.jQuery = function(selector) {
        const elements = document.querySelectorAll(selector);
        
        
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
      
      
      window.jQuery.fn = window.jQuery.prototype = {
        jquery: '3.6.0' 
      };
    }
    
    
    if (options.createAudioElements) {
      const container = document.getElementById('topRoomDiv');
      container.innerHTML = ''; 
      
      const users = options.users || ['user1', 'user2'];
      users.forEach(userId => {
        const audio = document.createElement('audio');
        audio.id = `msRemAudio-${userId}`;
        audio.autoplay = false;
        container.appendChild(audio);
        
        
        window.appService.globals.talkingUsers.set(userId, {
          userID: userId,
          userName: `User ${userId}`,
          producerID: `producer-${userId}`
        });
        
        
      });
    }
    
    
    
    
    
    return {
      globals: window.appService.globals,
      mediaSoupService: window.mediaSoupService
    };
  };
  
  
  window.cleanupMockVTF = function() {
    
    
    delete window.appService;
    delete window.globals;
    delete window.mediaSoupService;
    delete window.adjustVol;
    delete window.mute;
    delete window.unMute;
    delete window.reconnectAudio;
    
    
    if (window.jQuery && window.jQuery.fn && window.jQuery.fn.jquery === '3.6.0') {
      delete window.$;
      delete window.jQuery;
    }
    
    
    const container = document.getElementById('topRoomDiv');
    if (container) {
      container.innerHTML = '';
    }
  };
  
  
  window.simulateVTFBehaviors = {
    
    userJoins: function(userId) {
      
      
      const userData = {
        userID: userId,
        userName: `User ${userId}`,
        producerID: `producer-${userId}`
      };
      window.appService.globals.talkingUsers.set(userId, userData);
      
      
      const audio = document.createElement('audio');
      audio.id = `msRemAudio-${userId}`;
      audio.autoplay = false;
      document.getElementById('topRoomDiv').appendChild(audio);
      
      
      window.mediaSoupService.startListeningToPresenter(userData);
      
      
      setTimeout(() => {
        try {
          const ctx = new AudioContext();
          const dest = ctx.createMediaStreamDestination();
          audio.srcObject = dest.stream;
          
        } catch (e) {
          
        }
      }, 500);
    },
    
    
    userLeaves: function(userId) {
      
      
      const userData = window.appService.globals.talkingUsers.get(userId);
      window.appService.globals.talkingUsers.delete(userId);
      
      if (userData) {
        
        window.mediaSoupService.stopListeningToPresenter(userData);
      }
      
      
      const audio = document.getElementById(`msRemAudio-${userId}`);
      if (audio) {
        audio.remove();
      }
    },
    
    
    networkGlitch: function() {
      
      
      window.appService.globals.sessData.currentState = 'reconnecting';
      
      
      setTimeout(() => {
        window.reconnectAudio();
        window.appService.globals.sessData.currentState = 'open';
      }, 2000);
    }
  };
  
  
  export { setupMockVTF, cleanupMockVTF, simulateVTFBehaviors };