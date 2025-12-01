// zip-extractor.js
const fs = require('fs-extra');
const path = require('path');
const yauzl = require('yauzl');
const FormData = require('form-data');
const config = require('./config');

class ZipExtractor {
    constructor() {
        this.downloadsDir = path.join(__dirname, 'downloads');
        this.extractedDir = path.join(__dirname, 'extracted');
        this.watcher = null;
        this.extractedWatcher = null; // Watcher for extracted folder
        this.processingFiles = new Set(); // Track files being processed to avoid duplicates
        this.knownExtractedFolders = new Set(); // Track known extracted folders to detect new ones

        // VPS Configuration for auto-upload - uses config.js for easy updates
        this.vpsConfig = {
            baseUrl: config.VPS_BASE_URL || 'http://localhost:8080',
            apiKey: config.VPS_API_KEY || 'mysecret_api_key@123this_is_a_secret_key_to_access_the_php_system'
        };

        // Ensure directories exist
        fs.ensureDirSync(this.downloadsDir);
        fs.ensureDirSync(this.extractedDir);

        // Initialize known extracted folders
        this.initializeKnownFolders();

        console.log('📦 ZipExtractor initialized');
        console.log('📦 Downloads directory:', this.downloadsDir);
        console.log('📦 Extracted directory:', this.extractedDir);
        console.log('📦 VPS Auto-upload enabled:', this.vpsConfig.baseUrl);
    }

    /**
     * Initialize the list of known extracted folders
     */
    async initializeKnownFolders() {
        try {
            const folders = await fs.readdir(this.extractedDir);
            for (const folder of folders) {
                const folderPath = path.join(this.extractedDir, folder);
                const stats = await fs.stat(folderPath);
                if (stats.isDirectory()) {
                    this.knownExtractedFolders.add(folder);
                }
            }
            console.log('📦 Initialized known extracted folders:', Array.from(this.knownExtractedFolders));
        } catch (error) {
            console.error('📦 Error initializing known folders:', error);
        }
    }

    /**
     * Start watching the downloads directory for new zip files
     */
    startWatching() {
        console.log('📦 Starting to watch downloads directory for zip files...');

        this.watcher = fs.watch(this.downloadsDir, (eventType, filename) => {
            if (eventType === 'rename' && filename && filename.endsWith('.zip')) {
                const filePath = path.join(this.downloadsDir, filename);

                // Check if file exists and is not being processed
                if (fs.existsSync(filePath) && !this.processingFiles.has(filename)) {
                    console.log('📦 New zip file detected:', filename);
                    this.processZipFile(filePath, filename);
                }
            }
        });

        // Also check for existing zip files on startup
        this.checkExistingZipFiles();

        // Start watching extracted folder for new folders/files
        this.startWatchingExtractedFolder();
    }

    /**
     * Start watching the extracted folder for new folders/files
     * When a new folder is detected, emit completion event
     */
    startWatchingExtractedFolder() {
        console.log('📦 Starting to watch extracted folder for new files/folders...');

        this.extractedWatcher = fs.watch(this.extractedDir, async (eventType, filename) => {
            if (eventType === 'rename' && filename) {
                const folderPath = path.join(this.extractedDir, filename);

                // Wait a moment for the folder to be fully created
                await new Promise(resolve => setTimeout(resolve, 1000));

                try {
                    if (fs.existsSync(folderPath)) {
                        const stats = await fs.stat(folderPath);
                        
                        // Check if it's a directory (new extracted folder)
                        if (stats.isDirectory() && !this.knownExtractedFolders.has(filename)) {
                            console.log('📦 New extracted folder detected:', filename);
                            this.knownExtractedFolders.add(filename);
                            
                            // Check if folder has content (GLB files, etc.)
                            const folderContents = await fs.readdir(folderPath);
                            if (folderContents.length > 0) {
                                console.log('📦 New folder has content, emitting completion event...');
                                this.emitExtractionComplete(filename, folderPath);
                            }
                        }
                        // Check if it's a file (like screenshot)
                        else if (stats.isFile() && filename.endsWith('.png')) {
                            console.log('📦 New screenshot file detected:', filename);
                            // Screenshot is usually added after extraction, so check for recent folders
                            this.checkForRecentExtraction();
                        }
                    }
                } catch (error) {
                    console.error('📦 Error checking new extracted item:', error);
                }
            }
        });
    }

