<?= $this->extend('layout/main') ?>

<?= $this->section('title') ?>
3D Scan New Model - Artifact Collection
<?= $this->endSection() ?>

<?= $this->section('scripts') ?>
<script src="<?= base_url('/js/artifactsPage.js') ?>"></script>
<script src="http://localhost:3002/socket.io/socket.io.js"></script>
<?= $this->endSection() ?>

<?= $this->section('content') ?>
<link rel="stylesheet" href="<?php echo base_url('/styles/pages/artifactsPage/artifactsPage.css') ?>">
<link rel="stylesheet" href="<?php echo base_url('/styles/common/breadcrumbs.css') ?>">

<!-- Page Header -->
<div class="page-header">
    <div class="breadcrumb-nav">
        <nav aria-label="breadcrumb">
            <ol class="breadcrumb">
                <li class="breadcrumb-item">
                    <a href="<?= site_url('manage-artifacts') ?>">
                        <i class="fas fa-list"></i> Artifact List
                    </a>
                </li>
                <li class="breadcrumb-item active">
                    <i class="fas fa-camera"></i> 3D Scan
                </li>
            </ol>
        </nav>
    </div>
</div>

<!-- Scan Interface -->
<div class="scan-container">
    <!-- Mode Selection Buttons -->
    <div class="scan-mode-selector">
        <button id="scan-mode-btn" class="mode-btn active" onclick="switchMode('scan')">
            <i class="fas fa-camera"></i>
            <span>Scan New Artifact</span>
        </button>
        <button id="upload-mode-btn" class="mode-btn" onclick="switchMode('upload')">
            <i class="fas fa-cloud-upload-alt"></i>
            <span>Upload Existing Media Files</span>
        </button>
    </div>

    <!-- Scan Mode Content -->
    <div id="scan-mode-content" class="scan-content-wrapper">
        <div class="scan-layout">
            <!-- Left Panel: Automated Scanning -->
            <div class="scan-left-panel">
                <div class="scan-section">
                    <div class="section-header">
                        <i class="fas fa-robot section-icon green"></i>
                        <div>
                            <h3>Automated Scanning</h3>
                            <p class="section-description">Capture photos/videos directly for 3D scanning.</p>
                        </div>
                    </div>

                    <!-- Setup instructions card (green dashed box) -->
                    <div class="setup-instructions">
                        <div class="instructions-header">
                            <i class="fas fa-mobile-alt instructions-icon"></i>
                            <h4>Setup Instructions</h4>
                        </div>
                        <ol class="instructions-list">
                            <li>Download MacroDroid from Google Play Store</li>
                            <li>Import our macro file to MacroDroid</li>
                            <li>Enable MacroDroid automation</li>
                            <li>Connect your device to the system</li>
                        </ol>
                    </div>

                    <!-- Turntable / device status and actions -->
                    <div class="connection-status" style="margin-top: 1.5rem;">
                        <div class="status-indicator">
                            <div id="device-status-dot" class="status-dot"></div>
                            <div>
                                <div id="status-text">Turntable status</div>
                                <p id="status-message" class="status-message">Click refresh to check for connected devices.</p>
                            </div>
                        </div>

                        <div style="display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap;">
                            <button type="button" id="refresh-btn" class="btn-refresh-turntable" onclick="refreshTurntable()">
                                <i class="fas fa-sync-alt"></i>
                                <span>Refresh Turntable</span>
                            </button>
                        </div>

                        <div style="margin-top: 1.25rem; display:flex; gap:0.75rem; flex-wrap:wrap;">
                            <button type="button" id="start-scan-btn" class="btn-start-scan" disabled onclick="startScanning()">
                                <i class="fas fa-camera"></i>
                                <span>Start Automated Scanning</span>
                            </button>
                            <button type="button" id="stop-scan-btn" class="btn-stop-scan" style="display:none;" onclick="stopScanning()">
                                <i class="fas fa-stop"></i>
                                <span>Stop Scanning</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Right Panel: Scanning Pipeline -->
            <div class="scan-right-panel">
                <div class="pipeline-section">
                    <div class="section-header">
                        <i class="fas fa-cogs section-icon blue"></i>
                        <h3>Scanning Pipeline</h3>
                    </div>
                    <div class="pipeline-steps">
                        <div class="pipeline-step" data-step="1">
                            <div class="step-icon">
                                <i class="fas fa-user-check"></i>
                            </div>
                            <div class="step-content">
                                <h4>Authenticate</h4>
                                <p>Login to Kiri Engine</p>
                            </div>
                        </div>
                        <div class="pipeline-step" data-step="2">
                            <div class="step-icon">
                                <i class="fas fa-camera"></i>
                            </div>
                            <div class="step-content">
                                <h4>Capturing Artifact</h4>
                                <p>Taking photos from multiple angles</p>
                            </div>
                        </div>
                        <div class="pipeline-step" data-step="3">
                            <div class="step-icon">
                                <i class="fas fa-cogs"></i>
                            </div>
                            <div class="step-content">
                                <h4>Processing Photogrammetry</h4>
                                <p>Creating 3D model from photos</p>
                            </div>
                        </div>
                        <div class="pipeline-step" data-step="4">
                            <div class="step-icon">
                                <i class="fas fa-download"></i>
                            </div>
                            <div class="step-content">
                                <h4>Downloading 3D</h4>
                                <p>Getting your 3D model</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Upload Mode Content -->
    <div id="upload-mode-content" class="scan-content-wrapper" style="display: none;">
        <div class="scan-layout">
            <!-- Left Panel: Upload Files -->
            <div class="scan-left-panel">
                <div class="scan-section">
                    <div class="section-header">
                        <i class="fas fa-cloud-upload-alt section-icon blue"></i>
                        <h3>Upload Files</h3>
                    </div>
                    <p class="section-description">Upload your images or videos for 3D processing.</p>

                    <div class="upload-zone" id="upload-zone">
                        <div class="upload-zone-content">
                            <i class="fas fa-cloud-upload-alt upload-icon"></i>
                            <h4>Drop your files here or click to browse</h4>
                            <p>Supports images (JPG, PNG) and videos (MP4, MOV, AVI)</p>
                            <p class="upload-limit">Up to 150 files, 1GB per file</p>
                        </div>
                        <input type="file" id="file-input" multiple
                            accept="image/jpeg,image/jpg,image/png,video/mp4,video/mov,video/avi,.jpeg,.jpg,.png,.mp4,.mov,.avi"
                            style="display: none;">
                    </div>

                    <!-- File List -->
                    <div id="file-list-container" style="display: none; margin-top: 1rem;">
                        <div class="file-list-header"
                            style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
                            <h4 style="margin: 0; font-size: 1rem; font-weight: 600; color: var(--text-color);">Selected
                                Files</h4>
                            <button type="button" id="clear-files-btn" class="btn-clear-files"
                                style="padding: 0.5rem 1rem; background: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.875rem;">
                                <i class="fas fa-times"></i> Clear All
                            </button>
                        </div>
                        <div id="file-list"
                            style="max-height: 300px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.5rem;">
                        </div>
                        <div id="file-count"
                            style="margin-top: 0.75rem; color: var(--text-muted); font-size: 0.875rem; text-align: center;">
                        </div>
                    </div>

                    <button id="start-processing-btn" class="btn-start-processing" disabled>
                        <i class="fas fa-upload"></i>
                        <span>Start 3D Processing</span>
                    </button>

                    <!-- Progress Bar -->
                    <div id="upload-progress-container" style="display: none; margin-top: 1rem;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                            <span
                                style="color: var(--text-color); font-size: 0.9rem; font-weight: 500;">Uploading...</span>
                            <span id="upload-progress-text"
                                style="color: var(--text-muted); font-size: 0.9rem;">0%</span>
                        </div>
                        <div
                            style="width: 100%; height: 8px; background: var(--bg-color); border-radius: 10px; overflow: hidden;">
                            <div id="upload-progress-bar"
                                style="height: 100%; background: linear-gradient(90deg, #3b82f6 0%, #8b5cf6 100%); width: 0%; transition: width 0.3s ease;">
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Right Panel: Processing Pipeline -->
            <div class="scan-right-panel">
                <div class="pipeline-section">
                    <div class="section-header">
                        <i class="fas fa-cogs section-icon blue"></i>
                        <h3>Processing Pipeline</h3>
                    </div>
                    <div class="pipeline-steps">
                        <div class="pipeline-step" data-step="1">
                            <div class="step-icon">
                                <i class="fas fa-sign-in-alt"></i>
                            </div>
                            <div class="step-content">
                                <h4>Authenticate</h4>
                                <p>Login to Kiri Engine</p>
                            </div>
                        </div>
                        <div class="pipeline-step" data-step="2">
                            <div class="step-icon">
                                <i class="fas fa-cloud-upload-alt"></i>
                            </div>
                            <div class="step-content">
                                <h4>Upload Files</h4>
                                <p>Transfer your media files</p>
                            </div>
                        </div>
                        <div class="pipeline-step" data-step="3">
                            <div class="step-icon">
                                <i class="fas fa-cogs"></i>
                            </div>
                            <div class="step-content">
                                <h4>Process Photogrammetry</h4>
                                <p>Photo Scan with Kiri Engine</p>
                            </div>
                        </div>
                        <div class="pipeline-step" data-step="4">
                            <div class="step-icon">
                                <i class="fas fa-download"></i>
                            </div>
                            <div class="step-content">
                                <h4>Download</h4>
                                <p>Get your 3D model</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Recent scanned temp files (cards) -->
    <div class="scan-temp-files" style="margin-top: 1.5rem;">
        <div class="section-header">
            <i class="fas fa-folder-open section-icon blue"></i>
            <h3>Recent Scanned Files</h3>
        </div>

        <div id="scan-temp-files-grid"
            style="display: grid; grid-template-columns: repeat(auto-fill,minmax(260px,1fr)); gap: 1rem; margin-top: 1rem;">
        </div>

        <div id="scan-temp-files-empty" style="display:none; text-align:center; padding:2rem; color:var(--text-muted);">
            <i class="fas fa-folder-open" style="font-size:2rem"></i>
            <p>No scanned files available</p>
            <small>Scanned 3D models that are temporarily stored will appear here.</small>
        </div>
    </div>
