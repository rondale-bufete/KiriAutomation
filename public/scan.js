/**
 * 3D Scanner - Live Scanning Functionality
 * Handles camera access, photo capture, and scanning workflow
 * 
 * This file is ready for fresh development of the scan functionality.
 * All previous functions have been cleared to start from scratch.
 */

// scan.js

class Scanner {
    constructor() {
        // Initialize scanner properties
        this.isScanning = false;
        this.isLoggingIn = false;
        this.isLoggedIn = false;
        this.isMonitoring = false;
        this.monitoringInterval = null;
        this.reloadInterval = null;
        this.reloadTimeout = null; // For page reload cycle
        this.downloadTriggered = false; // Flag to prevent multiple download triggers

        // Pipeline management
        this.currentPipelineStep = 0;
        this.pipelineSteps = [
            { id: 'scanStep1', name: 'Authenticate', status: 'pending' },
            { id: 'scanStep2', name: 'Capturing Artifact', status: 'pending' },
            { id: 'scanStep3', name: 'Processing Photogrammetry', status: 'pending' },
            { id: 'scanStep4', name: 'Downloading 3D', status: 'pending' }
        ];

        // Turntable rotation management
        this.turntableRotationInterval = null;

        // Initialize elements and bind events
        this.initializeElements();
        this.bindEvents();

        // Initialize Socket.IO connection early
        this.initializeSocketConnection();

        // Clear any stale monitoring flags from previous sessions
        this.clearStaleMonitoringFlags();

        // Ensure button is enabled on startup
        this.ensureButtonState();

        // Check if monitoring should be active after page reload
        this.checkMonitoringState();

        // Also check for project cards on page load
        this.checkForProjectCards();

        // Check if we're already in a processing state and update pipeline accordingly
        this.checkForExistingProcessingState();

        // Also start a continuous check for processing state (in case page load check missed it)
        setTimeout(() => {
            console.log('🔄 Starting continuous processing state check...');
            this.startContinuousProcessingCheck();
        }, 2000);

        console.log('Scanner class initialized - ready for development');
    }

    /**
     * Initialize DOM elements
     */
    initializeElements() {
        // Scan tab elements
        this.startScanBtn = document.getElementById('startScanBtn');
        this.stopMonitoringBtn = document.getElementById('stopMonitoringBtn');
        this.monitoringStatus = document.getElementById('monitoringStatus');
        this.status = document.getElementById('status');

        // Other elements will be added as needed
        console.log('Scanner elements initialized');
    }

    /**
     * Ensure button state is correct on initialization
     */
    ensureButtonState() {
        if (this.startScanBtn) {
            // Button should be enabled by default unless monitoring is actually active
            this.startScanBtn.disabled = false;
            console.log('Start scan button enabled on initialization');
            console.log('Button element:', this.startScanBtn);
            console.log('Button disabled state:', this.startScanBtn.disabled);
            console.log('Current isMonitoring state:', this.isMonitoring);

            // Force enable the button regardless of isMonitoring state for debugging
            this.startScanBtn.disabled = false;
            console.log('Force enabled button for debugging');
        }
    }

    /**
     * Clear stale monitoring flags from previous sessions
     */
    clearStaleMonitoringFlags() {
        const monitoringActive = localStorage.getItem('kiri_monitoring_active');
        const monitoringStartTime = localStorage.getItem('kiri_monitoring_start_time');

        console.log('Clearing stale flags - active:', monitoringActive, 'startTime:', monitoringStartTime);

        if (monitoringActive === 'true' && monitoringStartTime) {
            // Check if monitoring was started more than 2 minutes ago (consistent with checkMonitoringState)
            const startTime = parseInt(monitoringStartTime);
            const now = Date.now();
            const timeDiff = now - startTime;

            console.log('Time difference for stale check:', timeDiff, 'ms');

            // If monitoring was started more than 2 minutes ago, consider it stale
            if (timeDiff > 2 * 60 * 1000) { // 2 minutes
                console.log('Found stale monitoring flags from previous session, clearing...');
                localStorage.removeItem('kiri_monitoring_active');
                localStorage.removeItem('kiri_monitoring_start_time');
            } else {
                console.log('Monitoring flags are recent, keeping them');
            }
        } else {
            console.log('No monitoring flags found to clear');
        }
    }

    /**
     * Bind event listeners
     */
    bindEvents() {
        if (this.startScanBtn) {
            this.startScanBtn.addEventListener('click', () => this.startLiveScanning());
            console.log('Click event listener bound to startScanBtn');
        } else {
            console.error('startScanBtn element not found!');
        }

        // Clean up monitoring when page is about to be unloaded
        window.addEventListener('beforeunload', () => {
            this.stopMonitoring();
        });

        console.log('Scanner events bound');
    }

    /**
     * Start Live Scanning - Main function triggered by button click
     * This will trigger both webhook and Kiri Engine login
     */
    async startLiveScanning() {
        try {
            console.log('=== START LIVE SCANNING TRIGGERED ===');
            console.log('Starting Live Scanning process...');
            this.showStatus('info', 'Starting Live Scanning...');

            // Reset pipeline to initial state
            this.resetPipeline();

            // Set scanning flag and disable button to prevent multiple clicks
            this.isScanning = true;
            this.downloadTriggered = false; // Reset download flag for new scan
            this.startScanBtn.disabled = true;
            this.startScanBtn.innerHTML = '<div class="loading-spinner"></div> Starting...';

            // Store scan start info
            const scanInfo = {
                startTime: Date.now(),
                lastProjectCount: document.querySelectorAll('div[data-v-d562c7af].mdoel-card-cont').length
            };
            localStorage.setItem('kiri_scan_info', JSON.stringify(scanInfo));

            // Store the scan start time for tracking new projects
            localStorage.setItem('kiri_scan_start_time', Date.now().toString());

            // Execute authentication and webhook in parallel
            // Progress events will be handled by Socket.IO events from the backend
            const [webhookResult, loginResult] = await Promise.allSettled([
                this.triggerMacroDroidWebhook(),
                this.loginToKiriEngine()
            ]);

            console.log('Authentication and webhook completed. Results:');
            console.log('Webhook result:', webhookResult);
            console.log('Login result:', loginResult);

            // Handle authentication results
            if (loginResult.status === 'fulfilled' && loginResult.value.success) {
                console.log('Kiri Engine login successful');
                this.isLoggedIn = true;
                this.showStatus('success', 'Successfully logged into Kiri Engine!');
            } else {
                console.error('Kiri Engine login failed:', loginResult.reason);
                this.showStatus('error', 'Failed to login to Kiri Engine');
                throw new Error('Authentication failed');
            }

            if (webhookResult.status === 'fulfilled' && webhookResult.value.success) {
                console.log('MacroDroid webhook triggered successfully');
                this.showStatus('success', 'MacroDroid macro triggered!');
            } else {
                console.error('MacroDroid webhook failed:', webhookResult.reason);
                this.showStatus('error', 'Failed to trigger MacroDroid macro');
            }

            // Turntable rotation is now handled by the pipeline steps
            console.log('Starting artifact capture...');
            console.log('Turntable rotation will be controlled by the scanning pipeline');

            // Start monitoring for project cards
            this.showStatus('info', 'Page reload monitoring started automatically');
            this.startMonitoring();

        } catch (error) {
            console.error('Error in startLiveScanning:', error);
            this.showStatus('error', 'Error starting Live Scanning: ' + error.message);

            // Stop turntable rotation on error
            this.stopTurntableRotation();

            // Reset scanning state on error
            this.isScanning = false;
            this.updateMonitoringUI();
        } finally {
            // Re-enable button and update UI state
            this.isScanning = false;
            this.startScanBtn.disabled = false;
            this.startScanBtn.innerHTML = '<i class="fas fa-camera"></i> Start Live Scanning';
            this.updateMonitoringUI();
        }
    }

