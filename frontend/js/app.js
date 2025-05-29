/**
 * Real-Time Webcam AI Vision Captioning Application
 * Frontend JavaScript Application
 */

class WebcamCaptionApp {
    constructor() {
        // DOM Elements
        this.elements = {
            // Camera elements
            webcam: document.getElementById('webcam'),
            canvas: document.getElementById('canvas'),
            previewContainer: document.getElementById('preview-container'),
            previewImage: document.getElementById('preview-image'),
            
            // Button elements
            startCameraBtn: document.getElementById('start-camera'),
            capturePhotoBtn: document.getElementById('capture-photo'),
            retakePhotoBtn: document.getElementById('retake-photo'),
            getCaptionBtn: document.getElementById('get-caption'),
            retryBtn: document.getElementById('retry-btn'),
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
            photoTaken: false,
            processing: false,
            capturedImageBlob: null,
            stream: null
        };
        
        // API Configuration - CONNECTS TO YOUR DIGITALOCEAN SERVER
        this.config = {
            apiBaseUrl: 'http://64.226.106.221',  // Your DigitalOcean server IP
            maxRetries: 3,
            retryDelay: 1000,
            healthCheckInterval: 30000 // Check system health every 30 seconds
        };
        
        // Initialize the application
        this.init();
    }
    
    /**
     * Initialize the application
     */
    async init() {
        console.log('🚀 Initializing Webcam Caption App...');
        
        // Bind event listeners
        this.bindEvents();
        
        // Check initial system health
        await this.checkSystemHealth();
        
        // Start periodic health checks
        this.startHealthMonitoring();
        
        // Set initial status
        this.updateStatus('Ready to start camera', '📹');
        
        console.log('✅ App initialized successfully');
    }
    
