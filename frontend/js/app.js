/**
 * AI Webcam Caption App - Frontend JavaScript
 * Handles webcam access, frame capture, and API communication
 */

class WebcamCaptionApp {
    constructor() {
        // DOM Elements
        this.elements = {
            loadingScreen: document.getElementById('loadingScreen'),
            video: document.getElementById('webcamVideo'),
            canvas: document.getElementById('captureCanvas'),
            captionText: document.getElementById('captionText'),
            captionStatus: document.getElementById('captionStatus'),
            updateTimer: document.getElementById('updateTimer'),
            cameraStatus: document.getElementById('cameraStatus'),
            recordingIndicator: document.getElementById('recordingIndicator'),
            historyList: document.getElementById('historyList'),
            
            // Controls
            pauseBtn: document.getElementById('pauseBtn'),
            pauseIcon: document.getElementById('pauseIcon'),
            captureBtn: document.getElementById('captureBtn'),
            retryCamera: document.getElementById('retryCamera'),
            settingsBtn: document.getElementById('settingsBtn'),
            fullscreenBtn: document.getElementById('fullscreenBtn'),
            clearHistory: document.getElementById('clearHistory'),
            
            // Settings Modal
            settingsModal: document.getElementById('settingsModal'),
            closeSettings: document.getElementById('closeSettings'),
            updateInterval: document.getElementById('updateInterval'),
            imageQuality: document.getElementById('imageQuality'),
            autoScroll: document.getElementById('autoScroll'),
            soundEffects: document.getElementById('soundEffects'),
            
            // Stats
            totalCaptions: document.getElementById('totalCaptions'),
            avgResponseTime: document.getElementById('avgResponseTime'),
            uptime: document.getElementById('uptime'),
            
            // Toasts
            errorToast: document.getElementById('errorToast'),
            successToast: document.getElementById('successToast'),
            errorMessage: document.getElementById('errorMessage'),
            successMessage: document.getElementById('successMessage'),
            closeError: document.getElementById('closeError'),
            
            // Loading steps
            step1: document.getElementById('step1'),
            step2: document.getElementById('step2'),
            step3: document.getElementById('step3'),
            loadingText: document.getElementById('loadingText')
        };
        
        // App State
        this.state = {
            isInitialized: false,
            isPaused: false,
            isCapturing: false,
            stream: null,
            captureInterval: null,
            timerInterval: null,
            uptimeInterval: null,
            
            // Settings
            updateIntervalMs: 2000,
            imageQuality: 0.8,
            autoScroll: true,
            soundEffects: true,
            
            // Stats
            totalCaptions: 0,
            responseTimes: [],
            startTime: Date.now(),
            
            // History
            captionHistory: []
        };
        
        // API Configuration
        this.config = {
            apiBaseUrl: window.location.origin,
            maxRetries: 3,
            retryDelay: 1000
        };
        
        // Bind methods
        this.handleCameraAccess = this.handleCameraAccess.bind(this);
        this.captureAndSend = this.captureAndSend.bind(this);
        this.togglePause = this.togglePause.bind(this);
        this.captureNow = this.captureNow.bind(this);
        this.retryCamera = this.retryCamera.bind(this);
        
        // Initialize the app
        this.init();
    }
    
    /**
     * Initialize the application
     */
    async init() {
        console.log('🚀 Initializing AI Webcam Caption App...');
        
        try {
            // Show loading screen
            this.showLoading();
            
            // Set up event listeners
            this.setupEventListeners();
            
            // Load settings from localStorage
            this.loadSettings();
            
            // Step 1: Camera Access
            this.updateLoadingStep(1, 'Requesting camera access...');
            await this.initCamera();
            
            // Step 2: Check API
            this.updateLoadingStep(2, 'Connecting to AI model...');
            await this.checkAPI();
            
            // Step 3: Ready
            this.updateLoadingStep(3, 'Ready to caption!');
            
            // Start the app
            await this.delay(500);
            this.startCaptioning();
            this.hideLoading();
            
            // Start uptime counter
            this.startUptimeCounter();
            
            this.state.isInitialized = true;
            console.log('✅ App initialized successfully!');
            
        } catch (error) {
            console.error('❌ Failed to initialize app:', error);
            this.showError('Failed to initialize: ' + error.message);
            this.hideLoading();
        }
    }
    
