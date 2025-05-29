/**
 * Real-Time Webcam AI Vision Captioning Application
 */

class WebcamCaptionApp {
    constructor() {
        // DOM Elements
        this.elements = {
            // Camera elements
            webcam: document.getElementById('webcam'),
            canvas: document.getElementById('canvas'),
            
            // Button elements
            startCameraBtn: document.getElementById('start-camera'),
            stopCameraBtn: document.getElementById('stop-camera'),
            healthCheckBtn: document.getElementById('health-check'),
            
            // Display elements
            statusDisplay: document.getElementById('status-display'),
            statusText: document.querySelector('.status-text'),
            statusIcon: document.querySelector('.status-icon'),
            captionResult: document.getElementById('caption-result'),
            captionText: document.getElementById('caption-text'),
            processingTime: document.getElementById('processing-time'),
            resultStatus: document.getElementById('result-status'),
            errorDisplay: document.getElementById('error-display'),
            errorMessage: document.getElementById('error-message'),
            retryBtn: document.getElementById('retry-btn'),
            
            // Loading overlay
            loadingOverlay: document.getElementById('loading-overlay'),
            loadingMessage: document.getElementById('loading-message'),
            loadingBar: document.getElementById('loading-bar'),
            
            // System status
            backendStatus: document.getElementById('backend-status'),
            gpuStatus: document.getElementById('gpu-status'),
            queueStatus: document.getElementById('queue-status')
        };
        
        // App State
        this.state = {
            cameraActive: false,
            realtimeCaptioning: false,
            processing: false,
            stream: null,
            captionInterval: null,
            lastCaptionTime: 0
        };
        
        // Configuration
        this.config = {
            apiBaseUrl: 'http://localhost:5000',
            maxRetries: 3,
            retryDelay: 1000,
            healthCheckInterval: 30000,
            captionInterval: 4000, // Generate caption every 4 seconds
            minCaptionDelay: 2000   // Minimum delay between captions
        };
        
        // Initialize the application
        this.init();
    }
    
    /**
     * Initialize the application
     */
    async init() {
        console.log('🚀 Initializing Real-Time Webcam Caption App...');
        
        this.bindEvents();
        await this.checkSystemHealth();
        this.startHealthMonitoring();
        this.updateStatus('Ready to start real-time captioning', '🎥');
        
        console.log('✅ App initialized successfully');
    }
    
