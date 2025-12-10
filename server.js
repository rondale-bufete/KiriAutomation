// server.js - COMPLETE FILE WITH ALL FIXES
// Part 1: Imports, Setup, and Configuration

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

// Expose io globally for other modules
global.io = io;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Ensure required directories exist
const downloadsDir = path.join(__dirname, 'downloads');
fs.ensureDirSync(downloadsDir);

const uploadsDir = path.join(__dirname, 'uploads');
fs.ensureDirSync(uploadsDir);

// Serve static files
app.use('/downloads', express.static('downloads'));
app.use('/extracted', express.static('extracted'));
app.use('/uploads', express.static('uploads'));

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

// Configure multer for CI4 uploads
const ci4Storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const ci4UploadDir = path.join(__dirname, 'uploads');
    fs.ensureDirSync(ci4UploadDir);
    cb(null, ci4UploadDir);
  },
  filename: (req, file, cb) => {
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

// Make automation accessible globally
global.automation = null;

// === PIPELINE STATUS MANAGEMENT (FIXED) ===

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

// Progress event to step mapping (FIXED)
const PROGRESS_STEP_MAP = {
  'login': 0,
  'upload': 1,
  'processing': 2,
  'download': 3,
  'auto-upload': 4,
  'complete': -1
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

// FIXED: Global flag to track which pipeline is currently active
let activePipelineType = null; // 'scan' or 'upload'

// Configuration for VPS, CI4, and Blynk
const VPS_CONFIG = {
  baseUrl: config.VPS_BASE_URL || 'http://localhost:8080',
  apiKey: config.VPS_API_KEY || 'mysecret_api_key@123this_is_a_secret_key_to_access_the_php_system'
};

const CI4_CONFIG = {
  baseUrl: config.CI4_BASE_URL || 'http://localhost:8080',
  apiKey: config.CI4_API_KEY || 'kiri-automation-ci4-secret-key-2024'
};

const BLYNK_CONFIG = {
  server: 'blynk.cloud',
  token: '36YSJZ3GgnyvR56BHz3ihV5BaEoZOeKd'
};

// === HELPER FUNCTIONS ===

/**
 * FIXED: Update pipeline state with proper tracking
 */
function updatePipelineState(step, message, explicitPipeline = null) {
  try {
    const stepIndex = PROGRESS_STEP_MAP[step];

    console.log(`📊 updatePipelineState called:`, {
      step,
      stepIndex,
      message,
      explicitPipeline,
      activePipelineType
    });

    let pipeline = explicitPipeline || activePipelineType || 'upload';

    if (!explicitPipeline && !activePipelineType) {
      if (message && (
        message.includes('turntable') ||
        message.includes('artifact') ||
        message.includes('macro') ||
        message.includes('capturing photos')
      )) {
        pipeline = 'scan';
      } else if (message && (
        message.includes('uploading files') ||
        message.includes('CI4') ||
        message.includes('media files')
      )) {
        pipeline = 'upload';
      }
    }



    if (stepIndex !== undefined && stepIndex >= -1) {
      const targetState = pipelineState[pipeline];

      if (!targetState) {
        console.error(`❌ Pipeline type '${pipeline}' not found in pipelineState`);
        return;
      }

      if (stepIndex === -1) {
        targetState.currentStatus = 'completed';
        targetState.isActive = false;
        activePipelineType = null;
        console.log(`✅ Pipeline ${pipeline} marked as COMPLETED`);
      } else {
        targetState.isActive = true;
        targetState.currentStep = stepIndex;
        targetState.currentStatus = 'active';
        targetState.lastUpdated = new Date().toISOString();

        const pipelineDef = pipeline === 'scan' ? SCAN_PIPELINE : UPLOAD_PIPELINE;
        const stepName = pipelineDef.steps[stepIndex]?.name || 'Unknown Step';

        console.log(`✅ Pipeline ${pipeline.toUpperCase()} updated: Step ${stepIndex} (${stepName}) - Status: ${targetState.currentStatus}`);
      }
    }
  } catch (error) {
    console.error('❌ Error updating pipeline state:', error.message);
  }
}

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

async function blynkUpdateMotor(state = 'off') {
  const value = String(state).toLowerCase() === 'on' ? 1 : 0;
  const url = `https://${BLYNK_CONFIG.server}/external/api/update?token=${BLYNK_CONFIG.token}&V1=${value}`;

  console.log(`🔌 MOTOR: blynkUpdateMotor called with state=${state}, value=${value}`);

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
      console.error('🔌 MOTOR: Blynk update HTTP error:', response.status, text);
      return { success: false, httpCode: response.status, response: text };
    }

    const text = await response.text();
    return { success: true, httpCode: response.status, response: text };
  } catch (error) {
    console.error('🔌 MOTOR: Blynk update error:', error.message);
    return { success: false, error: error.message };
  }
}

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

