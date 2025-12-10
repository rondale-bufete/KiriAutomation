module.exports = {
    // ===========================================
    // KIRI ENGINE CREDENTIALS (UPDATE THESE)
    // ===========================================
    KIRI_EMAIL: 'ophimacusarts@gmail.com',
    KIRI_PASSWORD: 'john72004',

    // ===========================================
    // SERVER CONFIGURATION
    // ===========================================
    PORT: 3002,
    NODE_ENV: 'production', // MUST be production on VPS (headless mode)

    // ===========================================
    // BROWSER CONFIGURATION (VPS-COMPATIBLE)
    // ===========================================
    BROWSER_TYPE: 'chromium', // Use chromium on Ubuntu VPS
    BROWSER_EXECUTABLE_PATH: null, // Use system chromium instead of Puppeteer's bundled version

    // ===========================================
    // VPS UPLOAD CONFIGURATION
    // ===========================================
    VPS_BASE_URL: process.env.VPS_BASE_URL || 'https://crca-artifacts-contentmanagement.site',
    VPS_API_KEY: process.env.VPS_API_KEY || 'mysecret_api_key@123this_is_a_secret_key_to_access_the_php_system',

    // ===========================================
    // CI4 REMOTE UPLOAD CONFIGURATION
    // ===========================================
    CI4_BASE_URL: process.env.CI4_BASE_URL || 'https://crca-artifacts-contentmanagement.site',
    CI4_API_KEY: process.env.CI4_API_KEY || 'kiri-automation-ci4-secret-key-2024',

    // ===========================================
    // WEBHOOK CONFIGURATION (FOR MACRO TRIGGER)
    // ===========================================
    WEBHOOK_URL: process.env.WEBHOOK_URL || 'http://localhost:3003/trigger-macro',

    // ===========================================
    // BROWSER PATHS (AUTO-DETECTION)
    // ===========================================
    BROWSER_PATHS: {
        chrome: {
            windows: [
                'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
                'C:\\Users\\%USERNAME%\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'
            ],
            mac: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            linux: '/usr/bin/google-chrome',
            ubuntu: '/usr/bin/google-chrome'
        },
        edge: {
            windows: [
                'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
                'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
                'C:\\Users\\%USERNAME%\\AppData\\Local\\Microsoft\\Edge\\Application\\msedge.exe'
            ]
        },
        chromium: {
            windows: [
                'C:\\Program Files (x86)\\Chromium\\Application\\chrome.exe',
                'C:\\Program Files\\Chromium\\Application\\chrome.exe',
                'C:\\Users\\%USERNAME%\\AppData\\Local\\Chromium\\Application\\chrome.exe'
            ],
            mac: '/Applications/Chromium.app/Contents/MacOS/Chromium',
            linux: '/usr/bin/chromium-browser',
            ubuntu: '/usr/bin/chromium-browser'
        },
        firefox: {
            windows: 'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
            mac: '/Applications/Firefox.app/Contents/MacOS/firefox',
            linux: '/usr/bin/firefox',
            ubuntu: '/usr/bin/firefox'
        },
        opera: {
            windows: 'C:\\Program Files\\Opera\\launcher.exe',
            mac: '/Applications/Opera.app/Contents/MacOS/Opera',
            linux: '/usr/bin/opera',
            ubuntu: '/usr/bin/opera'
        },
        brave: {
            windows: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
            mac: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
            linux: '/usr/bin/brave-browser',
            ubuntu: '/usr/bin/brave-browser'
        }
    }
};