    /**
     * Bind all event listeners
     */
    bindEvents() {
        this.elements.startCameraBtn.addEventListener('click', () => this.startRealTimeCapturing());
        this.elements.stopCameraBtn.addEventListener('click', () => this.stopRealTimeCapturing());
        this.elements.retryBtn.addEventListener('click', () => this.hideError());
        this.elements.healthCheckBtn.addEventListener('click', () => this.checkSystemHealth());
        
        // Handle browser tab visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.pauseRealTimeCapturing();
                this.pauseHealthMonitoring();
            } else {
                this.resumeRealTimeCapturing();
                this.resumeHealthMonitoring();
            }
        });
    }
    
    /**
     * Start real-time captioning
     */
    async startRealTimeCapturing() {
        try {
            this.updateStatus('Starting camera...', '📹');
            
            // Request camera access
            this.state.stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: 'user'
                },
                audio: false
            });
            
            // Set video source
            this.elements.webcam.srcObject = this.state.stream;
            
            // Wait for video to be ready
            await new Promise((resolve) => {
                this.elements.webcam.addEventListener('loadedmetadata', resolve, { once: true });
            });
            
            // Update UI
            this.state.cameraActive = true;
            this.elements.startCameraBtn.classList.add('hidden');
            this.elements.stopCameraBtn.classList.remove('hidden');
            
            // Start real-time captioning
            this.startRealTimeCaptioning();
            
            this.updateStatus('🔴 LIVE - Real-time AI captioning active', '🤖');
            console.log('✅ Real-time captioning started');
            
        } catch (error) {
            console.error('❌ Camera access failed:', error);
            
            let errorMessage = 'Could not access camera. ';
            if (error.name === 'NotAllowedError') {
                errorMessage += 'Please allow camera access and refresh the page.';
            } else if (error.name === 'NotFoundError') {
                errorMessage += 'No camera found on this device.';
            } else {
                errorMessage += 'Please check your camera settings.';
            }
            
            this.showError('Camera Access Failed', errorMessage);
        }
    }
    
    /**
     * Stop real-time captioning
     */
    stopRealTimeCapturing() {
        // Stop video stream
        if (this.state.stream) {
            this.state.stream.getTracks().forEach(track => track.stop());
            this.state.stream = null;
        }
        
        // Stop captioning interval
        this.stopRealTimeCaptioning();
        
        // Reset UI
        this.state.cameraActive = false;
        this.elements.startCameraBtn.classList.remove('hidden');
        this.elements.stopCameraBtn.classList.add('hidden');
        this.elements.captionResult.classList.add('hidden');
        
        this.updateStatus('Camera stopped - click to start again', '📹');
        console.log('✅ Real-time captioning stopped');
    }
    
    /**
     * Start the captioning interval
     */
    startRealTimeCaptioning() {
        if (this.state.captionInterval) {
            clearInterval(this.state.captionInterval);
        }
        
        this.state.realtimeCaptioning = true;
        
        // Generate first caption immediately
        setTimeout(() => this.captureAndAnalyze(), 1000);
        
        // Then continue every few seconds
        this.state.captionInterval = setInterval(() => {
            if (this.state.realtimeCaptioning && !this.state.processing) {
                this.captureAndAnalyze();
            }
        }, this.config.captionInterval);
        
        console.log('🔄 Real-time captioning interval started');
    }
    
    /**
     * Stop the captioning interval
     */
    stopRealTimeCaptioning() {
        this.state.realtimeCaptioning = false;
        
        if (this.state.captionInterval) {
            clearInterval(this.state.captionInterval);
            this.state.captionInterval = null;
        }
        
        console.log('⏹️ Real-time captioning interval stopped');
    }
    
    /**
     * Pause real-time captioning (for tab visibility)
     */
    pauseRealTimeCapturing() {
        if (this.state.realtimeCaptioning) {
            this.stopRealTimeCaptioning();
        }
    }
    
    /**
     * Resume real-time captioning (for tab visibility)
     */
    resumeRealTimeCapturing() {
        if (this.state.cameraActive && !this.state.realtimeCaptioning) {
            this.startRealTimeCaptioning();
        }
    }
    
    /**
     * Capture current frame and analyze with AI
     */
    async captureAndAnalyze() {
        // Throttle requests to avoid overwhelming the API
        const now = Date.now();
        if (now - this.state.lastCaptionTime < this.config.minCaptionDelay) {
            return;
        }
        
        if (this.state.processing || !this.state.cameraActive) {
            return;
        }
        
        try {
            // Capture current frame
            const imageBlob = await this.captureCurrentFrame();
            if (!imageBlob) return;
            
            this.state.processing = true;
            this.state.lastCaptionTime = now;
            
            // Show processing indicator in status
            this.updateStatus('🔴 LIVE - Analyzing current view...', '🧠');
            
            // Send to AI
            const formData = new FormData();
            formData.append('image', imageBlob, 'realtime-frame.jpg');
            
            const response = await this.sendToAPI('/caption', {
                method: 'POST',
                body: formData
            });
            
            // Display result
            this.displayCaption(response.caption, response.processing_time, response.status);
            
            // Update status back to live
            this.updateStatus('🔴 LIVE - Real-time AI captioning active', '🤖');
            
        } catch (error) {
            console.error('❌ Real-time caption failed:', error);
            // Don't show error popup for individual frame failures, just log it
            this.updateStatus('🔴 LIVE - Caption failed, retrying...', '⚠️');
        } finally {
            this.state.processing = false;
        }
    }
    
    /**
     * Capture current video frame as blob
     */
    async captureCurrentFrame() {
        return new Promise((resolve) => {
            try {
                const canvas = this.elements.canvas;
                const video = this.elements.webcam;
                const context = canvas.getContext('2d');
                
                // Set canvas size to match video
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                
                // Draw current video frame
                context.drawImage(video, 0, 0);
                
                // Convert to blob
                canvas.toBlob((blob) => {
                    resolve(blob);
                }, 'image/jpeg', 0.7); // Lower quality for faster processing
                
            } catch (error) {
                console.error('Frame capture failed:', error);
                resolve(null);
            }
        });
    }
    
    /**
     * Send API request to backend
     */
    async sendToAPI(endpoint, options = {}) {
        const url = `${this.config.apiBaseUrl}${endpoint}`;
        
        const defaultOptions = {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        };
        
        if (!(options.body instanceof FormData)) {
            defaultOptions.headers['Content-Type'] = 'application/json';
        }
        
        const finalOptions = { ...defaultOptions, ...options };
        
        let lastError;
        
        // Retry logic
        for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
            try {
                const response = await fetch(url, finalOptions);
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                const data = await response.json();
                return data;
                
            } catch (error) {
                lastError = error;
                
                if (attempt < this.config.maxRetries) {
                    await this.sleep(this.config.retryDelay * attempt);
                }
            }
        }
        
        throw new Error(`API request failed: ${lastError.message}`);
    }
    
    /**
     * Check system health
     */
    async checkSystemHealth() {
        try {
            const health = await this.sendToAPI('/health');
            
            this.elements.backendStatus.textContent = health.status || 'Unknown';
            this.elements.backendStatus.style.color = health.status === 'healthy' ? '#22c55e' : '#ef4444';
            
            this.elements.gpuStatus.textContent = health.gpu_status || 'Unknown';
            this.elements.gpuStatus.style.color = health.gpu_status === 'running' ? '#22c55e' : 
                                                 health.gpu_status === 'starting' ? '#f59e0b' : '#6b7280';
            
            this.elements.queueStatus.textContent = health.queue_length || '0';
            
        } catch (error) {
            console.warn('Health check failed:', error);
            this.elements.backendStatus.textContent = 'Offline';
            this.elements.backendStatus.style.color = '#ef4444';
            this.elements.gpuStatus.textContent = 'Unknown';
            this.elements.queueStatus.textContent = '?';
        }
    }
    
    /**
     * Display caption result
     */
    displayCaption(caption, processingTime, status) {
        this.elements.captionText.textContent = caption;
        
        if (processingTime) {
            this.elements.processingTime.textContent = `⏱️ ${processingTime}s`;
        } else {
            this.elements.processingTime.textContent = '';
        }
        
        // Status indicator
        const statusMap = {
            'success': { text: '✅ Live', color: '#22c55e' },
            'starting': { text: '🚀 Starting', color: '#f59e0b' },
            'budget_exceeded': { text: '💰 Budget Limit', color: '#ef4444' },
            'error': { text: '❌ Error', color: '#ef4444' }
        };
        
        const statusInfo = statusMap[status] || { text: '📝 Processing', color: '#6b7280' };
        this.elements.resultStatus.textContent = statusInfo.text;
        this.elements.resultStatus.style.color = statusInfo.color;
        
        this.elements.captionResult.classList.remove('hidden');
        this.hideError();
    }
    
    /**
     * Update status display
     */
    updateStatus(message, icon = '⏳') {
        this.elements.statusText.textContent = message;
        this.elements.statusIcon.textContent = icon;
        this.elements.statusDisplay.classList.remove('hidden');
    }
    
    /**
     * Show error message
     */
    showError(title, message) {
        document.querySelector('.error-title').textContent = title;
        this.elements.errorMessage.textContent = message;
        this.elements.errorDisplay.classList.remove('hidden');
    }
    
    /**
     * Hide error message
     */
    hideError() {
        this.elements.errorDisplay.classList.add('hidden');
    }
    
    /**
     * Start periodic health monitoring
     */
    startHealthMonitoring() {
        this.healthInterval = setInterval(() => {
            this.checkSystemHealth();
        }, this.config.healthCheckInterval);
    }
    
    /**
     * Pause health monitoring
     */
    pauseHealthMonitoring() {
        if (this.healthInterval) {
            clearInterval(this.healthInterval);
        }
    }
    
    /**
     * Resume health monitoring
     */
    resumeHealthMonitoring() {
        this.startHealthMonitoring();
    }
    
    /**
     * Sleep utility function
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Cleanup resources
     */
    cleanup() {
        this.stopRealTimeCapturing();
        
        if (this.healthInterval) {
            clearInterval(this.healthInterval);
        }
        
        console.log('🧹 App cleanup completed');
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎬 DOM loaded, starting real-time app...');
    window.webcamApp = new WebcamCaptionApp();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (window.webcamApp) {
        window.webcamApp.cleanup();
    }
});

// Export for potential module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WebcamCaptionApp;
}