    /**
     * Set up all event listeners
     */
    setupEventListeners() {
        // Control buttons
        this.elements.pauseBtn?.addEventListener('click', this.togglePause);
        this.elements.captureBtn?.addEventListener('click', this.captureNow);
        this.elements.retryCamera?.addEventListener('click', this.retryCamera);
        this.elements.clearHistory?.addEventListener('click', () => this.clearHistory());
        
        // Header buttons
        this.elements.settingsBtn?.addEventListener('click', () => this.showSettings());
        this.elements.fullscreenBtn?.addEventListener('click', () => this.toggleFullscreen());
        
        // Settings modal
        this.elements.closeSettings?.addEventListener('click', () => this.hideSettings());
        this.elements.settingsModal?.addEventListener('click', (e) => {
            if (e.target === this.elements.settingsModal) this.hideSettings();
        });
        
        // Settings inputs
        this.elements.updateInterval?.addEventListener('change', (e) => {
            this.state.updateIntervalMs = parseInt(e.target.value);
            this.saveSettings();
            if (!this.state.isPaused) {
                this.restartCaptioning();
            }
        });
        
        this.elements.imageQuality?.addEventListener('change', (e) => {
            this.state.imageQuality = parseFloat(e.target.value);
            this.saveSettings();
        });
        
        this.elements.autoScroll?.addEventListener('change', (e) => {
            this.state.autoScroll = e.target.checked;
            this.saveSettings();
        });
        
        this.elements.soundEffects?.addEventListener('change', (e) => {
            this.state.soundEffects = e.target.checked;
            this.saveSettings();
        });
        
        // Toast close buttons
        this.elements.closeError?.addEventListener('click', () => this.hideError());
        
        // Auto-hide success toast
        setTimeout(() => this.hideSuccess(), 3000);
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && e.target.tagName !== 'INPUT') {
                e.preventDefault();
                this.togglePause();
            } else if (e.code === 'KeyC' && e.ctrlKey) {
                e.preventDefault();
                this.captureNow();
            }
        });
        
        // Handle page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.pauseCapturing();
            } else if (this.state.isInitialized && !this.state.isPaused) {
                this.resumeCapturing();
            }
        });
    }
    
    /**
     * Initialize camera access
     */
    async initCamera() {
        try {
            // Request camera access
            const constraints = {
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'user'
                },
                audio: false
            };
            
            this.state.stream = await navigator.mediaDevices.getUserMedia(constraints);
            
            // Set video source
            this.elements.video.srcObject = this.state.stream;
            
            // Wait for video to be ready
            await new Promise((resolve, reject) => {
                this.elements.video.onloadedmetadata = () => {
                    this.elements.video.play()
                        .then(resolve)
                        .catch(reject);
                };
                this.elements.video.onerror = reject;
            });
            
            // Hide camera status message
            this.elements.cameraStatus?.classList.add('hidden');
            this.elements.recordingIndicator?.classList.remove('hidden');
            
            console.log('✅ Camera initialized successfully');
            
        } catch (error) {
            console.error('❌ Camera access failed:', error);
            this.elements.cameraStatus?.classList.remove('hidden');
            
            let errorMessage = 'Camera access denied';
            if (error.name === 'NotFoundError') {
                errorMessage = 'No camera found';
            } else if (error.name === 'NotAllowedError') {
                errorMessage = 'Camera access denied. Please allow camera access and refresh.';
            } else if (error.name === 'NotReadableError') {
                errorMessage = 'Camera is being used by another application';
            }
            
            throw new Error(errorMessage);
        }
    }
    
    /**
     * Check if the API is available
     */
    async checkAPI() {
        try {
            const response = await fetch(`${this.config.apiBaseUrl}/health`);
            if (!response.ok) {
                throw new Error(`API not available (${response.status})`);
            }
            
            const health = await response.json();
            if (!health.model_loaded) {
                throw new Error('AI model not loaded');
            }
            
            console.log('✅ API is ready');
            
        } catch (error) {
            console.error('❌ API check failed:', error);
            throw new Error('AI service not available: ' + error.message);
        }
    }
    
    /**
     * Start the captioning process
     */
    startCaptioning() {
        if (this.state.captureInterval) {
            clearInterval(this.state.captureInterval);
        }
        
        // Initial capture
        setTimeout(() => {
            this.captureAndSend();
        }, 1000);
        
        // Set up regular captures
        this.state.captureInterval = setInterval(() => {
            if (!this.state.isPaused && !this.state.isCapturing) {
                this.captureAndSend();
            }
        }, this.state.updateIntervalMs);
        
        // Start timer display
        this.startTimer();
        
        console.log(`✅ Captioning started (interval: ${this.state.updateIntervalMs}ms)`);
    }
    
    /**
     * Restart captioning with new interval
     */
    restartCaptioning() {
        this.stopCaptioning();
        this.startCaptioning();
    }
    
    /**
     * Stop the captioning process
     */
    stopCaptioning() {
        if (this.state.captureInterval) {
            clearInterval(this.state.captureInterval);
            this.state.captureInterval = null;
        }
        
        if (this.state.timerInterval) {
            clearInterval(this.state.timerInterval);
            this.state.timerInterval = null;
        }
    }
    
    /**
     * Pause captioning
     */
    pauseCapturing() {
        this.state.isPaused = true;
        this.updateCaptionStatus('Paused', 'paused');
        this.elements.pauseIcon.textContent = '▶️';
        this.elements.recordingIndicator?.classList.add('hidden');
    }
    
    /**
     * Resume captioning
     */
    resumeCapturing() {
        this.state.isPaused = false;
        this.updateCaptionStatus('Ready', 'ready');
        this.elements.pauseIcon.textContent = '⏸️';
        this.elements.recordingIndicator?.classList.remove('hidden');
    }
    
    /**
     * Toggle pause/resume
     */
    togglePause() {
        if (this.state.isPaused) {
            this.resumeCapturing();
            this.showSuccess('Captioning resumed');
            this.playSound('resume');
        } else {
            this.pauseCapturing();
            this.showSuccess('Captioning paused');
            this.playSound('pause');
        }
    }
    
    /**
     * Capture frame and send to API
     */
    async captureAndSend() {
        if (this.state.isCapturing || this.state.isPaused) {
            return;
        }
        
        this.state.isCapturing = true;
        this.updateCaptionStatus('Processing...', 'processing');
        
        try {
            // Capture frame from video
            const imageBlob = await this.captureFrame();
            
            // Send to API
            const startTime = Date.now();
            const caption = await this.sendToAPI(imageBlob);
            const responseTime = Date.now() - startTime;
            
            // Update UI
            this.updateCaptionText(caption);
            this.addToHistory(caption);
            this.updateStats(responseTime);
            this.updateCaptionStatus('Ready', 'ready');
            
            // Play success sound
            this.playSound('success');
            
        } catch (error) {
            console.error('❌ Capture failed:', error);
            this.updateCaptionStatus('Error', 'error');
            this.showError('Failed to generate caption: ' + error.message);
            this.playSound('error');
        } finally {
            this.state.isCapturing = false;
        }
    }
    
    /**
     * Manually trigger capture
     */
    async captureNow() {
        if (this.state.isCapturing) {
            return;
        }
        
        await this.captureAndSend();
        this.playSound('capture');
    }
    
    /**
     * Capture frame from video as blob
     */
    async captureFrame() {
        const video = this.elements.video;
        const canvas = this.elements.canvas;
        const ctx = canvas.getContext('2d');
        
        // Set canvas size to video size
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        // Draw video frame to canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Convert to blob
        return new Promise((resolve, reject) => {
            canvas.toBlob(
                (blob) => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error('Failed to capture frame'));
                    }
                },
                'image/jpeg',
                this.state.imageQuality
            );
        });
    }
    
    /**
     * Send image to API for captioning
     */
    async sendToAPI(imageBlob, retryCount = 0) {
        try {
            const formData = new FormData();
            formData.append('image', imageBlob, 'frame.jpg');
            
            const response = await fetch(`${this.config.apiBaseUrl}/caption`, {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `HTTP ${response.status}`);
            }
            
            const result = await response.json();
            return result.caption || 'No caption generated';
            
        } catch (error) {
            if (retryCount < this.config.maxRetries) {
                console.warn(`Retrying API call (${retryCount + 1}/${this.config.maxRetries})`);
                await this.delay(this.config.retryDelay);
                return this.sendToAPI(imageBlob, retryCount + 1);
            }
            throw error;
        }
    }
    
    /**
     * Update caption text in UI
     */
    updateCaptionText(caption) {
        const textElement = this.elements.captionText;
        
        // Add updating animation
        textElement.classList.add('updating');
        
        setTimeout(() => {
            textElement.innerHTML = `<div class="caption-main">${caption}</div>`;
            textElement.classList.remove('updating');
            
            // Auto-scroll if enabled
            if (this.state.autoScroll) {
                textElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }, 300);
    }
    
    /**
     * Add caption to history
     */
    addToHistory(caption) {
        const timestamp = new Date().toLocaleTimeString();
        const historyItem = {
            caption,
            timestamp,
            id: Date.now()
        };
        
        this.state.captionHistory.unshift(historyItem);
        
        // Keep only last 10 items
        if (this.state.captionHistory.length > 10) {
            this.state.captionHistory = this.state.captionHistory.slice(0, 10);
        }
        
        this.renderHistory();
    }
    
    /**
     * Render caption history
     */
    renderHistory() {
        const historyList = this.elements.historyList;
        if (!historyList) return;
        
        historyList.innerHTML = this.state.captionHistory
            .map(item => `
                <div class="history-item">
                    ${item.caption}
                    <span class="history-time">${item.timestamp}</span>
                </div>
            `)
            .join('');
    }
    
    /**
     * Clear caption history
     */
    clearHistory() {
        this.state.captionHistory = [];
        this.renderHistory();
        this.showSuccess('History cleared');
    }
    
    /**
     * Update stats
     */
    updateStats(responseTime) {
        this.state.totalCaptions++;
        this.state.responseTimes.push(responseTime);
        
        // Keep only last 20 response times
        if (this.state.responseTimes.length > 20) {
            this.state.responseTimes = this.state.responseTimes.slice(-20);
        }
        
        // Calculate average response time
        const avgTime = this.state.responseTimes.reduce((a, b) => a + b, 0) / this.state.responseTimes.length;
        
        // Update UI
        if (this.elements.totalCaptions) {
            this.elements.totalCaptions.textContent = this.state.totalCaptions.toString();
        }
        if (this.elements.avgResponseTime) {
            this.elements.avgResponseTime.textContent = Math.round(avgTime) + 'ms';
        }
    }
    
    /**
     * Update caption status
     */
    updateCaptionStatus(text, type) {
        const statusElement = this.elements.captionStatus;
        if (!statusElement) return;
        
        statusElement.textContent = text;
        statusElement.className = `status-badge ${type}`;
    }
    
    /**
     * Start countdown timer
     */
    startTimer() {
        if (this.state.timerInterval) {
            clearInterval(this.state.timerInterval);
        }
        
        let timeLeft = this.state.updateIntervalMs / 1000;
        
        const updateTimer = () => {
            if (this.state.isPaused) {
                this.elements.updateTimer.textContent = 'Paused';
                return;
            }
            
            if (this.state.isCapturing) {
                this.elements.updateTimer.textContent = 'Processing...';
                return;
            }
            
            this.elements.updateTimer.textContent = `Next update in ${timeLeft}s`;
            timeLeft--;
            
            if (timeLeft < 0) {
                timeLeft = this.state.updateIntervalMs / 1000;
            }
        };
        
        updateTimer();
        this.state.timerInterval = setInterval(updateTimer, 1000);
    }
    
    /**
     * Start uptime counter
     */
    startUptimeCounter() {
        if (this.state.uptimeInterval) {
            clearInterval(this.state.uptimeInterval);
        }
        
        this.state.uptimeInterval = setInterval(() => {
            const uptime = Date.now() - this.state.startTime;
            const minutes = Math.floor(uptime / 60000);
            const seconds = Math.floor((uptime % 60000) / 1000);
            
            if (this.elements.uptime) {
                this.elements.uptime.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
        }, 1000);
    }
    
    /**
     * Retry camera access
     */
    async retryCamera() {
        try {
            this.showLoading();
            this.updateLoadingStep(1, 'Retrying camera access...');
            
            // Stop existing stream
            if (this.state.stream) {
                this.state.stream.getTracks().forEach(track => track.stop());
            }
            
            await this.initCamera();
            this.hideLoading();
            this.showSuccess('Camera access granted!');
            
            if (!this.state.isInitialized) {
                await this.init();
            }
            
        } catch (error) {
            this.hideLoading();
            this.showError('Camera retry failed: ' + error.message);
        }
    }
    
    /**
     * Show settings modal
     */
    showSettings() {
        this.elements.settingsModal?.classList.remove('hidden');
        
        // Update settings values
        if (this.elements.updateInterval) {
            this.elements.updateInterval.value = this.state.updateIntervalMs.toString();
        }
        if (this.elements.imageQuality) {
            this.elements.imageQuality.value = this.state.imageQuality.toString();
        }
        if (this.elements.autoScroll) {
            this.elements.autoScroll.checked = this.state.autoScroll;
        }
        if (this.elements.soundEffects) {
            this.elements.soundEffects.checked = this.state.soundEffects;
        }
    }
    
    /**
     * Hide settings modal
     */
    hideSettings() {
        this.elements.settingsModal?.classList.add('hidden');
    }
    
    /**
     * Toggle fullscreen mode
     */
    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.error('Error attempting to enable fullscreen:', err);
            });
        } else {
            document.exitFullscreen();
        }
    }
    
    /**
     * Show loading screen
     */
    showLoading() {
        this.elements.loadingScreen?.classList.remove('hidden');
    }
    
    /**
     * Hide loading screen
     */
    hideLoading() {
        this.elements.loadingScreen?.classList.add('hidden');
    }
    
    /**
     * Update loading step
     */
    updateLoadingStep(step, text) {
        if (this.elements.loadingText) {
            this.elements.loadingText.textContent = text;
        }
        
        // Update step indicators
        [1, 2, 3].forEach(i => {
            const stepElement = this.elements[`step${i}`];
            if (stepElement) {
                if (i <= step) {
                    stepElement.classList.add('active');
                } else {
                    stepElement.classList.remove('active');
                }
            }
        });
    }
    
    /**
     * Show error toast
     */
    showError(message) {
        if (this.elements.errorMessage) {
            this.elements.errorMessage.textContent = message;
        }
        this.elements.errorToast?.classList.remove('hidden');
        
        // Auto-hide after 5 seconds
        setTimeout(() => this.hideError(), 5000);
    }
    
    /**
     * Hide error toast
     */
    hideError() {
        this.elements.errorToast?.classList.add('hidden');
    }
    
    /**
     * Show success toast
     */
    showSuccess(message) {
        if (this.elements.successMessage) {
            this.elements.successMessage.textContent = message;
        }
        this.elements.successToast?.classList.remove('hidden');
        
        // Auto-hide after 3 seconds
        setTimeout(() => this.hideSuccess(), 3000);
    }
    
    /**
     * Hide success toast
     */
    hideSuccess() {
        this.elements.successToast?.classList.add('hidden');
    }
    
    /**
     * Play sound effect
     */
    playSound(type) {
        if (!this.state.soundEffects) return;
        
        // Simple audio feedback using Web Audio API
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            // Different sounds for different actions
            switch (type) {
                case 'success':
                    oscillator.frequency.value = 800;
                    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
                    oscillator.start();
                    oscillator.stop(audioContext.currentTime + 0.3);
                    break;
                case 'error':
                    oscillator.frequency.value = 300;
                    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
                    oscillator.start();
                    oscillator.stop(audioContext.currentTime + 0.5);
                    break;
                case 'capture':
                    oscillator.frequency.value = 1000;
                    gainNode.gain.setValueAtTime(0.05, audioContext.currentTime);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
                    oscillator.start();
                    oscillator.stop(audioContext.currentTime + 0.1);
                    break;
                case 'pause':
                case 'resume':
                    oscillator.frequency.value = 600;
                    gainNode.gain.setValueAtTime(0.05, audioContext.currentTime);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
                    oscillator.start();
                    oscillator.stop(audioContext.currentTime + 0.2);
                    break;
            }
        } catch (error) {
            // Ignore audio errors
            console.warn('Audio not supported:', error);
        }
    }
    
    /**
     * Load settings from localStorage
     */
    loadSettings() {
        try {
            const saved = localStorage.getItem('webcam-caption-settings');
            if (saved) {
                const settings = JSON.parse(saved);
                this.state.updateIntervalMs = settings.updateIntervalMs || 2000;
                this.state.imageQuality = settings.imageQuality || 0.8;
                this.state.autoScroll = settings.autoScroll !== false;
                this.state.soundEffects = settings.soundEffects !== false;
            }
        } catch (error) {
            console.warn('Failed to load settings:', error);
        }
    }
    
    /**
     * Save settings to localStorage
     */
    saveSettings() {
        try {
            const settings = {
                updateIntervalMs: this.state.updateIntervalMs,
                imageQuality: this.state.imageQuality,
                autoScroll: this.state.autoScroll,
                soundEffects: this.state.soundEffects
            };
            localStorage.setItem('webcam-caption-settings', JSON.stringify(settings));
        } catch (error) {
            console.warn('Failed to save settings:', error);
        }
    }
    
    /**
     * Utility: Delay function
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Cleanup when page unloads
     */
    destroy() {
        // Stop all intervals
        if (this.state.captureInterval) clearInterval(this.state.captureInterval);
        if (this.state.timerInterval) clearInterval(this.state.timerInterval);
        if (this.state.uptimeInterval) clearInterval(this.state.uptimeInterval);
        
        // Stop camera stream
        if (this.state.stream) {
            this.state.stream.getTracks().forEach(track => track.stop());
        }
        
        console.log('🧹 App cleanup completed');
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎥 AI Webcam Caption App - Starting...');
    window.app = new WebcamCaptionApp();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (window.app) {
        window.app.destroy();
    }
});

// Handle errors globally
window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    if (window.app) {
        window.app.showError('An unexpected error occurred');
    }
});

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    if (window.app) {
        window.app.showError('An unexpected error occurred');
    }
    event.preventDefault();
});