/**
 * FIXED: Central helper to broadcast progress with explicit pipeline tracking
 */
function broadcastProgress(step, message, pipelineType = null) {
  try {
    console.log(`📡 broadcastProgress called:`, { step, message, pipelineType });

    if (pipelineType && !activePipelineType) {
      activePipelineType = pipelineType;
      console.log(`📊 Set active pipeline type to: ${pipelineType}`);
    }

    io.emit('progress', { step, message });
    console.log(`📡 Socket.IO progress event emitted`);
  } catch (e) {
    console.error('❌ Error emitting Socket.IO progress event:', e.message);
  }

  sendCI4ProgressUpdate(step, message).catch(err => {
    console.error('❌ Error sending CI4 progress update:', err.message);
  });

  updatePipelineState(step, message, pipelineType);
}

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

    let response;
    if (typeof fetch !== 'undefined') {
      response = await fetch(url, requestOptions);
    } else {
      const fetch = require('node-fetch');
      response = await fetch(url, requestOptions);
    }

    const data = await response.text();

    let jsonData;
    try {
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
    throw error;
  }
}


// Part 2: Main Routes and Endpoints

// === BASIC ROUTES ===

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/motor-test', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'motor-test.html'));
});

app.get('/status', (req, res) => {
  res.json({
    isProcessing: isProcessing,
    automationInitialized: automation !== null
  });
});

// === FILE MANAGEMENT ROUTES ===