    /**
     * Central handler for scan failures / failed cards
     */
    async handleScanFailure(reason = 'Scanning failed. Please try again.') {
        try {
            console.log('❌ SCAN FAILURE HANDLER TRIGGERED:', reason);

            // Update status UI
            this.showStatus('error', reason);

            // Ensure motor and turntable are stopped
            try {
                this.controlMotor('off');
            } catch (e) {
                console.warn('Error turning off motor during failure handler:', e);
            }
            try {
                this.stopTurntableRotation();
            } catch (e) {
                console.warn('Error stopping turntable during failure handler:', e);
            }

            // Ask backend to close automation browser instance (if any)
            try {
                await fetch('/api/close-automation', { method: 'POST' });
            } catch (e) {
                console.warn('Error calling /api/close-automation:', e);
            }

            // Stop monitoring / reload cycle
            try {
                await this.stopMonitoring();
            } catch (e) {
                console.warn('Error stopping monitoring during failure handler:', e);
            }

            // Explicitly stop page reload cycle as extra safety
            try {
                this.stopPageReloadCycle();
            } catch (e) {
                console.warn('Error stopping page reload cycle during failure handler:', e);
            }

            // Reset pipeline UI
            try {
                this.resetPipeline();
            } catch (e) {
                console.warn('Error resetting pipeline during failure handler:', e);
            }

            // Clear form and uploads so user can start fresh
            try {
                await this.clearFormAndUploads();
            } catch (e) {
                console.warn('Error clearing form/uploads during failure handler:', e);
            }

            // Reset scanning state and buttons
            this.isScanning = false;
            if (this.startScanBtn) {
                this.startScanBtn.disabled = false;
                this.startScanBtn.innerHTML = '<i class="fas fa-camera"></i> Start Live Scanning';
            }
            this.updateMonitoringUI();

        } catch (error) {
            console.error('🚨 Error in handleScanFailure:', error);
        }
    }

    /**
     * Trigger MacroDroid webhook to start macro on phone
     */
    async triggerMacroDroidWebhook() {
        try {
            console.log('=== TRIGGER MACRODROID WEBHOOK CALLED ===');
            console.log('Triggering MacroDroid webhook...');

            // Base webhook URL
            const baseUrl = 'https://trigger.macrodroid.com/1edc60c9-1abf-4a1f-b80f-61c0919ad820/trigger-macro';

            // Add parameters as query string (MacroDroid prefers GET with query parameters)
            const params = new URLSearchParams({
                action: 'start_scanning',
                timestamp: new Date().toISOString(),
                source: 'kiri_automation'
            });

            const webhookUrl = `${baseUrl}?${params.toString()}`;
            console.log('Webhook URL:', webhookUrl);

            // Use GET method as MacroDroid webhooks work better with GET
            const response = await fetch(webhookUrl, {
                method: 'GET',
                // No headers needed for simple GET request
            });

            console.log('Webhook response status:', response.status);
            console.log('Webhook response headers:', Object.fromEntries(response.headers.entries()));

            // Try to get response text for debugging
            let responseText = '';
            try {
                responseText = await response.text();
                console.log('Webhook response body:', responseText);
            } catch (e) {
                console.log('Could not read response body:', e.message);
            }

            if (response.ok) {
                console.log('MacroDroid webhook triggered successfully');
                return { success: true, message: 'MacroDroid macro triggered' };
            } else {
                throw new Error(`Webhook request failed with status: ${response.status}. Response: ${responseText}`);
            }

        } catch (error) {
            console.error('MacroDroid webhook error:', error);
            console.error('Error details:', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
            return { success: false, message: error.message };
        }
    }

    /**
     * Login to Kiri Engine using the existing automation instance with Puppeteer
     */
    async loginToKiriEngine() {
        try {
            console.log('=== LOGIN TO KIRI ENGINE CALLED ===');
            console.log('Starting Kiri Engine login via automation...');
            this.isLoggingIn = true;

            // Call the backend login endpoint that uses the automation instance
            const response = await fetch('/api/login-automation', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: 'login'
                })
            });

            const result = await response.json();

