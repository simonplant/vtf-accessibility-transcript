// transcription.js - Handles audio transcription with various services

class TranscriptionService {
    constructor() {
        this.service = 'browser';
        this.apiKeys = {};
        this.loadSettings();
        this.transcriptionQueue = [];
        this.isProcessing = false;
    }
    
    async loadSettings() {
        const settings = await chrome.storage.local.get([
            'transcriptionService', 
            'openaiKey', 
            'azureKey', 
            'azureRegion'
        ]);
        
        this.service = settings.transcriptionService || 'browser';
        this.apiKeys = {
            openai: settings.openaiKey,
            azure: settings.azureKey,
            azureRegion: settings.azureRegion
        };
    }
    
    async queueTranscription(audioBase64, format, sampleRate, timestamp) {
        this.transcriptionQueue.push({
            audio: audioBase64,
            format: format,
            sampleRate: sampleRate,
            timestamp: timestamp
        });
        
        // Process queue if not already processing
        if (!this.isProcessing) {
            this.processQueue();
        }
    }
    
    async processQueue() {
        if (this.transcriptionQueue.length === 0) {
            this.isProcessing = false;
            return;
        }
        
        this.isProcessing = true;
        const item = this.transcriptionQueue.shift();
        
        try {
            const result = await this.transcribeAudio(item.audio, item.format, item.sampleRate);
            
            // Send successful transcription
            chrome.runtime.sendMessage({
                type: 'TRANSCRIPTION_COMPLETE',
                transcript: result.transcript,
                confidence: result.confidence,
                timestamp: item.timestamp,
                service: result.service
            });
        } catch (error) {
            console.error('Transcription error:', error);
            
            // Send error but continue processing
            chrome.runtime.sendMessage({
                type: 'TRANSCRIPTION_COMPLETE',
                transcript: `[Transcription error: ${error.message}]`,
                confidence: 0,
                timestamp: item.timestamp,
                service: 'error'
            });
        }
        
        // Process next item
        setTimeout(() => this.processQueue(), 100);
    }
    
    async transcribeAudio(audioBase64, format = 'wav', sampleRate = 16000) {
        await this.loadSettings(); // Reload settings in case they changed
        
        try {
            switch (this.service) {
                case 'openai':
                    return await this.transcribeWithOpenAI(audioBase64);
                case 'azure':
                    return await this.transcribeWithAzure(audioBase64, format, sampleRate);
                case 'browser':
                default:
                    return await this.transcribeWithBrowser(audioBase64);
            }
        } catch (error) {
            console.error('Transcription error:', error);
            throw error;
        }
    }
    
    async transcribeWithOpenAI(audioBase64) {
        if (!this.apiKeys.openai) {
            throw new Error('OpenAI API key not configured. Go to extension options to add it.');
        }
        
        // Convert base64 to blob
        const audioBlob = this.base64ToBlob(audioBase64, 'audio/wav');
        
        // Create form data
        const formData = new FormData();
        formData.append('file', audioBlob, 'audio.wav');
        formData.append('model', 'whisper-1');
        formData.append('response_format', 'json');
        formData.append('language', 'en');
        
        try {
            const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKeys.openai}`
                },
                body: formData
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
            }
            
            const result = await response.json();
            return {
                transcript: result.text,
                confidence: 0.95, // OpenAI doesn't provide confidence scores
                service: 'openai'
            };
        } catch (error) {
            console.error('OpenAI transcription error:', error);
            throw error;
        }
    }
    
    async transcribeWithAzure(audioBase64, format, sampleRate) {
        if (!this.apiKeys.azure || !this.apiKeys.azureRegion) {
            throw new Error('Azure Speech Services not configured');
        }
        
        const audioBlob = this.base64ToBlob(audioBase64, 'audio/wav');
        
        try {
            const response = await fetch(
                `https://${this.apiKeys.azureRegion}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US`,
                {
                    method: 'POST',
                    headers: {
                        'Ocp-Apim-Subscription-Key': this.apiKeys.azure,
                        'Content-Type': 'audio/wav',
                        'Accept': 'application/json'
                    },
                    body: audioBlob
                }
            );
            
            if (!response.ok) {
                throw new Error(`Azure API error: ${response.statusText}`);
            }
            
            const result = await response.json();
            return {
                transcript: result.DisplayText,
                confidence: result.NBest?.[0]?.Confidence || 0.9,
                service: 'azure'
            };
        } catch (error) {
            console.error('Azure transcription error:', error);
            throw error;
        }
    }
    
    async transcribeWithBrowser(audioBase64) {
        // Browser API doesn't work well with audio streams
        // Return a message indicating the limitation
        return {
            transcript: '[Browser transcription not available for captured streams. Please configure OpenAI or Azure in extension options.]',
            confidence: 0,
            service: 'browser'
        };
    }
    
    base64ToBlob(base64, mimeType) {
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray], { type: mimeType });
    }
}

// Create global instance
const transcriptionService = new TranscriptionService();

// Handle audio chunks from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'TRANSCRIBE_AUDIO') {
        transcriptionService.queueTranscription(
            request.audio, 
            request.format, 
            request.sampleRate,
            request.timestamp
        );
    }
});

// Forward transcription results
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'TRANSCRIPTION_COMPLETE') {
        // Forward to all tabs
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
                if (tab.url && tab.url.includes('vtf.t3live.com')) {
                    chrome.tabs.sendMessage(tab.id, {
                        type: 'TRANSCRIPTION_RESULT',
                        transcript: request.transcript,
                        confidence: request.confidence,
                        timestamp: request.timestamp,
                        service: request.service
                    });
                }
            });
        });
    }
});