app.get('/api/downloads', (req, res) => {
  try {
    const downloadsDir = path.join(__dirname, 'downloads');

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
      .sort((a, b) => new Date(b.created) - new Date(a.created));

    res.json({ success: true, files });
  } catch (error) {
    console.error('Error listing downloads:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/extracted', async (req, res) => {
  try {
    const extractedFiles = await zipExtractor.getExtractedFiles();
    res.json({ success: true, files: extractedFiles });
  } catch (error) {
    console.error('Error listing extracted files:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/open-folder', async (req, res) => {
  try {
    const { folderName } = req.body;

    if (!folderName) {
      return res.status(400).json({ success: false, error: 'Folder name is required' });
    }

    const folderPath = path.join(__dirname, 'extracted', folderName);

    if (!fs.existsSync(folderPath)) {
      return res.status(404).json({ success: false, error: 'Folder not found' });
    }

    const { spawn } = require('child_process');
    const os = require('os');
    const platform = os.platform();

    if (platform === 'win32') {
      const windowsPath = folderPath.replace(/\//g, '\\');
      const batchFilePath = path.join(__dirname, 'open-folder.bat');

      const child = spawn(batchFilePath, [`"${windowsPath}"`], {
        detached: true,
        stdio: 'ignore',
        shell: true,
        cwd: __dirname
      });

      child.on('error', (error) => {
        console.error('Batch file execution failed:', error);
        const explorerChild = spawn('explorer', [windowsPath], {
          detached: true,
          stdio: 'ignore'
        });
        explorerChild.unref();
      });

      child.unref();
    } else if (platform === 'darwin') {
      const child = spawn('open', [folderPath], {
        detached: true,
        stdio: 'ignore'
      });
      child.unref();
    } else {
      const child = spawn('xdg-open', [folderPath], {
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

app.post('/api/clear-uploads', async (req, res) => {
  try {
    const uploadsDir = path.join(__dirname, 'uploads');

    if (!fs.existsSync(uploadsDir)) {
      return res.json({
        success: true,
        message: 'Uploads directory does not exist',
        deletedCount: 0
      });
    }

    const files = await fs.readdir(uploadsDir);
    let deletedCount = 0;
    const errors = [];

    for (const file of files) {
      try {
        const filePath = path.join(uploadsDir, file);
        const stats = await fs.stat(filePath);

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

app.post('/reset', async (req, res) => {
  try {
    if (automation) {
      console.log('Resetting automation instance...');
      await automation.close();
      automation = null;
    }
    isProcessing = false;
    activePipelineType = null;
    res.json({ success: true, message: 'Processing state reset successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// === MAIN UPLOAD ENDPOINT (FIXED) ===

app.post('/upload', upload.array('files', 150), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  if (isProcessing) {
    return res.status(409).json({ error: 'Another batch is currently being processed' });
  }

  isProcessing = true;

  try {
    activePipelineType = 'upload';

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
      browserType: config.BROWSER_TYPE || 'chromium',
      executablePath: config.BROWSER_EXECUTABLE_PATH || null
    });
    await automation.init();

    global.automation = automation;

    broadcastProgress('login', 'Logging in to Kiri Engine...', 'upload');

    if (!config.KIRI_EMAIL || !config.KIRI_PASSWORD) {
      isProcessing = false;
      activePipelineType = null;
      return res.status(500).json({ error: 'Kiri Engine credentials not found in configuration.' });
    }

    const loginResult = await automation.login(config.KIRI_EMAIL, config.KIRI_PASSWORD);
    if (!loginResult.success) {
      isProcessing = false;
      activePipelineType = null;
      return res.status(500).json({ error: loginResult.message });
    }

    broadcastProgress('upload', `Uploading ${req.files.length} files...`, 'upload');

    const filePaths = req.files.map(file => file.path);
    const uploadResult = await automation.uploadMultipleFiles(filePaths);

    if (!uploadResult.success) {
      isProcessing = false;
      activePipelineType = null;
      for (const uploadedFile of req.files) {
        await fs.remove(uploadedFile.path);
      }
      return res.status(500).json({ error: `Upload failed: ${uploadResult.message}` });
    }

    broadcastProgress('processing', 'Processing photogrammetry with multiple images...', 'upload');

    await blynkUpdateMotor('off');

    const exportResult = await automation.waitForProjectCompletionAndExport();
    if (!exportResult.success) {
      isProcessing = false;
      activePipelineType = null;
      for (const uploadedFile of req.files) {
        await fs.remove(uploadedFile.path);
      }
      return res.status(500).json({ error: exportResult.message });
    }

    broadcastProgress('download', '3D model download completed!', 'upload');

    for (const uploadedFile of req.files) {
      await fs.remove(uploadedFile.path);
    }

    console.log('Closing automation instance after successful processing...');
    try {
      await automation.close();
      automation = null;
      global.automation = null;
    } catch (e) {
      console.log('Error closing automation:', e.message);
    }

    isProcessing = false;
    activePipelineType = null;

    res.json({
      success: true,
      message: `${req.files.length} files processed and downloaded successfully`,
      fileCount: req.files.length
    });

  } catch (error) {
    isProcessing = false;
    activePipelineType = null;

    if (automation) {
      console.log('Closing automation instance due to error...');
      try {
        await automation.close();
        automation = null;
        global.automation = null;
      } catch (e) {
        console.log('Error closing automation during error cleanup:', e.message);
      }
    }

    if (req.files) {
      for (const uploadedFile of req.files) {
        await fs.remove(uploadedFile.path);
      }
    }
    broadcastProgress('error', `Error: ${error.message}`, 'upload');
    res.status(500).json({ error: error.message });
  }
});

// === MOTOR CONTROL ROUTES ===

app.get('/api/motor/status', async (req, res) => {
  try {
    const result = {
      motor_status: 'Unknown',
      device_status: 'Unknown',
      timestamp: new Date().toISOString()
    };

    const v1Status = await blynkApiGet('get', '&V1');
    if (v1Status !== null) {
      result.motor_status = parseInt(v1Status, 10) === 1 ? 'ON' : 'OFF';
    }

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

const motorControlHandler = async (req, res) => {
  try {
    const { state } = req.params;
    const normalized = String(state || 'off').toLowerCase() === 'on' ? 'on' : 'off';

    // console.log(`🔌 MOTOR API: Received motor control request (${req.method}) for state: ${normalized}`);

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
    console.error('🔌 MOTOR API: Motor control API error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

app.get('/api/motor/control/:state', motorControlHandler);
app.post('/api/motor/control/:state', motorControlHandler);

// === CI4 UPLOAD ROUTES ===

app.post('/api/ci4/upload', ci4Upload.any(), async (req, res) => {
  const apiKey = req.headers['x-api-key'] || req.body.api_key || req.query.api_key;
  const expectedApiKey = config.CI4_API_KEY || 'kiri-automation-ci4-secret-key-2024';

  if (!apiKey || apiKey !== expectedApiKey) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized - Invalid or missing API key'
    });
  }

  const uploadedFiles = Array.isArray(req.files) ? req.files : [];

  if (!uploadedFiles || uploadedFiles.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'No files uploaded'
    });
  }

  try {
    console.log(`📤 CI4 Upload: Saved ${uploadedFiles.length} file(s) to uploads directory`);

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

app.post('/api/close-automation', async (req, res) => {
  try {
    if (automation && typeof automation.close === 'function') {
      console.log('API /api/close-automation: Closing automation instance...');
      await automation.close();
      automation = null;
      global.automation = null;
      activePipelineType = null;
      return res.json({ success: true, message: 'Automation instance closed.' });
    }

    return res.json({ success: true, message: 'No active automation instance to close.' });
  } catch (error) {
    console.error('Error in /api/close-automation:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});


// Part 3: Automation and Pipeline API Routes

// === AUTOMATION ROUTES (FIXED) ===

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

    activePipelineType = 'scan';

    broadcastProgress('login', 'Logging in to Kiri Engine...', 'scan');

    if (automation) {
      console.log('Closing existing automation instance...');
      try {
        await automation.close();
      } catch (e) {
        console.log('Error closing existing automation:', e.message);
      }
      automation = null;
    }

    console.log('Creating new automation instance for login...');
    automation = new KiriEngineAutomation({
      headless: config.NODE_ENV === 'production',
      sessionPath: './session',
      browserType: config.BROWSER_TYPE || 'chromium',
      executablePath: config.BROWSER_EXECUTABLE_PATH || null
    });

    await automation.init();

    console.log('Attempting Kiri Engine login via automation...');
    const loginResult = await automation.login(config.KIRI_EMAIL, config.KIRI_PASSWORD);

    if (loginResult.success) {
      console.log('Kiri Engine login successful via automation');

      broadcastProgress('upload', 'Capturing photos with turntable rotation...', 'scan');

      console.log('Starting page reload cycle after successful login...');
      automation.startPageReloadCycle();

      res.json({
        success: true,
        message: 'Successfully logged into Kiri Engine via automation - monitoring started'
      });
    } else {
      console.log('Kiri Engine login failed:', loginResult.message);
      activePipelineType = null;
      res.status(401).json({
        success: false,
        message: loginResult.message
      });
    }

  } catch (error) {
    console.error('Kiri Engine login error:', error);
    activePipelineType = null;
    res.status(500).json({
      success: false,
      message: `Login failed: ${error.message}`
    });
  }
});

app.post('/api/stop-monitoring', async (req, res) => {
  try {
    console.log('Stop monitoring endpoint called');

    if (automation) {
      console.log('Stopping page reload cycle...');
      automation.stopPageReloadCycle();
      activePipelineType = null;
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

app.post('/api/trigger-download', async (req, res) => {
  try {
    console.log('Trigger download endpoint called');

    if (!automation || !automation.page) {
      return res.status(404).json({
        success: false,
        message: 'Automation not initialized'
      });
    }

    const isLoggedIn = await automation.checkLoginStatus();
    if (!isLoggedIn) {
      return res.status(401).json({
        success: false,
        message: 'Not logged in'
      });
    }

    console.log('Navigating to projects page...');
    await automation.page.goto('https://www.kiriengine.app/webapp/mymodel', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await automation.page.waitForTimeout(2000);

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

app.get('/api/check-processes', async (req, res) => {
  try {
    console.log('Checking for new processes...');

    if (!automation || !automation.page) {
      return res.json({
        hasNewProcesses: false,
        message: 'Automation not initialized'
      });
    }

    const isLoggedIn = await automation.checkLoginStatus();
    if (!isLoggedIn) {
      return res.json({
        hasNewProcesses: false,
        message: 'Not logged in'
      });
    }

    console.log('Navigating to projects page...');
    await automation.page.goto('https://www.kiriengine.app/webapp/mymodel', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await automation.page.waitForTimeout(2000);

    const processingElements = await automation.page.$$('div[data-v-d562c7af] .status-mask .status span');
    const projectCards = await automation.page.$$('div[data-v-d562c7af].model-cover, .model-cover');

    let hasNewProcesses = false;
    let processStatus = 'No processing projects found';

    if (processingElements.length > 0) {
      for (const element of processingElements) {
        const statusText = await automation.page.evaluate(el => el.textContent, element);

        if (statusText && statusText.trim() === 'Processing..') {
          hasNewProcesses = true;
          processStatus = 'Found project with "Processing.." status';
          break;
        }
      }
    }

    if (!hasNewProcesses && projectCards.length > 0) {
      processStatus = `Found ${projectCards.length} completed projects`;
    }

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

// === PIPELINE STATUS API ENDPOINTS (FIXED) ===

app.post('/api/update-pipeline-state', (req, res) => {
  try {
    const { pipeline, stepIndex, stepName, status, message } = req.body;

    console.log(`📩 Received pipeline update from frontend:`, { pipeline, stepIndex, stepName, status, message });

    if (!pipeline || stepIndex === undefined) {
      return res.status(400).json({ success: false, error: 'Missing pipeline or stepIndex' });
    }

    if (stepIndex >= 0 && status === 'active' && !activePipelineType) {
      activePipelineType = pipeline;
      console.log(`📊 Set active pipeline type to: ${pipeline} (from frontend)`);
    }

    if (status === 'completed' && activePipelineType === pipeline) {
      activePipelineType = null;
      console.log(`📊 Cleared active pipeline type (pipeline completed)`);
    }

    if (pipeline === 'scan' && pipelineState.scan) {
      pipelineState.scan.currentStep = stepIndex;
      pipelineState.scan.currentStatus = status;
      pipelineState.scan.lastUpdated = new Date().toISOString();
      pipelineState.scan.isActive = stepIndex >= 0 && (status === 'active' || status === 'pending');

      console.log(`✅ Pipeline State Updated (Frontend): SCAN - Step: ${stepIndex}, Name: ${stepName}, Status: ${status}`);
    } else if (pipeline === 'upload' && pipelineState.upload) {
      pipelineState.upload.currentStep = stepIndex;
      pipelineState.upload.currentStatus = status;
      pipelineState.upload.lastUpdated = new Date().toISOString();
      pipelineState.upload.isActive = stepIndex >= 0 && (status === 'active' || status === 'pending');

      console.log(`✅ Pipeline State Updated (Frontend): UPLOAD - Step: ${stepIndex}, Name: ${stepName}, Status: ${status}`);
    }

    res.json({ success: true, message: 'Pipeline state updated', state: pipelineState });
  } catch (error) {
    console.error('❌ Error updating pipeline state:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/pipeline/debug', (req, res) => {
  console.log('📋 Pipeline debug request - current state:', pipelineState);
  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    debug: {
      pipelineState: pipelineState,
      activePipelineType: activePipelineType,
      scanPipelineDefinition: SCAN_PIPELINE,
      uploadPipelineDefinition: UPLOAD_PIPELINE
    }
  });
});

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

app.get('/api/pipeline/active-status', (req, res) => {
  const scanState = pipelineState.scan;
  const uploadState = pipelineState.upload;



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

  let scanActiveStatus = null;
  let scanStepName = null;
  if (scanState.isActive && scanState.currentStep >= 0 && scanState.currentStep < SCAN_PIPELINE.steps.length) {
    scanActiveStatus = scanStatusMap[scanState.currentStep];
    scanStepName = SCAN_PIPELINE.steps[scanState.currentStep].name;
  }

  let uploadActiveStatus = null;
  let uploadStepName = null;
  if (uploadState.isActive && uploadState.currentStep >= 0 && uploadState.currentStep < UPLOAD_PIPELINE.steps.length) {
    uploadActiveStatus = uploadStatusMap[uploadState.currentStep];
    uploadStepName = UPLOAD_PIPELINE.steps[uploadState.currentStep].name;
  }

  const response = {
    success: true,
    timestamp: new Date().toISOString(),
    activeStatus: {
      scan: {
        isRunning: scanState.isActive && scanState.currentStep >= 0,
        status: scanActiveStatus,
        stepName: scanStepName,
        stepIndex: scanState.currentStep
      },
      upload: {
        isRunning: uploadState.isActive && uploadState.currentStep >= 0,
        status: uploadActiveStatus,
        stepName: uploadStepName,
        stepIndex: uploadState.currentStep
      }
    }
  };


  res.json(response);
});

app.post('/api/pipeline/reset', (req, res) => {
  const { type } = req.body;

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

  if (type === 'both' ||
    (type === 'scan' && activePipelineType === 'scan') ||
    (type === 'upload' && activePipelineType === 'upload')) {
    activePipelineType = null;
    console.log(`📊 Cleared active pipeline type during reset`);
  }

  res.json({
    success: true,
    message: `Pipeline${type === 'both' ? 's' : ''} reset successfully`,
    timestamp: new Date().toISOString()
  });
});


// Part 4: Remote Control Routes and CI4 Upload Watcher

// === REMOTE CONTROL ROUTES (FIXED) ===

app.post('/api/remote-trigger', async (req, res) => {
  try {
    const { action, token, data } = req.body;

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

app.post('/api/remote/start-live-scanning', async (req, res) => {
  try {
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

app.post('/api/remote/start-automated-scanning', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'] || req.body.api_key || req.query.api_key;
    const expectedApiKey = config.CI4_API_KEY || 'kiri-automation-ci4-secret-key-2024';

    if (!apiKey || apiKey !== expectedApiKey) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized - Invalid API key'
      });
    }

    console.log('🌐 CI4 Remote: Start Automated Scanning request received');

    res.json({
      success: true,
      message: 'Automated scanning started successfully',
      timestamp: new Date().toISOString(),
      status: 'scanning-in-progress'
    });

    (async () => {
      try {
        activePipelineType = 'scan';

        if (automation) {
          console.log('Closing existing automation instance...');
          try {
            await automation.close();
          } catch (e) {
            console.log('Error closing existing automation:', e.message);
          }
          automation = null;
        }

        console.log('Creating new automation instance for remote scan...');
        automation = new KiriEngineAutomation({
          headless: config.NODE_ENV === 'production',
          sessionPath: './session',
          browserType: config.BROWSER_TYPE || 'chromium',
          executablePath: config.BROWSER_EXECUTABLE_PATH || null
        });

        await automation.init();
        global.automation = automation;

        broadcastProgress('login', 'Logging in to Kiri Engine...', 'scan');

        if (!config.KIRI_EMAIL || !config.KIRI_PASSWORD) {
          throw new Error('Kiri Engine credentials not found in configuration');
        }

        const loginResult = await automation.login(config.KIRI_EMAIL, config.KIRI_PASSWORD);
        if (!loginResult.success) {
          throw new Error(loginResult.message);
        }

        console.log('✅ Kiri Engine login successful via remote trigger');

        broadcastProgress('upload', 'Capturing photos with turntable rotation...', 'scan');

        // console.log('🔌 MOTOR: Turning ON motor - Starting Capturing Artifact phase');
        try {
          await blynkUpdateMotor('on');
          console.log('🔌 MOTOR: Motor turned ON successfully');
        } catch (motorError) {
          console.error('🔌 MOTOR: Error turning on motor:', motorError.message);
        }

        console.log('📱 WEBHOOK: Triggering macro for photo capture...');
        try {
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

        if (global.io) {
          global.io.emit('remote-scan-trigger', {
            message: 'Remote automated scan triggered from CI4',
            timestamp: new Date().toISOString(),
            source: 'ci4-api'
          });
          console.log('✅ Remote scan trigger event emitted to connected clients');
        }

        console.log('Starting page reload cycle after successful login...');
        automation.startPageReloadCycle();

        console.log('✅ Server-side automation is now running');

      } catch (automationError) {
        console.error('❌ Error in server-side automation trigger:', automationError);

        broadcastProgress('error', `Automation error: ${automationError.message}`, 'scan');

        if (automation) {
          try {
            await automation.close();
          } catch (e) {
            console.log('Error closing automation after error:', e.message);
          }
          automation = null;
        }

        activePipelineType = null;
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

app.get('/api/remote/scanning-status', async (req, res) => {
  try {
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
      activePipelineType: activePipelineType,
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

app.post('/api/remote/stop-scanning', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'] || req.body.api_key || req.query.api_key;
    const expectedApiKey = config.CI4_API_KEY || 'kiri-automation-ci4-secret-key-2024';

    if (!apiKey || apiKey !== expectedApiKey) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized - Invalid API key'
      });
    }

    console.log('🛑 CI4 Remote: Stop scanning request received');

    if (automation) {
      try {
        automation.stopPageReloadCycle();
        console.log('✅ Page reload monitoring stopped');
      } catch (e) {
        console.log('Error stopping monitoring:', e.message);
      }
    }

    activePipelineType = null;

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

// === CI4 UPLOADS FILE WATCHER (FIXED) ===

class CI4UploadWatcher {
  constructor() {
    this.uploadsDir = path.join(__dirname, 'uploads');
    this.watcher = null;
    this.processingFiles = new Set();
    this.knownFiles = new Set();
    this.processingTimeout = null;
    this.batchDelay = 2000;

    fs.ensureDirSync(this.uploadsDir);
    this.initializeKnownFiles();

    console.log('📁 CI4 Upload Watcher initialized');
    console.log('📁 Watching directory:', this.uploadsDir);
  }

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

  isValidFile(filename) {
    const allowedExtensions = /\.(jpeg|jpg|png|mp4|mov|avi)$/i;
    return allowedExtensions.test(filename);
  }

  startWatching() {
    console.log('📁 Starting to watch uploads directory for CI4 files...');

    this.watcher = fs.watch(this.uploadsDir, async (eventType, filename) => {
      if (!filename) return;

      const filePath = path.join(this.uploadsDir, filename);

      if (eventType === 'rename' && fs.existsSync(filePath)) {
        const stats = await fs.stat(filePath);

        if (stats.isFile() && this.isValidFile(filename) && !this.knownFiles.has(filename)) {
          console.log('📁 New CI4 file detected:', filename);
          this.knownFiles.add(filename);

          if (this.processingTimeout) {
            clearTimeout(this.processingTimeout);
          }

          this.processingTimeout = setTimeout(() => {
            this.processNewFiles();
          }, this.batchDelay);
        }
      }
    });

    console.log('📁 CI4 Upload Watcher is now active');
  }

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

      newFiles.forEach(file => this.processingFiles.add(file));

      await this.triggerAutomation(newFiles);

    } catch (error) {
      console.error('📁 Error processing new files:', error);
    }
  }

  async triggerAutomation(files) {
    isProcessing = true;

    try {
      activePipelineType = 'upload';

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

      global.automation = automation;

      broadcastProgress('login', 'Logging in to Kiri Engine...', 'upload');

      if (!config.KIRI_EMAIL || !config.KIRI_PASSWORD) {
        isProcessing = false;
        activePipelineType = null;
        throw new Error('Kiri Engine credentials not found in configuration');
      }

      const loginResult = await automation.login(config.KIRI_EMAIL, config.KIRI_PASSWORD);
      if (!loginResult.success) {
        isProcessing = false;
        activePipelineType = null;
        throw new Error(loginResult.message);
      }

      broadcastProgress('upload', `Uploading ${files.length} files from CI4...`, 'upload');

      const filePaths = files.map(file => path.join(this.uploadsDir, file));
      const uploadResult = await automation.uploadMultipleFiles(filePaths);

      if (!uploadResult.success) {
        isProcessing = false;
        activePipelineType = null;
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

      broadcastProgress('processing', 'Processing photogrammetry with multiple images...', 'upload');

      // console.log('🔌 MOTOR: Turning OFF motor for Processing Photogrammetry step...');
      await blynkUpdateMotor('off');

      const exportResult = await automation.waitForProjectCompletionAndExport();
      if (!exportResult.success) {
        isProcessing = false;
        activePipelineType = null;
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

      broadcastProgress('download', '3D model download completed!', 'upload');
      broadcastProgress('auto-upload', 'Auto-uploading GLB file to VPS...', 'upload');

      for (const file of files) {
        try {
          await fs.remove(path.join(this.uploadsDir, file));
          this.processingFiles.delete(file);
          this.knownFiles.delete(file);
        } catch (e) {
          console.log('Error removing file:', e.message);
        }
      }

      console.log('Closing automation instance after successful processing...');
      try {
        await automation.close();
        automation = null;
        global.automation = null;
      } catch (e) {
        console.log('Error closing automation:', e.message);
      }

      isProcessing = false;
      activePipelineType = null;
      broadcastProgress('complete', 'Processing completed successfully!', 'upload');
      console.log('✅ CI4 Upload Process Completed Successfully!');

    } catch (error) {
      isProcessing = false;
      activePipelineType = null;

      if (automation) {
        console.log('Closing automation instance due to error...');
        try {
          await automation.close();
          automation = null;
          global.automation = null;
        } catch (e) {
          console.log('Error closing automation during error cleanup:', e.message);
        }
      }

      files.forEach(file => this.processingFiles.delete(file));

      broadcastProgress('error', `Error: ${error.message}`, 'upload');
      console.error('❌ CI4 Upload Processing Error:', error);
    }
  }

  stopWatching() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      console.log('📁 CI4 Upload Watcher stopped');
    }
  }
}


// Part 5: VPS Routes, Arduino Monitor, Socket.IO, and Server Initialization

// === VPS PROXY ROUTES ===

app.get('/api/test-server', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running with updated code',
    timestamp: new Date().toISOString(),
    activePipelineType: activePipelineType
  });
});

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

app.post('/api/vps/upload-file', async (req, res) => {
  try {
    const upload = multer({
      storage: multer.memoryStorage(),
      limits: {
        fileSize: 200 * 1024 * 1024,
      },
      fileFilter: (req, file, cb) => {
        if (file.originalname.toLowerCase().endsWith('.glb')) {
          cb(null, true);
        } else {
          cb(new Error('Only .glb files are allowed!'), false);
        }
      }
    });

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

        const FormData = require('form-data');
        const formData = new FormData();

        const glbMimeType = req.file.originalname.toLowerCase().endsWith('.glb')
          ? 'model/gltf-binary'
          : (req.file.mimetype || 'application/octet-stream');

        formData.append('file', req.file.buffer, {
          filename: req.file.originalname,
          contentType: glbMimeType,
          knownLength: req.file.size
        });

        formData.append('api_key', VPS_CONFIG.apiKey);

        const url = `${VPS_CONFIG.baseUrl}/remote-upload/drop-file`;
        const formHeaders = formData.getHeaders();

        let fetchFunction;
        try {
          const nodeFetch = require('node-fetch');

          if (typeof nodeFetch === 'function') {
            fetchFunction = nodeFetch;
          } else if (typeof nodeFetch === 'object' && nodeFetch.default) {
            fetchFunction = nodeFetch.default;
          } else {
            return res.status(500).json({
              success: false,
              error: 'Unknown node-fetch format'
            });
          }
        } catch (e) {
          return res.status(500).json({
            success: false,
            error: 'node-fetch import failed',
            message: e.message
          });
        }

        const response = await fetchFunction(url, {
          method: 'POST',
          headers: {
            'X-API-Key': VPS_CONFIG.apiKey,
            ...formHeaders
          },
          body: formData
        });

        const data = await response.text();

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

// === ARDUINO MONITOR ===

class ArduinoMonitor {
  constructor() {
    this.port = null;
    this.isConnected = false;
    this.portPath = null;
  }

  async checkPorts() {
    try {
      console.log('🎠 Checking available serial ports...');

      if (global.io) {
        global.io.emit('ports-list', {
          message: 'Serial port scanning not available in this environment',
          ports: []
        });
      }
    } catch (error) {
      console.error('🎠 Error checking ports:', error);
    }
  }

  sendCommand(command) {
    console.log('🎠 ARDUINO MONITOR: sendCommand called with:', command);
    console.log('🎠 ARDUINO MONITOR: isConnected:', this.isConnected);

    if (!this.isConnected || !this.port) {
      console.log('🎠 ARDUINO MONITOR: Not connected, cannot send command');
      return false;
    }

    try {
      console.log('🎠 ARDUINO MONITOR: Command would be sent:', command);
      return true;
    } catch (error) {
      console.error('🎠 ARDUINO MONITOR: Error sending command:', error);
      return false;
    }
  }

  async connect(portPath) {
    try {
      console.log('🎠 Attempting to connect to port:', portPath);
      this.portPath = portPath;
      this.isConnected = true;
      console.log('🎠 Successfully connected to port');
      return true;
    } catch (error) {
      console.error('🎠 Connection error:', error);
      this.isConnected = false;
      return false;
    }
  }

  disconnect() {
    try {
      if (this.port) {
        this.port = null;
      }
      this.isConnected = false;
      this.portPath = null;
      console.log('🎠 Disconnected from serial port');
    } catch (error) {
      console.error('🎠 Disconnect error:', error);
    }
  }
}

const arduinoMonitor = new ArduinoMonitor();
global.arduinoMonitor = arduinoMonitor;

console.log('✅ Arduino Monitor initialized and available globally');

// === INITIALIZE ZIP EXTRACTOR ===

const ZipExtractor = require('./zip-extractor');
const zipExtractor = new ZipExtractor();
zipExtractor.startWatching();

// === INITIALIZE CI4 UPLOAD WATCHER ===

const ci4UploadWatcher = new CI4UploadWatcher();
ci4UploadWatcher.startWatching();

// === SOCKET.IO CONNECTION HANDLING ===

io.on('connection', (socket) => {
  console.log('Client connected');

  socket.on('list-ports', () => {
    console.log('Client requested turntable port list');
    arduinoMonitor.checkPorts();
  });

  socket.on('turntable-command', (data) => {
    console.log('🎠 SERVER: Received turntable command:', data.command);
    console.log('🎠 SERVER: Arduino monitor exists:', !!arduinoMonitor);
    console.log('🎠 SERVER: Arduino monitor connected:', arduinoMonitor.isConnected);

    const success = arduinoMonitor.sendCommand(data.command);
    console.log('🎠 SERVER: Command send result:', success);

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

// === GRACEFUL SHUTDOWN ===

process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  if (automation) {
    await automation.close();
  }
  activePipelineType = null;
  if (motorState === 'on') {
    await blynkUpdateMotor('off');
  }
  ci4UploadWatcher.stopWatching();
  zipExtractor.stopWatching();
  process.exit(0);
});

// === START SERVER ===

const PORT = config.PORT || 3002;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Pipeline tracking enabled with activePipelineType monitoring`);
  console.log(`Active Pipeline Type: ${activePipelineType || 'None'}`);
});