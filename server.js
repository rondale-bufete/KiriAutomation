// server.js

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const { Server } = require('socket.io');
const http = require('http');
const KiriEngineAutomation = require('./kiri-automation');
const config = require('./config');

// Debug configuration loading
console.log('Configuration loaded:');
console.log('KIRI_EMAIL:', config.KIRI_EMAIL);
console.log('KIRI_PASSWORD:', config.KIRI_PASSWORD ? '[SET]' : 'NOT SET');
console.log('PORT:', config.PORT);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Expose io globally for other modules if needed
global.io = io;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Ensure downloads directory exists
const downloadsDir = path.join(__dirname, 'downloads');
fs.ensureDirSync(downloadsDir);

// Ensure uploads directory exists for CI4 uploads
const uploadsDir = path.join(__dirname, 'uploads');
fs.ensureDirSync(uploadsDir);

// Serve files from downloads directory
app.use('/downloads', express.static('downloads'));

// Serve files from extracted directory
app.use('/extracted', express.static('extracted'));

// Serve files from uploads directory
app.use('/uploads', express.static('uploads'));

// API endpoint to list downloaded files
app.get('/api/downloads', (req, res) => {
  try {
    const downloadsDir = path.join(__dirname, 'downloads');

    // Check if downloads directory exists
    if (!fs.existsSync(downloadsDir)) {
      return res.json({ success: true, files: [] });
    }

    const files = fs.readdirSync(downloadsDir)
      .filter(file => {
        const filePath = path.join(downloadsDir, file);
        return fs.statSync(filePath).isFile();
      })
      .map(file => {
        const filePath = path.join(downloadsDir, file);
        const stats = fs.statSync(filePath);
        return {
          name: file,
          size: stats.size,
          created: stats.birthtime,
          downloadUrl: `/downloads/${file}`
        };
      })
      .sort((a, b) => new Date(b.created) - new Date(a.created)); // Sort by newest first

    res.json({ success: true, files });
  } catch (error) {
    console.error('Error listing downloads:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API endpoint to list extracted files
app.get('/api/extracted', async (req, res) => {
  try {
    const extractedFiles = await zipExtractor.getExtractedFiles();
    res.json({ success: true, files: extractedFiles });
  } catch (error) {
    console.error('Error listing extracted files:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API endpoint for remote trigger from CI4 app
app.post('/api/remote-trigger', async (req, res) => {
  try {
    const { action, token, data } = req.body;

    // Simple authentication (you can enhance this)
    const expectedToken = process.env.REMOTE_TRIGGER_TOKEN || 'kiri-automation-2024';

    if (!token || token !== expectedToken) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized - Invalid token'
      });
    }

    console.log('🌐 Remote trigger received:', { action, data });

    switch (action) {
      case 'start-scan':
        // Trigger the scanning process
        if (global.io) {
          global.io.emit('remote-scan-trigger', {
            message: 'Remote scan triggered from CI4',
            data: data || {}
          });
        }

        res.json({
          success: true,
          message: 'Scan triggered successfully',
          timestamp: new Date().toISOString()
        });
        break;

      case 'check-status':
        // Return current status
        const status = {
          server: 'running',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          memory: process.memoryUsage()
        };

        res.json({
          success: true,
          status: status
        });
        break;

      case 'get-models':
        // Return list of 3D models
        try {
          const extractedFiles = await zipExtractor.getExtractedFiles();
          res.json({
            success: true,
            models: extractedFiles,
            count: extractedFiles.length
          });
        } catch (error) {
          res.status(500).json({
            success: false,
            error: 'Failed to get models: ' + error.message
          });
        }
        break;

      default:
        res.status(400).json({
          success: false,
          error: 'Unknown action: ' + action
        });
    }

  } catch (error) {
    console.error('Remote trigger error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Endpoint for CI4 "Start Automated Scanning" button to trigger live scanning via Socket.IO
app.post('/api/remote/start-live-scanning', async (req, res) => {
  try {
    // Authenticate using the same CI4 API key used for /api/ci4/upload
    const apiKey = req.headers['x-api-key'] || req.body.api_key || req.query.api_key;
    const expectedApiKey = config.CI4_API_KEY || 'kiri-automation-ci4-secret-key-2024';

    if (!apiKey || apiKey !== expectedApiKey) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized - Invalid API key'
      });
    }

    console.log('🌐 CI4 remote start-live-scanning request received:', req.body);

    if (global.io) {
      global.io.emit('remote-scan-trigger', {
        message: 'Remote scan triggered from CI4 start-live-scanning endpoint',
        data: req.body || {}
      });
    }

    res.json({
      success: true,
      message: 'Live scanning triggered successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error handling CI4 start-live-scanning request:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Test endpoint to verify file explorer opening
app.get('/api/test-explorer', (req, res) => {
  const { spawn } = require('child_process');
  const path = require('path');
  const os = require('os');

  if (os.platform() === 'win32') {
    const testPath = path.join(__dirname, 'extracted');
    console.log('Testing file explorer with path:', testPath);

    const child = spawn('cmd', ['/c', 'start', '""', `"${testPath}"`], {
      detached: true,
      stdio: 'ignore',
      shell: true
    });

    child.on('error', (error) => {
      console.error('Test failed:', error);
      res.json({ success: false, error: error.message });
    });

    child.on('spawn', () => {
      console.log('Test command spawned successfully');
      res.json({ success: true, message: 'Test command executed' });
    });

    child.unref();
  } else {
    res.json({ success: false, error: 'Not Windows' });
  }
});

// API endpoint to open folder in file explorer
app.post('/api/open-folder', async (req, res) => {
  try {
    const { folderName } = req.body;

    if (!folderName) {
      return res.status(400).json({ success: false, error: 'Folder name is required' });
    }

    const folderPath = path.join(__dirname, 'extracted', folderName);

    // Check if folder exists
    if (!fs.existsSync(folderPath)) {
      return res.status(404).json({ success: false, error: 'Folder not found' });
    }

    // Open folder in file explorer based on operating system
    const { spawn } = require('child_process');
    const os = require('os');
    const platform = os.platform();

    let command, args;

    if (platform === 'win32') {
      // Windows - use batch file for more reliable execution
      const windowsPath = folderPath.replace(/\//g, '\\');
      console.log(`Opening folder in file explorer: ${folderPath}`);
      console.log(`Windows path: ${windowsPath}`);

      const { spawn } = require('child_process');
      const batchFilePath = path.join(__dirname, 'open-folder.bat');

      console.log(`Using batch file: ${batchFilePath}`);

      // Execute the batch file
      const child = spawn(batchFilePath, [`"${windowsPath}"`], {
        detached: true,
        stdio: 'ignore',
        shell: true,
        cwd: __dirname
      });

      child.on('error', (error) => {
        console.error('Batch file execution failed:', error);

        // Fallback: try direct explorer command
        console.log('Trying direct explorer command as fallback...');
        const explorerChild = spawn('explorer', [windowsPath], {
          detached: true,
          stdio: 'ignore'
        });

        explorerChild.on('error', (error2) => {
          console.error('Explorer fallback also failed:', error2);
        });

        explorerChild.on('spawn', () => {
          console.log('Explorer fallback spawned successfully');
        });

        explorerChild.unref();
      });

      child.on('spawn', () => {
        console.log('Batch file spawned successfully');
      });

      child.unref();
    } else if (platform === 'darwin') {
      // macOS
      command = 'open';
      args = [folderPath];

      console.log(`Opening folder in file explorer: ${folderPath}`);
      console.log(`Command: ${command} ${args.join(' ')}`);

      const child = spawn(command, args, {
        detached: true,
        stdio: 'ignore'
      });
      child.unref();
    } else {
      // Linux
      command = 'xdg-open';
      args = [folderPath];

      console.log(`Opening folder in file explorer: ${folderPath}`);
      console.log(`Command: ${command} ${args.join(' ')}`);

      const child = spawn(command, args, {
        detached: true,
        stdio: 'ignore'
      });
      child.unref();
    }

    res.json({
      success: true,
      message: 'File explorer opened successfully',
      folderPath: folderPath
    });

  } catch (error) {
    console.error('Error opening folder:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads';
    fs.ensureDirSync(uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 1024 * 1024 * 1024, // 1GB limit per file
    files: 150 // Allow up to 150 files
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|mp4|mov|avi/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed!'));
    }
  }
});

// Configure multer for CI4 uploads (saves to uploads directory)
const ci4Storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const ci4UploadDir = path.join(__dirname, 'uploads');
    fs.ensureDirSync(ci4UploadDir);
    cb(null, ci4UploadDir);
  },
  filename: (req, file, cb) => {
    // Keep original filename for easier tracking
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'ci4-' + uniqueSuffix + '-' + file.originalname);
  }
});

const ci4Upload = multer({
  storage: ci4Storage,
  limits: {
    fileSize: 1024 * 1024 * 1024, // 1GB limit per file
    files: 150 // Allow up to 150 files
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|mp4|mov|avi/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed!'));
    }
  }
});

// Global variables for automation management
let automation = null;
let isProcessing = false;

// Make automation accessible globally for zip-extractor
global.automation = null;

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Simple motor control test page (mirrors CI4 motor_control_view.php)
app.get('/motor-test', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'motor-test.html'));
});

app.post('/upload', upload.array('files', 150), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  if (isProcessing) {
    return res.status(409).json({ error: 'Another batch is currently being processed' });
  }

  isProcessing = true;

  try {
    // Always create a fresh automation instance for each request
    // This prevents "Requesting main frame too early" errors
    if (automation) {
      console.log('Closing previous automation instance...');
      try {
        await automation.close();
      } catch (e) {
        console.log('Error closing previous automation:', e.message);
      }
    }

    console.log('Creating new automation instance...');
    automation = new KiriEngineAutomation({
      headless: config.NODE_ENV === 'production',
      sessionPath: './session',
      browserType: config.BROWSER_TYPE || 'chromium', // chromium, chrome, firefox, edge
      executablePath: config.BROWSER_EXECUTABLE_PATH || null
    });
    await automation.init();

    // Update global automation reference
    global.automation = automation;

    // Emit progress update
    broadcastProgress('login', 'Logging in to Kiri Engine...');

    // Login to Kiri Engine
    console.log('Configuration check:');
    console.log('KIRI_EMAIL:', config.KIRI_EMAIL ? '[SET]' : '[NOT SET]');
    console.log('KIRI_PASSWORD:', config.KIRI_PASSWORD ? '[SET]' : '[NOT SET]');

    if (!config.KIRI_EMAIL || !config.KIRI_PASSWORD) {
      isProcessing = false;
      return res.status(500).json({ error: 'Kiri Engine credentials not found in configuration. Please check your config.js file.' });
    }

    const loginResult = await automation.login(config.KIRI_EMAIL, config.KIRI_PASSWORD);
    if (!loginResult.success) {
      isProcessing = false;
      return res.status(500).json({ error: loginResult.message });
    }

    // Emit progress update
    broadcastProgress('upload', `Uploading ${req.files.length} files...`);

    // Upload all files at once
    const filePaths = req.files.map(file => file.path);
    broadcastProgress('upload', `Uploading ${req.files.length} files to Kiri Engine...`);

    const uploadResult = await automation.uploadMultipleFiles(filePaths);
    if (!uploadResult.success) {
      isProcessing = false;
      // Clean up uploaded files
      for (const uploadedFile of req.files) {
        await fs.remove(uploadedFile.path);
      }
      return res.status(500).json({ error: `Upload failed: ${uploadResult.message}` });
    }

    // Emit progress update
    broadcastProgress('processing', 'Processing photogrammetry with multiple images...');

    await blynkUpdateMotor('off');

    // Wait for project completion and handle export/download
    const exportResult = await automation.waitForProjectCompletionAndExport();
    if (!exportResult.success) {
      isProcessing = false;
      // Clean up uploaded files
      for (const uploadedFile of req.files) {
        await fs.remove(uploadedFile.path);
      }
      return res.status(500).json({ error: exportResult.message });
    }

    // Emit progress update for completed download
    broadcastProgress('download', '3D model download completed!');

    // Clean up uploaded files
    for (const uploadedFile of req.files) {
      await fs.remove(uploadedFile.path);
    }

    // Close automation instance to free up resources
    console.log('Closing automation instance after successful processing...');
    try {
      await automation.close();
      automation = null; // Reset automation instance
      global.automation = null; // Reset global reference
    } catch (e) {
      console.log('Error closing automation:', e.message);
    }

    isProcessing = false;

    res.json({
      success: true,
      message: `${req.files.length} files processed and downloaded successfully`,
      fileCount: req.files.length
    });

  } catch (error) {
    isProcessing = false;

    // Clean up automation instance on error
    if (automation) {
      console.log('Closing automation instance due to error...');
      try {
        await automation.close();
        automation = null; // Reset automation instance
        global.automation = null; // Reset global reference
      } catch (e) {
        console.log('Error closing automation during error cleanup:', e.message);
      }
    }

    // Clean up uploaded files
    if (req.files) {
      for (const uploadedFile of req.files) {
        await fs.remove(uploadedFile.path);
      }
    }
    broadcastProgress('error', `Error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.get('/status', (req, res) => {
  res.json({
    isProcessing: isProcessing,
    automationInitialized: automation !== null
  });
});

// API to force-close the current automation browser instance (used on scan failure)
app.post('/api/close-automation', async (req, res) => {
  try {
    if (automation && typeof automation.close === 'function') {
      console.log('API /api/close-automation: Closing automation instance...');
      await automation.close();
      automation = null;
      global.automation = null;
      return res.json({ success: true, message: 'Automation instance closed.' });
    }

    return res.json({ success: true, message: 'No active automation instance to close.' });
  } catch (error) {
    console.error('Error in /api/close-automation:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// === ESP32 Motor Control via Blynk (Node clone of CI4 MotorController) ===

// JSON API to fetch real-time status
app.get('/api/motor/status', async (req, res) => {
  try {
    const result = {
      motor_status: 'Unknown',
      device_status: 'Unknown',
      timestamp: new Date().toISOString()
    };

    // 1. Fetch current Virtual Pin V1 status
    const v1Status = await blynkApiGet('get', '&V1');
    if (v1Status !== null) {
      result.motor_status = parseInt(v1Status, 10) === 1 ? 'ON' : 'OFF';
    }

    // 2. Fetch device connection status
    const deviceConnected = await blynkApiGet('isHardwareConnected');
    if (deviceConnected !== null) {
      result.device_status = deviceConnected.toLowerCase() === 'true' ? 'Online' : 'Offline';
    }

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Motor status API error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API to control motor ON/OFF (state param like 'on' or 'off')
// Motor control endpoint - handles both GET and POST requests
const motorControlHandler = async (req, res) => {
  try {
    const { state } = req.params;
    const normalized = String(state || 'off').toLowerCase() === 'on' ? 'on' : 'off';


    const updateResult = await blynkUpdateMotor(normalized);


    if (!updateResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to send motor command',
        details: updateResult
      });
    }

    res.json({
      success: true,
      message: `Motor command sent: ${normalized.toUpperCase()}`,
      state: normalized,
      response: updateResult.response || null
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Accept both GET and POST requests for motor control
app.get('/api/motor/control/:state', motorControlHandler);
app.post('/api/motor/control/:state', motorControlHandler);

// CI4 Remote Upload Endpoint - Saves files to uploads directory
// File watcher will automatically detect and process them
// Use any() to accept files[0], files[1], etc. format from PHP cURL
app.post('/api/ci4/upload', ci4Upload.any(), async (req, res) => {
  // Authentication check
  const apiKey = req.headers['x-api-key'] || req.body.api_key || req.query.api_key;
  const expectedApiKey = config.CI4_API_KEY || 'kiri-automation-ci4-secret-key-2024';

  if (!apiKey || apiKey !== expectedApiKey) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized - Invalid or missing API key'
    });
  }

  // Handle any() format - req.files is an array of all uploaded files
  // PHP sends files[0], files[1], etc. which multer.any() accepts
  const uploadedFiles = Array.isArray(req.files) ? req.files : [];

  if (!uploadedFiles || uploadedFiles.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'No files uploaded'
    });
  }

  try {
    console.log(`📤 CI4 Upload: Saved ${uploadedFiles.length} file(s) to uploads directory`);

    // Files are now saved in the uploads directory
    // The file watcher will automatically detect and process them

    res.json({
      success: true,
      message: `${uploadedFiles.length} file(s) uploaded successfully. Processing will start automatically.`,
      fileCount: uploadedFiles.length,
      files: uploadedFiles.map(file => ({
        name: file.filename,
        originalName: file.originalname,
        size: file.size,
        path: file.path
      }))
    });
  } catch (error) {
    console.error('CI4 Upload Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// API endpoint to clear uploads folder
app.post('/api/clear-uploads', async (req, res) => {
  try {
    const uploadsDir = path.join(__dirname, 'uploads');

    // Check if uploads directory exists
    if (!fs.existsSync(uploadsDir)) {
      return res.json({
        success: true,
        message: 'Uploads directory does not exist',
        deletedCount: 0
      });
    }

    // Read all files in uploads directory
    const files = await fs.readdir(uploadsDir);
    let deletedCount = 0;
    const errors = [];

    // Delete each file
    for (const file of files) {
      try {
        const filePath = path.join(uploadsDir, file);
        const stats = await fs.stat(filePath);

        // Only delete files, not directories
        if (stats.isFile()) {
          await fs.remove(filePath);
          deletedCount++;
          console.log(`🗑️ Deleted upload file: ${file}`);
        }
      } catch (error) {
        console.error(`Error deleting file ${file}:`, error.message);
        errors.push({ file, error: error.message });
      }
    }

    console.log(`✅ Cleared uploads folder: ${deletedCount} files deleted`);

    res.json({
      success: true,
      message: `Successfully deleted ${deletedCount} file(s) from uploads folder`,
      deletedCount: deletedCount,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Error clearing uploads folder:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to clear uploads folder'
    });
  }
});

// Add endpoint to reset processing state if needed
app.post('/reset', async (req, res) => {
  try {
    if (automation) {
      console.log('Resetting automation instance...');
      await automation.close();
      automation = null;
    }
    isProcessing = false;
    res.json({ success: true, message: 'Processing state reset successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Remote Upload Proxy Routes - Proxy requests to VPS PHP backend
// This eliminates CORS issues by having the Node.js server make the requests

// Configuration for VPS PHP backend - uses config.js for easy updates
const VPS_CONFIG = {
  baseUrl: config.VPS_BASE_URL || 'http://localhost:8080',
  apiKey: config.VPS_API_KEY || 'mysecret_api_key@123this_is_a_secret_key_to_access_the_php_system'
};

// Configuration for CI4 backend progress updates
const CI4_CONFIG = {
  baseUrl: config.CI4_BASE_URL || 'http://localhost:8080',
  apiKey: config.CI4_API_KEY || 'kiri-automation-ci4-secret-key-2024'
};

// Blynk motor control configuration (mirrors CI4 MotorController.php)
const BLYNK_CONFIG = {
  server: 'blynk.cloud',
  // IMPORTANT: this is your current CI4 Blynk token. Consider moving to config.js/env for production.
  token: '36YSJZ3GgnyvR56BHz3ihV5BaEoZOeKd'
};

// Helper to call Blynk HTTP API via GET
async function blynkApiGet(endpoint, query = '') {
  const url = `https://${BLYNK_CONFIG.server}/external/api/${endpoint}?token=${BLYNK_CONFIG.token}${query}`;

  try {
    let response;
    if (typeof fetch !== 'undefined') {
      response = await fetch(url, { method: 'GET' });
    } else {
      const nodeFetch = require('node-fetch');
      response = await nodeFetch(url, { method: 'GET' });
    }

    if (!response.ok) {
      console.error('Blynk API GET HTTP error:', response.status, 'for', endpoint);
      return null;
    }

    const text = (await response.text()).trim();
    return text !== '' ? text : null;
  } catch (error) {
    console.error('Blynk API GET error for', endpoint, ':', error.message);
    return null;
  }
}

// Helper to update Blynk virtual pin V1 (motor on/off)
async function blynkUpdateMotor(state = 'off') {
  const value = String(state).toLowerCase() === 'on' ? 1 : 0;
  const url = `https://${BLYNK_CONFIG.server}/external/api/update?token=${BLYNK_CONFIG.token}&V1=${value}`;


  try {
    let response;
    if (typeof fetch !== 'undefined') {
      response = await fetch(url, { method: 'GET' });
    } else {
      const nodeFetch = require('node-fetch');
      response = await nodeFetch(url, { method: 'GET' });
    }


    if (!response.ok) {
      const text = await response.text();
      return { success: false, httpCode: response.status, response: text };
    }

    const text = await response.text();
    return { success: true, httpCode: response.status, response: text };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Helper function to make requests to VPS
async function makeVPSRequest(endpoint, options = {}) {
  const url = `${VPS_CONFIG.baseUrl}${endpoint}`;

  const defaultOptions = {
    headers: {
      'X-API-Key': VPS_CONFIG.apiKey,
      'Content-Type': 'application/json',
      ...options.headers
    }
  };

  const requestOptions = { ...defaultOptions, ...options };

  try {
    console.log(`🌐 Making VPS request to: ${url}`);
    console.log(`🌐 Request options:`, JSON.stringify(requestOptions, null, 2));

    // Use native fetch (available in Node.js 18+) or fallback to node-fetch
    let response;
    if (typeof fetch !== 'undefined') {
      // Native fetch is available
      response = await fetch(url, requestOptions);
    } else {
      // Fallback to node-fetch
      const fetch = require('node-fetch');
      response = await fetch(url, requestOptions);
    }

    const data = await response.text();

    let jsonData;
    try {
      // Check if response is HTML (error page) or JSON
      if (data.trim().startsWith('<!DOCTYPE') || data.trim().startsWith('<html')) {
        jsonData = {
          error: 'VPS returned HTML error page instead of JSON',
          html_response: data.substring(0, 500) + '...',
          status_code: response.status,
          url: url
        };
      } else {
        jsonData = JSON.parse(data);
      }
    } catch (e) {
      jsonData = {
        parse_error: e.message,
        raw_response: data.substring(0, 500) + '...',
        response_type: 'non-json'
      };
    }

    return {
      status: response.status,
      statusText: response.statusText,
      data: jsonData,
      headers: Object.fromEntries(response.headers.entries())
    };
  } catch (error) {
    console.error('VPS request error:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    throw error;
  }
}

// Helper to send progress updates to CI4 app
async function sendCI4ProgressUpdate(step, message) {
  const url = `${CI4_CONFIG.baseUrl}/api/automation/progress`;

  const body = {
    step,
    message,
    source: 'node-automation',
    timestamp: new Date().toISOString()
  };

  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': CI4_CONFIG.apiKey
    },
    body: JSON.stringify(body)
  };

  try {
    if (typeof fetch !== 'undefined') {
      await fetch(url, options);
    } else {
      const nodeFetch = require('node-fetch');
      await nodeFetch(url, options);
    }
  } catch (error) {
    console.error('CI4 progress update error:', error.message);
  }
}

// Central helper to broadcast progress to both Socket.IO clients and CI4
function broadcastProgress(step, message) {
  try {
    io.emit('progress', { step, message });
  } catch (e) {
    console.error('Error emitting Socket.IO progress event:', e.message);
  }

  // Fire and forget CI4 update
  sendCI4ProgressUpdate(step, message).catch(err => {
    console.error('Error sending CI4 progress update:', err.message);
  });

  // Update pipeline state
  updatePipelineState(step, message);
}

// === Pipeline Status Management ===

// Pipeline definitions
const SCAN_PIPELINE = {
  name: 'Scan New Artifact',
  steps: [
    { id: 'scanStep1', index: 0, name: 'Authenticate', description: 'Login to Kiri Engine' },
    { id: 'scanStep2', index: 1, name: 'Capturing Artifact', description: 'Taking photos from multiple angles' },
    { id: 'scanStep3', index: 2, name: 'Processing Photogrammetry', description: 'Creating 3D model from photos' },
    { id: 'scanStep4', index: 3, name: 'Downloading 3D', description: 'Getting your 3D model' }
  ]
};

const UPLOAD_PIPELINE = {
  name: 'Upload Existing Media',
  steps: [
    { id: 'step1', index: 0, name: 'Authenticate', description: 'Login to Kiri Engine' },
    { id: 'step2', index: 1, name: 'Upload Files', description: 'Transfer your media files' },
    { id: 'step3', index: 2, name: 'Process Photogrammetry', description: 'Photo Scan with Kiri Engine' },
    { id: 'step4', index: 3, name: 'Download', description: 'Get your 3D model' },
    { id: 'step5', index: 4, name: 'Auto-Upload', description: 'Upload to VPS system' }
  ]
};

// Progress event to step mapping
const PROGRESS_STEP_MAP = {
  'login': 0,      // Authenticate
  'upload': 1,     // Upload/Capturing
  'processing': 2, // Processing
  'download': 3,   // Downloading
  'complete': -1   // Completed (pseudo-step)
};

// Global pipeline state
const pipelineState = {
  scan: {
    isActive: false,
    currentStep: -1,
    currentStatus: 'pending',
    lastUpdated: null
  },
  upload: {
    isActive: false,
    currentStep: -1,
    currentStatus: 'pending',
    lastUpdated: null
  }
};

// Function to update pipeline state
function updatePipelineState(step, message) {
  try {
    const stepIndex = PROGRESS_STEP_MAP[step];

    // Determine which pipeline is active based on context
    // For now, we'll check message content to determine pipeline type
    const isScanPipeline = message && (message.includes('turntable') || message.includes('photos'));
    const pipeline = isScanPipeline ? 'scan' : 'upload';

    if (stepIndex !== undefined) {
      if (stepIndex === -1) {
        // Complete
        pipelineState[pipeline].currentStatus = 'completed';
      } else {
        pipelineState[pipeline].isActive = true;
        pipelineState[pipeline].currentStep = stepIndex;
        pipelineState[pipeline].currentStatus = 'active';
        pipelineState[pipeline].lastUpdated = new Date().toISOString();
        console.log(`📊 Pipeline State Updated: ${pipeline.toUpperCase()} - Step ${stepIndex} (${SCAN_PIPELINE.steps[stepIndex]?.name || UPLOAD_PIPELINE.steps[stepIndex]?.name})`);
      }
    }
  } catch (error) {
    console.error('Error updating pipeline state:', error.message);
  }
}

// Simple test endpoint to verify server is running new code
app.get('/api/test-server', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running with updated code',
    timestamp: new Date().toISOString(),
    nodeFetchTest: (() => {
      try {
        // Test if node-fetch can be imported (regardless of native fetch)
        const nodeFetch = require('node-fetch');
        return typeof nodeFetch === 'function';
      } catch (e) {
        return false;
      }
    })(),
    nativeFetchTest: (() => {
      return typeof fetch !== 'undefined';
    })()
  });
});

// Test fetch function availability
app.get('/api/vps/test-fetch', (req, res) => {
  try {
    const fetchAvailable = typeof fetch !== 'undefined';
    const nodeVersion = process.version;

    // Test node-fetch import
    let nodeFetchTest = false;
    try {
      const fetch = require('node-fetch');
      nodeFetchTest = typeof fetch === 'function';
    } catch (e) {
      console.error('Node-fetch import error:', e);
    }

    res.json({
      success: true,
      message: 'Fetch function test',
      data: {
        fetchAvailable,
        nodeVersion,
        fetchType: fetchAvailable ? 'native' : 'node-fetch required',
        nodeFetchAvailable: nodeFetchTest,
        vpsConfig: {
          baseUrl: VPS_CONFIG.baseUrl,
          apiKeyLength: VPS_CONFIG.apiKey.length,
          apiKeyPreview: VPS_CONFIG.apiKey.substring(0, 20) + '...'
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Fetch test failed'
    });
  }
});

// Test direct VPS response
app.get('/api/vps/test-direct', async (req, res) => {
  try {
    const url = `${VPS_CONFIG.baseUrl}/remote-upload/test-upload`;
    console.log(`🌐 Testing direct VPS response from: ${url}`);
    console.log(`🌐 Using API Key: ${VPS_CONFIG.apiKey.substring(0, 20)}...`);

    const requestBody = JSON.stringify({ test: true });
    console.log(`🌐 Request body: ${requestBody}`);

    // Use native fetch (available in Node.js 18+) or fallback to node-fetch
    let response;
    if (typeof fetch !== 'undefined') {
      // Native fetch is available
      console.log(`🌐 Using native fetch`);
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'X-API-Key': VPS_CONFIG.apiKey,
          'Content-Type': 'application/json',
          'User-Agent': 'Node.js-VPS-Proxy/1.0'
        },
        body: requestBody
      });
    } else {
      // Fallback to node-fetch
      console.log(`🌐 Using node-fetch fallback`);
      const fetch = require('node-fetch');
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'X-API-Key': VPS_CONFIG.apiKey,
          'Content-Type': 'application/json',
          'User-Agent': 'Node.js-VPS-Proxy/1.0'
        },
        body: requestBody
      });
    }

    const data = await response.text();
    console.log(`🌐 VPS Response Status: ${response.status}`);
    console.log(`🌐 VPS Response Headers:`, Object.fromEntries(response.headers.entries()));
    console.log(`🌐 VPS Response Body (first 500 chars):`, data.substring(0, 500));

    res.json({
      success: true,
      message: 'Direct VPS test completed',
      data: {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        bodyPreview: data.substring(0, 500),
        bodyLength: data.length,
        isHtml: data.trim().startsWith('<!DOCTYPE') || data.trim().startsWith('<html'),
        isJson: data.trim().startsWith('{') || data.trim().startsWith('['),
        fullResponse: data // Include full response for debugging
      }
    });
  } catch (error) {
    console.error('🌐 Direct VPS test error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Direct VPS test failed',
      stack: error.stack
    });
  }
});

