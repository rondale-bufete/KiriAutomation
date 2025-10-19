// server.js

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const { Server } = require('socket.io');
const http = require('http');
const KiriEngineAutomation = require('./kiri-automation');
const ArduinoPortMonitor = require('./arduino-port-monitor');
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

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Ensure downloads directory exists
const downloadsDir = path.join(__dirname, 'downloads');
fs.ensureDirSync(downloadsDir);

// Serve files from downloads directory
app.use('/downloads', express.static('downloads'));

// Serve files from extracted directory
app.use('/extracted', express.static('extracted'));

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

// Global variables for automation management
let automation = null;
let isProcessing = false;

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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

    // Emit progress update
    io.emit('progress', { step: 'login', message: 'Logging in to Kiri Engine...' });

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
    io.emit('progress', { step: 'upload', message: `Uploading ${req.files.length} files...` });

    // Upload all files at once
    const filePaths = req.files.map(file => file.path);
    io.emit('progress', { step: 'upload', message: `Uploading ${req.files.length} files to Kiri Engine...` });

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
    io.emit('progress', { step: 'processing', message: 'Processing photogrammetry with multiple images...' });

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

    // Emit progress update
    io.emit('progress', { step: 'download', message: '3D model download completed!' });

    // Emit auto-upload progress (the zip-extractor will handle the actual upload)
    io.emit('progress', { step: 'auto-upload', message: 'Auto-uploading GLB file to VPS...' });

    // Clean up uploaded files
    for (const uploadedFile of req.files) {
      await fs.remove(uploadedFile.path);
    }

    // Close automation instance to free up resources
    console.log('Closing automation instance after successful processing...');
    try {
      await automation.close();
      automation = null; // Reset automation instance
    } catch (e) {
      console.log('Error closing automation:', e.message);
    }

    isProcessing = false;
    io.emit('progress', { step: 'complete', message: 'Processing completed successfully!' });

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
    io.emit('progress', { step: 'error', message: `Error: ${error.message}` });
    res.status(500).json({ error: error.message });
  }
});

app.get('/status', (req, res) => {
  res.json({
    isProcessing: isProcessing,
    automationInitialized: automation !== null
  });
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

// Configuration for VPS PHP backend
const VPS_CONFIG = {
  baseUrl: process.env.VPS_PHP_URL || 'https://crca-artifacts-contentmanagement.site',
  apiKey: process.env.VPS_API_KEY || 'mysecret_api_key@123this_is_a_secret_key_to_access_the_php_system'
};

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

// Initialize turntable port monitoring
const arduinoMonitor = new ArduinoPortMonitor(io);

// Initialize zip extractor
const ZipExtractor = require('./zip-extractor');
const zipExtractor = new ZipExtractor();
zipExtractor.startWatching();

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
  if (arduinoMonitor) {
    arduinoMonitor.cleanup();
  }
  process.exit(0);
});

const PORT = config.PORT || 3002;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});