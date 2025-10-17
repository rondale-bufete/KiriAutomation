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

        // Initialize elements and bind events
        this.initializeElements();
        this.bindEvents();

        // Clear any stale monitoring flags from previous sessions
        this.clearStaleMonitoringFlags();

        // Ensure button is enabled on startup
        this.ensureButtonState();

        // Check if monitoring should be active after page reload
        this.checkMonitoringState();

        // Also check for project cards on page load
        this.checkForProjectCards();

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

            console.log('About to execute both functions in parallel...');
            console.log('1. triggerMacroDroidWebhook()');
            console.log('2. loginToKiriEngine()');

            // Execute both functions in parallel
            const [webhookResult, loginResult] = await Promise.allSettled([
                this.triggerMacroDroidWebhook(),
                this.loginToKiriEngine()
            ]);

            console.log('Both functions completed. Results:');
            console.log('Webhook result:', webhookResult);
            console.log('Login result:', loginResult);

            // Handle results
            if (webhookResult.status === 'fulfilled' && webhookResult.value.success) {
                console.log('MacroDroid webhook triggered successfully');
                this.showStatus('success', 'MacroDroid macro triggered!');
            } else {
                console.error('MacroDroid webhook failed:', webhookResult.reason);
                this.showStatus('error', 'Failed to trigger MacroDroid macro');
            }

            if (loginResult.status === 'fulfilled' && loginResult.value.success) {
                console.log('Kiri Engine login successful');
                this.showStatus('success', 'Successfully logged into Kiri Engine!');
                this.isLoggedIn = true;

                // Monitoring is now handled automatically by the backend
                this.showStatus('info', 'Page reload monitoring started automatically');
                this.startMonitoring();

            } else {
                console.error('Kiri Engine login failed:', loginResult.reason);
                this.showStatus('error', 'Failed to login to Kiri Engine');
            }

        } catch (error) {
            console.error('Error in startLiveScanning:', error);
            this.showStatus('error', 'Error starting Live Scanning: ' + error.message);
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
     * Trigger MacroDroid webhook to start macro on phone
     */
    async triggerMacroDroidWebhook() {
        try {
            console.log('=== TRIGGER MACRODROID WEBHOOK CALLED ===');
            console.log('Triggering MacroDroid webhook...');

            // Base webhook URL
            const baseUrl = 'https://trigger.macrodroid.com/2f11520b-ff4c-478f-93f8-a878809f1ce0/trigger-kiri-scan';

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
     * Start monitoring with Socket.IO connection
     */
    startMonitoring() {
        try {
            console.log('Starting monitoring...');

            // Set monitoring flag in localStorage
            localStorage.setItem('kiri_monitoring_active', 'true');
            localStorage.setItem('kiri_monitoring_start_time', Date.now().toString());

            // Initialize Socket.IO connection if not already connected
            if (!this.socket) {
                console.log('Initializing Socket.IO connection...');
                this.socket = io();

                this.socket.on('connect', () => {
                    console.log('Socket.IO connected');
                });

                this.socket.on('disconnect', () => {
                    console.log('Socket.IO disconnected');
                });

                this.socket.on('reload-status', (data) => {
                    console.log('Received reload status update:', data);
                    this.updateMonitoringStatus(data);
                });
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
                                break;
                            }
                        }
                    } else {
                        // No status mask means the project is likely completed
                        console.log('Project card without status mask - likely completed');
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
     * Update project status in the UI (same as kiri-automation.js performPageReload)
     */
    updateProjectStatus(hasNewProcesses, processStatus, projectCount) {
        if (this.monitoringStatus) {
            const timestamp = new Date().toLocaleTimeString();
            let statusText = `Last check: ${timestamp}`;

            if (hasNewProcesses) {
                statusText += ` | 🔄 ${processStatus}`;
                this.monitoringStatus.className = 'monitoring-status active processing';
            } else {
                statusText += ` | ✅ ${processStatus}`;
                this.monitoringStatus.className = 'monitoring-status active completed';
            }

            this.monitoringStatus.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> ${statusText}`;
        }

        // Also update main status if there are new processes
        if (hasNewProcesses) {
            this.showStatus('success', `Found processing project! ${processStatus}`);
        }

        // CRITICAL: If we have completed projects and no processing, STOP monitoring and start download
        // This matches the server.js behavior where it calls waitForProjectCompletionAndExport()
        if (projectCount > 0 && !hasNewProcesses && !this.downloadTriggered) {
            console.log('🚀 Project completed! Stopping monitoring and starting download sequence...');
            this.showStatus('info', 'Project completed! Starting download sequence...');
            this.downloadTriggered = true; // Set flag to prevent multiple triggers

            // Stop ALL monitoring first
            this.stopMonitoring();

            // STOP the page reload monitoring (same as kiri-automation.js)
            this.stopPageReloadCycle();

            // Clear any remaining intervals or timeouts
            if (this.monitoringInterval) {
                clearInterval(this.monitoringInterval);
                this.monitoringInterval = null;
            }
            if (this.reloadTimeout) {
                clearTimeout(this.reloadTimeout);
                this.reloadTimeout = null;
            }

            // Clear monitoring flags in localStorage
            localStorage.removeItem('kiri_monitoring_active');
            localStorage.removeItem('kiri_monitoring_start_time');

            // Start the download sequence
            this.checkForCompletedProjectAndDownload();
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
                this.showStatus('success', 'Download completed! 3D model saved to Downloads folder.');

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