// Test what PHP controller receives - minimal test
app.get('/api/vps/test-php-debug', async (req, res) => {
  try {
    console.log(`🌐 Testing what PHP controller receives...`);

    // Create a very simple test file
    const testContent = 'Hello PHP Controller!';
    const testFileName = 'test-php-debug.txt';

    // Create FormData exactly like the main upload
    const FormData = require('form-data');
    const formData = new FormData();

    // Add file with same structure as main upload
    formData.append('file', Buffer.from(testContent), {
      filename: testFileName,
      contentType: 'text/plain'
    });
    formData.append('api_key', VPS_CONFIG.apiKey);

    const url = `${VPS_CONFIG.baseUrl}/remote-upload/test-upload`;
    console.log(`🌐 Testing PHP debug endpoint: ${url}`);

    // Use node-fetch for form-data
    const fetch = require('node-fetch');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-API-Key': VPS_CONFIG.apiKey,
        ...formData.getHeaders()
      },
      body: formData
    });

    const data = await response.text();
    console.log(`🌐 PHP Debug Response: ${data}`);

    res.json({
      success: true,
      message: 'PHP debug test completed',
      data: {
        status: response.status,
        statusText: response.statusText,
        response: data
      }
    });
  } catch (error) {
    console.error('❌ PHP debug test failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'PHP debug test failed'
    });
  }
});

