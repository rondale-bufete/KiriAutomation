// arduino-port-monitor.js

const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const { SerialPortStream } = require('@serialport/stream');
const { autoDetect } = require('@serialport/bindings-cpp');

class ArduinoPortMonitor {
    constructor(io) {
        this.io = io;
        this.port = null;
        this.parser = null;
        this.portPath = null;
        this.isConnected = false;
        this.monitorInterval = null;
        this.lastPorts = []; // Track last known ports to avoid duplicate logs

        // Start port monitoring
        this.startPortMonitoring();
    }

    /**
     * Start monitoring for Arduino ports
     */
    startPortMonitoring() {
        // Check ports every 10 seconds (reduced frequency)
        this.monitorInterval = setInterval(() => {
            this.checkPorts();
        }, 10000);

        // Initial check
        this.checkPorts();
    }

    /**
     * Check available serial ports
     */
    async checkPorts() {
        try {
            const binding = autoDetect();
            const ports = await binding.list();

            const arduinoPorts = ports.filter(port => {
                const manufacturer = port.manufacturer?.toLowerCase() || '';
                const vendorId = (port.vendorId || '').toLowerCase();

                // Check for common Arduino-related identifiers
                const isArduino =
                    manufacturer.includes('arduino') ||
                    manufacturer.includes('wch') ||     // CH340 chip
                    manufacturer.includes('ftdi') ||    // FTDI chip
                    manufacturer.includes('silicon') || // Silicon Labs
                    vendorId === '2341' ||            // Arduino vendor ID
                    vendorId === '1a86' ||            // CH340 vendor ID
                    vendorId === '0403';              // FTDI vendor ID

                return isArduino;
            });

            const currentPorts = arduinoPorts.map(p => p.path);
            
            // Only log and emit if there's a change in ports
            if (JSON.stringify(currentPorts) !== JSON.stringify(this.lastPorts)) {
                console.log('Turntable ports changed:', currentPorts);
                this.lastPorts = currentPorts;
                
                // Emit the list of available ports
                this.io.emit('arduino-ports-list', {
                    ports: currentPorts
                });
            }

            // If we're not connected and there's an Arduino port, try to connect
            if (!this.isConnected && arduinoPorts.length > 0) {
                const targetPort = arduinoPorts[0];
                this.connectToPort(targetPort.path);
            }

            // If we're connected but our port is no longer in the list, disconnect
            if (this.isConnected && this.portPath) {
                const portStillExists = arduinoPorts.some(p => p.path === this.portPath);
                if (!portStillExists) {
                    this.handleDisconnection('Device removed');
                }
            }

        } catch (error) {
            console.error('Error checking ports:', error);
        }
    }

    /**
     * Connect to a specific port
     */
    connectToPort(portPath) {
        if (this.port) {
            // Already connected to this port
            if (this.portPath === portPath) return;

            // Disconnect from current port first
            this.disconnect();
        }

        try {
            this.port = new SerialPort({
                path: portPath,
                baudRate: 9600,
                autoOpen: false,
                binding: autoDetect()
            });

            this.parser = new ReadlineParser();
            this.port.pipe(this.parser);

            this.port.open((err) => {
                if (err) {
                    console.error('Error opening port:', err.message);
                    return;
                }

                console.log('Connected to turntable on port:', portPath);
                this.portPath = portPath;
                this.isConnected = true;

                // Emit connection event
                this.io.emit('arduino-port-connected', {
                    port: portPath
                });

                // Set up data handling
                this.setupDataHandling();
            });

            // Handle port closing
            this.port.on('close', () => {
                this.handleDisconnection('Port closed');
            });

            // Handle errors
            this.port.on('error', (err) => {
                console.error('Serial port error:', err.message);
                this.handleDisconnection('Port error: ' + err.message);
            });

        } catch (error) {
            console.error('Error connecting to port:', error);
            this.handleDisconnection('Connection error: ' + error.message);
        }
    }

    /**
     * Set up data handling from Arduino
     */
    setupDataHandling() {
        if (!this.parser) return;

        this.parser.on('data', (data) => {
            // Handle incoming data from Arduino
            // Emit to all connected clients
            this.io.emit('arduino-data', {
                port: this.portPath,
                data: data.trim()
            });
        });
    }

    /**
     * Send command to Arduino turntable
     */
    sendCommand(command) {
        console.log('🎠 ARDUINO-MONITOR: sendCommand called with:', command);
        console.log('🎠 ARDUINO-MONITOR: port exists:', !!this.port);
        console.log('🎠 ARDUINO-MONITOR: isConnected:', this.isConnected);
        console.log('🎠 ARDUINO-MONITOR: portPath:', this.portPath);
        
        if (!this.port || !this.isConnected) {
            console.warn('🎠 ARDUINO-MONITOR: Cannot send command: no active connection');
            return false;
        }

        try {
            // Send single character command directly
            console.log('🎠 ARDUINO-MONITOR: Writing command to port...');
            this.port.write(command);
            console.log(`🎠 ARDUINO-MONITOR: Sent command '${command}' to turntable on ${this.portPath}`);
            return true;
        } catch (error) {
            console.error('🎠 ARDUINO-MONITOR: Error sending command to turntable:', error);
            return false;
        }
    }

    /**
     * Handle port disconnection
     */
    handleDisconnection(reason) {
        if (!this.isConnected) return;

        console.log('Turntable disconnected:', reason);

        // Clean up port connection
        if (this.port) {
            try {
                this.port.close();
            } catch (error) {
                console.error('Error closing port:', error);
            }
        }

        // Reset state
        this.port = null;
        this.parser = null;
        this.isConnected = false;

        // Emit disconnection event
        this.io.emit('arduino-port-disconnected', {
            port: this.portPath,
            message: reason
        });

        this.portPath = null;
    }

    /**
     * Manually disconnect from current port
     */
    disconnect() {
        this.handleDisconnection('Manual disconnection');
    }

    /**
     * Clean up resources
     */
    cleanup() {
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
        }
        this.disconnect();
    }
}

module.exports = ArduinoPortMonitor;