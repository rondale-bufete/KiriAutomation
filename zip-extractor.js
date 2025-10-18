// zip-extractor.js
const fs = require('fs-extra');
const path = require('path');
const yauzl = require('yauzl');

class ZipExtractor {
    constructor() {
        this.downloadsDir = path.join(__dirname, 'downloads');
        this.extractedDir = path.join(__dirname, 'extracted');
        this.watcher = null;
        this.processingFiles = new Set(); // Track files being processed to avoid duplicates
        
        // Ensure directories exist
        fs.ensureDirSync(this.downloadsDir);
        fs.ensureDirSync(this.extractedDir);
        
        console.log('📦 ZipExtractor initialized');
        console.log('📦 Downloads directory:', this.downloadsDir);
        console.log('📦 Extracted directory:', this.extractedDir);
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
            await this.extractZip(zipPath, extractFolder);
            
            console.log('📦 Successfully extracted:', filename, 'to:', extractFolder);
            
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