// Simple text file upload test
app.get('/api/vps/test-simple-upload', async (req, res) => {
  try {
    console.log(`🌐 Testing simple text file upload...`);

    // Create a simple text file
    const testContent = 'This is a simple test file for upload debugging';
    const testFileName = 'simple-test.txt';

    // Create FormData
    const FormData = require('form-data');
    const formData = new FormData();

    // Add simple text file
    formData.append('file', Buffer.from(testContent), {
      filename: testFileName,
      contentType: 'text/plain'
    });
    formData.append('api_key', VPS_CONFIG.apiKey);

    const url = `${VPS_CONFIG.baseUrl}/remote-upload/drop-file`;
    console.log(`🌐 Simple upload to: ${url}`);

    // Use node-fetch for form-data (native fetch doesn't work with form-data)
    const fetch = require('node-fetch');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-API-Key': VPS_CONFIG.apiKey,
        ...formData.getHeaders()
      },
      body: formData
    });

    const data = await response.text();
    console.log(`🌐 Simple upload response: ${data}`);

    res.json({
      success: true,
      message: 'Simple upload test completed',
      data: {
        status: response.status,
        statusText: response.statusText,
        response: data
      }
    });
  } catch (error) {
    console.error('❌ Simple upload test failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Simple upload test failed'
    });
  }
});