    /**
     * Check for recently extracted folders and emit completion if found
     */
    async checkForRecentExtraction() {
        try {
            const folders = await fs.readdir(this.extractedDir);
            for (const folder of folders) {
                if (!this.knownExtractedFolders.has(folder)) {
                    const folderPath = path.join(this.extractedDir, folder);
                    const stats = await fs.stat(folderPath);
                    if (stats.isDirectory()) {
                        const folderContents = await fs.readdir(folderPath);
                        if (folderContents.length > 0) {
                            console.log('📦 Found recent extraction, emitting completion event...');
                            this.knownExtractedFolders.add(folder);
                            this.emitExtractionComplete(folder, folderPath);
                            break;
                        }
                    }
                }
            }
        } catch (error) {
            console.error('📦 Error checking for recent extraction:', error);
        }
    }

    /**
     * Emit extraction complete event via Socket.IO
     */
    emitExtractionComplete(folderName, folderPath) {
        try {
            // Check if global.io is available (Socket.IO instance)
            if (global.io) {
                console.log('📦 Emitting extraction complete event for folder:', folderName);
                global.io.emit('progress', { 
                    step: 'complete', 
                    message: '3D model download and extraction completed successfully!',
                    extractedFolder: folderName,
                    folderPath: folderPath
                });
                console.log('✅ Completion event emitted successfully');
                
                // Trigger logout after extraction is detected
                this.triggerLogoutAfterExtraction();
            } else {
                console.log('⚠️ Socket.IO not available, cannot emit completion event');
            }
        } catch (error) {
            console.error('📦 Error emitting extraction complete event:', error);
        }
    }

    /**
     * Trigger logout after extraction is detected
     * Navigates to mymodel page and performs logout
     */
    async triggerLogoutAfterExtraction() {
        try {
            console.log('📦 Triggering logout after extraction detection...');
            
            // Check if automation instance is available
            if (global.automation && global.automation.page) {
                console.log('📦 Automation instance found, navigating to mymodel and logging out...');
                
                // Navigate to mymodel page first
                try {
                    const currentUrl = global.automation.page.url();
                    console.log('📦 Current URL before navigation:', currentUrl);
                    
                    // Navigate to mymodel page
                    await global.automation.page.goto('https://www.kiriengine.app/webapp/mymodel', {
                        waitUntil: 'networkidle2',
                        timeout: 30000
                    });
                    await global.automation.page.waitForTimeout(2000);
                    console.log('✅ Successfully navigated to mymodel page');
                } catch (navError) {
                    console.log('⚠️ Navigation error, trying with domcontentloaded:', navError.message);
                    try {
                        await global.automation.page.goto('https://www.kiriengine.app/webapp/mymodel', {
                            waitUntil: 'domcontentloaded',
                            timeout: 30000
                        });
                        await global.automation.page.waitForTimeout(2000);
                    } catch (retryError) {
                        console.error('❌ Failed to navigate to mymodel page:', retryError.message);
                    }
                }
                
                // Perform logout
                try {
                    await global.automation.logout();
                    console.log('✅ Logout completed after extraction detection');
                } catch (logoutError) {
                    console.error('❌ Error during logout:', logoutError.message);
                }
            } else {
                console.log('⚠️ Automation instance not available - browser may have been closed');
            }
        } catch (error) {
            console.error('📦 Error triggering logout after extraction:', error);
        }
    }

    /**
     * Check for existing zip files that might not have been processed
     */
    async checkExistingZipFiles() {
        try {
            const files = await fs.readdir(this.downloadsDir);
            const zipFiles = files.filter(file => file.endsWith('.zip'));

            if (zipFiles.length > 0) {
                console.log('📦 Found existing zip files:', zipFiles);
                for (const zipFile of zipFiles) {
                    const filePath = path.join(this.downloadsDir, zipFile);
                    if (!this.processingFiles.has(zipFile)) {
                        await this.processZipFile(filePath, zipFile);
                    }
                }
            }
        } catch (error) {
            console.error('📦 Error checking existing zip files:', error);
        }
    }