</div>

<style>
    .scan-container {
        max-width: 1400px;
        margin: 0 auto;
        padding: 2rem;
    }

    /* Mode Selector */
    .scan-mode-selector {
        display: flex;
        gap: 1rem;
        margin-bottom: 2rem;
    }

    .mode-btn {
        flex: 1;
        padding: 1rem 2rem;
        border: 2px solid var(--card-border);
        border-radius: 12px;
        background: var(--card-bg);
        color: var(--text-color);
        font-size: 1rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.3s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.75rem;
    }

    .mode-btn i {
        font-size: 1.2rem;
    }

    .mode-btn.active {
        background: var(--blue-primary);
        color: white;
        border-color: var(--blue-primary);
    }

    .mode-btn:not(.active):hover {
        border-color: var(--blue-primary);
        background: var(--blue-bg);
    }

    /* Content Wrapper */
    .scan-content-wrapper {
        background: var(--card-bg);
        border: 1px solid var(--card-border);
        border-radius: 16px;
        padding: 2rem;
    }

    .scan-layout {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 2rem;
    }

    /* Left Panel */
    .scan-left-panel {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
    }

    .scan-section {
        background: var(--bg-color);
        border: 1px solid var(--card-border);
        border-radius: 12px;
        padding: 1.5rem;
    }

    .section-header {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 0.75rem;
    }

    .section-icon {
        font-size: 1.5rem;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
    }

    .section-icon.green {
        background: rgba(34, 197, 94, 0.1);
        color: #22c55e;
    }

    .section-icon.blue {
        background: rgba(59, 130, 246, 0.1);
        color: #3b82f6;
    }

    .section-header h3 {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 600;
        color: var(--text-color);
    }

    .section-description {
        margin: 0 0 1rem 0;
        color: var(--text-muted);
        font-size: 0.9rem;
    }

    /* Setup Instructions */
    .setup-instructions {
        border: 2px dashed #22c55e;
        border-radius: 12px;
        padding: 1.5rem;
        background: rgba(34, 197, 94, 0.05);
    }

    .instructions-header {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 1rem;
    }

    .instructions-icon {
        font-size: 1.5rem;
        color: #22c55e;
    }

    .instructions-header h4 {
        margin: 0;
        font-size: 1.1rem;
        font-weight: 600;
        color: var(--text-color);
    }

    .instructions-list {
        margin: 0;
        padding-left: 1.5rem;
        color: var(--text-color);
    }

    .instructions-list li {
        margin-bottom: 0.5rem;
        line-height: 1.6;
    }

    /* Connection Status */
    .connection-status {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .status-indicator {
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }

    .status-dot {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: var(--gray-500);
        animation: pulse 2s infinite;
    }

    .status-dot.checking {
        background: #3b82f6;
    }

    .status-dot.connected {
        background: #22c55e;
        animation: none;
    }

    .status-dot.disconnected {
        background: #ef4444;
        animation: none;
    }

    @keyframes pulse {

        0%,
        100% {
            opacity: 1;
        }

        50% {
            opacity: 0.5;
        }
    }

    #status-text {
        color: var(--text-color);
        font-weight: 500;
    }

    .status-message {
        margin: 0;
        color: var(--text-muted);
        font-size: 0.9rem;
    }

    .btn-refresh-turntable {
        padding: 0.75rem 1.5rem;
        background: #22c55e;
        color: white;
        border: none;
        border-radius: 8px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.3s ease;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        width: fit-content;
    }

    .btn-refresh-turntable:hover {
        background: #16a34a;
        transform: translateY(-2px);
    }

    /* Start Scan Button */
    .btn-start-scan {
        padding: 1rem 2rem;
        background: var(--gray-400);
        color: var(--gray-600);
        border: none;
        border-radius: 12px;
        font-size: 1.1rem;
        font-weight: 600;
        cursor: not-allowed;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.75rem;
        transition: all 0.3s ease;
    }

    .btn-start-scan:not(:disabled) {
        background: var(--blue-primary);
        color: white;
        cursor: pointer;
    }

    .btn-start-scan:not(:disabled):hover {
        background: var(--blue-dark);
        transform: translateY(-2px);
    }

    .btn-stop-scan {
        padding: 1rem 2rem;
        background: #ef4444;
        color: white;
        border: none;
        border-radius: 12px;
        font-size: 1.1rem;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.75rem;
        transition: all 0.3s ease;
    }

    .btn-stop-scan:hover {
        background: #dc2626;
        transform: translateY(-2px);
    }

    .btn-stop-scan:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .status-badge {
        display: inline-block;
        padding: 0.25rem 0.75rem;
        border-radius: 9999px;
        font-size: 0.875rem;
        font-weight: 600;
        text-transform: uppercase;
    }

    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }

        to {
            transform: translateX(0);
            opacity: 1;
        }
    }

    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }

        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }

    /* Upload Zone */
    .upload-zone {
        border: 2px dashed var(--card-border);
        border-radius: 12px;
        padding: 3rem 2rem;
        text-align: center;
        cursor: pointer;
        transition: all 0.3s ease;
        background: var(--bg-color);
    }

    .upload-zone:hover {
        border-color: var(--blue-primary);
        background: var(--blue-bg);
    }

    .upload-zone.dragover {
        border-color: var(--blue-primary);
        background: var(--blue-bg);
        transform: scale(1.02);
    }

    .upload-zone-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
    }

    .upload-icon {
        font-size: 3rem;
        color: var(--blue-primary);
    }

    .upload-zone-content h4 {
        margin: 0;
        font-size: 1.1rem;
        font-weight: 600;
        color: var(--text-color);
    }

    .upload-zone-content p {
        margin: 0;
        color: var(--text-muted);
        font-size: 0.9rem;
    }

    .upload-limit {
        font-size: 0.85rem !important;
        color: var(--text-muted) !important;
    }

    .btn-start-processing {
        width: 100%;
        padding: 1rem 2rem;
        margin-top: 1rem;
        background: var(--gray-400);
        color: var(--gray-600);
        border: none;
        border-radius: 12px;
        font-size: 1.1rem;
        font-weight: 600;
        cursor: not-allowed;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.75rem;
        transition: all 0.3s ease;
    }

    .btn-start-processing:not(:disabled) {
        background: var(--blue-primary);
        color: white;
        cursor: pointer;
    }

    .btn-start-processing:not(:disabled):hover {
        background: var(--blue-dark);
        transform: translateY(-2px);
    }

    /* Right Panel - Pipeline */
    .scan-right-panel {
        display: flex;
        flex-direction: column;
    }

    .pipeline-section {
        background: var(--bg-color);
        border: 1px solid var(--card-border);
        border-radius: 12px;
        padding: 1.5rem;
        height: fit-content;
    }

    .pipeline-steps {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        margin-top: 1.5rem;
    }

    .pipeline-step {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 1rem;
        background: var(--card-bg);
        border: 1px solid var(--card-border);
        border-radius: 8px;
        transition: all 0.3s ease;
    }

    .pipeline-step.active {
        border-color: var(--blue-primary);
        background: var(--blue-bg);
    }

    .pipeline-step.completed {
        border-color: #22c55e;
        background: rgba(34, 197, 94, 0.1);
    }

    .step-icon {
        width: 48px;
        height: 48px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--bg-color);
        border-radius: 8px;
        color: var(--text-muted);
        font-size: 1.25rem;
    }

    .pipeline-step.active .step-icon {
        background: var(--blue-primary);
        color: white;
    }

    .pipeline-step.completed .step-icon {
        background: #22c55e;
        color: white;
    }

    .step-content {
        flex: 1;
    }

    .step-content h4 {
        margin: 0 0 0.25rem 0;
        font-size: 1rem;
        font-weight: 600;
        color: var(--text-color);
    }

    .step-content p {
        margin: 0;
        font-size: 0.85rem;
        color: var(--text-muted);
    }

    /* Responsive Design */
    @media (max-width: 1024px) {
        .scan-layout {
            grid-template-columns: 1fr;
        }
    }

    @media (max-width: 768px) {
        .scan-container {
            padding: 1rem;
        }

        .scan-mode-selector {
            flex-direction: column;
        }

        .scan-content-wrapper {
            padding: 1.5rem;
        }

        .upload-zone {
            padding: 2rem 1rem;
        }
    }

    /* File List Styles */
    .file-item {
        background: var(--card-bg);
        border: 1px solid var(--card-border);
        border-radius: 8px;
        padding: 0.75rem 1rem;
        display: flex;
        justify-content: space-between;
        align-items: center;
        transition: all 0.3s ease;
    }

    .file-item:hover {
        border-color: var(--blue-primary);
        background: var(--blue-bg);
    }

    .file-info {
        flex: 1;
        min-width: 0;
    }

    .file-name {
        font-weight: 500;
        color: var(--text-color);
        font-size: 0.9rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-bottom: 0.25rem;
    }

    .file-size {
        color: var(--text-muted);
        font-size: 0.8rem;
    }

    .file-remove-btn {
        padding: 0.5rem;
        background: #ef4444;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 0.875rem;
        transition: all 0.3s ease;
        margin-left: 0.75rem;
    }

    .file-remove-btn:hover {
        background: #dc2626;
        transform: scale(1.05);
    }

    .btn-clear-files:hover {
        background: #dc2626;
        transform: translateY(-1px);
    }