// Debug endpoint to test what PHP receives
app.get('/api/vps/debug-upload', async (req, res) => {
  try {
    console.log(`🌐 Debug: Testing what PHP controller receives...`);

    // Create a simple test file
    const testContent = 'Debug test file content';
    const testFileName = 'debug-test.txt';

    // Create FormData exactly like the real upload
    const FormData = require('form-data');
    const formData = new FormData();

    formData.append('file', Buffer.from(testContent), {
      filename: testFileName,
      contentType: 'text/plain'
    });

    formData.append('api_key', VPS_CONFIG.apiKey);

    const url = `${VPS_CONFIG.baseUrl}/remote-upload/drop-file`;
    console.log(`🌐 Debug upload to: ${url}`);

    const formHeaders = formData.getHeaders();
    console.log(`🌐 Debug form headers:`, formHeaders);

    // Use native fetch or node-fetch for proper form-data handling
    // Use node-fetch for form-data (native fetch doesn't work with form-data)
    const fetch = require('node-fetch');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-API-Key': VPS_CONFIG.apiKey,
        ...formHeaders
      },
      body: formData
    });

    const data = await response.text();
    console.log(`🌐 Debug response status: ${response.status}`);
    console.log(`🌐 Debug response headers:`, Object.fromEntries(response.headers.entries()));
    console.log(`🌐 Debug response body:`, data);

    res.json({
      success: true,
      message: 'Debug upload test completed',
      data: {
        status: response.status,
        statusText: response.statusText,
        responseHeaders: Object.fromEntries(response.headers.entries()),
        responseBody: data,
        requestHeaders: {
          'X-API-Key': VPS_CONFIG.apiKey,
          ...formHeaders
        }
      }
    });
  } catch (error) {
    console.error('🌐 Debug upload test error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Debug upload test failed'
    });
  }
});

// Test VPS file upload endpoint with a simple text file
app.get('/api/vps/test-file-upload', async (req, res) => {
  try {
    console.log(`🌐 Testing VPS file upload endpoint...`);

    // Create a simple test file in memory
    const testContent = 'This is a test file for VPS upload';
    const testFileName = 'test-upload.txt';

    // Create FormData
    const FormData = require('form-data');
    const formData = new FormData();

    // Add test file
    formData.append('file', Buffer.from(testContent), {
      filename: testFileName,
      contentType: 'text/plain'
    });

    // Add API key as form field (PHP controller expects this)
    formData.append('api_key', VPS_CONFIG.apiKey);

    const url = `${VPS_CONFIG.baseUrl}/remote-upload/drop-file`;
    console.log(`🌐 Testing file upload to: ${url}`);
    console.log(`🌐 Test file: ${testFileName} (${testContent.length} bytes)`);

    // Use native fetch or node-fetch for proper form-data handling
    let response;
    if (typeof fetch !== 'undefined') {
      // Native fetch is available
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'X-API-Key': VPS_CONFIG.apiKey,
          ...formData.getHeaders()
        },
        body: formData
      });
    } else {
      // Fallback to node-fetch
      const fetch = require('node-fetch');
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'X-API-Key': VPS_CONFIG.apiKey,
          ...formData.getHeaders()
        },
        body: formData
      });
    }

    const data = await response.text();
    console.log(`🌐 VPS File Upload Response Status: ${response.status}`);
    console.log(`🌐 VPS File Upload Response: ${data}`);

    let jsonData;
    try {
      jsonData = JSON.parse(data);
    } catch (e) {
      jsonData = {
        parse_error: e.message,
        raw_response: data
      };
    }

    res.json({
      success: true,
      message: 'VPS file upload test completed',
      data: {
        status: response.status,
        statusText: response.statusText,
        response: jsonData,
        testFile: {
          name: testFileName,
          size: testContent.length,
          content: testContent
        }
      }
    });
  } catch (error) {
    console.error('🌐 VPS file upload test error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'VPS file upload test failed',
      stack: error.stack
    });
  }
});

// Test VPS connection
app.get('/api/vps/test-connection', async (req, res) => {
  try {
    const result = await makeVPSRequest('/remote-upload/test-upload', {
      method: 'POST',
      body: JSON.stringify({ test: true })
    });

    res.json({
      success: true,
      message: 'VPS connection successful',
      vpsResponse: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'VPS connection failed'
    });
  }
});

// Test CORS configuration
app.get('/api/vps/test-cors', async (req, res) => {
  try {
    // Test preflight request
    const preflightResult = await makeVPSRequest('/remote-upload/test-upload', {
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://localhost:3002',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type, X-API-Key'
      }
    });

    res.json({
      success: true,
      message: 'CORS test completed',
      corsResponse: preflightResult
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'CORS test failed'
    });
  }
});