    /**
     * Process a zip file - extract it and move contents to extracted folder
     */
    async processZipFile(zipPath, filename) {
        if (this.processingFiles.has(filename)) {
            console.log('📦 File already being processed:', filename);
            return;
        }

        this.processingFiles.add(filename);
        console.log('📦 Processing zip file:', filename);

        try {
            // Create a unique folder for this extraction
            const baseName = path.parse(filename).name;
            const extractFolder = path.join(this.extractedDir, baseName);

            // Ensure the extract folder exists
            await fs.ensureDir(extractFolder);

            // Extract the zip file
            const extractedFiles = await this.extractZip(zipPath, extractFolder);

            console.log('📦 Successfully extracted:', filename, 'to:', extractFolder);

            // Flatten GLB files - move them out of nested folders to extracted root
            const flattenedGLBFiles = await this.flattenGLBFiles(extractFolder, extractedFiles);

            // Move any screenshots from extracted root to this folder
            await this.moveScreenshotsToFolder(extractFolder);

            // Mark this folder as known
            this.knownExtractedFolders.add(baseName);

            // Emit extraction complete event immediately after extraction
            console.log('📦 Extraction complete, emitting completion event...');
            this.emitExtractionComplete(baseName, extractFolder);

            // Auto-upload GLB files to VPS
            await this.autoUploadGLBFiles(extractFolder, flattenedGLBFiles);

            // Delete the original zip file after successful extraction
            await fs.remove(zipPath);
            console.log('📦 Removed original zip file:', filename);

        } catch (error) {
            console.error('📦 Error processing zip file:', filename, error);
        } finally {
            this.processingFiles.delete(filename);
        }
    }

    /**
     * Flatten GLB files - move them out of nested folders to extracted root
     */
    async flattenGLBFiles(extractFolder, extractedFiles) {
        try {
            const flattenedFiles = [];

            for (const file of extractedFiles) {
                const filePath = path.join(extractFolder, file);

                // Check if it's a GLB file
                if (file.toLowerCase().endsWith('.glb')) {
                    // Check if file exists
                    if (await fs.pathExists(filePath)) {
                        // Get the filename without path
                        const fileName = path.basename(file);

                        // Create new path directly in extractFolder
                        const newPath = path.join(extractFolder, fileName);

                        // If the file is not already in the root, move it
                        if (filePath !== newPath) {
                            console.log('📦 Moving GLB file from nested folder:', file, '→', fileName);
                            await fs.move(filePath, newPath, { overwrite: true });

                            // Remove empty parent directories
                            const parentDir = path.dirname(filePath);
                            if (parentDir !== extractFolder) {
                                try {
                                    await fs.remove(parentDir);
                                    console.log('📦 Removed empty parent directory:', parentDir);
                                } catch (e) {
                                    console.log('📦 Could not remove parent directory (not empty):', parentDir);
                                }
                            }
                        }

                        flattenedFiles.push(fileName);
                    }
                } else {
                    // Keep non-GLB files as they are
                    flattenedFiles.push(file);
                }
            }

            console.log('📦 Flattened GLB files:', flattenedFiles);
            return flattenedFiles;

        } catch (error) {
            console.error('❌ Error flattening GLB files:', error);
            return extractedFiles; // Return original list if flattening fails
        }
    }

    /**
     * Move any screenshots from extracted root directory to the specific extracted folder
     */
    async moveScreenshotsToFolder(extractFolder) {
        try {
            // Look for screenshot files in the extracted root directory
            const screenshotFiles = await fs.readdir(this.extractedDir);
            const screenshotPattern = /^model_screenshot_\d+\.png$/i;
            
            for (const file of screenshotFiles) {
                if (screenshotPattern.test(file)) {
                    const screenshotPath = path.join(this.extractedDir, file);
                    const stats = await fs.stat(screenshotPath);
                    
                    // Only move files (not directories) and check if it's a recent screenshot (within last 10 minutes)
                    if (stats.isFile()) {
                        const fileAge = Date.now() - stats.mtime.getTime();
                        const tenMinutes = 10 * 60 * 1000;
                        
                        if (fileAge < tenMinutes) {
                            const destinationPath = path.join(extractFolder, file);
                            console.log(`📦 Moving screenshot to extracted folder: ${file} → ${path.basename(extractFolder)}`);
                            await fs.move(screenshotPath, destinationPath, { overwrite: true });
                        }
                    }
                }
            }
        } catch (error) {
            console.error('📦 Error moving screenshots:', error);
            // Don't throw - screenshot moving is optional
        }
    }

