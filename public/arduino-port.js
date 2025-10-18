(function() {
    'use strict';

    /**
     * Turntable Port Detection Module
     * Handles real-time monitoring of turntable device connections
     */
    class ArduinoPortManager {
        constructor() {
            // Initialize properties
            this.socket = null;
            this.isConnected = false;
            this.currentPort = null;
            this.portList = [];

            // Initialize DOM elements
            this.portStatus = document.getElementById('portStatus');
            this.portDetails = document.getElementById('portDetails');
            this.refreshPortsBtn = document.getElementById('refreshPortsBtn');
            
            // Initialize turntable settings elements
            this.turntableSettings = document.getElementById('turntableSettings');
            // Rotation duration is now controlled by the scanning pipeline

            // Bind event handlers
            this.bindEvents();

            // Initialize WebSocket connection
            this.initializeSocket();

            // Initialize scan button state (disabled by default)
            this.updateScanButtonState(false);

            // Initial port check
            this.checkPorts();
        }

        /**
         * Bind event handlers
         */
        bindEvents() {
            if (this.refreshPortsBtn) {
                this.refreshPortsBtn.addEventListener('click', () => this.checkPorts());
            }
        }

        /**
         * Initialize Socket.IO connection for real-time port updates
         */
        initializeSocket() {
            try {
                // Always create a new socket connection
                this.socket = io();

                if (!this.socket) {
                    console.error('Failed to initialize Socket.IO connection');
                    return;
                }

                console.log('Socket.IO connection initialized');

                // Handle socket connection events
                this.socket.on('connect', () => {
                    console.log('Socket.IO connected successfully');
                    // Request initial port list on connection
                    this.checkPorts();
                });

                this.socket.on('connect_error', (error) => {
                    console.error('Socket.IO connection error:', error);
                    this.updatePortStatus({
                        isConnected: false,
                        message: 'Connection Error',
                        details: 'Failed to connect to server'
                    });
                });

                // Listen for port events
                this.socket.on('arduino-port-connected', this.handlePortConnection.bind(this));
                this.socket.on('arduino-port-disconnected', this.handlePortDisconnection.bind(this));
                this.socket.on('arduino-ports-list', this.updatePortsList.bind(this));
                this.socket.on('turntable-command-response', this.handleCommandResponse.bind(this));
            } catch (error) {
                console.error('Failed to initialize Socket.IO:', error);
                this.updatePortStatus({
                    isConnected: false,
                    message: 'Socket Error',
                    details: error.message
                });
            }
        }

        /**
         * Check available ports
         */
        checkPorts() {
            try {
                console.log('Checking for turntable device...');
                this.setRefreshButtonState(true);

                // Only show checking state if we're not already connected
                if (!this.isConnected) {
                    this.updatePortStatus({
                        isConnected: false,
                        message: 'Checking for turntable...',
                        details: 'Please wait while we scan for devices'
                    });
                }

                // Emit socket event to request ports list
                this.socket.emit('list-ports');

            } catch (error) {
                console.error('Error checking ports:', error);
                this.updatePortStatus({
                    isConnected: false,
                    message: 'Error checking ports',
                    details: error.message
                });
            } finally {
                this.setRefreshButtonState(false);
            }
        }

        /**
         * Handle port connection event
         */
        handlePortConnection(data) {
            console.log('Handling port connection:', data);
            this.isConnected = true;
            this.currentPort = data.port;

            this.updatePortStatus({
                isConnected: true,
                message: 'Turntable Connected',
                details: `Connected to ${data.port}`
            });

            // Enable the Start Live Scanning button
            this.updateScanButtonState(true);
            
            // Show turntable settings
            this.showTurntableSettings(true);

            // Notify the Scanner class if needed
            if (window.scanner) {
                window.scanner.handleArduinoConnection(data);
            }
        }

        /**
         * Handle port disconnection event
         */
        handlePortDisconnection(data) {
            console.log('Handling port disconnection:', data);
            this.isConnected = false;
            this.currentPort = null;

            this.updatePortStatus({
                isConnected: false,
                message: 'Turntable Disconnected',
                details: data.message || 'Device was disconnected'
            });

            // Disable the Start Live Scanning button
            this.updateScanButtonState(false);
            
            // Hide turntable settings
            this.showTurntableSettings(false);

            // Notify the Scanner class if needed
            if (window.scanner) {
                window.scanner.handleArduinoDisconnection(data);
            }
        }

        /**
         * Update the list of available ports
         */
        updatePortsList(data) {
            this.portList = data.ports;
            console.log('Updated ports list:', this.portList);

            if (this.portList.length === 0) {
                this.updatePortStatus({
                    isConnected: false,
                    message: 'No Turntable Found',
                    details: 'Please connect your turntable device'
                });
                // Disable the Start Live Scanning button when no turntable is found
                this.updateScanButtonState(false);
                return;
            }

            // Check if current port is still in the list
            if (this.currentPort && !this.portList.includes(this.currentPort)) {
                this.handlePortDisconnection({
                    message: 'Device no longer available'
                });
                return;
            }

            // If we're already connected, maintain the connected status
            if (this.isConnected && this.currentPort) {
                this.updatePortStatus({
                    isConnected: true,
                    message: 'Turntable Connected',
                    details: `Connected to ${this.currentPort}`
                });
                // Ensure the Start Live Scanning button is enabled
                this.updateScanButtonState(true);
                
                // Show turntable settings
                this.showTurntableSettings(true);
                return;
            }

            // If we have ports but none is connected, show available ports
            if (!this.isConnected) {
                this.updatePortStatus({
                    isConnected: false,
                    message: 'Turntable Detected',
                    details: `Available ports: ${this.portList.join(', ')} - Click to connect`
                });
                // Disable the Start Live Scanning button when turntable is detected but not connected
                this.updateScanButtonState(false);
                
                // Hide turntable settings
                this.showTurntableSettings(false);
            }
        }

        /**
         * Update the port status display
         */
        updatePortStatus({ isConnected, message, details }) {
            if (!this.portStatus || !this.portDetails) return;

            // Determine status type based on message content
            let statusType = 'disconnected';
            if (isConnected) {
                statusType = 'connected';
            } else if (message.includes('Detected') || message.includes('Available')) {
                statusType = 'detected';
            } else if (message.includes('Checking')) {
                statusType = 'checking';
            }

            // Update port status container
            const container = document.querySelector('.port-status-container');
            if (container) {
                container.className = `port-status-container ${statusType}`;
            }

            // Update indicator dot with animation
            const indicator = this.portStatus.querySelector('.indicator-dot');
            if (indicator) {
                // Remove previous classes and animations
                indicator.className = 'indicator-dot';
                void indicator.offsetWidth; // Trigger reflow to restart animation
                indicator.className = `indicator-dot ${statusType}`;
            }

            // Update port status text with fade effect
            const portText = this.portStatus.querySelector('.port-text');
            if (portText) {
                portText.style.opacity = '0';
                setTimeout(() => {
                    portText.textContent = message;
                    portText.style.opacity = '1';
                }, 200);
            }

            // Update details with fade effect
            if (this.portDetails) {
                this.portDetails.style.opacity = '0';
                setTimeout(() => {
                    this.portDetails.textContent = details;
                    this.portDetails.style.opacity = '1';
                }, 200);
            }

            // Add a subtle background flash effect
            const portStatus = document.querySelector('.port-status');
            if (portStatus) {
                portStatus.classList.remove('connected', 'disconnected', 'detected', 'checking');
                void portStatus.offsetWidth; // Trigger reflow
                portStatus.classList.add(statusType);
            }

            // Update button style based on connection status
            if (this.refreshPortsBtn) {
                this.refreshPortsBtn.classList.remove('connected', 'disconnected', 'detected', 'checking');
                this.refreshPortsBtn.classList.add(statusType);
            }

            // Show toast notification (only for significant changes)
            if (statusType === 'connected' || statusType === 'disconnected') {
                this.showNotification(isConnected, message);
            }
        }

        /**
         * Show a toast notification for port status changes
         */
        showNotification(isConnected, message) {
            const toast = document.createElement('div');
            toast.className = `port-notification ${isConnected ? 'success' : 'error'}`;

            const icon = document.createElement('i');
            icon.className = `fas ${isConnected ? 'fa-plug' : 'fa-times-circle'}`;

            toast.appendChild(icon);
            toast.appendChild(document.createTextNode(' ' + message));

            document.body.appendChild(toast);

            // Trigger animation
            setTimeout(() => toast.classList.add('show'), 100);

            // Remove after animation
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }

        /**
         * Enable/disable the refresh button
         */
        setRefreshButtonState(isChecking) {
            if (this.refreshPortsBtn) {
                this.refreshPortsBtn.disabled = isChecking;
                this.refreshPortsBtn.innerHTML = isChecking ?
                    '<i class="fas fa-circle-notch fa-spin"></i> Checking...' :
                    '<i class="fas fa-sync-alt"></i> Refresh Turntable';
            }
        }

        /**
         * Enable/disable the Start Live Scanning button based on turntable connection
         */
        updateScanButtonState(isConnected) {
            const startScanBtn = document.getElementById('startScanBtn');
            if (startScanBtn) {
                startScanBtn.disabled = !isConnected;
                
                if (isConnected) {
                    startScanBtn.classList.remove('disabled');
                    startScanBtn.title = 'Start live scanning with turntable';
                } else {
                    startScanBtn.classList.add('disabled');
                    startScanBtn.title = 'Turntable must be connected to start scanning';
                }
            }
        }

        /**
         * Show/hide turntable settings
         */
        showTurntableSettings(show) {
            if (this.turntableSettings) {
                this.turntableSettings.style.display = show ? 'block' : 'none';
            }
        }

        /**
         * Send command to Arduino turntable
         */
        sendTurntableCommand(command) {
            console.log('🎠 ARDUINO-PORT: sendTurntableCommand called with:', command);
            console.log('🎠 ARDUINO-PORT: isConnected:', this.isConnected);
            console.log('🎠 ARDUINO-PORT: socket exists:', !!this.socket);
            
            if (!this.isConnected || !this.socket) {
                console.warn('🎠 ARDUINO-PORT: Cannot send command: turntable not connected');
                return false;
            }

            console.log('🎠 ARDUINO-PORT: Sending turntable command:', command);
            this.socket.emit('turntable-command', { command: command });
            console.log('🎠 ARDUINO-PORT: Command emitted successfully');
            return true;
        }

        /**
         * Rotate turntable forward for specified duration at fixed slow speed
         */
        async rotateForwardTimed() {
            const duration = 2; // Fixed duration, controlled by pipeline
            
            console.log(`Rotating turntable forward for ${duration} seconds at fixed slow speed`);
            
            // Send simple forward command (Arduino will use its fixed speed)
            const success = this.sendTurntableCommand('F');
            if (!success) return false;
            
            // Wait for the specified duration
            await new Promise(resolve => setTimeout(resolve, duration * 1000));
            
            // Stop the turntable
            this.sendTurntableCommand('S');
            console.log('Turntable rotation completed');
            
            return true;
        }

        /**
         * Stop turntable immediately
         */
        stopTurntable() {
            console.log('Stopping turntable');
            return this.sendTurntableCommand('S');
        }

        /**
         * Get turntable settings
         */
        getTurntableSettings() {
            return {
                duration: 2, // Fixed duration, controlled by pipeline
                speed: 5 // Fixed slow speed
            };
        }

        /**
         * Handle command response from server
         */
        handleCommandResponse(data) {
            console.log('Command response:', data);
            
            if (!data.success) {
                console.error('Command failed:', data.message);
                this.updateTurntableStatus('stopped', 'Command Failed');
                
                // Show error notification
                this.showNotification(false, `Command failed: ${data.message}`);
            }
        }

        /**
         * Clean up resources
         */
        cleanup() {
            if (this.socket) {
                this.socket.off('arduino-port-connected');
                this.socket.off('arduino-port-disconnected');
                this.socket.off('arduino-ports-list');
            }
        }
    }

    // Initialize port manager when DOM is loaded
    window.addEventListener('DOMContentLoaded', function() {
        window.arduinoPortManager = new ArduinoPortManager();
    });

})();