// Proxy file upload to VPS
app.post('/api/vps/upload-file', async (req, res) => {
  try {
    // Handle file upload via multipart/form-data
    const upload = multer({
      storage: multer.memoryStorage(), // Store in memory for proxying
      limits: {
        fileSize: 200 * 1024 * 1024, // 200MB limit
      },
      fileFilter: (req, file, cb) => {
        // Only allow .glb files
        if (file.originalname.toLowerCase().endsWith('.glb')) {
          cb(null, true);
        } else {
          cb(new Error('Only .glb files are allowed!'), false);
        }
      }
    });

    // Use multer to handle the file upload
    upload.single('file')(req, res, async (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          error: err.message,
          message: 'File upload validation failed'
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No file uploaded',
          message: 'Please select a .glb file to upload'
        });
      }

      try {
        console.log(`🌐 Proxying file upload: ${req.file.originalname} (${req.file.size} bytes)`);

        // Create FormData for the VPS request
        const FormData = require('form-data');
        const formData = new FormData();

        // Add the file with proper field name and options
        // Force GLB files to have the correct MIME type
        const glbMimeType = req.file.originalname.toLowerCase().endsWith('.glb')
          ? 'model/gltf-binary'
          : (req.file.mimetype || 'application/octet-stream');

        // Try different approaches for file upload
        console.log(`🌐 Attempting file upload with:`, {
          fieldName: 'file',
          filename: req.file.originalname,
          contentType: glbMimeType,
          size: req.file.size
        });

        // Method 1: Use buffer with options
        formData.append('file', req.file.buffer, {
          filename: req.file.originalname,
          contentType: glbMimeType,
          knownLength: req.file.size
        });

        // Add API key as form field (PHP controller expects this)
        formData.append('api_key', VPS_CONFIG.apiKey);

        console.log(`🌐 FormData fields:`, {
          filename: req.file.originalname,
          size: req.file.size,
          mimetype: req.file.mimetype,
          apiKeyLength: VPS_CONFIG.apiKey.length
        });

        // Debug: Log the actual form data structure
        console.log(`🌐 FormData entries:`, formData.getHeaders());
        console.log(`🌐 File buffer length:`, req.file.buffer.length);
        console.log(`🌐 File buffer first 50 bytes:`, req.file.buffer.slice(0, 50));
        console.log(`🌐 FormData field names:`, {
          fileField: 'file',
          apiKeyField: 'api_key',
          apiKeyValue: VPS_CONFIG.apiKey.substring(0, 20) + '...'
        });

        // Make request to VPS
        const url = `${VPS_CONFIG.baseUrl}/remote-upload/drop-file`;
        console.log(`🌐 Uploading to VPS: ${url}`);

        // Get form data headers (this includes the boundary)
        const formHeaders = formData.getHeaders();
        console.log(`🌐 Form headers:`, formHeaders);

        // CRITICAL: Use node-fetch for form-data uploads (native fetch doesn't work with form-data)
        console.log(`🌐 Using node-fetch for form-data upload (native fetch has form-data issues)`);

        // --- CRITICAL FIX FOR NODE-FETCH IMPORT ---
        let fetchFunction;
        try {
          const nodeFetch = require('node-fetch');
          console.log(`🌐 DEBUG: node-fetch imported. Type: ${typeof nodeFetch}`);

          // Handle both v2 (function) and v3+ (object with default export)
          if (typeof nodeFetch === 'function') {
            fetchFunction = nodeFetch;
            console.log(`🌐 DEBUG: Using node-fetch v2 (function)`);
          } else if (typeof nodeFetch === 'object' && nodeFetch.default) {
            fetchFunction = nodeFetch.default;
            console.log(`🌐 DEBUG: Using node-fetch v3+ (object.default)`);
          } else {
            console.error(`❌ DEBUG: Unknown node-fetch format. Type: ${typeof nodeFetch}, has default: ${!!nodeFetch.default}`);
            return res.status(500).json({
              success: false,
              error: 'Unknown node-fetch format',
              message: `node-fetch type: ${typeof nodeFetch}, has default: ${!!nodeFetch.default}`
            });
          }

          if (typeof fetchFunction !== 'function') {
            console.error(`❌ DEBUG: fetchFunction is not a function! Type: ${typeof fetchFunction}`);
            return res.status(500).json({
              success: false,
              error: 'fetchFunction is not a function',
              message: `fetchFunction type: ${typeof fetchFunction}`
            });
          }

          console.log(`🌐 DEBUG: fetchFunction ready. Type: ${typeof fetchFunction}`);
        } catch (e) {
          console.error(`❌ DEBUG: Failed to import node-fetch: ${e.message}`);
          return res.status(500).json({
            success: false,
            error: 'node-fetch import failed',
            message: e.message
          });
        }
        // --- END CRITICAL FIX ---

        const response = await fetchFunction(url, {
          method: 'POST',
          headers: {
            'X-API-Key': VPS_CONFIG.apiKey,
            ...formHeaders
          },
          body: formData
        });

        const data = await response.text();
        console.log(`🌐 VPS Upload Response Status: ${response.status}`);
        console.log(`🌐 VPS Upload Response Headers:`, Object.fromEntries(response.headers.entries()));
        console.log(`🌐 VPS Upload Response: ${data.substring(0, 500)}...`);

        // If upload failed, try to get more debug info
        if (response.status !== 200) {
          console.log(`🌐 Full VPS response:`, data);
        }

        let jsonData;
        try {
          jsonData = JSON.parse(data);
        } catch (e) {
          jsonData = {
            parse_error: e.message,
            raw_response: data.substring(0, 500) + '...'
          };
        }

        res.json({
          success: response.ok,
          message: response.ok ? 'File uploaded successfully via proxy!' : 'Upload failed',
          vpsResponse: {
            status: response.status,
            statusText: response.statusText,
            data: jsonData
          },
          fileInfo: {
            name: req.file.originalname,
            size: req.file.size,
            type: req.file.mimetype
          }
        });

      } catch (error) {
        console.error('🌐 File upload proxy error:', error);
        res.status(500).json({
          success: false,
          error: error.message,
          message: 'File upload proxy failed'
        });
      }
    });

  } catch (error) {
    console.error('🌐 Upload proxy error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Upload proxy failed'
    });
  }
});

// Proxy test upload endpoint
app.post('/api/vps/test-upload', async (req, res) => {
  try {
    const result = await makeVPSRequest('/remote-upload/test-upload', {
      method: 'POST',
      body: JSON.stringify(req.body)
    });

    res.json({
      success: true,
      message: 'Test upload proxy successful',
      vpsResponse: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Test upload proxy failed'
    });
  }
});

// Proxy cleanup temp files
app.post('/api/vps/cleanup-temp-files', async (req, res) => {
  try {
    const result = await makeVPSRequest('/remote-upload/cleanup-temp-files', {
      method: 'POST',
      body: JSON.stringify({ api_key: VPS_CONFIG.apiKey })
    });

    res.json({
      success: true,
      message: 'Cleanup proxy successful',
      vpsResponse: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Cleanup proxy failed'
    });
  }
});

// Get temp file info
app.get('/api/vps/temp-file/:tempName', async (req, res) => {
  try {
    const { tempName } = req.params;
    const result = await makeVPSRequest(`/remote-upload/temp-file/${tempName}`, {
      method: 'GET'
    });

    res.json({
      success: true,
      message: 'Get temp file proxy successful',
      vpsResponse: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Get temp file proxy failed'
    });
  }
});

// Move temp file to permanent location
app.post('/api/vps/move-temp-file', async (req, res) => {
  try {
    const result = await makeVPSRequest('/remote-upload/move-temp-file', {
      method: 'POST',
      body: JSON.stringify(req.body)
    });

    res.json({
      success: true,
      message: 'Move temp file proxy successful',
      vpsResponse: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Move temp file proxy failed'
    });
  }
});

// Add endpoint for Kiri Engine login via automation
app.post('/api/login-automation', async (req, res) => {
  try {
    console.log('Kiri Engine login via automation endpoint called');

    const { action } = req.body;

    if (action !== 'login') {
      return res.status(400).json({
        success: false,
        message: 'Invalid action. Expected "login"'
      });
    }

    // Emit progress update for authentication step
    io.emit('progress', { step: 'login', message: 'Logging in to Kiri Engine...' });

    // Close existing automation if it exists
    if (automation) {
      console.log('Closing existing automation instance...');
      try {
        await automation.close();
      } catch (e) {
        console.log('Error closing existing automation:', e.message);
      }
      automation = null;
    }

    // Create new automation instance
    console.log('Creating new automation instance for login...');
    automation = new KiriEngineAutomation({
      headless: config.NODE_ENV === 'production',
      sessionPath: './session',
      browserType: config.BROWSER_TYPE || 'chromium',
      executablePath: config.BROWSER_EXECUTABLE_PATH || null
    });

    await automation.init();

    // Perform login using config credentials
    console.log('Attempting Kiri Engine login via automation...');
    const loginResult = await automation.login(config.KIRI_EMAIL, config.KIRI_PASSWORD);

    if (loginResult.success) {
      console.log('Kiri Engine login successful via automation');

      // Emit progress update for capturing step
      io.emit('progress', { step: 'upload', message: 'Capturing photos with turntable rotation...' });

      // Start the 5-second page reload cycle for monitoring
      console.log('Starting page reload cycle after successful login...');
      automation.startPageReloadCycle();

      res.json({
        success: true,
        message: 'Successfully logged into Kiri Engine via automation - monitoring started'
      });
    } else {
      console.log('Kiri Engine login failed:', loginResult.message);
      res.status(401).json({
        success: false,
        message: loginResult.message
      });
    }

  } catch (error) {
    console.error('Kiri Engine login error:', error);
    res.status(500).json({
      success: false,
      message: `Login failed: ${error.message}`
    });
  }
});