            if (result.success) {
                console.log('Kiri Engine login successful via automation');
                this.isLoggedIn = true;
                return { success: true, message: 'Successfully logged into Kiri Engine via automation' };
            } else {
                throw new Error(result.message || 'Login failed');
            }

        } catch (error) {
            console.error('Kiri Engine login error:', error);
            return { success: false, message: error.message };
        } finally {
            this.isLoggingIn = false;
        }
    }

    /**
     * Start turntable rotation for automated scanning
     */
    async startTurntableRotation() {
        try {
            console.log('=== START TURNTABLE ROTATION CALLED ===');

            // Check if turntable is connected
            if (!window.arduinoPortManager || !window.arduinoPortManager.isConnected) {
                console.warn('Turntable not connected, skipping rotation');
                return { success: false, message: 'Turntable not connected' };
            }

            console.log('Starting turntable rotation...');

            // Get turntable settings
            const settings = window.arduinoPortManager.getTurntableSettings();
            console.log('Turntable settings:', settings);

            // Start the timed rotation
            const success = await window.arduinoPortManager.rotateForwardTimed();

            if (success) {
                console.log('Turntable rotation completed successfully');
                return { success: true, message: 'Turntable rotation completed' };
            } else {
                throw new Error('Failed to start turntable rotation');
            }

        } catch (error) {
            console.error('Turntable rotation error:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * Control ESP32 motor via Node.js Blynk API
     * state: 'on' | 'off'
     */
    async controlMotor(state) {
        const normalized = (state || 'off').toLowerCase() === 'on' ? 'on' : 'off';
        const url = `/api/motor/control/${normalized}`;

        try {
            console.log(`⚙️ MOTOR: Sending ${normalized.toUpperCase()} command to`, url);
            const response = await fetch(url, { method: 'POST' });
            const result = await response.json().catch(() => ({}));
            console.log('⚙️ MOTOR: Response:', result);
            return result;
        } catch (error) {
            console.error('⚙️ MOTOR: Error sending command:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Start turntable rotation based on current pipeline step
     */
    async startTurntableRotationForStep(stepIndex) {
        try {
            console.log(`=== START TURNTABLE ROTATION FOR STEP ${stepIndex} ===`);

            // Check if turntable is connected
            if (!window.arduinoPortManager || !window.arduinoPortManager.isConnected) {
                console.warn('Turntable not connected, skipping rotation');
                return { success: false, message: 'Turntable not connected' };
            }

            // Define rotation durations for each step
            const stepDurations = {
                0: 0,      // Authenticate - no rotation needed
                1: 2,      // Capturing Artifact - short rotation for photo capture
                2: 0,      // Processing Photogrammetry - no rotation needed
                3: 0       // Downloading 3D - no rotation needed
            };

            const duration = stepDurations[stepIndex] || 0;

            if (duration === 0) {
                console.log(`No turntable rotation needed for step ${stepIndex}`);
                return { success: true, message: 'No rotation needed for this step' };
            }

            console.log(`Starting turntable rotation for ${duration} seconds...`);

            // Temporarily set the rotation duration for this step
            const originalDuration = window.arduinoPortManager.rotationDuration?.value;
            if (window.arduinoPortManager.rotationDuration) {
                window.arduinoPortManager.rotationDuration.value = duration;
            }

            // Start the timed rotation
            const success = await window.arduinoPortManager.rotateForwardTimed();

            // Restore original duration
            if (window.arduinoPortManager.rotationDuration && originalDuration) {
                window.arduinoPortManager.rotationDuration.value = originalDuration;
            }

            if (success) {
                console.log(`Turntable rotation completed successfully for step ${stepIndex}`);
                return { success: true, message: `Turntable rotation completed for step ${stepIndex}` };
            } else {
                throw new Error(`Failed to start turntable rotation for step ${stepIndex}`);
            }

        } catch (error) {
            console.error('Turntable rotation error:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * Update pipeline step status
     */
    updatePipelineStep(stepIndex, status, message = null) {
        console.log(`🔄 updatePipelineStep called: stepIndex=${stepIndex}, status=${status}, message=${message}`);

        if (stepIndex < 0 || stepIndex >= this.pipelineSteps.length) {
            console.error('Invalid pipeline step index:', stepIndex);
            return;
        }

        const step = this.pipelineSteps[stepIndex];
        const stepElement = document.getElementById(step.id);

        if (!stepElement) {
            console.error('Pipeline step element not found:', step.id);
            return;
        }

        console.log(`Updating step element: ${step.id} to status: ${status}`);

        // Update internal status
        step.status = status;
        this.currentPipelineStep = stepIndex;

        // Remove all status classes
        stepElement.classList.remove('pending', 'active', 'completed');

        // Add appropriate status class
        stepElement.classList.add(status);

        // Update step content based on status
        const stepTitle = stepElement.querySelector('.step-title');
        const stepDescription = stepElement.querySelector('.step-description');
        const stepIcon = stepElement.querySelector('.step-icon i');

        if (status === 'active') {
            stepTitle.textContent = this.getActiveStepTitle(stepIndex);
            stepDescription.textContent = this.getActiveStepDescription(stepIndex);
            if (message) {
                stepDescription.textContent = message;
            }
        } else if (status === 'completed') {
            stepTitle.textContent = this.getCompletedStepTitle(stepIndex);
            stepDescription.textContent = this.getCompletedStepDescription(stepIndex);
        } else {
            stepTitle.textContent = this.getPendingStepTitle(stepIndex);
            stepDescription.textContent = this.getPendingStepDescription(stepIndex);
        }

        // Handle motor control when transitioning to Processing Photogrammetry step
        // This is needed when processing is detected locally (not via Socket.IO)
        if (this.isScanning && stepIndex === 2 && status === 'active') {
            console.log('🎠 TURNTABLE: Stopping rotation for Processing Photogrammetry step (local detection)...');
            this.stopTurntableRotation();

            // Turn OFF ESP32 motor when capturing phase ends
            console.log('🔌 MOTOR: Turning OFF motor for Processing Photogrammetry step (local detection)...');
            this.controlMotor('off');
        }

        console.log(`✅ Pipeline step ${stepIndex} (${step.name}) updated to: ${status}`);
        console.log(`Current pipeline step is now: ${this.currentPipelineStep}`);
    }

    /**
     * Get step titles and descriptions for different states
     */
    getPendingStepTitle(stepIndex) {
        const titles = ['Authenticate', 'Capturing Artifact', 'Processing Photogrammetry', 'Downloading 3D'];
        return titles[stepIndex] || 'Unknown Step';
    }

    getActiveStepTitle(stepIndex) {
        const titles = ['Authenticating', 'Capturing Artifact', 'Processing Photogrammetry', 'Downloading 3D'];
        return titles[stepIndex] || 'Processing';
    }

    getCompletedStepTitle(stepIndex) {
        const titles = ['Authenticated', 'Artifact Captured', 'Photogrammetry Processed', '3D Downloaded'];
        return titles[stepIndex] || 'Completed';
    }

    getPendingStepDescription(stepIndex) {
        const descriptions = [
            'Login to Kiri Engine',
            'Taking photos from multiple angles',
            'Creating 3D model from photos',
            'Downloading completed 3D model'
        ];
        return descriptions[stepIndex] || 'Waiting...';
    }

    getActiveStepDescription(stepIndex) {
        const descriptions = [
            'Logging into Kiri Engine...',
            'Capturing photos with turntable rotation...',
            'Processing 3D model in Kiri Engine...',
            'Downloading 3D model files...'
        ];
        return descriptions[stepIndex] || 'Processing...';
    }

    getCompletedStepDescription(stepIndex) {
        const descriptions = [
            'Successfully logged in',
            'Photos captured successfully',
            '3D model processing completed',
            '3D model downloaded successfully'
        ];
        return descriptions[stepIndex] || 'Completed successfully';
    }

    /**
     * Reset pipeline to initial state
     */
    resetPipeline() {
        this.currentPipelineStep = 0;
        this.pipelineSteps.forEach((step, index) => {
            this.updatePipelineStep(index, 'pending');
        });
        console.log('Pipeline reset to initial state');
    }

    /**
     * Get current pipeline state for debugging
     */
    getCurrentPipelineState() {
        console.log('=== CURRENT PIPELINE STATE ===');
        console.log('Current step index:', this.currentPipelineStep);
        console.log('Pipeline steps:', this.pipelineSteps);
        this.pipelineSteps.forEach((step, index) => {
            const element = document.getElementById(step.id);
            const classes = element ? Array.from(element.classList) : ['element not found'];
            console.log(`Step ${index} (${step.name}): status=${step.status}, classes=[${classes.join(', ')}]`);
        });
        console.log('===============================');
    }

    /**
     * Start monitoring for project status changes
     */
    startDirectProjectCardChecking() {
        console.log('🔍 Starting direct project monitoring...');

        // Use the successful pattern from authentication
        // Check more frequently during the capture phase
        this.directCheckingInterval = setInterval(() => {
            const timestamp = new Date().toLocaleTimeString();
            console.log(`[${timestamp}] Checking project card status...`);

            // Look for project cards with processing status
            const projectCards = document.querySelectorAll('div[data-v-d562c7af].mdoel-card-cont');
            console.log(`Found ${projectCards.length} project cards`);

            let processingDetected = false;

            for (const card of projectCards) {
                const statusMask = card.querySelector('.status-mask');
                if (statusMask) {
                    const statusSpan = statusMask.querySelector('.status span');
                    if (statusSpan) {
                        const statusText = statusSpan.textContent.trim();
                        console.log('Found status text:', statusText);

                        if (statusText === 'Processing..' || statusText === 'Processing...') {
                            console.log('✅ Processing status detected!');
                            processingDetected = true;

                            // Force pipeline to processing step immediately
                            if (this.currentPipelineStep !== 2) {
                                this.updatePipelineStep(1, 'completed');
                                this.updatePipelineStep(2, 'active', 'Processing 3D model in Kiri Engine...');
                                this.showStatus('success', 'Processing detected! Pipeline updated.');
                            }

                            // Stop checking once we detect processing
                            this.stopDirectProjectCardChecking();
                            break;
                        }
                    }
                }
            }

            // Update monitoring status with timestamp
            if (this.monitoringStatus) {
                const status = processingDetected ? 'Processing detected!' : 'Monitoring active';
                this.monitoringStatus.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> Last check: ${timestamp} | ${status}`;
            }

        }, 2000); // Check more frequently (every 2 seconds) during capture phase

        // Initial immediate check
        console.log('Performing initial project card check...');
        this.checkForProcessingStatusDirectly();
    }    /**
     * Check for processing status using Kiri Engine's project card states
     */
    checkForProcessingStatusDirectly() {
        console.log('🔍 Direct check for processing status...');

        // Look for project cards with processing status
        const projectCards = document.querySelectorAll('div[data-v-d562c7af].mdoel-card-cont');
        console.log(`Found ${projectCards.length} project cards`);

        // First check for processing projects
        for (const card of projectCards) {
            const statusMask = card.querySelector('.status-mask');
            if (statusMask) {
                const statusSpan = statusMask.querySelector('.status span');
                if (statusSpan) {
                    const statusText = statusSpan.textContent.trim();
                    console.log('Found status text:', statusText);

                    if (statusText === 'Processing..' || statusText === 'Processing...') {
                        console.log('✅ Processing status detected!');

                        // Force pipeline to processing step immediately
                        if (this.currentPipelineStep !== 2) {
                            // Update UI immediately like we do in authentication
                            this.updatePipelineStep(1, 'completed');
                            this.updatePipelineStep(2, 'active', 'Processing 3D model in Kiri Engine...');
                            this.showStatus('success', 'Processing detected! Pipeline updated.');
                        }
                        return true;
                    }
                }
            }
        }

        // If no processing projects found, check if we're in processing and projects are complete
        if (this.currentPipelineStep === 2) {
            // Check if any project cards have no status mask (completed state)
            let allCompleted = true;
            for (const card of projectCards) {
                const statusMask = card.querySelector('.status-mask');
                if (statusMask) {
                    allCompleted = false;
                    break;
                }
            }

            if (allCompleted && projectCards.length > 0) {
                console.log('✅ Processing completed, moving to download step');
                this.updatePipelineStep(2, 'completed');
                this.updatePipelineStep(3, 'active', 'Downloading 3D model files...');
                if (!this.downloadTriggered) {
                    this.triggerDownload();
                }
                return true;
            }
        }

        // If no status change needed, just return false
        console.log('No processing status detected yet');
        return false;
    }    /**
     * Force pipeline update (extracted for reuse)
     */
    forcePipelineUpdate() {
        console.log('🚀 FORCING pipeline update to processing step...');
        this.updatePipelineStep(1, 'completed');
        this.updatePipelineStep(2, 'active', 'Processing 3D model in Kiri Engine...');

        // Stop direct checking since we've moved to processing
        this.stopDirectProjectCardChecking();

        // Show success message
        this.showStatus('success', 'Processing detected! Pipeline updated to processing step.');

        console.log('✅ Pipeline updated to processing step');
    }

    /**
     * Stop direct project card checking
     */
    stopDirectProjectCardChecking() {
        if (this.directCheckingInterval) {
            clearInterval(this.directCheckingInterval);
            this.directCheckingInterval = null;
            console.log('🔍 Direct project card checking stopped');
        }
    }

    /**
     * Manually trigger pipeline update to processing step
     */
    forcePipelineToProcessing() {
        console.log('🚀 MANUALLY forcing pipeline to processing step...');
        this.getCurrentPipelineState();
        this.updatePipelineStep(1, 'completed');
        this.updatePipelineStep(2, 'active', 'Processing 3D model in Kiri Engine...');
        console.log('✅ Pipeline manually updated to processing step');
    }

    /**
     * Debug method to inspect the DOM and find processing status
     */
    debugProcessingStatus() {
        console.log('🔍 DEBUG: Inspecting DOM for processing status...');

        // Look for all possible project cards
        const projectCards = document.querySelectorAll('div[data-v-d562c7af].mdoel-card-cont');
        console.log(`Found ${projectCards.length} project cards with selector: div[data-v-d562c7af].mdoel-card-cont`);

        // Try alternative selectors
        const altCards1 = document.querySelectorAll('[class*="model-card"]');
        const altCards2 = document.querySelectorAll('[class*="project-card"]');
        const altCards3 = document.querySelectorAll('[class*="card"]');

        console.log(`Alternative selectors found:`, {
            'model-card': altCards1.length,
            'project-card': altCards2.length,
            'card': altCards3.length
        });

        // Check each project card in detail
        projectCards.forEach((card, index) => {
            console.log(`\n--- Project Card ${index + 1} ---`);
            console.log('Card element:', card);
            console.log('Card classes:', card.className);
            console.log('Card text content:', card.textContent);

            // Look for status elements
            const statusMask = card.querySelector('.status-mask');
            const statusDiv = card.querySelector('[class*="status"]');
            const allSpans = card.querySelectorAll('span');

            console.log('Status elements:', {
                statusMask: statusMask ? statusMask.textContent : 'Not found',
                statusDiv: statusDiv ? statusDiv.textContent : 'Not found',
                spans: Array.from(allSpans).map(span => span.textContent)
            });

            // Check if any text contains "Processing"
            if (card.textContent.includes('Processing')) {
                console.log('🚨 FOUND PROCESSING TEXT in card', index + 1);
            }
        });

        // Also search the entire page for "Processing" text
        const allElements = document.querySelectorAll('*');
        const processingElements = Array.from(allElements).filter(el =>
            el.textContent && el.textContent.includes('Processing')
        );

        console.log(`\nFound ${processingElements.length} elements containing "Processing" text:`,
            processingElements.map(el => ({
                tag: el.tagName,
                classes: el.className,
                text: el.textContent.trim()
            }))
        );
    }

    /**
     * Check if we're already in a processing state on page load
     */
    checkForExistingProcessingState() {
        console.log('🔍 Checking for existing processing state...');

        // Look for project cards with processing status
        const projectCards = document.querySelectorAll('div[data-v-d562c7af].mdoel-card-cont');
        console.log(`Found ${projectCards.length} project cards on page load`);

        for (const card of projectCards) {
            const statusMask = card.querySelector('.status-mask');
            if (statusMask) {
                const statusSpan = statusMask.querySelector('.status span');
                if (statusSpan) {
                    const statusText = statusSpan.textContent.trim();
                    console.log('Found status text on page load:', statusText);

                    if (statusText === 'Processing..' || statusText === 'Processing...') {
                        console.log('🚨 EXISTING PROCESSING STATE DETECTED ON PAGE LOAD!');
                        console.log('Forcing pipeline to processing step...');

                        // Force pipeline to processing step
                        this.updatePipelineStep(1, 'completed');
                        this.updatePipelineStep(2, 'active', 'Processing 3D model in Kiri Engine...');

                        console.log('✅ Pipeline updated to processing step on page load');
                        return true;
                    }
                }
            }
        }

        console.log('No existing processing state found');
        return false;
    }

    /**
     * Start continuous processing state check (backup method)
     */
    startContinuousProcessingCheck() {
        console.log('🔄 Starting continuous processing state check...');

        // Check every 3 seconds for processing state
        this.continuousCheckInterval = setInterval(() => {
            console.log('🔄 Continuous processing state check...');

            // Only check if we're currently in capturing step
            if (this.currentPipelineStep === 1) {
                const found = this.checkForProcessingStatusDirectly();
                if (found) {
                    console.log('🔄 Continuous check found processing state, stopping continuous check');
                    clearInterval(this.continuousCheckInterval);
                    this.continuousCheckInterval = null;
                }
            } else {
                console.log('🔄 Continuous check: Not in capturing step, stopping continuous check');
                clearInterval(this.continuousCheckInterval);
                this.continuousCheckInterval = null;
            }
        }, 3000);
    }

    /**
     * Trigger download of completed 3D model
     */
    async triggerDownload() {
        try {
            console.log('=== TRIGGERING DOWNLOAD ===');
            this.downloadTriggered = true;

            // Call the backend download endpoint
            const response = await fetch('/api/download-model', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: 'download'
                })
            });

            const result = await response.json();

            if (result.success) {
                console.log('Download triggered successfully');
                this.updatePipelineStep(3, 'completed');
                this.showStatus('success', '3D model download completed!');
            } else {
                throw new Error(result.message || 'Download failed');
            }

        } catch (error) {
            console.error('Download error:', error);
            this.showStatus('error', 'Failed to download 3D model: ' + error.message);
        }
    }

    /**
     * Start monitoring with Socket.IO connection
     */
    /**
     * Initialize Socket.IO connection
     */
    initializeSocketConnection() {
        try {
            console.log('🔌 Initializing Socket.IO connection...');
            this.socket = io();

            // Set up event listeners
            this.socket.on('connect', () => {
                console.log('🔌 Socket.IO connected successfully');
            });

            this.socket.on('disconnect', () => {
                console.log('🔌 Socket.IO disconnected');
            });

            this.socket.on('reload-status', (data) => {
                console.log('Received reload status update:', data);
                this.updateMonitoringStatus(data);
            });

            // Listen for remote scan triggers from CI4
            this.socket.on('remote-scan-trigger', (data) => {
                console.log('🌐 SCANNING: Remote scan trigger received:', data);
                this.showStatus('info', 'Remote scan triggered from CI4 app');

                // Automatically start the scanning process
                setTimeout(() => {
                    this.startLiveScanning();
                }, 1000);
            });

            // Listen for progress events (same as upload pipeline)
            this.socket.on('progress', async (data) => {
                console.log('🎯 SCANNING PIPELINE: Received progress event:', data);
                console.log('🎯 SCANNING PIPELINE: Socket connected:', this.socket.connected);
                console.log('🎯 SCANNING PIPELINE: Current pipeline step before update:', this.currentPipelineStep);
                if (data.step === 'error') {
                    console.log('🎯 SCANNING PIPELINE: Error step received, triggering failure handler');
                    this.handleScanFailure(data.message || 'Scanning failed due to an error in automation.');
                } else {
                    console.log('🎯 SCANNING PIPELINE: Calling updateScanningProgress...');
                    await this.updateScanningProgress(data.step, data.message);
                    console.log('🎯 SCANNING PIPELINE: Current pipeline step after update:', this.currentPipelineStep);
                }
            });

            console.log('🔌 Socket.IO connection initialized');
        } catch (error) {
            console.error('Error initializing Socket.IO connection:', error);
        }
    }

    startMonitoring() {
        try {
            console.log('Starting monitoring...');

            // Set monitoring flag in localStorage
            localStorage.setItem('kiri_monitoring_active', 'true');
            localStorage.setItem('kiri_monitoring_start_time', Date.now().toString());

            // Socket.IO connection should already be initialized in constructor
            if (!this.socket) {
                console.error('Socket.IO connection not initialized!');
                this.initializeSocketConnection();
            }

            // Set monitoring flag but don't update UI yet
            // UI will be updated when monitoring status actually changes
            this.isMonitoring = true;

            console.log('Monitoring started successfully');

        } catch (error) {
            console.error('Error starting monitoring:', error);
        }
    }

    /**
     * Stop monitoring and close Socket.IO connection
     */
    async stopMonitoring() {
        try {
            console.log('Stopping monitoring...');

            // Call backend to stop the reload cycle
            const response = await fetch('/api/stop-monitoring', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            const result = await response.json();

            if (result.success) {
                console.log('Backend monitoring stopped');

                // Stop turntable rotation when monitoring stops
                this.stopTurntableRotation();

                // Also stop any page reload interval associated with monitoring
                this.stopPageReloadCycle();

                // Close Socket.IO connection
                if (this.socket) {
                    this.socket.disconnect();
                    this.socket = null;
                    console.log('Socket.IO connection closed');
                }

                // Clear monitoring flags
                localStorage.removeItem('kiri_monitoring_active');
                localStorage.removeItem('kiri_monitoring_start_time');

                // Update UI
                this.isMonitoring = false;
                this.updateMonitoringUI();

                this.showStatus('info', 'Monitoring stopped');

            } else {
                console.error('Failed to stop backend monitoring:', result.message);
                this.showStatus('error', 'Failed to stop monitoring: ' + result.message);
            }

        } catch (error) {
            console.error('Error stopping monitoring:', error);
            this.showStatus('error', 'Error stopping monitoring: ' + error.message);
        }
    }

    /**
     * Update monitoring status UI
     */
    updateMonitoringUI() {
        if (this.monitoringStatus) {
            if (this.isMonitoring) {
                this.monitoringStatus.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Monitoring active';
                this.monitoringStatus.className = 'monitoring-status active';
            } else {
                this.monitoringStatus.innerHTML = '<i class="fas fa-pause-circle"></i> Monitoring stopped';
                this.monitoringStatus.className = 'monitoring-status inactive';
            }
        }

        // Update button states - DON'T disable the start button when monitoring is active
        // The start button should only be disabled during actual scanning, not monitoring
        if (this.startScanBtn) {
            // Only disable if we're currently in the middle of scanning (isScanning = true)
            this.startScanBtn.disabled = this.isScanning;
            console.log('Updating button state - isMonitoring:', this.isMonitoring, 'isScanning:', this.isScanning, 'disabled:', this.startScanBtn.disabled);
        }

        if (this.stopMonitoringBtn) {
            this.stopMonitoringBtn.style.display = this.isMonitoring ? 'inline-block' : 'none';
        }
    }

    /**
     * Update monitoring status from backend data
     */
    updateMonitoringStatus(data) {
        if (this.monitoringStatus) {
            const timestamp = new Date(data.timestamp).toLocaleTimeString();
            let statusText = `Last check: ${timestamp}`;

            if (data.hasNewProcesses) {
                statusText += ` | Found: ${data.processStatus}`;
            } else {
                statusText += ` | ${data.processStatus}`;
            }

            this.monitoringStatus.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> ${statusText}`;
        }
    }

    /**
     * Check if monitoring should be active after page reload
     */
    checkMonitoringState() {
        const monitoringActive = localStorage.getItem('kiri_monitoring_active');
        const monitoringStartTime = localStorage.getItem('kiri_monitoring_start_time');
        const projectCompletionActive = localStorage.getItem('kiri_project_completion_active');

        console.log('Checking monitoring state - active:', monitoringActive, 'startTime:', monitoringStartTime, 'projectCompletion:', projectCompletionActive);

        // Check if we're in the middle of project completion monitoring
        if (projectCompletionActive === 'true') {
            console.log('Resuming project completion monitoring after page reload...');
            this.showStatus('info', 'Resuming project completion monitoring...');
            this.checkForCompletedProjectAndDownload();
            return;
        }

        if (monitoringActive === 'true' && monitoringStartTime) {
            // Check if monitoring was started recently (within last 2 minutes - more strict)
            const startTime = parseInt(monitoringStartTime);
            const now = Date.now();
            const timeDiff = now - startTime;

            console.log('Time difference:', timeDiff, 'ms (threshold: 2 minutes)');

            // If monitoring was started more than 2 minutes ago, consider it stale
            if (timeDiff < 2 * 60 * 1000) { // 2 minutes - more strict
                console.log('Found recent monitoring flags, but NOT restarting monitoring automatically');
                console.log('User must click Start Live Scanning to begin monitoring');
                // Don't call startMonitoring() here - let the user decide
            } else {
                console.log('Monitoring flag found but appears stale, clearing...');
                // Clear stale monitoring flags
                localStorage.removeItem('kiri_monitoring_active');
                localStorage.removeItem('kiri_monitoring_start_time');
            }
        } else {
            console.log('No valid monitoring state found');
        }
    }

    /**
     * Start the 5-second page reload cycle (SIMPLE AND DIRECT)
     */
    startPageReloadCycle() {
        console.log('Starting 5-second monitoring cycle...');
        this.showStatus('info', 'Monitoring active - checking for macro processes every 5 seconds...');

        // Use interval instead of timeout to avoid infinite page reload loops
        this.reloadInterval = setInterval(() => {
            console.log('Checking for project cards...');

            // Check for project cards and their status
            const result = this.checkForProjectCards();
            console.log('Project card check result:', result);

            // Update UI with current status
            if (result) {
                this.updateProjectStatus(result.hasNewProcesses, result.processStatus, result.projectCount);
            }
        }, 5000);

        // Perform initial check immediately
        console.log('Performing initial project card check...');
        const initialResult = this.checkForProjectCards();
        if (initialResult) {
            this.updateProjectStatus(initialResult.hasNewProcesses, initialResult.processStatus, initialResult.projectCount);
        }
    }

    /**
     * Stop the page reload cycle (same as kiri-automation.js)
     */
    stopPageReloadCycle() {
        try {
            // Clear both interval and timeout to be safe
            if (this.reloadInterval) {
                clearInterval(this.reloadInterval);
                this.reloadInterval = null;
                console.log('Monitoring interval stopped');
            }
            if (this.reloadTimeout) {
                clearTimeout(this.reloadTimeout);
                this.reloadTimeout = null;
                console.log('Page reload timeout cleared');
            }
        } catch (error) {
            console.error('Error stopping page reload cycle:', error.message);
        }
    }

    /**
     * Check for project cards and their status (using kiri-automation.js logic)
     */
    checkForProjectCards() {
        try {
            console.log('🔍 Checking for project cards and their status...');

            // Look for all project cards first
            const projectCards = document.querySelectorAll('div[data-v-d562c7af].mdoel-card-cont');
            console.log(`Found ${projectCards.length} project cards`);

            let hasNewProcesses = false;
            let processStatus = 'No processing projects found';
            let projectCount = projectCards.length;

            // If we have project cards, check each one for processing status
            if (projectCards.length > 0) {
                for (const card of projectCards) {
                    // Look for status-mask specifically within this card
                    const statusMask = card.querySelector('.status-mask');
                    if (statusMask) {
                        const statusSpan = statusMask.querySelector('.status span');
                        if (statusSpan) {
                            const statusText = statusSpan.textContent.trim();
                            console.log('Found status text:', statusText);

                            // Project is processing if status mask exists with "Processing" text
                            if (statusText === 'Processing..' || statusText === 'Processing...') {
                                hasNewProcesses = true;
                                processStatus = 'Found project with "Processing" status';
                                console.log('✅ Processing project detected!');
                                console.log('Current pipeline step before update:', this.currentPipelineStep);

                                // Debug current pipeline state
                                this.getCurrentPipelineState();

                                // Force update the pipeline to processing step
                                console.log('🔄 FORCING pipeline update to processing step...');
                                this.updatePipelineStep(1, 'completed');
                                this.updatePipelineStep(2, 'active', 'Processing 3D model in Kiri Engine...');

                                // Stop direct checking since we've moved to processing
                                this.stopDirectProjectCardChecking();

                                console.log('✅ Pipeline forced to processing step - current step after update:', this.currentPipelineStep);

                                // Also show a status message to user
                                this.showStatus('success', 'Processing detected! Pipeline updated to processing step.');

                                break;
                            }
                        }
                    } else {
                        // No status mask means the project is likely completed
                        console.log('Project card without status mask - likely completed');

                        // Check if we're currently in processing step and no status mask means completed
                        if (this.currentPipelineStep === 2) {
                            console.log('✅ Project processing completed!');
                            this.updatePipelineStep(2, 'completed');
                            this.updatePipelineStep(3, 'active', 'Downloading 3D model files...');

                            // Trigger download if not already triggered
                            if (!this.downloadTriggered) {
                                this.triggerDownload();
                            }
                        }
                    }
                }

                if (!hasNewProcesses) {
                    // If we have cards but none are processing, they're completed
                    processStatus = `Found ${projectCards.length} completed projects`;
                    console.log('✅ All projects completed!');
                }
            }

            console.log('Process check result:', { hasNewProcesses, processStatus, projectCount });

            // Update UI with the results
            this.updateProjectStatus(hasNewProcesses, processStatus, projectCount);

            return {
                hasNewProcesses,
                processStatus,
                projectCount
            };

        } catch (error) {
            console.error('Error checking for project cards:', error.message);
            return {
                hasNewProcesses: false,
                processStatus: `Error: ${error.message}`,
                projectCount: 0
            };
        }
    }

    /**
     * Update scanning progress based on Socket.IO progress events (same as upload pipeline)
     */
    async updateScanningProgress(step, message) {
        console.log(`🔄 updateScanningProgress: step=${step}, message=${message}`);
        console.log(`🔄 updateScanningProgress: pipelineSteps length:`, this.pipelineSteps.length);

        // Map progress steps to pipeline steps (same as upload pipeline)
        const stepMap = {
            'login': 0,
            'upload': 1,  // For scanning, this is "Capturing Artifact"
            'processing': 2,
            'download': 3,
            'complete': 4
        };

        const currentStep = stepMap[step] || 0;
        console.log(`🔄 Mapped step ${step} to pipeline step ${currentStep}`);

        // Update all pipeline steps
        for (let i = 0; i < this.pipelineSteps.length; i++) {
            const stepElement = document.getElementById(this.pipelineSteps[i].id);
            console.log(`🔄 Step ${i}: Looking for element with id: ${this.pipelineSteps[i].id}, found:`, !!stepElement);
            if (!stepElement) continue;

            console.log(`🔄 Step ${i}: Current classes before update:`, stepElement.className);

            if (i < currentStep) {
                // Previous steps - mark as completed
                stepElement.classList.remove('pending', 'active');
                stepElement.classList.add('completed');
                this.updateStepText(stepElement, i, 'completed');
                console.log(`🔄 Step ${i}: Updated to completed`);
            } else if (i === currentStep) {
                // Current step - mark as active
                stepElement.classList.remove('pending', 'completed');
                stepElement.classList.add('active');
                this.updateStepText(stepElement, i, 'active', message);
                console.log(`🔄 Step ${i}: Updated to active`);

                // Handle specific step actions (turntable + motor) ONLY for live scanning
                // Guarded by isScanning so Upload Existing Media Files progress
                // does NOT trigger any motor or turntable actions.
                if (this.isScanning) {
                    if (i === 1 && step === 'upload') {
                        // Start turntable rotation when entering "Capturing Artifact" step
                        console.log('🎠 TURNTABLE: Starting rotation for Capturing Artifact step...');
                        this.startTurntableRotation();

                        // Turn ON ESP32 motor when capturing starts
                        await this.controlMotor('on');
                    } else if (i === 2 && step === 'processing') {
                        // Stop turntable rotation when advancing to "Processing Photogrammetry"
                        console.log('🎠 TURNTABLE: Stopping rotation for Processing Photogrammetry step...');
                        this.stopTurntableRotation();

                        // Turn OFF ESP32 motor when capturing phase ends
                        console.log('🔌 MOTOR: Turning OFF motor for Processing Photogrammetry step (Socket.IO)...');
                        await this.controlMotor('off');
                        console.log('🔌 MOTOR: Motor turned OFF successfully');
                    }
                }
            } else {
                // Future steps - mark as pending
                stepElement.classList.remove('active', 'completed');
                stepElement.classList.add('pending');
                this.updateStepText(stepElement, i, 'pending');
                console.log(`🔄 Step ${i}: Updated to pending`);
            }

            console.log(`🔄 Step ${i}: Classes after update:`, stepElement.className);
        }

        // Update internal pipeline state
        this.currentPipelineStep = currentStep;

        // When we reach the final step, show success modal and clear form/uploads
        if (step === 'complete' || currentStep === this.pipelineSteps.length - 1) {
            console.log('🎉 Scanning pipeline completed! Showing success modal...');

            // Stop monitoring and turntable when pipeline is done
            this.stopMonitoring();
            this.stopTurntableRotation();

            // Ensure motor is OFF when the entire pipeline completes (only relevant for live scanning)
            if (this.isScanning) {
                await this.controlMotor('off');
            }

            setTimeout(() => {
                this.showSuccessModal();
                this.clearFormAndUploads();
            }, 1000);
        }
    }

    /**
     * Update step text based on state (similar to upload pipeline)
     */
    updateStepText(stepElement, stepIndex, state, customMessage = null) {
        const stepTitle = stepElement.querySelector('.step-title');
        const stepDescription = stepElement.querySelector('.step-description');
        const stepIcon = stepElement.querySelector('.step-icon i');

        const stepTexts = {
            0: { // Authentication
                pending: { title: 'Authenticate', description: 'Login to Kiri Engine', icon: 'fa-sign-in-alt' },
                active: { title: 'Authenticating', description: 'Logging into Kiri Engine...', icon: 'fa-cogs' },
                completed: { title: 'Authenticated', description: 'Successfully logged in', icon: 'fa-check' }
            },
            1: { // Capturing Artifact
                pending: { title: 'Capturing Artifact', description: 'Taking photos from multiple angles', icon: 'fa-camera' },
                active: { title: 'Capturing Artifact', description: 'Taking photos from multiple angles...', icon: 'fa-camera' },
                completed: { title: 'Artifact Captured', description: 'Photos captured successfully', icon: 'fa-check' }
            },
            2: { // Processing
                pending: { title: 'Processing Photogrammetry', description: 'Creating 3D model from photos', icon: 'fa-cogs' },
                active: { title: 'Processing Photogrammetry', description: 'Processing 3D model in Kiri Engine...', icon: 'fa-cogs' },
                completed: { title: 'Photogrammetry Processed', description: '3D model reconstruction completed', icon: 'fa-check' }
            },
            3: { // Download
                pending: { title: 'Downloading 3D', description: 'Getting your 3D model', icon: 'fa-download' },
                active: { title: 'Downloading 3D', description: 'Downloading 3D model files...', icon: 'fa-download' },
                completed: { title: '3D Downloaded', description: '3D model ready for download', icon: 'fa-check' }
            }
        };

        const stepData = stepTexts[stepIndex][state];
        if (stepData) {
            stepTitle.textContent = stepData.title;
            stepDescription.textContent = customMessage || stepData.description;
            stepIcon.className = `fas ${stepData.icon}`;
        }
    }

    /**
     * Show success modal (same as upload pipeline)
     */
    showSuccessModal() {
        console.log('Attempting to show success modal...');
        const successModal = document.getElementById('successModal');
        if (successModal) {
            successModal.classList.add('show');
            console.log('Success modal should now be visible');
        } else {
            console.error('Success modal element not found!');
        }
    }

    /**
     * Clear form and delete uploads folder contents after pipeline completion
     */
    async clearFormAndUploads() {
        console.log('Clearing form and deleting uploads...');

        // Clear the scan form
        this.clearScanForm();

        // Delete uploads folder contents via API
        try {
            const response = await fetch('/api/clear-uploads', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const result = await response.json();
            if (result.success) {
                console.log('✅ Uploads folder cleared successfully');
            } else {
                console.error('❌ Failed to clear uploads folder:', result.error);
            }
        } catch (error) {
            console.error('❌ Error clearing uploads folder:', error);
        }
    }

    /**
     * Start turntable rotation (send single F command)
     */
    startTurntableRotation() {
        try {
            console.log('🎠 TURNTABLE: Starting turntable rotation...');
            console.log('🎠 TURNTABLE: Checking turntable connection...');

            // Check if turntable is connected
            const isConnected = this.isTurntableConnected();
            console.log('🎠 TURNTABLE: Connection status:', isConnected);

            if (!isConnected) {
                console.warn('🎠 TURNTABLE: Not connected, cannot start rotation');
                return false;
            }

            // Send single F command to start rotation
            console.log('🎠 TURNTABLE: Sending F command to start rotation...');
            const success = this.rotateTurntableForward();
            console.log('🎠 TURNTABLE: rotateTurntableForward result:', success);

            if (success) {
                console.log('🎠 TURNTABLE: Turntable rotation started successfully');
                return true;
            } else {
                console.warn('🎠 TURNTABLE: Failed to start turntable rotation');
                return false;
            }

        } catch (error) {
            console.error('🎠 TURNTABLE: Error starting turntable rotation:', error);
            return false;
        }
    }

    /**
     * Stop turntable rotation (send single S command)
     */
    stopTurntableRotation() {
        try {
            console.log('🎠 TURNTABLE: Stopping turntable rotation...');

            // Send single S command to stop rotation
            const success = this.stopTurntable();
            if (success) {
                console.log('🎠 TURNTABLE: Turntable rotation stopped successfully');
                return true;
            } else {
                console.warn('🎠 TURNTABLE: Failed to stop turntable rotation');
                return false;
            }

        } catch (error) {
            console.error('🎠 TURNTABLE: Error stopping turntable rotation:', error);
            return false;
        }
    }

    /**
     * Check if turntable is connected
     */
    isTurntableConnected() {
        // Check if arduino port monitor is available and connected
        console.log('🎠 TURNTABLE: Checking connection...');
        console.log('🎠 TURNTABLE: window.arduinoPortManager exists:', !!window.arduinoPortManager);

        if (window.arduinoPortManager) {
            const isConnected = window.arduinoPortManager.isConnected;
            console.log('🎠 TURNTABLE: arduinoPortManager.isConnected:', isConnected);
            return isConnected;
        }

        console.log('🎠 TURNTABLE: No arduinoPortManager found');
        return false;
    }

    /**
     * Rotate turntable forward
     */
    async rotateTurntableForward() {
        try {
            console.log('🎠 TURNTABLE: Attempting to rotate forward...');
            if (window.arduinoPortManager) {
                const result = window.arduinoPortManager.sendTurntableCommand('F');
                console.log('🎠 TURNTABLE: Forward command result:', result);
                return result;
            }
            console.log('🎠 TURNTABLE: No arduinoPortManager available');
            return false;
        } catch (error) {
            console.error('🎠 TURNTABLE: Error rotating forward:', error);
            return false;
        }
    }

    /**
     * Stop turntable
     */
    stopTurntable() {
        try {
            console.log('🎠 TURNTABLE: Attempting to stop...');
            if (window.arduinoPortManager) {
                const result = window.arduinoPortManager.sendTurntableCommand('S');
                console.log('🎠 TURNTABLE: Stop command result:', result);
                return result;
            }
            console.log('🎠 TURNTABLE: No arduinoPortManager available for stop');
            return false;
        } catch (error) {
            console.error('🎠 TURNTABLE: Error stopping:', error);
            return false;
        }
    }

    /**
     * Update project status in the UI based on backend state
     */
    updateProjectStatus(hasProcessingProjects, processStatus, projectCount) {
        // Update monitoring status display
        if (this.monitoringStatus) {
            const timestamp = new Date().toLocaleTimeString();
            const statusText = `Last check: ${timestamp} | ${processStatus}`;
            this.monitoringStatus.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> ${statusText}`;
        }

        // If we detect processing, immediately update pipeline to processing step
        if (hasProcessingProjects) {
            console.log('Processing status detected from backend, updating pipeline...');
            this.updatePipelineStep(1, 'completed');
            this.updatePipelineStep(2, 'active', 'Processing 3D model in Kiri Engine...');
            this.showStatus('info', 'Processing 3D model in Kiri Engine...');
            return;
        }

        // If we have projects but none are processing, check if completed
        if (projectCount > 0 && !hasProcessingProjects) {
            // Check if there's no status mask (indicating completion)
            const projectCards = document.querySelectorAll('div[data-v-d562c7af].mdoel-card-cont');
            let isCompleted = true;

            for (const card of projectCards) {
                const statusMask = card.querySelector('.status-mask');
                if (statusMask) {
                    isCompleted = false;

                    // Detect failed cards by status text (check all cards, not just first)
                    const statusSpan = statusMask.querySelector('.status span');
                    if (statusSpan) {
                        const statusText = statusSpan.textContent.trim();
                        console.log('Card status text:', statusText);
                        if (statusText.toLowerCase().includes('failed')) {
                            console.log('❌ FAILED CARD DETECTED:', statusText);
                            this.handleScanFailure('Scan failed in Kiri Engine (card marked Failed).');
                            return;
                        }
                    }
                    // Continue checking other cards for potential failures
                }
            }

            if (isCompleted && !this.downloadTriggered) {
                console.log('Project completed, initiating download...');
                this.updatePipelineStep(2, 'completed');
                this.updatePipelineStep(3, 'active', 'Downloading 3D model files...');
                this.downloadTriggered = true;
                this.stopMonitoring();
                this.triggerDownload();
            }
        }
    }

    /**
     * Check for completed project and initiate download using backend automation
     */
    async checkForCompletedProjectAndDownload() {
        try {
            console.log('🚀 Project completed! Initiating download sequence via backend...');
            this.showStatus('info', 'Project completed! Starting download sequence...');

            // Set project completion monitoring flag
            localStorage.setItem('kiri_project_completion_active', 'true');

            // Call the backend API to handle the complete download workflow
            // This will use the same proven automation logic as kiri-automation.js
            await this.initiateDownloadSequence();

        } catch (error) {
            console.error('Error checking for completed project:', error.message);
            this.showStatus('error', 'Error monitoring project completion: ' + error.message);
            localStorage.removeItem('kiri_project_completion_active');
        }
    }

    /**
     * Initiate download sequence by calling backend API that handles complete workflow
     */
    async initiateDownloadSequence() {
        try {
            console.log('🚀 Starting complete download workflow via backend API...');
            this.showStatus('info', 'Starting download sequence...');

            // Call the backend API to handle the complete download workflow
            // This will use the same proven automation logic as kiri-automation.js
            const response = await fetch('/api/trigger-download', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            const result = await response.json();

            if (result.success) {
                console.log('✅ Download completed successfully via backend!');
                this.showStatus('success', 'Download completed! 3D model saved to app downloads folder.');

                // Clear project completion flag
                localStorage.removeItem('kiri_project_completion_active');

                // Stop monitoring after successful download
                this.stopMonitoring();

            } else {
                console.log('❌ Download failed via backend:', result.message);
                this.showStatus('error', 'Download failed: ' + result.message);
                localStorage.removeItem('kiri_project_completion_active');
            }

        } catch (error) {
            console.error('Error calling download API:', error.message);
            this.showStatus('error', 'Download sequence failed: ' + error.message);
            localStorage.removeItem('kiri_project_completion_active');
        }
    }

    /**
     * Wait for timeout (helper function)
     */
    waitForTimeout(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Test webhook independently (for debugging)
     */
    async testWebhookOnly() {
        console.log('Testing webhook only...');
        this.showStatus('info', 'Testing MacroDroid webhook...');

        const result = await this.triggerMacroDroidWebhook();

        if (result.success) {
            this.showStatus('success', 'Webhook test successful!');
        } else {
            this.showStatus('error', 'Webhook test failed: ' + result.message);
        }

        return result;
    }

    /**
     * Show status message to user
     */
    showStatus(type, message) {
        if (this.status) {
            this.status.className = `status ${type} show`;
            this.status.textContent = message;

            if (type === 'success' || type === 'error') {
                setTimeout(() => {
                    this.status.classList.remove('show');
                }, 5000);
            }
        }
        console.log(`Status [${type}]: ${message}`);
    }

    /**
     * Manually clear monitoring state (useful for debugging)
     */
    clearMonitoringState() {
        console.log('Manually clearing monitoring state...');
        localStorage.removeItem('kiri_monitoring_active');
        localStorage.removeItem('kiri_monitoring_start_time');
        this.isMonitoring = false;
        this.updateMonitoringUI();
        this.showStatus('info', 'Monitoring state cleared');
    }

    /**
     * Manually check for processing projects (for debugging)
     */
    async checkForProcessingProjects() {
        try {
            console.log('Manually checking for processing projects...');

            const response = await fetch('/api/check-processes');
            const result = await response.json();

            console.log('Process check result:', result);

            if (result.hasNewProcesses) {
                this.showStatus('success', `Found: ${result.processStatus}`);
            } else {
                this.showStatus('info', result.processStatus || 'No processing projects found');
            }

            return result;

        } catch (error) {
            console.error('Error checking for processing projects:', error);
            this.showStatus('error', 'Error checking for processing projects: ' + error.message);
            return { hasNewProcesses: false, message: error.message };
        }
    }

    /**
     * Manually check for project cards (for debugging)
     */
    checkProjectCardsManually() {
        console.log('Manually checking for project cards...');
        this.showStatus('info', 'Checking for project cards...');

        const result = this.checkForProjectCards();

        if (result.hasNewProcesses) {
            this.showStatus('success', `Found processing project: ${result.processStatus}`);
        } else {
            this.showStatus('info', result.processStatus || 'No processing projects found');
        }

        return result;
    }

    /**
     * Manually test download sequence (for debugging)
     */
    async testDownloadSequenceManually() {
        console.log('Manually testing download sequence...');
        this.showStatus('info', 'Testing download sequence...');

        try {
            await this.checkForCompletedProjectAndDownload();
        } catch (error) {
            console.error('Error in manual download test:', error);
            this.showStatus('error', 'Download test failed: ' + error.message);
        }
    }

    /**
     * Reset scanner to initial state (nuclear option for debugging)
     */
    resetScanner() {
        console.log('Resetting scanner to initial state...');

        // Clear all monitoring state
        this.clearMonitoringState();

        // Reset all flags
        this.isScanning = false;
        this.isLoggingIn = false;
        this.isLoggedIn = false;
        this.isMonitoring = false;
        this.downloadTriggered = false;

        // Clear intervals and timeouts
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
        if (this.reloadInterval) {
            clearInterval(this.reloadInterval);
            this.reloadInterval = null;
        }
        if (this.reloadTimeout) {
            clearTimeout(this.reloadTimeout);
            this.reloadTimeout = null;
        }

        // Close socket connection if exists
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }

        // Update UI
        this.updateMonitoringUI();

        // Re-enable button
        this.ensureButtonState();

        this.showStatus('info', 'Scanner reset to initial state');
    }
}

// Initialize scanner when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Check if monitoring is already active to prevent infinite reload loops
    const monitoringActive = localStorage.getItem('kiri_monitoring_active');
    const projectCompletionActive = localStorage.getItem('kiri_project_completion_active');

    if (monitoringActive === 'true' || projectCompletionActive === 'true') {
        console.log('Monitoring already active, reusing existing scanner instance');
        // If scanner already exists, just update its state instead of creating new instance
        if (window.scanner) {
            window.scanner.checkMonitoringState();
        } else {
            // Create scanner but don't start new monitoring cycle
            window.scanner = new Scanner();
            // Override the startPageReloadCycle to prevent infinite loops during monitoring
            window.scanner.startPageReloadCycle = function () {
                console.log('Monitoring already active, skipping page reload cycle start');
            };
        }
    } else {
        console.log('No active monitoring, initializing fresh scanner instance');
        window.scanner = new Scanner();
    }
});

// Export for use in other modules if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Scanner;
}

// Global function to manually fix pipeline (for debugging)
window.fixPipeline = function () {
    console.log('🔧 Manual pipeline fix triggered...');
    if (window.scanner) {
        window.scanner.forcePipelineToProcessing();
    } else {
        console.error('Scanner not found!');
    }
};

// Global function to check pipeline state
window.checkPipeline = function () {
    console.log('🔍 Checking pipeline state...');
    if (window.scanner) {
        window.scanner.getCurrentPipelineState();
    } else {
        console.error('Scanner not found!');
    }
};