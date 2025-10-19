// zip-extractor.js
const fs = require('fs-extra');
const path = require('path');
const yauzl = require('yauzl');
const FormData = require('form-data');

class ZipExtractor {
    constructor() {
        this.downloadsDir = path.join(__dirname, 'downloads');
        this.extractedDir = path.join(__dirname, 'extracted');
        this.watcher = null;
        this.processingFiles = new Set(); // Track files being processed to avoid duplicates
        
        // VPS Configuration for auto-upload
        this.vpsConfig = {
            baseUrl: process.env.VPS_BASE_URL || 'https://crca-artifacts-contentmanagement.site',
            apiKey: process.env.VPS_API_KEY || 'mysecret_api_key@123this_is_a_secret_key_to_access_the_php_system'
        };
        
        // Ensure directories exist
        fs.ensureDirSync(this.downloadsDir);
        fs.ensureDirSync(this.extractedDir);
        
        console.log('📦 ZipExtractor initialized');
        console.log('📦 Downloads directory:', this.downloadsDir);
        console.log('📦 Extracted directory:', this.extractedDir);
        console.log('📦 VPS Auto-upload enabled:', this.vpsConfig.baseUrl);
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
                    const uploadResult = await this.uploadGLBToVPS(glbPath, glbFile);
                    
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
    async uploadGLBToVPS(filePath, fileName) {
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