// Add endpoint to stop the page reload cycle
app.post('/api/stop-monitoring', async (req, res) => {
  try {
    console.log('Stop monitoring endpoint called');

    if (automation) {
      console.log('Stopping page reload cycle...');
      automation.stopPageReloadCycle();
      res.json({
        success: true,
        message: 'Page reload monitoring stopped successfully'
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'No automation instance found'
      });
    }
  } catch (error) {
    console.error('Error stopping monitoring:', error);
    res.status(500).json({
      success: false,
      message: `Error stopping monitoring: ${error.message}`
    });
  }
});

// Add endpoint to trigger download sequence for completed projects
app.post('/api/trigger-download', async (req, res) => {
  try {
    console.log('Trigger download endpoint called');

    if (!automation || !automation.page) {
      return res.status(404).json({
        success: false,
        message: 'Automation not initialized'
      });
    }

    // Check if we're logged in
    const isLoggedIn = await automation.checkLoginStatus();
    if (!isLoggedIn) {
      return res.status(401).json({
        success: false,
        message: 'Not logged in'
      });
    }

    // Navigate to the projects page first
    console.log('Navigating to projects page...');
    await automation.page.goto('https://www.kiriengine.app/webapp/mymodel', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await automation.page.waitForTimeout(2000);

    // Start the download sequence using the proven automation logic
    console.log('Starting download sequence via automation...');
    const downloadResult = await automation.waitForProjectCompletionAndExport();

    if (downloadResult.success) {
      console.log('Download completed successfully via automation');
      res.json({
        success: true,
        message: 'Download completed successfully'
      });
    } else {
      console.log('Download failed via automation:', downloadResult.message);
      res.status(500).json({
        success: false,
        message: downloadResult.message
      });
    }

  } catch (error) {
    console.error('Error triggering download:', error);
    res.status(500).json({
      success: false,
      message: `Error triggering download: ${error.message}`
    });
  }
});

// Add endpoint to check for new processes (for 5-second polling)
app.get('/api/check-processes', async (req, res) => {
  try {
    console.log('Checking for new processes...');

    if (!automation || !automation.page) {
      return res.json({
        hasNewProcesses: false,
        message: 'Automation not initialized'
      });
    }

    // Check if we're logged in
    const isLoggedIn = await automation.checkLoginStatus();
    if (!isLoggedIn) {
      return res.json({
        hasNewProcesses: false,
        message: 'Not logged in'
      });
    }

    // Navigate to the projects page to check for new processes
    console.log('Navigating to projects page to check for new processes...');
    await automation.page.goto('https://www.kiriengine.app/webapp/mymodel', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await automation.page.waitForTimeout(2000);

    // Check for new processes using the specific processing status selector
    console.log('Looking for processing projects with specific selector...');

    // Look for the specific processing status elements
    const processingElements = await automation.page.$$('div[data-v-d562c7af] .status-mask .status span');
    console.log(`Found ${processingElements.length} processing status elements`);

    // Also get project cards for counting and fallback
    const projectCards = await automation.page.$$('div[data-v-d562c7af].model-cover, .model-cover, div[class*="card"], div[class*="project"]');
    console.log(`Found ${projectCards.length} project cards`);

    let hasNewProcesses = false;
    let processStatus = 'No processing projects found';

    if (processingElements.length > 0) {
      for (const element of processingElements) {
        const statusText = await automation.page.evaluate(el => el.textContent, element);
        console.log('Processing status text:', statusText);

        // Check if the text is exactly "Processing.." (note the two dots)
        if (statusText && statusText.trim() === 'Processing..') {
          hasNewProcesses = true;
          processStatus = 'Found project with "Processing.." status';
          console.log('New processing project detected!');
          break;
        }
      }
    }

    // Also check for project cards as backup (in case the specific selector doesn't work)
    if (!hasNewProcesses && projectCards.length > 0) {
      for (const card of projectCards) {
        const cardText = await automation.page.evaluate(el => el.textContent, card);

        // Check if there are any new/processing projects
        if (cardText && (
          cardText.includes('Processing') ||
          cardText.includes('Queuing') ||
          cardText.includes('Creating') ||
          cardText.includes('New') ||
          cardText.includes('...')
        )) {
          hasNewProcesses = true;
          processStatus = `Found processing project: ${cardText.substring(0, 50)}...`;
          console.log('New/processing project detected:', cardText.substring(0, 100));
          break;
        }
      }

      if (!hasNewProcesses) {
        processStatus = `Found ${projectCards.length} completed projects`;
      }
    }

    console.log('Process check result:', { hasNewProcesses, processStatus });

    res.json({
      hasNewProcesses,
      processStatus,
      projectCount: projectCards.length
    });

  } catch (error) {
    console.error('Error checking processes:', error);
    res.status(500).json({
      hasNewProcesses: false,
      message: `Error checking processes: ${error.message}`
    });
  }
});

// Make Socket.IO available globally for the automation class
global.io = io;


// Initialize zip extractor
const ZipExtractor = require('./zip-extractor');
const zipExtractor = new ZipExtractor();
zipExtractor.startWatching();

// CI4 Uploads File Watcher - Monitors uploads directory and triggers automation
class CI4UploadWatcher {
  constructor() {
    this.uploadsDir = path.join(__dirname, 'uploads');
    this.watcher = null;
    this.processingFiles = new Set(); // Track files being processed
    this.knownFiles = new Set(); // Track known files to detect new ones
    this.processingTimeout = null;
    this.batchDelay = 2000; // Wait 2 seconds after last file to process batch

    // Ensure directory exists
    fs.ensureDirSync(this.uploadsDir);

    // Initialize known files
    this.initializeKnownFiles();

    console.log('📁 CI4 Upload Watcher initialized');
    console.log('📁 Watching directory:', this.uploadsDir);
  }

  /**
   * Initialize the list of known files
   */
  async initializeKnownFiles() {
    try {
      if (fs.existsSync(this.uploadsDir)) {
        const files = await fs.readdir(this.uploadsDir);
        files.forEach(file => {
          const filePath = path.join(this.uploadsDir, file);
          const stats = fs.statSync(filePath);
          if (stats.isFile() && this.isValidFile(file)) {
            this.knownFiles.add(file);
          }
        });
        console.log(`📁 Found ${this.knownFiles.size} existing files in uploads directory`);
      }
    } catch (error) {
      console.error('Error initializing known files:', error);
    }
  }

  /**
   * Check if file is a valid image/video file
   */
  isValidFile(filename) {
    const allowedExtensions = /\.(jpeg|jpg|png|mp4|mov|avi)$/i;
    return allowedExtensions.test(filename);
  }

  /**
   * Start watching the uploads directory for new files
   */
  startWatching() {
    console.log('📁 Starting to watch uploads directory for CI4 files...');

    this.watcher = fs.watch(this.uploadsDir, async (eventType, filename) => {
      if (!filename) return;

      const filePath = path.join(this.uploadsDir, filename);

      // Check if it's a new file (not in known files)
      if (eventType === 'rename' && fs.existsSync(filePath)) {
        const stats = await fs.stat(filePath);

        if (stats.isFile() && this.isValidFile(filename) && !this.knownFiles.has(filename)) {
          console.log('📁 New CI4 file detected:', filename);
          this.knownFiles.add(filename);

          // Clear existing timeout
          if (this.processingTimeout) {
            clearTimeout(this.processingTimeout);
          }

          // Wait for batch to complete (files might be uploaded in sequence)
          this.processingTimeout = setTimeout(() => {
            this.processNewFiles();
          }, this.batchDelay);
        }
      }
    });

    console.log('📁 CI4 Upload Watcher is now active');
  }

  /**
   * Process new files that haven't been processed yet
   */
  async processNewFiles() {
    if (isProcessing) {
      console.log('📁 Another process is running, will retry later...');
      return;
    }

    try {
      const files = await fs.readdir(this.uploadsDir);
      const newFiles = files.filter(file => {
        const filePath = path.join(this.uploadsDir, file);
        const stats = fs.statSync(filePath);
        return stats.isFile() &&
          this.isValidFile(file) &&
          !this.processingFiles.has(file) &&
          this.knownFiles.has(file);
      });

      if (newFiles.length === 0) {
        console.log('📁 No new files to process');
        return;
      }

      console.log(`📁 Found ${newFiles.length} new file(s) to process`);

      // Mark files as being processed
      newFiles.forEach(file => this.processingFiles.add(file));

      // Trigger the automation process
      await this.triggerAutomation(newFiles);

    } catch (error) {
      console.error('📁 Error processing new files:', error);
    }
  }

  /**
   * Trigger the automation process with the new files
   */
  async triggerAutomation(files) {
    isProcessing = true;

    try {
      // Reset upload pipeline state at start of new upload
      pipelineState.upload = {
        isActive: false,
        currentStep: -1,
        currentStatus: 'pending',
        lastUpdated: null
      };
      console.log('📊 Pipeline State Reset: UPLOAD pipeline reset for new upload');

      // Always create a fresh automation instance for each request
      if (automation) {
        console.log('Closing previous automation instance...');
        try {
          await automation.close();
        } catch (e) {
          console.log('Error closing previous automation:', e.message);
        }
      }

      console.log('🚀 Starting Kiri Automation for CI4 uploaded files...');
      console.log(`📁 Processing ${files.length} file(s)`);

      automation = new KiriEngineAutomation({
        headless: config.NODE_ENV === 'production',
        sessionPath: './session',
        browserType: config.BROWSER_TYPE || 'chromium',
        executablePath: config.BROWSER_EXECUTABLE_PATH || null
      });
      await automation.init();

      // Update global automation reference
      global.automation = automation;

      // Emit progress update
      io.emit('progress', { step: 'login', message: 'Logging in to Kiri Engine...' });

      // Login to Kiri Engine
      if (!config.KIRI_EMAIL || !config.KIRI_PASSWORD) {
        isProcessing = false;
        throw new Error('Kiri Engine credentials not found in configuration');
      }

      const loginResult = await automation.login(config.KIRI_EMAIL, config.KIRI_PASSWORD);
      if (!loginResult.success) {
        isProcessing = false;
        throw new Error(loginResult.message);
      }

      // Emit progress update
      io.emit('progress', { step: 'upload', message: `Uploading ${files.length} files from CI4...` });

      // Get full file paths
      const filePaths = files.map(file => path.join(this.uploadsDir, file));
      const uploadResult = await automation.uploadMultipleFiles(filePaths);

      if (!uploadResult.success) {
        isProcessing = false;
        // Clean up uploaded files
        for (const file of files) {
          try {
            await fs.remove(path.join(this.uploadsDir, file));
            this.processingFiles.delete(file);
            this.knownFiles.delete(file);
          } catch (e) {
            console.log('Error removing file:', e.message);
          }
        }
        throw new Error(`Upload failed: ${uploadResult.message}`);
      }

      // Emit progress update
      io.emit('progress', { step: 'processing', message: 'Processing photogrammetry with multiple images...' });

      await blynkUpdateMotor('off');

      // Wait for project completion and handle export/download
      const exportResult = await automation.waitForProjectCompletionAndExport();
      if (!exportResult.success) {
        isProcessing = false;
        // Clean up uploaded files
        for (const file of files) {
          try {
            await fs.remove(path.join(this.uploadsDir, file));
            this.processingFiles.delete(file);
            this.knownFiles.delete(file);
          } catch (e) {
            console.log('Error removing file:', e.message);
          }
        }
        throw new Error(exportResult.message);
      }

      // Emit progress update
      io.emit('progress', { step: 'download', message: '3D model download completed!' });
      io.emit('progress', { step: 'auto-upload', message: 'Auto-uploading GLB file to VPS...' });

      // Clean up uploaded files after successful processing
      for (const file of files) {
        try {
          await fs.remove(path.join(this.uploadsDir, file));
          this.processingFiles.delete(file);
          this.knownFiles.delete(file);
        } catch (e) {
          console.log('Error removing file:', e.message);
        }
      }

      // Close automation instance
      console.log('Closing automation instance after successful processing...');
      try {
        await automation.close();
        automation = null;
        global.automation = null;
      } catch (e) {
        console.log('Error closing automation:', e.message);
      }

      // Reset pipeline state after successful completion
      pipelineState.upload = {
        isActive: false,
        currentStep: -1,
        currentStatus: 'pending',
        lastUpdated: null
      };
      console.log('📊 Pipeline State Reset: UPLOAD pipeline reset after successful completion');

      isProcessing = false;
      io.emit('progress', { step: 'complete', message: 'Processing completed successfully!' });
      console.log('✅ CI4 Upload Process Completed Successfully!');

    } catch (error) {
      isProcessing = false;

      // Reset pipeline state on error
      pipelineState.upload = {
        isActive: false,
        currentStep: -1,
        currentStatus: 'pending',
        lastUpdated: null
      };
      console.log('📊 Pipeline State Reset: UPLOAD pipeline reset due to error');

      // Clean up automation instance on error
      if (automation) {
        try {
          await automation.close();
          automation = null;
          global.automation = null;
        } catch (e) {
          console.log('Error closing automation during error cleanup:', e.message);
        }
      }

      // Remove from processing set on error
      files.forEach(file => this.processingFiles.delete(file));

      io.emit('progress', { step: 'error', message: `Error: ${error.message}` });
    }
  }

  /**
   * Stop watching
   */
  stopWatching() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      console.log('📁 CI4 Upload Watcher stopped');
    }
  }
}