    /**
     * Auto-upload GLB files to VPS after extraction
     */
    async autoUploadGLBFiles(extractFolder, extractedFiles) {
        try {
            // Find GLB files in the extracted files
            const glbFiles = extractedFiles.filter(file =>
                file.toLowerCase().endsWith('.glb')
            );

            if (glbFiles.length === 0) {
                console.log('📦 No GLB files found for auto-upload');
                return;
            }

            console.log('📦 Found GLB files for auto-upload:', glbFiles);

            // Upload each GLB file
            for (const glbFile of glbFiles) {
                const glbPath = path.join(extractFolder, glbFile);

                try {
                    console.log('📦 Auto-uploading GLB file:', glbFile);

                    // Try to find a related screenshot/image in the same folder
                    let imagePath = null;
                    let imageName = null;

                    try {
                        const folderItems = await fs.readdir(extractFolder);

                        // Prefer Kiri screenshot naming pattern first (model_screenshot_*.png)
                        const screenshotPattern = /^model_screenshot_\d+\.png$/i;
                        const screenshots = folderItems.filter(name => screenshotPattern.test(name));

                        let candidateImage = null;

                        if (screenshots.length > 0) {
                            candidateImage = screenshots[0];
                        } else {
                            // Fallback: any common image extension in the folder
                            const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp'];
                            candidateImage = folderItems.find(name => {
                                const lower = name.toLowerCase();
                                return imageExtensions.some(ext => lower.endsWith(ext));
                            });
                        }

                        if (candidateImage) {
                            imagePath = path.join(extractFolder, candidateImage);

                            if (await fs.pathExists(imagePath)) {
                                imageName = candidateImage;
                                console.log('📦 Found related image for upload:', imageName);
                            } else {
                                imagePath = null;
                                imageName = null;
                            }
                        } else {
                            console.log('📦 No related image found for GLB file:', glbFile);
                        }
                    } catch (imageError) {
                        console.error('📦 Error while searching for related image:', imageError);
                    }

                    const uploadResult = await this.uploadGLBToVPS(glbPath, glbFile, imagePath, imageName);

                    if (uploadResult.success) {
                        console.log('✅ GLB file uploaded successfully:', glbFile);
                    } else {
                        console.error('❌ GLB file upload failed:', glbFile, uploadResult.error);
                    }
                } catch (error) {
                    console.error('❌ Error uploading GLB file:', glbFile, error.message);
                }
            }

        } catch (error) {
            console.error('❌ Error in autoUploadGLBFiles:', error);
        }
    }