    /**
     * Bind all event listeners
     */
    bindEvents() {
        // Camera controls
        this.elements.startCameraBtn.addEventListener('click', () => this.startCamera());
        this.elements.capturePhotoBtn.addEventListener('click', () => this.capturePhoto());
        this.elements.retakePhotoBtn.addEventListener('click', () => this.retakePhoto());
        this.elements.getCaptionBtn.addEventListener('click', () => this.getCaption());
        
        // Error handling
        this.elements.retryBtn.addEventListener('click', () => this.hideError());
        
        // System health check
        this.elements.healthCheckBtn.addEventListener('click', () => this.checkSystemHealth());
        
        // Handle browser tab visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.pauseHealthMonitoring();
            } else {
                this.resumeHealthMonitoring();
            }
        });
    }
    
    /**
     * Start the webcam
     */
    async startCamera() {
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
            
            // Update UI state
            this.state.cameraActive = true;
            this.elements.startCameraBtn.classList.add('hidden');
            this.elements.capturePhotoBtn.classList.remove('hidden');
            
            this.updateStatus('Camera ready - click to capture photo', '📸');
            
            console.log('✅ Camera started successfully');
            
        } catch (error) {
            console.error('❌ Camera access failed:', error);
            
            let errorMessage = 'Could not access camera. ';
            if (error.name === 'NotAllowedError') {
                errorMessage += 'Please allow camera access and try again.';
            } else if (error.name === 'NotFoundError') {
                errorMessage += 'No camera found on this device.';
            } else {
                errorMessage += 'Please check your camera settings.';
            }
            
            this.showError('Camera Access Failed', errorMessage);
        }
    }
    
    /**
     * Capture photo from webcam
     */
    capturePhoto() {
        try {
            const canvas = this.elements.canvas;
            const video = this.elements.webcam;
            const context = canvas.getContext('2d');
            
            // Set canvas dimensions to match video
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            
            // Draw video frame to canvas
            context.drawImage(video, 0, 0);
            
            // Convert to blob
            canvas.toBlob((blob) => {
                this.state.capturedImageBlob = blob;
                
                // Create preview URL
                const previewUrl = URL.createObjectURL(blob);
                this.elements.previewImage.src = previewUrl;
                
                // Update UI
                this.elements.webcam.classList.add('hidden');
                this.elements.previewContainer.classList.remove('hidden');
                this.elements.capturePhotoBtn.classList.add('hidden');
                this.elements.retakePhotoBtn.classList.remove('hidden');
                this.elements.getCaptionBtn.classList.remove('hidden');
                
                this.state.photoTaken = true;
                this.updateStatus('Photo captured - get AI caption', '🤖');
                
                console.log('✅ Photo captured successfully');
                
            }, 'image/jpeg', 0.8);
            
        } catch (error) {
            console.error('❌ Photo capture failed:', error);
            this.showError('Capture Failed', 'Could not capture photo. Please try again.');
        }
    }
    
    /**
     * Retake photo
     */
    retakePhoto() {
        // Clean up previous image
        if (this.state.capturedImageBlob) {
            URL.revokeObjectURL(this.elements.previewImage.src);
            this.state.capturedImageBlob = null;
        }
        
        // Reset UI
        this.elements.previewContainer.classList.add('hidden');
        this.elements.webcam.classList.remove('hidden');
        this.elements.retakePhotoBtn.classList.add('hidden');
        this.elements.getCaptionBtn.classList.add('hidden');
        this.elements.capturePhotoBtn.classList.remove('hidden');
        
        // Hide previous results
        this.elements.captionResult.classList.add('hidden');
        this.hideError();
        
        this.state.photoTaken = false;
        this.updateStatus('Camera ready - click to capture photo', '📸');
    }
    
    /**
     * Get AI caption for captured image
     */
    async getCaption() {
        if (!this.state.capturedImageBlob || this.state.processing) {
            return;
        }
        
        this.state.processing = true;
        this.showLoading('AI is analyzing your image...', 'This may take 60-90 seconds if the AI is starting up');
        
        try {
            // Create form data
            const formData = new FormData();
            formData.append('image', this.state.capturedImageBlob, 'webcam-capture.jpg');
            
            console.log('📤 Sending image to AI server...');
            
            // Send to backend API
            const response = await this.sendToAPI('/caption', {
                method: 'POST',
                body: formData
            });
            
            console.log('📥 Received response:', response);
            
            // Handle different response types
            if (response.status === 'success') {
                this.displayCaption(response.caption, response.processing_time || 0, 'success');
            } else if (response.status === 'starting') {
                this.displayCaption(response.caption, null, 'starting');
                this.updateLoadingMessage('AI is starting up...', 'Please wait 60-90 seconds and try again');
                setTimeout(() => this.hideLoading(), 3000);
            } else if (response.status === 'budget_exceeded') {
                this.displayCaption(response.caption, null, 'budget_exceeded');
            } else {
                this.displayCaption(response.caption || 'Processing...', response.processing_time, response.status);
            }
            
        } catch (error) {
            console.error('❌ Caption generation failed:', error);
            this.showError('AI Processing Failed', error.message || 'Could not process image. Please try again.');
        } finally {
            this.state.processing = false;
            this.hideLoading();
        }
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
        
        // Don't set Content-Type for FormData (browser sets it automatically)
        if (!(options.body instanceof FormData)) {
            defaultOptions.headers['Content-Type'] = 'application/json';
        }
        
        const finalOptions = { ...defaultOptions, ...options };
        
        console.log(`🌐 API Request: ${options.method || 'GET'} ${url}`);
        
        let lastError;
        
        // Retry logic
        for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
            try {
                const response = await fetch(url, finalOptions);
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                const data = await response.json();
                console.log(`✅ API Success (attempt ${attempt}):`, data);
                return data;
                
            } catch (error) {
                lastError = error;
                console.warn(`⚠️ API attempt ${attempt} failed:`, error.message);
                
                if (attempt < this.config.maxRetries) {
                    await this.sleep(this.config.retryDelay * attempt);
                }
            }
        }
        
        throw new Error(`API request failed after ${this.config.maxRetries} attempts: ${lastError.message}`);
    }
    
    /**
     * Check system health
     */
    async checkSystemHealth() {
        try {
            const health = await this.sendToAPI('/health');
            
            // Update status displays
            this.elements.backendStatus.textContent = health.status || 'Unknown';
            this.elements.backendStatus.style.color = health.status === 'healthy' ? '#22c55e' : '#ef4444';
            
            this.elements.gpuStatus.textContent = health.gpu_status || 'Unknown';
            this.elements.gpuStatus.style.color = health.gpu_status === 'running' ? '#22c55e' : 
                                                 health.gpu_status === 'starting' ? '#f59e0b' : '#6b7280';
            
            this.elements.queueStatus.textContent = health.queue_length || '0';
            
            console.log('✅ System health check completed:', health);
            
        } catch (error) {
            console.warn('⚠️ System health check failed:', error);
            this.elements.backendStatus.textContent = 'Offline';
            this.elements.backendStatus.style.color = '#ef4444';
            this.elements.gpuStatus.textContent = 'Unknown';
            this.elements.queueStatus.textContent = '?';
        }
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
            'success': { text: '✅ Success', color: '#22c55e' },
            'starting': { text: '🚀 Starting', color: '#f59e0b' },
            'budget_exceeded': { text: '💰 Budget Limit', color: '#ef4444' },
            'error': { text: '❌ Error', color: '#ef4444' }
        };
        
        const statusInfo = statusMap[status] || { text: '📝 Processed', color: '#6b7280' };
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
     * Show loading overlay
     */
    showLoading(title, message) {
        this.elements.loadingMessage.textContent = message;
        document.querySelector('.loading-title').textContent = title;
        this.elements.loadingOverlay.classList.remove('hidden');
        
        // Animate progress bar
        this.elements.loadingBar.style.animation = 'progress 3s ease-in-out infinite';
    }
    
    /**
     * Update loading message
     */
    updateLoadingMessage(title, message) {
        document.querySelector('.loading-title').textContent = title;
        this.elements.loadingMessage.textContent = message;
    }
    
    /**
     * Hide loading overlay
     */
    hideLoading() {
        this.elements.loadingOverlay.classList.add('hidden');
        this.elements.loadingBar.style.animation = '';
    }
    
    /**
     * Show error message
     */
    showError(title, message) {
        document.querySelector('.error-title').textContent = title;
        this.elements.errorMessage.textContent = message;
        this.elements.errorDisplay.classList.remove('hidden');
        this.elements.captionResult.classList.add('hidden');
    }
    
    /**
     * Hide error message
     */
    hideError() {
        this.elements.errorDisplay.classList.add('hidden');
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
        // Stop camera stream
        if (this.state.stream) {
            this.state.stream.getTracks().forEach(track => track.stop());
        }
        
        // Clear intervals
        if (this.healthInterval) {
            clearInterval(this.healthInterval);
        }
        
        // Revoke blob URLs
        if (this.elements.previewImage.src) {
            URL.revokeObjectURL(this.elements.previewImage.src);
        }
        
        console.log('🧹 App cleanup completed');
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎬 DOM loaded, starting app...');
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