// API endpoint to trigger Start Automated Scanning remotely from CI4
app.post('/api/remote/start-automated-scanning', async (req, res) => {
  try {
    // Authenticate using API key
    const apiKey = req.headers['x-api-key'] || req.body.api_key || req.query.api_key;
    const expectedApiKey = config.CI4_API_KEY || 'kiri-automation-ci4-secret-key-2024';

    if (!apiKey || apiKey !== expectedApiKey) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized - Invalid API key'
      });
    }

    console.log('🌐 CI4 Remote: Start Automated Scanning request received');

    // Send immediate response to CI4 app (don't wait for automation to complete)
    res.json({
      success: true,
      message: 'Automated scanning started successfully',
      timestamp: new Date().toISOString(),
      status: 'scanning-in-progress'
    });

    // Run server-side automation in background (don't await - respond immediately)
    (async () => {
      try {
        // Reset scan pipeline state at start of new scan
        pipelineState.scan = {
          isActive: false,
          currentStep: -1,
          currentStatus: 'pending',
          lastUpdated: null
        };
        console.log('📊 Pipeline State Reset: SCAN pipeline reset for new scan');

        // Close existing automation if it exists
        if (automation) {
          console.log('Closing existing automation instance...');
          try {
            await automation.close();
          } catch (e) {
            console.log('Error closing existing automation:', e.message);
          }
          automation = null;
        }

        // Create new automation instance
        console.log('Creating new automation instance for remote scan...');
        automation = new KiriEngineAutomation({
          headless: config.NODE_ENV === 'production',
          sessionPath: './session',
          browserType: config.BROWSER_TYPE || 'chromium',
          executablePath: config.BROWSER_EXECUTABLE_PATH || null
        });

        await automation.init();
        global.automation = automation;

        // Broadcast progress to any connected clients (optional)
        broadcastProgress('login', 'Logging in to Kiri Engine...');

        // Login to Kiri Engine
        if (!config.KIRI_EMAIL || !config.KIRI_PASSWORD) {
          throw new Error('Kiri Engine credentials not found in configuration');
        }

        const loginResult = await automation.login(config.KIRI_EMAIL, config.KIRI_PASSWORD);
        if (!loginResult.success) {
          throw new Error(loginResult.message);
        }

        console.log('✅ Kiri Engine login successful via remote trigger');

        // Broadcast progress for capturing step to any connected clients
        broadcastProgress('upload', 'Capturing photos with turntable rotation...');
        try {
          await blynkUpdateMotor('on');
        } catch (motorError) {
          console.error('🔌 MOTOR: Error turning on motor (server-side):', motorError.message);
        }

        // Trigger webhook macro to start photo capture (CRITICAL - must happen after motor ON)
        console.log('📱 WEBHOOK: Triggering macro for photo capture...');
        try {
          // Use the macro trigger webhook that's configured in config.js
          const webhookUrl = config.WEBHOOK_URL || 'http://localhost:3003/trigger-macro';
          console.log('📱 WEBHOOK: Sending request to:', webhookUrl);

          const webhookResponse = await (typeof fetch !== 'undefined' ? fetch : require('node-fetch'))(
            webhookUrl,
            { method: 'POST', headers: { 'Content-Type': 'application/json' } }
          );

          const webhookResult = await webhookResponse.json().catch(() => ({}));
          console.log('📱 WEBHOOK: Response:', webhookResult);
        } catch (webhookError) {
          console.error('📱 WEBHOOK: Error triggering macro:', webhookError.message);
        }

        // Emit Socket.IO event to trigger the scanner on connected clients (for monitoring)
        if (global.io) {
          global.io.emit('remote-scan-trigger', {
            message: 'Remote automated scan triggered from CI4',
            timestamp: new Date().toISOString(),
            source: 'ci4-api'
          });
          console.log('✅ Remote scan trigger event emitted to connected clients (for browser monitoring)');
        }

        // Start the page reload cycle for monitoring
        console.log('Starting page reload cycle after successful login...');
        automation.startPageReloadCycle();

        console.log('✅ Server-side automation is now running (browser optional for monitoring)');

      } catch (automationError) {
        console.error('❌ Error in server-side automation trigger:', automationError);

        // Reset pipeline state on error
        pipelineState.scan = {
          isActive: false,
          currentStep: -1,
          currentStatus: 'pending',
          lastUpdated: null
        };
        console.log('📊 Pipeline State Reset: SCAN pipeline reset due to error');

        // Broadcast error to any connected clients
        broadcastProgress('error', `Automation error: ${automationError.message}`);

        // Clean up on error
        if (automation) {
          try {
            await automation.close();
          } catch (e) {
            console.log('Error closing automation after error:', e.message);
          }
          automation = null;
        }
      }
    })();

  } catch (error) {
    console.error('❌ Error handling remote scan trigger:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to trigger automated scanning'
    });
  }
});