</style>

<script>
    let currentMode = 'scan';
    let uploadedFiles = [];
    
    // Connect to Node.js Socket.IO server for real-time pipeline updates
    const socket = io('http://localhost:3002', {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5
    });

    socket.on('connect', () => {
        console.log('✅ Connected to Node.js server via Socket.IO');
    });

    socket.on('disconnect', () => {
        console.log('❌ Disconnected from Node.js server');
    });

    // Listen for progress updates from Node.js server
    socket.on('progress', (data) => {
        console.log('📡 Received progress update from server:', data);
        
        // Update pipeline UI based on progress step
        if (data.step === 'login') {
            activatePipelineStep(1);
        } else if (data.step === 'upload') {
            activatePipelineStep(2);
        } else if (data.step === 'processing') {
            activatePipelineStep(3);
            // Turn OFF motor when processing starts
            console.log('🔌 Processing detected via Socket.IO! Turning OFF motor...');
            fetch('<?= site_url('motor/control/off') ?>', { method: 'GET' })
                .then(() => console.log('🔌 Motor turned OFF via Socket.IO'))
                .catch(err => console.error('Error turning off motor:', err));
        } else if (data.step === 'download') {
            activatePipelineStep(4);
        } else if (data.step === 'complete') {
            activatePipelineStep(5);
        }
    });

    function switchMode(mode) {
        currentMode = mode;

        // Update buttons
        document.getElementById('scan-mode-btn').classList.toggle('active', mode === 'scan');
        document.getElementById('upload-mode-btn').classList.toggle('active', mode === 'upload');

        // Update content
        document.getElementById('scan-mode-content').style.display = mode === 'scan' ? 'block' : 'none';
        document.getElementById('upload-mode-content').style.display = mode === 'upload' ? 'block' : 'none';
    }

    function refreshTurntable() {
        const statusText = document.getElementById('status-text');
        const statusDot = document.getElementById('device-status-dot');
        const statusMessage = document.getElementById('status-message');
        const refreshBtn = document.getElementById('refresh-btn');
        const startBtn = document.getElementById('start-scan-btn');

        // Update UI to show checking state
        statusText.textContent = 'Checking for turntable...';
        statusDot.className = 'status-dot checking';
        statusMessage.textContent = 'Please wait while we scan for devices.';
        refreshBtn.disabled = true;
        refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking...';

        // Make AJAX call to check status
        fetch('<?= site_url('motor/check-status') ?>')
            .then(response => response.json())
            .then(data => {
                console.log('Motor status response:', data);
                refreshBtn.disabled = false;
                refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh Turntable';

                if (data.success) {
                    // Update device status
                    if (data.device_status === 'Online') {
                        statusText.textContent = 'Turntable connected';
                        statusDot.className = 'status-dot connected';
                        statusMessage.textContent = 'Device is online and ready.';
                        startBtn.disabled = false;
                    } else {
                        statusText.textContent = 'Turntable offline';
                        statusDot.className = 'status-dot disconnected';
                        statusMessage.textContent = 'Device is offline. Please check your connection.';
                        startBtn.disabled = true;
                    }

                    // Optional: Update motor status if elements exist
                    const motorStatusText = document.getElementById('motor-status-text');
                    const motorStatusBadge = document.getElementById('motor-status-badge');
                    if (motorStatusText && motorStatusBadge) {
                        motorStatusText.textContent = data.motor_status;
                        if (data.motor_status === 'ON') {
                            motorStatusBadge.style.background = '#fbbf24';
                            motorStatusBadge.style.color = '#1f2937';
                        } else {
                            motorStatusBadge.style.background = '#9ca3af';
                            motorStatusBadge.style.color = 'white';
                        }
                    }
                } else {
                    statusText.textContent = 'Status check failed';
                    statusDot.className = 'status-dot disconnected';
                    statusMessage.textContent = 'Unable to check device status. Please try again.';
                    startBtn.disabled = true;
                }
            })
            .catch(error => {
                console.error('Error checking status:', error);

                refreshBtn.disabled = false;
                refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh Turntable';
                statusText.textContent = 'Connection error';
                statusDot.className = 'status-dot disconnected';
                statusMessage.textContent = 'Failed to connect to device. Please check your network.';
                startBtn.disabled = true;
            });
    }

    function startScanning() {
        const startBtn = document.getElementById('start-scan-btn');
        const stopBtn = document.getElementById('stop-scan-btn');

        startBtn.disabled = true;
        startBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Starting...';

        // Call CI4 controller endpoint to trigger live scanning
        fetch('<?= site_url('api/kiri-scan/start-live-scanning') ?>', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            }
        })
            .then(response => response.json())
            .then(result => {
                if (result.success) {
                    startBtn.style.display = 'none';
                    stopBtn.style.display = 'flex';
                    showNotification('Live scanning started successfully!', 'success');
                    // Activate first pipeline step
                    activatePipelineStep(1);
                    console.log('Live scanning triggered via CI4 controller:', result);
                } else {
                    startBtn.disabled = false;
                    startBtn.innerHTML = '<i class="fas fa-camera"></i> <span>Start Automated Scanning</span>';
                    showNotification('Failed to start live scanning: ' + (result.error || 'Unknown error'), 'error');
                    console.error('Error:', result);
                }
            })
            .catch(error => {
                console.error('Error calling start-live-scanning:', error);
                startBtn.disabled = false;
                startBtn.innerHTML = '<i class="fas fa-camera"></i> <span>Start Automated Scanning</span>';
                showNotification('Error starting live scanning. Please check the server.', 'error');
            });
    }

    function stopScanning() {
        const startBtn = document.getElementById('start-scan-btn');
        const stopBtn = document.getElementById('stop-scan-btn');

        // Hide stop button and show start button
        stopBtn.style.display = 'none';
        startBtn.style.display = 'flex';
        startBtn.disabled = false;

        showNotification('Scanning stopped!', 'success');
        // Reset pipeline steps
        resetPipelineSteps();
    }

    function activatePipelineStep(stepNumber) {
        // Remove active/completed from all steps
        document.querySelectorAll('.pipeline-step').forEach((step, index) => {
            step.classList.remove('active', 'completed');
            if (index + 1 < stepNumber) {
                step.classList.add('completed');
            } else if (index + 1 === stepNumber) {
                step.classList.add('active');
            }
        });
    }

    function resetPipelineSteps() {
        document.querySelectorAll('.pipeline-step').forEach(step => {
            step.classList.remove('active', 'completed');
        });
    }

    function showNotification(message, type) {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 1rem 1.5rem;
            background: ${type === 'success' ? '#22c55e' : '#ef4444'};
            color: white;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            z-index: 10001;
            display: flex;
            align-items: center;
            gap: 0.75rem;
            animation: slideIn 0.3s ease;
        `;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
            <span>${message}</span>
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // Upload zone functionality
    const uploadZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-input');
    const startProcessingBtn = document.getElementById('start-processing-btn');

    uploadZone.addEventListener('click', () => {
        fileInput.click();
    });

    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });

    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('dragover');
    });

    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        const files = Array.from(e.dataTransfer.files);
        handleFiles(files);
    });

    fileInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        handleFiles(files);
    });

    // Configuration - Use CI4 route instead of direct Node.js connection
    const UPLOAD_URL = '<?= base_url("api/kiri-scan/upload") ?>';

    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    function handleFiles(files) {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'video/mp4', 'video/mov', 'video/avi'];
        const maxSize = 1024 * 1024 * 1024; // 1GB
        const validFiles = [];
        const errors = [];

        Array.from(files).forEach(file => {
            // Check file type
            if (!allowedTypes.includes(file.type)) {
                errors.push(`Invalid file type: ${file.name}. Only images (JPEG, PNG) and videos (MP4, MOV, AVI) are allowed.`);
                return;
            }

            // Check file size
            if (file.size > maxSize) {
                errors.push(`File too large: ${file.name}. Maximum size is 1GB.`);
                return;
            }

            // Check if file already exists
            if (validFiles.find(f => f.name === file.name && f.size === file.size)) {
                errors.push(`File already added: ${file.name}`);
                return;
            }

            validFiles.push(file);
        });

        // Show errors if any
        if (errors.length > 0) {
            errors.forEach(error => showNotification(error, 'error'));
        }

        // Update uploaded files
        if (validFiles.length > 0) {
            uploadedFiles = [...uploadedFiles, ...validFiles];
            updateFileList();
            startProcessingBtn.disabled = false;
        }
    }

    function updateFileList() {
        const fileListContainer = document.getElementById('file-list-container');
        const fileList = document.getElementById('file-list');
        const fileCount = document.getElementById('file-count');
        const clearBtn = document.getElementById('clear-files-btn');

        if (uploadedFiles.length === 0) {
            fileListContainer.style.display = 'none';
            startProcessingBtn.disabled = true;
            return;
        }

        fileListContainer.style.display = 'block';
        fileList.innerHTML = '';

        uploadedFiles.forEach((file, index) => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.innerHTML = `
                <div class="file-info">
                    <div class="file-name">${file.name}</div>
                    <div class="file-size">${formatFileSize(file.size)}</div>
                </div>
                <button type="button" class="file-remove-btn" onclick="removeFile(${index})" title="Remove file">
                    <i class="fas fa-times"></i>
                </button>
            `;
            fileList.appendChild(fileItem);
        });

        fileCount.textContent = `${uploadedFiles.length} file(s) selected`;
    }

    function removeFile(index) {
        uploadedFiles.splice(index, 1);
        updateFileList();
    }

    // Clear all files
    document.getElementById('clear-files-btn').addEventListener('click', () => {
        uploadedFiles = [];
        fileInput.value = '';
        updateFileList();
        const uploadContent = uploadZone.querySelector('.upload-zone-content');
        uploadContent.innerHTML = `
            <i class="fas fa-cloud-upload-alt upload-icon"></i>
            <h4>Drop your files here or click to browse</h4>
            <p>Supports images (JPG, PNG) and videos (MP4, MOV, AVI)</p>
            <p class="upload-limit">Up to 150 files, 1GB per file</p>
        `;
    });

    // Start processing button handler
    startProcessingBtn.addEventListener('click', async () => {
        if (uploadedFiles.length === 0) {
            showNotification('Please select at least one file to upload.', 'error');
            return;
        }

        // Disable button and show progress
        startProcessingBtn.disabled = true;
        startProcessingBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Processing...</span>';

        const progressContainer = document.getElementById('upload-progress-container');
        const progressBar = document.getElementById('upload-progress-bar');
        const progressText = document.getElementById('upload-progress-text');

        progressContainer.style.display = 'block';
        progressBar.style.width = '10%';
        progressText.textContent = '10%';

        // Activate first pipeline step (Authenticate)
        activateUploadPipelineStep(1);

        // Create FormData
        const formData = new FormData();
        uploadedFiles.forEach(file => {
            formData.append('files[]', file);
        });

        try {
            // Initial upload progress (still on Authenticate visually)
            progressBar.style.width = '30%';
            progressText.textContent = '30%';

            const response = await fetch(UPLOAD_URL, {
                method: 'POST',
                body: formData
            });

            // Upload request has completed, move to Upload Files step
            activateUploadPipelineStep(2);

            progressBar.style.width = '60%';
            progressText.textContent = '60%';

            const data = await response.json();

            // Server response is being processed, move to Process Photogrammetry step
            activateUploadPipelineStep(3);

            if (data.success) {
                progressBar.style.width = '100%';
                progressText.textContent = '100%';
                activateUploadPipelineStep(4);

                showNotification(data.message || 'Files uploaded successfully! 3D scan has started.', 'success');

                // Clear files after successful upload
                setTimeout(() => {
                    uploadedFiles = [];
                    fileInput.value = '';
                    updateFileList();
                    progressContainer.style.display = 'none';
                    progressBar.style.width = '0%';
                    startProcessingBtn.disabled = false;
                    startProcessingBtn.innerHTML = '<i class="fas fa-upload"></i> <span>Start 3D Processing</span>';
                    resetUploadPipelineSteps();
                }, 3000);
            } else {
                progressContainer.style.display = 'none';
                progressBar.style.width = '0%';
                showNotification(data.error || 'Upload failed. Please try again.', 'error');
                startProcessingBtn.disabled = false;
                startProcessingBtn.innerHTML = '<i class="fas fa-upload"></i> <span>Start 3D Processing</span>';
                resetUploadPipelineSteps();
            }
        } catch (error) {
            console.error('Upload error:', error);
            progressContainer.style.display = 'none';
            progressBar.style.width = '0%';
            showNotification('Error: ' + error.message, 'error');
            startProcessingBtn.disabled = false;
            startProcessingBtn.innerHTML = '<i class="fas fa-upload"></i> <span>Start 3D Processing</span>';
            resetUploadPipelineSteps();
        }
    });

    function activateUploadPipelineStep(stepNumber) {
        const uploadModeContent = document.getElementById('upload-mode-content');
        const steps = uploadModeContent.querySelectorAll('.pipeline-step');
        steps.forEach((step, index) => {
            step.classList.remove('active', 'completed');
            if (index + 1 < stepNumber) {
                step.classList.add('completed');
            } else if (index + 1 === stepNumber) {
                step.classList.add('active');
            }
        });
    }

    function resetUploadPipelineSteps() {
        const uploadModeContent = document.getElementById('upload-mode-content');
        const steps = uploadModeContent.querySelectorAll('.pipeline-step');
        steps.forEach(step => {
            step.classList.remove('active', 'completed');
        });
    }

    // Initialize temp files loading on page load (Scan tab UI is cleared)
    document.addEventListener('DOMContentLoaded', function () {
        // Initial load of temp files cards for scan page
        loadScanTempFiles();
        
        // ⚠️ REMOVED: Automatic periodic refresh (no more setInterval)
        // The temp files will now only load once on page load
    });

    // Load temp files for scanning UI and show as cards
    function loadScanTempFiles() {
        const grid = document.getElementById('scan-temp-files-grid');
        const empty = document.getElementById('scan-temp-files-empty');
        if (!grid) return;

        grid.innerHTML = '<div style="grid-column:1/-1; padding:1rem; color:var(--text-muted)"><i class="fas fa-spinner fa-spin"></i> Loading scanned files...</div>';
        empty.style.display = 'none';

        fetch('<?= site_url('manage-artifacts/temp-files') ?>')
            .then(r => r.json())
            .then(data => {
                if (!data.success || !Array.isArray(data.files) || data.files.length === 0) {
                    grid.innerHTML = '';
                    empty.style.display = 'block';
                    return;
                }

                grid.innerHTML = '';
                data.files.forEach(file => {
                    const card = document.createElement('div');
                    card.className = 'temp-file-card';
                    card.style = 'background:var(--card-bg); border:1px solid var(--card-border); padding:0.75rem; border-radius:8px; display:flex; flex-direction:column; gap:0.5rem;'

                    const previewWrap = document.createElement('div');
                    previewWrap.style = 'height:120px; border-radius:6px; overflow:hidden; display:flex; align-items:center; justify-content:center; background:var(--bg-color);'
                    const previewId = `scan-preview-${file.path.replace(/[^a-zA-Z0-9]/g, '_')}`;

                    // If a thumbnail image is available from the temp folder, show it directly
                    if (file.thumbnail_path) {
                        const img = document.createElement('img');
                        img.src = '<?= base_url('') ?>' + file.thumbnail_path.replace(/^\//, '');
                        img.alt = file.original_name || file.name;
                        img.style = 'width:100%; height:100%; object-fit:cover; display:block;';
                        previewWrap.appendChild(img);
                    } else {
                        // Fallback: keep the original 3D preview container
                        previewWrap.innerHTML = `<div id="${previewId}" style="width:100%; height:100%; display:flex; align-items:center; justify-content:center;"></div>`;
                    }

                    const title = document.createElement('div');
                    title.className = 'temp-file-card-title';
                    title.textContent = file.original_name;
                    title.style = 'font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';

                    const meta = document.createElement('div');
                    meta.style = 'display:flex; justify-content:space-between; color:var(--text-muted); font-size:0.9rem;';
                    meta.innerHTML = `<span>${file.size_formatted}</span><span>${file.modified}</span>`;

                    const actions = document.createElement('div');
                    actions.style = 'display:flex; gap:0.5rem; margin-top:0.5rem; justify-content:flex-end;';
                    const useBtn = document.createElement('button');
                    useBtn.className = 'btn-primary';
                    useBtn.style = 'padding:0.5rem 0.75rem;';
                    useBtn.innerHTML = '<i class="fas fa-plus"></i> Use in Add Artifact';
                    useBtn.onclick = () => {
                        // Redirect to add page and pass temp filename
                        const encoded = encodeURIComponent(file.name);
                        window.location.href = '<?= site_url('manage-artifacts/add') ?>?temp=' + encoded;
                    };

                    const downloadBtn = document.createElement('a');
                    downloadBtn.className = 'btn-secondary';
                    downloadBtn.style = 'padding:0.5rem 0.75rem;';
                    downloadBtn.href = '<?= base_url('') ?>' + file.path.replace(/^\//, '');
                    downloadBtn.target = '_blank';
                    downloadBtn.innerHTML = '<i class="fas fa-eye"></i> View';

                    actions.appendChild(downloadBtn);
                    actions.appendChild(useBtn);

                    card.appendChild(previewWrap);
                    card.appendChild(title);
                    card.appendChild(meta);
                    card.appendChild(actions);

                    grid.appendChild(card);

                    // Load 3D preview only when we do not have a dedicated thumbnail image
                    if (!file.thumbnail_path && ['glb', 'gltf'].includes(file.extension.toLowerCase())) {
                        // reuse same logic from other pages
                        try {
                            const scene = new THREE.Scene();
                            const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
                            const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
                            renderer.setSize(220, 120);
                            renderer.setClearColor(0x000000, 0);
                            const container = document.getElementById(previewId);
                            if (container) {
                                container.innerHTML = '';
                                container.appendChild(renderer.domElement);
                                const ambientLight = new THREE.AmbientLight(0x404040, 0.6); scene.add(ambientLight);
                                const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8); directionalLight.position.set(1, 1, 1); scene.add(directionalLight);
                                const loader = new THREE.GLTFLoader();
                                loader.load('<?= base_url('') ?>' + file.path.replace(/^\//, ''), function (gltf) {
                                    const model = gltf.scene;
                                    const box = new THREE.Box3().setFromObject(model);
                                    const center = box.getCenter(new THREE.Vector3());
                                    const size = box.getSize(new THREE.Vector3());
                                    const maxDim = Math.max(size.x, size.y, size.z);
                                    const scale = (maxDim > 0) ? (1.2 / maxDim) : 1;
                                    model.scale.setScalar(scale);
                                    model.position.sub(center.multiplyScalar(scale));
                                    scene.add(model);
                                    camera.position.set(2, 2, 2); camera.lookAt(0, 0, 0);
                                    renderer.render(scene, camera);
                                    (function animate() { model.rotation.y += 0.01; renderer.render(scene, camera); requestAnimationFrame(animate); }());
                                }, null, function (err) { console.error('preview load err', err); container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:120px;color:var(--text-muted)"><i class="fas fa-cube"></i></div>'; });
                            }
                        } catch (e) { console.error(e); }
                    }
                });
            })
            .catch(err => { console.error('failed', err); grid.innerHTML = ''; empty.style.display = 'block'; });
    }
</script>

<?= $this->endSection() ?>