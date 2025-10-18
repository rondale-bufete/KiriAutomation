// Test script to diagnose browser launch issues
const puppeteer = require('puppeteer');
const fs = require('fs');
const os = require('os');

console.log('=== Browser Launch Test ===');
console.log('Platform:', os.platform());
console.log('Architecture:', os.arch());
console.log('Node.js version:', process.version);
console.log('Puppeteer version:', require('puppeteer/package.json').version);

// Test browser detection
function detectBrowserPath(browserType) {
    const username = os.userInfo().username;
    
    const browserPaths = {
        chrome: [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            `C:\\Users\\${username}\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe`
        ],
        edge: [
            'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
            'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
            `C:\\Users\\${username}\\AppData\\Local\\Microsoft\\Edge\\Application\\msedge.exe`
        ]
    };

    if (browserPaths[browserType]) {
        for (const browserPath of browserPaths[browserType]) {
            if (fs.existsSync(browserPath)) {
                return browserPath;
            }
        }
    }
    return null;
}

async function testBrowserLaunch() {
    const browsers = ['chromium', 'chrome', 'edge'];
    
    for (const browserType of browsers) {
        console.log(`\n--- Testing ${browserType} ---`);
        
        try {
            const launchOptions = {
                headless: false,
                timeout: 30000,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu'
                ]
            };

            // Try to detect browser path
            if (browserType !== 'chromium') {
                const detectedPath = detectBrowserPath(browserType);
                if (detectedPath) {
                    launchOptions.executablePath = detectedPath;
                    console.log(`Using detected path: ${detectedPath}`);
                } else {
                    console.log(`Browser not found, skipping ${browserType}`);
                    continue;
                }
            }

            console.log('Launching browser...');
            const browser = await puppeteer.launch(launchOptions);
            console.log(`✅ ${browserType} launched successfully!`);
            
            const page = await browser.newPage();
            await page.goto('https://www.google.com');
            console.log(`✅ Page loaded successfully!`);
            
            await browser.close();
            console.log(`✅ ${browserType} test completed successfully!`);
            
        } catch (error) {
            console.log(`❌ ${browserType} failed: ${error.message}`);
        }
    }
}

// Run the test
testBrowserLaunch().then(() => {
    console.log('\n=== Test completed ===');
    process.exit(0);
}).catch((error) => {
    console.error('Test failed:', error);
    process.exit(1);
});
