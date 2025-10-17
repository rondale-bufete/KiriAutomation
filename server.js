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

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

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

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected');

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