// API endpoint to check scanning status
app.get('/api/remote/scanning-status', async (req, res) => {
  try {
    // Authenticate using API key
    const apiKey = req.headers['x-api-key'] || req.query.api_key;
    const expectedApiKey = config.CI4_API_KEY || 'kiri-automation-ci4-secret-key-2024';

    if (!apiKey || apiKey !== expectedApiKey) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized - Invalid API key'
      });
    }

    const status = {
      isProcessing: isProcessing,
      automationInitialized: automation !== null,
      automationLoggedIn: automation ? await automation.checkLoginStatus() : false,
      timestamp: new Date().toISOString()
    };

    res.json({
      success: true,
      status: status
    });

  } catch (error) {
    console.error('❌ Error checking scanning status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// API endpoint to stop scanning
app.post('/api/remote/stop-scanning', async (req, res) => {
  try {
    // Authenticate using API key
    const apiKey = req.headers['x-api-key'] || req.body.api_key || req.query.api_key;
    const expectedApiKey = config.CI4_API_KEY || 'kiri-automation-ci4-secret-key-2024';

    if (!apiKey || apiKey !== expectedApiKey) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized - Invalid API key'
      });
    }

    console.log('🛑 CI4 Remote: Stop scanning request received');

    // Stop monitoring if active
    if (automation) {
      try {
        automation.stopPageReloadCycle();
        console.log('✅ Page reload monitoring stopped');
      } catch (e) {
        console.log('Error stopping monitoring:', e.message);
      }
    }

    // Emit stop event to connected clients
    if (global.io) {
      global.io.emit('remote-stop-scanning', {
        message: 'Remote stop scanning triggered from CI4',
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: 'Scanning stopped successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error stopping scanning:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// === Pipeline Status API Endpoints ===

/**
 * POST /api/update-pipeline-state
 * Receives pipeline state updates from the frontend
 * Updates the global pipelineState object
 */
app.post('/api/update-pipeline-state', (req, res) => {
  try {
    const { pipeline, stepIndex, stepName, status, message } = req.body;

    console.log(`📩 Received pipeline update:`, { pipeline, stepIndex, stepName, status, message });

    if (!pipeline || stepIndex === undefined) {
      return res.status(400).json({ success: false, error: 'Missing pipeline or stepIndex' });
    }

    // Update the appropriate pipeline state
    if (pipeline === 'scan' && pipelineState.scan) {
      pipelineState.scan.currentStep = stepIndex;
      pipelineState.scan.currentStatus = status;
      pipelineState.scan.lastUpdated = new Date().toISOString();
      pipelineState.scan.isActive = stepIndex >= 0 && status === 'active';

      console.log(`📊 ✅ Pipeline State Updated (Frontend): SCAN`);
      console.log(`   Step: ${stepIndex}, Name: ${stepName}, Status: ${status}`);
      console.log(`   Current pipelineState.scan:`, pipelineState.scan);
    } else if (pipeline === 'upload' && pipelineState.upload) {
      pipelineState.upload.currentStep = stepIndex;
      pipelineState.upload.currentStatus = status;
      pipelineState.upload.lastUpdated = new Date().toISOString();
      pipelineState.upload.isActive = stepIndex >= 0 && status === 'active';

      console.log(`📊 ✅ Pipeline State Updated (Frontend): UPLOAD`);
      console.log(`   Step: ${stepIndex}, Name: ${stepName}, Status: ${status}`);
      console.log(`   Current pipelineState.upload:`, pipelineState.upload);
    }

    res.json({ success: true, message: 'Pipeline state updated', state: pipelineState });
  } catch (error) {
    console.error('Error updating pipeline state:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/pipeline/debug
 * Debug endpoint to see current pipeline state (no processing)
 */
app.get('/api/pipeline/debug', (req, res) => {
  console.log('📋 Pipeline debug request - current state:', pipelineState);
  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    debug: {
      pipelineState: pipelineState,
      scanPipelineDefinition: SCAN_PIPELINE,
      uploadPipelineDefinition: UPLOAD_PIPELINE
    }
  });
});

/**
 * GET /api/pipeline/status
 * Returns both pipeline states with detailed information
 */
app.get('/api/pipeline/status', (req, res) => {
  const scanState = pipelineState.scan;
  const uploadState = pipelineState.upload;

  const scanProgressPercent = scanState.isActive && scanState.currentStep >= 0 ? ((scanState.currentStep + 1) / SCAN_PIPELINE.steps.length) * 100 : 0;
  const uploadProgressPercent = uploadState.isActive && uploadState.currentStep >= 0 ? ((uploadState.currentStep + 1) / UPLOAD_PIPELINE.steps.length) * 100 : 0;

  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    scan: {
      isRunning: scanState.isActive && scanState.currentStep >= 0,
      currentStep: scanState.currentStep,
      currentStepName: scanState.currentStep >= 0 ? SCAN_PIPELINE.steps[scanState.currentStep].name : 'Not started',
      currentStatus: scanState.currentStatus,
      progressPercent: Math.round(scanProgressPercent),
      lastUpdated: scanState.lastUpdated
    },
    upload: {
      isRunning: uploadState.isActive && uploadState.currentStep >= 0,
      currentStep: uploadState.currentStep,
      currentStepName: uploadState.currentStep >= 0 ? UPLOAD_PIPELINE.steps[uploadState.currentStep].name : 'Not started',
      currentStatus: uploadState.currentStatus,
      progressPercent: Math.round(uploadProgressPercent),
      lastUpdated: uploadState.lastUpdated
    }
  });
});

/**
 * GET /api/pipeline/active-status
 * Returns simplified active status from both pipelines
 * Includes activeStatus with values like: authenticating, capturing, processing, downloading
 */
app.get('/api/pipeline/active-status', (req, res) => {
  const scanState = pipelineState.scan;
  const uploadState = pipelineState.upload;

  // Map pipeline step indices to human-readable active statuses
  const scanStatusMap = {
    0: 'authenticating',
    1: 'capturing',
    2: 'processing',
    3: 'downloading'
  };

  const uploadStatusMap = {
    0: 'authenticating',
    1: 'uploading',
    2: 'processing',
    3: 'downloading',
    4: 'uploading'
  };

  // Get active status for scan pipeline
  let scanActiveStatus = null;
  if (scanState.isActive && scanState.currentStep >= 0 && scanState.currentStep < 4) {
    scanActiveStatus = scanStatusMap[scanState.currentStep];
  }

  // Get active status for upload pipeline
  let uploadActiveStatus = null;
  if (uploadState.isActive && uploadState.currentStep >= 0 && uploadState.currentStep < 5) {
    uploadActiveStatus = uploadStatusMap[uploadState.currentStep];
  }

  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    activeStatus: {
      scan: {
        isRunning: scanState.isActive && scanState.currentStep >= 0,
        status: scanActiveStatus, // 'authenticating', 'capturing', 'processing', 'downloading', or null
        stepName: scanState.currentStep >= 0 ? SCAN_PIPELINE.steps[scanState.currentStep]?.name : null,
        stepIndex: scanState.currentStep
      },
      upload: {
        isRunning: uploadState.isActive && uploadState.currentStep >= 0,
        status: uploadActiveStatus, // 'authenticating', 'uploading', 'processing', 'downloading', or null
        stepName: uploadState.currentStep >= 0 ? UPLOAD_PIPELINE.steps[uploadState.currentStep]?.name : null,
        stepIndex: uploadState.currentStep
      }
    }
  });
});

/**
 * POST /api/pipeline/reset
 * Reset pipeline state to initial pending status
 */
app.post('/api/pipeline/reset', (req, res) => {
  const { type } = req.body; // 'scan', 'upload', or 'both'

  if (type === 'scan' || type === 'both') {
    pipelineState.scan = {
      isActive: false,
      currentStep: -1,
      currentStatus: 'pending',
      lastUpdated: null
    };
  }

  if (type === 'upload' || type === 'both') {
    pipelineState.upload = {
      isActive: false,
      currentStep: -1,
      currentStatus: 'pending',
      lastUpdated: null
    };
  }

  res.json({
    success: true,
    message: `Pipeline${type === 'both' ? 's' : ''} reset successfully`,
    timestamp: new Date().toISOString()
  });
});

// Initialize CI4 Upload Watcher
const ci4UploadWatcher = new CI4UploadWatcher();
ci4UploadWatcher.startWatching();

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected');

  // Handle turntable port listing request
  socket.on('list-ports', () => {
    console.log('Client requested turntable port list');
    arduinoMonitor.checkPorts();
  });

  // Handle turntable command requests
  socket.on('turntable-command', (data) => {
    console.log('🎠 SERVER: Received turntable command:', data.command);
    console.log('🎠 SERVER: Arduino monitor exists:', !!arduinoMonitor);
    console.log('🎠 SERVER: Arduino monitor connected:', arduinoMonitor.isConnected);

    const success = arduinoMonitor.sendCommand(data.command);
    console.log('🎠 SERVER: Command send result:', success);

    // Send response back to client
    socket.emit('turntable-command-response', {
      command: data.command,
      success: success,
      message: success ? 'Command sent successfully' : 'Failed to send command'
    });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  if (automation) {
    await automation.close();
  }
  process.exit(0);
});

const PORT = config.PORT || 3002;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});