    /**
     * Upload a single GLB file to VPS
     */
    async uploadGLBToVPS(filePath, fileName, imagePath = null, imageName = null) {
        try {
            // Check if file exists
            if (!await fs.pathExists(filePath)) {
                return { success: false, error: 'File not found' };
            }

            // Get file stats
            const stats = await fs.stat(filePath);
            console.log('📦 Uploading GLB file:', fileName, 'Size:', stats.size, 'bytes');

            // Create FormData
            const formData = new FormData();
            const fileBuffer = await fs.readFile(filePath);

            formData.append('file', fileBuffer, {
                filename: fileName,
                contentType: 'model/gltf-binary'
            });
            formData.append('api_key', this.vpsConfig.apiKey);

            // Optionally attach a related image (screenshot/preview) if provided
            if (imagePath && imageName) {
                try {
                    if (await fs.pathExists(imagePath)) {
                        const imageBuffer = await fs.readFile(imagePath);

                        // Basic content type detection by extension
                        const lowerName = imageName.toLowerCase();
                        let imageContentType = 'image/png';
                        if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) {
                            imageContentType = 'image/jpeg';
                        } else if (lowerName.endsWith('.webp')) {
                            imageContentType = 'image/webp';
                        }

                        formData.append('image', imageBuffer, {
                            filename: imageName,
                            contentType: imageContentType
                        });

                        console.log('📦 Attached image to VPS upload:', imageName);
                    } else {
                        console.log('📦 Image path does not exist, skipping image upload:', imagePath);
                    }
                } catch (imgErr) {
                    console.error('📦 Error attaching image to VPS upload (will continue with GLB only):', imgErr.message);
                }
            }

            // Use node-fetch with compatibility layer
            let fetchFunction;
            try {
                const nodeFetch = require('node-fetch');
                if (typeof nodeFetch === 'function') {
                    fetchFunction = nodeFetch;
                } else if (typeof nodeFetch === 'object' && nodeFetch.default) {
                    fetchFunction = nodeFetch.default;
                } else {
                    throw new Error('Unknown node-fetch format');
                }
            } catch (e) {
                return { success: false, error: 'Failed to import node-fetch: ' + e.message };
            }

            // Upload to VPS
            const url = `${this.vpsConfig.baseUrl}/remote-upload/drop-file`;
            const response = await fetchFunction(url, {
                method: 'POST',
                headers: {
                    'X-API-Key': this.vpsConfig.apiKey,
                    ...formData.getHeaders()
                },
                body: formData
            });

            const responseText = await response.text();
            let responseData;

            try {
                responseData = JSON.parse(responseText);
            } catch (e) {
                return { success: false, error: 'Invalid JSON response: ' + responseText };
            }

            if (response.ok && responseData.success) {
                return {
                    success: true,
                    message: 'GLB file uploaded successfully',
                    vpsResponse: responseData
                };
            } else {
                return {
                    success: false,
                    error: responseData.error || 'Upload failed',
                    vpsResponse: responseData
                };
            }

        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Extract a zip file to a directory
     */
    extractZip(zipPath, extractDir) {
        return new Promise((resolve, reject) => {
            yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
                if (err) {
                    reject(err);
                    return;
                }

                const extractedFiles = [];

                zipfile.readEntry();

                zipfile.on('entry', (entry) => {
                    if (/\/$/.test(entry.fileName)) {
                        // Directory entry
                        const dirPath = path.join(extractDir, entry.fileName);
                        fs.ensureDirSync(dirPath);
                        zipfile.readEntry();
                    } else {
                        // File entry
                        zipfile.openReadStream(entry, (err, readStream) => {
                            if (err) {
                                console.error('📦 Error reading zip entry:', entry.fileName, err);
                                zipfile.readEntry();
                                return;
                            }

                            const filePath = path.join(extractDir, entry.fileName);
                            const dirPath = path.dirname(filePath);

                            // Ensure directory exists
                            fs.ensureDirSync(dirPath);

                            // Create write stream
                            const writeStream = fs.createWriteStream(filePath);

                            readStream.pipe(writeStream);

                            writeStream.on('close', () => {
                                extractedFiles.push(entry.fileName);
                                console.log('📦 Extracted file:', entry.fileName);
                                zipfile.readEntry();
                            });

                            writeStream.on('error', (err) => {
                                console.error('📦 Error writing file:', entry.fileName, err);
                                zipfile.readEntry();
                            });
                        });
                    }
                });

                zipfile.on('end', () => {
                    console.log('📦 Extraction completed. Files extracted:', extractedFiles.length);
                    resolve(extractedFiles);
                });

                zipfile.on('error', (err) => {
                    console.error('📦 Zip extraction error:', err);
                    reject(err);
                });
            });
        });
    }

    /**
     * Stop watching
     */
    stopWatching() {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
            console.log('📦 Stopped watching downloads directory');
        }
        if (this.extractedWatcher) {
            this.extractedWatcher.close();
            this.extractedWatcher = null;
            console.log('📦 Stopped watching extracted directory');
        }
    }

    /**
     * Get list of extracted files
     */
    async getExtractedFiles() {
        try {
            const files = await fs.readdir(this.extractedDir);
            const result = [];

            for (const file of files) {
                const filePath = path.join(this.extractedDir, file);
                const stats = await fs.stat(filePath);

                if (stats.isDirectory()) {
                    // Get files inside the directory with their sizes
                    const subFiles = await fs.readdir(filePath);
                    const subFilesWithSizes = [];
                    let totalSize = 0;

                    for (const subFile of subFiles) {
                        const subFilePath = path.join(filePath, subFile);
                        const subStats = await fs.stat(subFilePath);
                        subFilesWithSizes.push({
                            name: subFile,
                            size: subStats.size,
                            type: path.extname(subFile).toLowerCase()
                        });
                        totalSize += subStats.size;
                    }

                    result.push({
                        name: file,
                        type: 'directory',
                        path: filePath,
                        files: subFiles,
                        filesWithSizes: subFilesWithSizes,
                        totalSize: totalSize,
                        created: stats.birthtime
                    });
                } else {
                    result.push({
                        name: file,
                        type: 'file',
                        path: filePath,
                        size: stats.size,
                        created: stats.birthtime
                    });
                }
            }

            return result.sort((a, b) => new Date(b.created) - new Date(a.created));
        } catch (error) {
            console.error('📦 Error getting extracted files:', error);
            return [];
        }
    }
}

module.exports = ZipExtractor;
