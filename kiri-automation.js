//kiri-automation.js - Kiri Engine Automation Class

const puppeteer = require('puppeteer');
const fs = require('fs-extra');
const path = require('path');

class KiriEngineAutomation {
    constructor(options = {}) {
        this.browser = null;
        this.page = null;
        this.isLoggedIn = false;
        this.isLoggingIn = false;
        this.buttonClicked = false;
        this.sessionPath = options.sessionPath || './session';
        this.headless = options.headless || false;
        this.timeout = options.timeout || 30000;
        this.browserType = options.browserType || 'chromium';
        this.executablePath = options.executablePath || null;
        this.reloadInterval = null;
        this.isReloading = false;
        this.trackedProjectId = null;
        this.trackedProjectTitle = null;
    }

    // FIXED detectBrowserPath - Only checks Linux paths
    detectBrowserPath(browserType) {
        const os = require('os');
        const fs = require('fs');
        const platform = os.platform();

        const browserPaths = {
            chrome: {
                linux: [
                    '/usr/bin/google-chrome',
                    '/usr/bin/google-chrome-stable',
                    '/usr/bin/chromium-browser',
                    '/snap/bin/chromium'
                ]
            },
            chromium: {
                linux: [
                    '/usr/bin/chromium-browser',
                    '/usr/bin/chromium',
                    '/snap/bin/chromium'
                ]
            }
        };

        if (platform === 'linux' && browserPaths[browserType] && browserPaths[browserType].linux) {
            for (const browserPath of browserPaths[browserType].linux) {
                if (fs.existsSync(browserPath)) {
                    console.log(`Found ${browserType} at: ${browserPath}`);
                    return browserPath;
                }
            }
        }

        console.log(`No ${browserType} browser found for platform: ${platform}`);
        return null;
    }

    async init() {
        try {
            // Close existing browser if it exists
            if (this.browser) {
                console.log('Closing existing browser instance...');
                try {
                    await this.browser.close();
                } catch (e) {
                    console.log('Error closing existing browser:', e.message);
                }
                this.browser = null;
                this.page = null;
            }

            console.log('Launching new browser instance...');

            // Configure browser launch options
            const appDownloadsDir = path.resolve(__dirname, 'downloads');
            const launchOptions = {
                headless: this.headless,
                defaultViewport: null,
                userDataDir: this.sessionPath,
                downloadsPath: appDownloadsDir,
                timeout: 60000,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu',
                    '--disable-web-security',
                    '--disable-features=VizDisplayCompositor',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding',
                    '--disable-download-protection',
                    '--disable-extensions',
                    '--disable-plugins',
                    '--disable-default-apps',
                    '--disable-background-networking',
                    '--disable-sync',
                    '--disable-translate',
                    '--disable-ipc-flooding-protection',
                    '--allow-running-insecure-content',
                    '--disable-features=TranslateUI',
                    '--disable-features=BlinkGenPropertyTrees',
                    `--download-dir=${appDownloadsDir}`
                ]
            };

            // ============================================
            // FIXED: Direct browser detection for Linux
            // ============================================
            const os = require('os');
            const platform = os.platform();

            if (this.executablePath) {
                launchOptions.executablePath = this.executablePath;
                console.log(`Using configured browser: ${this.executablePath}`);
            } else if (platform === 'linux') {
                // Force chromium-browser on Linux
                const linuxChromiumPaths = [
                    '/usr/bin/chromium-browser',
                    '/usr/bin/chromium',
                    '/snap/bin/chromium',
                    '/usr/bin/google-chrome',
                    '/usr/bin/google-chrome-stable'
                ];

                for (const browserPath of linuxChromiumPaths) {
                    if (fs.existsSync(browserPath)) {
                        launchOptions.executablePath = browserPath;
                        console.log(`Found and using browser: ${browserPath}`);
                        break;
                    }
                }

                if (!launchOptions.executablePath) {
                    throw new Error('No Chromium/Chrome browser found on Linux. Please install: sudo apt install chromium-browser');
                }
            }

            console.log(`Launching browser...`);
            console.log(`Download directory set to: ${appDownloadsDir}`);

            // Launch the browser
            this.browser = await puppeteer.launch(launchOptions);
            console.log(`Browser launched successfully`);

            console.log('Creating new page...');
            this.page = await this.browser.newPage();

            // Set up download behavior immediately after page creation
            try {
                const client = await this.page.target().createCDPSession();
                await client.send('Page.setDownloadBehavior', {
                    behavior: 'allow',
                    downloadPath: appDownloadsDir
                });
                console.log('Initial download behavior set to:', appDownloadsDir);
            } catch (error) {
                console.log('Could not set initial download behavior:', error.message);
            }

            // Wait for page to be fully ready
            await this.page.waitForFunction(() => document.readyState === 'complete', { timeout: 10000 });

            // Set user agent to avoid detection
            await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

            // Set longer timeouts for network issues
            this.page.setDefaultTimeout(60000);
            this.page.setDefaultNavigationTimeout(60000);

            // Handle redirects to prevent going back to login
            this.page.on('response', async (response) => {
                if (response.url().includes('/login') && this.isLoggedIn) {
                    console.log('Detected redirect to login page, attempting to navigate back to main app...');
                    try {
                        await this.page.goto('https://www.kiriengine.app/webapp/', {
                            waitUntil: 'networkidle2',
                            timeout: 30000
                        });
                    } catch (e) {
                        console.log('Failed to navigate back to main app:', e.message);
                    }
                }
            });

            return true;
        } catch (error) {
            throw new Error(`Failed to initialize browser: ${error.message}`);
        }
    }

    async login(email, password) {
        try {
            console.log('Login called with email:', email);
            console.log('Login called with password:', password ? '[PROVIDED]' : '[MISSING]');

            // Prevent multiple simultaneous login attempts
            if (this.isLoggingIn) {
                console.log('Login already in progress, waiting...');
                while (this.isLoggingIn) {
                    await this.page.waitForTimeout(1000);
                }
                return { success: this.isLoggedIn, message: this.isLoggedIn ? 'Login completed' : 'Login failed' };
            }

            this.isLoggingIn = true;
            this.buttonClicked = false; // Reset button click flag for new login attempt

            if (!this.page) {
                await this.init();
            }

            // Navigate to Kiri Engine with retry logic for network issues
            console.log('Navigating to Kiri Engine...');
            let navigationSuccess = false;
            let navigationAttempts = 0;
            const maxNavigationAttempts = 3;

            while (!navigationSuccess && navigationAttempts < maxNavigationAttempts) {
                navigationAttempts++;
                console.log(`Navigation attempt ${navigationAttempts}/${maxNavigationAttempts}...`);

                try {
                    await this.page.goto('https://www.kiriengine.app/webapp/', {
                        waitUntil: 'networkidle2',
                        timeout: this.timeout
                    });
                    navigationSuccess = true;
                    console.log('Navigation successful');
                } catch (e) {
                    console.log(`Navigation failed (attempt ${navigationAttempts}):`, e.message);
                    if (navigationAttempts < maxNavigationAttempts) {
                        console.log('Retrying navigation in 3 seconds...');
                        await this.page.waitForTimeout(3000);
                    }
                }
            }

            if (!navigationSuccess) {
                throw new Error('Failed to navigate to Kiri Engine after multiple attempts');
            }

            // Wait for page to load completely (reduced wait time)
            await this.page.waitForTimeout(1500);

            // Check if we need to click the "Log In" button to access the login form
            try {
                const loginButton = await this.page.$('a.log_in_btn');
                if (loginButton) {
                    console.log('Clicking Log In button to access login form...');
                    await loginButton.click();
                    await this.page.waitForTimeout(1000); // Reduced wait time
                }
            } catch (e) {
                console.log('Log In button not found or already on login page');
            }

            // Check if already logged in
            const isAlreadyLoggedIn = await this.checkLoginStatus();
            if (isAlreadyLoggedIn) {
                console.log('Already logged in');
                this.isLoggedIn = true;
                return { success: true, message: 'Already logged in' };
            }

            // Wait for login form to be visible after clicking Log In button (reduced wait)
            console.log('Waiting for login form to load...');
            await this.page.waitForTimeout(1000);

            // Look for login form elements using actual Kiri Engine selectors
            const loginSelectors = [
                'input[type="email"].k-input-inner',
                'input[type="email"]',
                '.k-input-inner[type="email"]'
            ];

            let emailInput = null;
            for (const selector of loginSelectors) {
                try {
                    emailInput = await this.page.$(selector);
                    if (emailInput) break;
                } catch (e) {
                    continue;
                }
            }

            // If still no email input found, wait a bit more and try again (reduced wait)
            if (!emailInput) {
                console.log('Email input not found, waiting for form to load...');
                await this.page.waitForTimeout(1500);

                for (const selector of loginSelectors) {
                    try {
                        emailInput = await this.page.$(selector);
                        if (emailInput) break;
                    } catch (e) {
                        continue;
                    }
                }
            }

            if (!emailInput) {
                throw new Error('Could not find email input field');
            }

            // Fill login form
            console.log('Filling login form...');
            console.log('Email to enter:', email);

            // Clear and fill email field with multiple methods
            await emailInput.click();
            await emailInput.evaluate(input => input.value = ''); // Clear any existing value

            // Try multiple input methods for better reliability
            console.log('Setting email value using multiple methods...');

            // Method 1: Direct value setting with events
            await emailInput.evaluate((input, value) => {
                input.focus();
                input.value = value;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                input.dispatchEvent(new Event('blur', { bubbles: true }));
            }, email);

            // Method 2: Type the email character by character as fallback
            await this.page.waitForTimeout(500);
            const currentEmailValue = await emailInput.evaluate(input => input.value);
            if (!currentEmailValue || currentEmailValue !== email) {
                console.log('Direct value setting failed, trying type method...');
                await emailInput.click();
                await emailInput.evaluate(input => input.value = '');
                await emailInput.type(email, { delay: 50 });
            }

            // Verify email was entered
            const emailValue = await emailInput.evaluate(input => input.value);
            console.log('Email field value after fast method:', emailValue);

            // Find and fill password using actual Kiri Engine selectors
            const passwordSelectors = [
                'input[type="password"].k-input-inner',
                'input[type="password"]',
                '.k-input-inner[type="password"]'
            ];

            let passwordInput = null;
            for (const selector of passwordSelectors) {
                try {
                    passwordInput = await this.page.$(selector);
                    if (passwordInput) break;
                } catch (e) {
                    continue;
                }
            }

            if (!passwordInput) {
                throw new Error('Could not find password input field');
            }

            console.log('Password to enter:', password);

            // Clear and fill password field with multiple methods
            await passwordInput.click();
            await passwordInput.evaluate(input => input.value = ''); // Clear any existing value

            // Try multiple input methods for better reliability
            console.log('Setting password value using multiple methods...');

            // Method 1: Direct value setting with events
            await passwordInput.evaluate((input, value) => {
                input.focus();
                input.value = value;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                input.dispatchEvent(new Event('blur', { bubbles: true }));
            }, password);

            // Method 2: Type the password character by character as fallback
            await this.page.waitForTimeout(500);
            const currentPasswordValue = await passwordInput.evaluate(input => input.value);
            if (!currentPasswordValue || currentPasswordValue !== password) {
                console.log('Direct value setting failed, trying type method...');
                await passwordInput.click();
                await passwordInput.evaluate(input => input.value = '');
                await passwordInput.type(password, { delay: 50 });
            }

            // Verify password was entered
            const passwordValue = await passwordInput.evaluate(input => input.value);
            console.log('Password field value after fast method:', passwordValue ? '[HIDDEN]' : '[EMPTY]');

            // Submit form using actual Kiri Engine submit button
            console.log('Submitting login form...');
            const submitSelectors = [
                'div.form_item button.mask-button_hover',
                'button.mask-button_hover',
                'button[data-v-056c4f14].mask-button_hover',
                'button[class*="mask-button"]',
                'button:has-text("Log In")',
                'button'
            ];

            let submitButton = null;
            for (const selector of submitSelectors) {
                try {
                    submitButton = await this.page.$(selector);
                    if (submitButton) {
                        // Check if it's the login button by looking for "Log In" text
                        const buttonText = await this.page.evaluate(el => el.textContent, submitButton);
                        console.log('Found button with text:', buttonText);
                        if (buttonText && buttonText.toLowerCase().includes('log in')) {
                            console.log('Login button found and selected');
                            break;
                        }
                    }
                } catch (e) {
                    console.log('Selector failed:', selector, e.message);
                    continue;
                }
            }

            if (!submitButton) {
                console.log('No submit button found, trying Enter key...');
                // Try pressing Enter as fallback
                await this.page.keyboard.press('Enter');
            } else {
                console.log('Clicking login button...');

                // Prevent multiple button clicks
                if (this.buttonClicked) {
                    console.log('Button already clicked, skipping...');
                } else {
                    this.buttonClicked = true;

                    // Single click strategy with proper state management
                    console.log('Clicking login button once...');

                    // Check if button is still clickable and not disabled
                    const isButtonEnabled = await submitButton.evaluate(button => {
                        return !button.disabled && button.offsetParent !== null;
                    });

                    if (!isButtonEnabled) {
                        console.log('Login button is disabled or not visible, trying Enter key...');
                        await this.page.keyboard.press('Enter');
                    } else {
                        // Single click with proper event handling
                        try {
                            await submitButton.click();
                            console.log('Login button clicked successfully');
                        } catch (e) {
                            console.log('Normal click failed, trying JavaScript click...');
                            await submitButton.evaluate(button => {
                                button.click();
                            });
                        }
                    }
                }

                // Wait for the click to register and prevent multiple clicks
                console.log('Waiting for login to process...');
                await this.page.waitForTimeout(3000);
            }

            // Wait for navigation or login completion with multiple checks
            console.log('Waiting for login to complete...');
            let loginSuccess = false;

            // Try multiple approaches to detect login success
            for (let attempt = 1; attempt <= 5; attempt++) {
                console.log(`Login verification attempt ${attempt}/5...`);

                try {
                    // Wait for navigation
                    await this.page.waitForNavigation({
                        waitUntil: 'networkidle2',
                        timeout: 15000
                    });
                    console.log('Navigation detected');
                } catch (e) {
                    console.log('No navigation detected, checking current state...');
                }

                // Wait for page to stabilize
                await this.page.waitForTimeout(2000);

                // Check login status
                loginSuccess = await this.checkLoginStatus();
                if (loginSuccess) {
                    console.log('Login success detected!');

                    // Additional wait to ensure we don't get redirected back
                    await this.page.waitForTimeout(3000);

                    // Double-check we're still logged in
                    const stillLoggedIn = await this.checkLoginStatus();
                    if (stillLoggedIn) {
                        console.log('Login confirmed - still logged in after waiting');
                        break;
                    } else {
                        console.log('Login was temporary, continuing to check...');
                        loginSuccess = false;
                    }
                }

                // Wait a bit more and check again
                if (attempt < 5) {
                    console.log('Login not yet successful, waiting and retrying...');
                    await this.page.waitForTimeout(3000);
                }
            }

            if (loginSuccess) {
                this.isLoggedIn = true;
                this.isLoggingIn = false;
                console.log('Login successful');

                // Check for and close Kiri Engine Pro advertisement modal if it appears
                await this.closeProAdvertisementModal();

                return { success: true, message: 'Successfully logged in' };
            } else {
                this.isLoggingIn = false;
                console.log('Login failed - checking for error messages...');

                // Check for error messages on the page
                const errorMessages = await this.page.evaluate(() => {
                    const errorSelectors = [
                        '.error', '.alert', '.warning', '.message',
                        '[class*="error"]', '[class*="alert"]', '[class*="warning"]'
                    ];
                    const errors = [];
                    for (const selector of errorSelectors) {
                        const elements = document.querySelectorAll(selector);
                        for (const el of elements) {
                            if (el.textContent && el.textContent.trim()) {
                                errors.push(el.textContent.trim());
                            }
                        }
                    }
                    return errors;
                });

                // Check specifically for network errors
                const hasNetworkError = errorMessages.some(msg =>
                    msg.toLowerCase().includes('network') ||
                    msg.toLowerCase().includes('unavailable') ||
                    msg.toLowerCase().includes('connection')
                );

                if (hasNetworkError) {
                    console.log('Network error detected, attempting retry...');
                    this.isLoggingIn = false;

                    // Wait a bit and retry the entire login process
                    await this.page.waitForTimeout(5000);
                    console.log('Retrying login due to network error...');
                    return await this.login(email, password);
                }

                if (errorMessages.length > 0) {
                    console.log('Error messages found:', errorMessages);
                    throw new Error(`Login failed: ${errorMessages.join(', ')}`);
                } else {
                    throw new Error('Login failed - credentials may be incorrect or form not submitted properly');
                }
            }

        } catch (error) {
            this.isLoggingIn = false;
            console.error('Login error:', error.message);
            return { success: false, message: `Login failed: ${error.message}` };
        }
    }

    async checkLoginStatus() {
        try {
            console.log('Checking login status...');
            const currentUrl = this.page.url();
            console.log('Current URL:', currentUrl);

            // Wait a moment for page to stabilize
            await this.page.waitForTimeout(1000);

            // Check if we're on login page - if so, definitely not logged in
            if (currentUrl.includes('/login')) {
                console.log('Still on login page - not logged in');
                return false;
            }

            // Look for Kiri Engine specific logged-in indicators
            const loggedInSelectors = [
                // Kiri Engine specific selectors
                'a[href*="logout"]',
                'a[href*="profile"]',
                '.user-avatar',
                '.account-menu',
                '.user-menu',
                '.profile',
                '.dashboard',
                '.upload-area',
                '[data-testid="user-menu"]',
                '.avatar',
                '.user-info',
                // Look for Photo Scan or other main app elements
                'div:has-text("Photo Scan")',
                'div:has-text("Start creating")',
                'div:has-text("Upload")',
                '.a_l', // Photo Scan card
                'div[data-v-07ce6356]' // Kiri Engine specific data attributes
            ];

            for (const selector of loggedInSelectors) {
                try {
                    const element = await this.page.$(selector);
                    if (element) {
                        console.log(`Found logged-in indicator: ${selector}`);
                        return true;
                    }
                } catch (e) {
                    continue;
                }
            }

            // Check URL patterns for logged-in state
            if (currentUrl.includes('/dashboard') ||
                currentUrl.includes('/app') ||
                currentUrl.includes('/main') ||
                (currentUrl.includes('/webapp') && !currentUrl.includes('/login')) ||
                currentUrl.includes('/mymodel') ||
                currentUrl.includes('/upload')) {
                console.log('URL indicates logged-in state');
                return true;
            }

            // Check for absence of login form elements
            const loginFormExists = await this.page.$('input[type="email"]') ||
                await this.page.$('input[type="password"]') ||
                await this.page.$('button:has-text("Log In")');

            if (!loginFormExists) {
                console.log('No login form found - likely logged in');
                return true;
            }

            console.log('No clear logged-in indicators found');
            return false;
        } catch (error) {
            console.log('Error checking login status:', error.message);
            return false;
        }
    }

    /**
     * Detect and close Kiri Engine Pro advertisement modal if it appears
     * This modal sometimes appears after login and needs to be closed before proceeding
     */
    async closeProAdvertisementModal() {
        try {
            console.log('Checking for Kiri Engine Pro advertisement modal...');

            // Wait a moment for modal to appear (if it's going to appear)
            await this.page.waitForTimeout(2000);

            // Multiple selectors to find the close button
            const closeButtonSelectors = [
                'button.close-btn[data-v-17f9c411]',
                'button.close-btn',
                'button[data-v-17f9c411].close-btn',
                '.el-dialog__body button.close-btn',
                'div[data-v-17f9c411] button.close-btn'
            ];

            let closeButton = null;

            // Try to find the close button
            for (const selector of closeButtonSelectors) {
                try {
                    closeButton = await this.page.$(selector);
                    if (closeButton) {
                        // Verify it's actually the close button by checking if it's visible
                        const isVisible = await this.page.evaluate((btn) => {
                            return btn && btn.offsetParent !== null &&
                                window.getComputedStyle(btn).display !== 'none';
                        }, closeButton);

                        if (isVisible) {
                            console.log(`Found Pro advertisement modal close button with selector: ${selector}`);
                            break;
                        } else {
                            closeButton = null;
                        }
                    }
                } catch (e) {
                    continue;
                }
            }

            // Alternative: Check if modal exists by looking for modal body with specific content
            if (!closeButton) {
                console.log('Close button not found with direct selectors, checking for modal body...');

                const modalExists = await this.page.evaluate(() => {
                    // Look for modal body with the specific data attribute
                    const modalBody = document.querySelector('div.el-dialog__body');
                    if (modalBody) {
                        // Check if it contains the Pro advertisement content
                        const hasProContent = modalBody.querySelector('div[data-v-17f9c411]') !== null ||
                            modalBody.textContent.includes('biggest sale') ||
                            modalBody.textContent.includes('55% OFF') ||
                            modalBody.textContent.includes('Kiri Engine Pro');

                        if (hasProContent) {
                            // Find close button within this modal
                            const closeBtn = modalBody.querySelector('button.close-btn');
                            return closeBtn !== null;
                        }
                    }
                    return false;
                });

                if (modalExists) {
                    console.log('Pro advertisement modal detected, trying to find close button...');
                    // Try again with a more specific selector
                    closeButton = await this.page.$('.el-dialog__body button.close-btn');
                }
            }

            if (closeButton) {
                console.log('Closing Kiri Engine Pro advertisement modal...');

                // Try clicking the close button
                try {
                    await closeButton.click();
                    console.log('Successfully clicked close button');

                    // Wait for modal to disappear
                    await this.page.waitForTimeout(1000);

                    // Verify modal is closed
                    const modalStillOpen = await this.page.evaluate(() => {
                        const modalBody = document.querySelector('div.el-dialog__body');
                        if (modalBody) {
                            const hasProContent = modalBody.querySelector('div[data-v-17f9c411]') !== null ||
                                modalBody.textContent.includes('biggest sale') ||
                                modalBody.textContent.includes('55% OFF');
                            return hasProContent;
                        }
                        return false;
                    });

                    if (!modalStillOpen) {
                        console.log('✅ Pro advertisement modal closed successfully');
                    } else {
                        console.log('⚠️ Modal may still be open, trying alternative close method...');
                        // Try pressing Escape key as fallback
                        await this.page.keyboard.press('Escape');
                        await this.page.waitForTimeout(500);
                    }
                } catch (clickError) {
                    console.log('Error clicking close button, trying JavaScript click...', clickError.message);
                    // Fallback: Use JavaScript click
                    try {
                        await this.page.evaluate((btn) => {
                            if (btn) {
                                btn.click();
                            }
                        }, closeButton);
                        await this.page.waitForTimeout(1000);
                        console.log('Closed modal using JavaScript click');
                    } catch (jsError) {
                        console.log('JavaScript click also failed, trying Escape key...', jsError.message);
                        // Last resort: Press Escape
                        await this.page.keyboard.press('Escape');
                        await this.page.waitForTimeout(500);
                    }
                }
            } else {
                console.log('No Pro advertisement modal detected - proceeding normally');
            }

        } catch (error) {
            console.log('Error checking/closing Pro advertisement modal:', error.message);
            // Don't throw error - just log it and continue
            // The modal might not appear every time, so this is not critical
        }
    }

    async configureProjectSettings() {
        try {
            console.log('Configuring project settings...');

            // Wait for project setup page to load
            await this.page.waitForTimeout(2000);

            // Enable Auto Object Masking switch (new UI)
            console.log('Enabling Auto Object Masking switch...');
            const autoMaskSelectors = [
                'div[data-v-3f51526f] .switch.k-slider-switch',
                '.form-item__content .switch.k-slider-switch',
                '.switch.k-slider-switch'
            ];
            let autoMaskSwitch = null;

            for (const selector of autoMaskSelectors) {
                try {
                    const element = await this.page.$(selector);
                    if (element) {
                        autoMaskSwitch = element;
                        console.log(`Auto Object Masking switch found with selector: ${selector}`);
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }

            if (autoMaskSwitch) {
                const isChecked = await autoMaskSwitch.evaluate(el => {
                    const input = el.querySelector('input[type="checkbox"]');
                    if (input) return input.checked;
                    return el.classList.contains('is-checked') || el.classList.contains('switch--checked');
                });

                if (!isChecked) {
                    console.log('Auto Object Masking is disabled, enabling now...');
                    const switchTarget = await autoMaskSwitch.$('.switch__core') || autoMaskSwitch;
                    try {
                        await switchTarget.click();
                    } catch (clickError) {
                        console.log('Primary click failed, trying alternative click for Auto Object Masking...', clickError.message);
                        await autoMaskSwitch.click();
                    }
                    await this.page.waitForTimeout(800);
                    console.log('Auto Object Masking enabled');
                } else {
                    console.log('Auto Object Masking already enabled');
                }
            } else {
                console.log('Auto Object Masking switch not found (UI may have changed)');
            }

            // Set file format to GLB using updated selectors
            console.log('Setting file format to GLB (new UI selectors)...');
            const fileFormatSelectors = [
                'div[data-v-3f51526f].k-input.k-select',
                '.form-item__content .k-input.k-select',
                '.k-input.k-select'
            ];
            let fileFormatDropdown = null;

            for (const selector of fileFormatSelectors) {
                try {
                    const candidates = await this.page.$$(selector);
                    for (const candidate of candidates) {
                        const textContent = await this.page.evaluate(el => el.textContent || '', candidate);
                        if (textContent && (textContent.includes('OBJ') || textContent.includes('GLB'))) {
                            fileFormatDropdown = candidate;
                            console.log(`File format dropdown found with selector: ${selector}`);
                            break;
                        }
                    }
                    if (fileFormatDropdown) break;
                } catch (e) {
                    continue;
                }
            }

            if (fileFormatDropdown) {
                let dropdownClicked = false;
                const inputWrap = await fileFormatDropdown.$('.k-input-wrap');
                if (inputWrap) {
                    try {
                        await inputWrap.click();
                        dropdownClicked = true;
                    } catch (e) {
                        console.log('Failed to click input wrap, falling back to entire dropdown:', e.message);
                    }
                }

                if (!dropdownClicked) {
                    try {
                        await fileFormatDropdown.click();
                    } catch (e) {
                        console.log('Failed to click file format dropdown:', e.message);
                    }
                }

                await this.page.waitForTimeout(800);

                const optionSelectors = [
                    'div[data-v-3f51526f].select-list_wrap li',
                    '.select-list_wrap li'
                ];
                let glbOption = null;

                for (const selector of optionSelectors) {
                    try {
                        const options = await this.page.$$(selector);
                        for (const option of options) {
                            const optionText = await this.page.evaluate(el => el.textContent.trim(), option);
                            if (optionText === 'GLB') {
                                glbOption = option;
                                console.log('GLB option located');
                                break;
                            }
                        }
                        if (glbOption) break;
                    } catch (e) {
                        continue;
                    }
                }

                if (glbOption) {
                    await glbOption.click();
                    console.log('GLB format selected');
                    await this.page.waitForTimeout(800);
                } else {
                    console.log('GLB option not found in updated dropdown');
                }
            } else {
                console.log('File format dropdown not found - selectors may need updating');
            }

            // Set texture resolution to 4K (new UI)
            console.log('Setting texture resolution to 4K...');
            const textureSelectors = [
                'div[data-v-3f51526f].form-item__content .k-input.k-select',
                '.form-item__content .k-input.k-select',
                '.k-input.k-select'
            ];
            let textureDropdown = null;

            for (const selector of textureSelectors) {
                try {
                    const candidates = await this.page.$$(selector);
                    for (const candidate of candidates) {
                        const textContent = await this.page.evaluate(el => el.textContent || '', candidate);
                        if (textContent && (textContent.includes('8K') || textContent.includes('4K') || textContent.includes('2K'))) {
                            textureDropdown = candidate;
                            console.log(`Texture resolution dropdown candidate found with selector: ${selector}`);
                            break;
                        }
                    }
                    if (textureDropdown) break;
                } catch (e) {
                    continue;
                }
            }

            if (textureDropdown) {
                let dropdownClicked = false;
                const textureInputWrap = await textureDropdown.$('.k-input-wrap');
                if (textureInputWrap) {
                    try {
                        await textureInputWrap.click();
                        dropdownClicked = true;
                    } catch (e) {
                        console.log('Failed to click texture input wrap, falling back to entire dropdown:', e.message);
                    }
                }

                if (!dropdownClicked) {
                    try {
                        await textureDropdown.click();
                    } catch (e) {
                        console.log('Failed to click texture dropdown:', e.message);
                    }
                }

                await this.page.waitForTimeout(800);

                const textureOptionSelectors = [
                    'div[data-v-3f51526f].select-list_wrap li',
                    '.select-list_wrap li'
                ];
                let fourKOption = null;

                for (const selector of textureOptionSelectors) {
                    try {
                        const options = await this.page.$$(selector);
                        for (const option of options) {
                            const optionText = await this.page.evaluate(el => el.textContent.trim(), option);
                            if (optionText === '4K') {
                                fourKOption = option;
                                console.log('4K texture option located');
                                break;
                            }
                        }
                        if (fourKOption) break;
                    } catch (e) {
                        continue;
                    }
                }

                if (fourKOption) {
                    await fourKOption.click();
                    console.log('4K texture resolution selected');
                    await this.page.waitForTimeout(800);
                } else {
                    console.log('4K option not found in texture dropdown');
                }
            } else {
                console.log('Texture resolution dropdown not found - selectors may need updating');
            }

            // Set project name if needed
            console.log('Setting project name...');
            const nameInputSelectors = [
                'input[placeholder*="Name"]',
                'input[name="name"]',
                '.k-input-inner[type="text"]',
                'input[type="text"]'
            ];

            let nameInput = null;
            for (const selector of nameInputSelectors) {
                try {
                    nameInput = await this.page.$(selector);
                    if (nameInput) {
                        // Check if it's the name field by looking at placeholder or nearby text
                        const placeholder = await this.page.evaluate(el => el.placeholder, nameInput);
                        if (placeholder && placeholder.toLowerCase().includes('name')) {
                            console.log('Project name input found');
                            break;
                        }
                    }
                } catch (e) {
                    continue;
                }
            }

            if (nameInput) {
                const projectName = `3D_Model_${Date.now()}`;
                await nameInput.click();
                await nameInput.evaluate(input => input.value = '');
                await nameInput.evaluate((input, value) => {
                    input.value = value;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                }, projectName);
                console.log(`Project name set to: ${projectName}`);
            }

            // Click "Create 3D Model Now" button to start processing
            console.log('Clicking Create 3D Model Now button...');
            const createButtonSelectors = [
                'button[data-v-3f51526f].mask-button_hover',
                'button[data-v-955c126f].mask-button_hover',
                'button.mask-button_hover',
                'button:has-text("Create 3D Model Now")',
                'button:has-text("Create")',
                '.gradient-button',
                'button[class*="gradient"]'
            ];

            let createButton = null;
            for (const selector of createButtonSelectors) {
                try {
                    createButton = await this.page.$(selector);
                    if (createButton) {
                        const buttonText = await this.page.evaluate(el => el.textContent, createButton);
                        if (buttonText && buttonText.includes('Create')) {
                            console.log(`Create button found with selector: ${selector}`);
                            break;
                        }
                    }
                } catch (e) {
                    continue;
                }
            }

            if (createButton) {
                await createButton.click();
                console.log('Create 3D Model Now button clicked');

                // Wait for "Upload Successful" modal to appear first
                console.log('Waiting for Upload Successful modal to appear...');
                try {
                    // Wait for modal with "Upload Successful" text (try multiple variations)
                    await this.page.waitForFunction(() => {
                        const elements = document.querySelectorAll('div, span, p, h1, h2, h3, h4, h5, h6, button');
                        for (const el of elements) {
                            const text = el.textContent;
                            if (text && (
                                text.includes('Upload Successful') ||
                                text.includes('Upload successful') ||
                                text.includes('Successfully uploaded') ||
                                text.includes('Upload completed') ||
                                text.includes('Upload Complete') ||
                                text.includes('Uploaded successfully') ||
                                text.includes('Files uploaded') ||
                                text.includes('Upload finished') ||
                                text.includes('Processing started') ||
                                text.includes('Model creation started') ||
                                text.includes('Creating 3D model') ||
                                text.includes('Processing your files') ||
                                text.includes('Upload complete')
                            )) {
                                console.log('Found upload success modal with text:', text);
                                return true;
                            }
                        }
                        return false;
                    }, { timeout: 900000 }); // Wait up to 15 minutes for modal

                    console.log('Upload Successful modal appeared');

                    // Now wait for OK button to be present and clickable
                    console.log('Waiting for OK button in Upload Success Modal...');
                    const okButtonSelectors = [
                        'button.el-button.el-button--primary',
                        '.el-button--primary',
                        'button[type="button"].el-button',
                        'button.el-button'
                    ];

                    let okButton = null;

                    // Wait for OK button to appear using waitForFunction
                    await this.page.waitForFunction(() => {
                        const selectors = [
                            'button.el-button.el-button--primary',
                            '.el-button--primary',
                            'button[type="button"].el-button',
                            'button.el-button'
                        ];

                        for (const selector of selectors) {
                            const buttons = document.querySelectorAll(selector);
                            for (const button of buttons) {
                                if (button.textContent && button.textContent.trim() === 'OK') {
                                    // Check if button is clickable
                                    if (!button.disabled && button.offsetParent !== null) {
                                        return true;
                                    }
                                }
                            }
                        }
                        return false;
                    }); // Wait indefinitely for OK button - no timeout

                    console.log('OK button found in Upload Success Modal');

                    // Now find and click the OK button
                    for (const selector of okButtonSelectors) {
                        try {
                            const buttons = await this.page.$$(selector);
                            for (const button of buttons) {
                                const buttonText = await this.page.evaluate(el => el.textContent, button);
                                if (buttonText && buttonText.trim() === 'OK') {
                                    const isClickable = await this.page.evaluate(el => {
                                        return !el.disabled && el.offsetParent !== null;
                                    }, button);

                                    if (isClickable) {
                                        okButton = button;
                                        console.log(`OK button found and clickable with selector: ${selector}`);
                                        break;
                                    }
                                }
                            }
                            if (okButton) break;
                        } catch (e) {
                            continue;
                        }
                    }

                    if (okButton) {
                        await okButton.click();
                        console.log('OK button clicked - upload process completed');

                        // Wait for modal to close and page to stabilize
                        console.log('Waiting for modal to close...');
                        await this.page.waitForTimeout(3000);

                        // Navigate to home page after OK click
                        console.log('Navigating to home page...');
                        try {
                            await this.page.goto('https://www.kiriengine.app/webapp/mymodel', {
                                waitUntil: 'networkidle2',
                                timeout: 30000
                            });
                            console.log('Successfully navigated to home page');

                            // Wait for home page to fully load and stabilize
                            console.log('Waiting for home page to stabilize...');
                            await this.page.waitForTimeout(5000);

                            // Verify we're actually on the home page
                            const currentUrl = this.page.url();
                            console.log('Current URL after navigation:', currentUrl);

                            if (!currentUrl.includes('/mymodel')) {
                                console.log('Not on home page, attempting to navigate again...');
                                await this.page.goto('https://www.kiriengine.app/webapp/mymodel', {
                                    waitUntil: 'networkidle2',
                                    timeout: 30000
                                });
                                await this.page.waitForTimeout(3000);
                            }

                        } catch (navError) {
                            console.log('Navigation to home page failed:', navError.message);
                        }
                    } else {
                        console.log('OK button not found after waitForFunction');
                        // Navigate to home page anyway
                        console.log('Navigating to home page as fallback...');
                        try {
                            await this.page.goto('https://www.kiriengine.app/webapp/mymodel', {
                                waitUntil: 'networkidle2',
                                timeout: 30000
                            });
                            console.log('Successfully navigated to home page');

                            // Wait for home page to fully load and stabilize
                            console.log('Waiting for home page to stabilize...');
                            await this.page.waitForTimeout(5000);

                        } catch (navError) {
                            console.log('Navigation to home page failed:', navError.message);
                        }
                    }
                } catch (e) {
                    console.log('Upload success modal or OK button did not appear within timeout:', e.message);
                    console.log('Current page URL:', this.page.url());
                    console.log('Current page title:', await this.page.title());

                    // Check what's actually on the page
                    const pageContent = await this.page.content();
                    console.log('Page contains "success":', pageContent.toLowerCase().includes('success'));
                    console.log('Page contains "upload":', pageContent.toLowerCase().includes('upload'));
                    console.log('Page contains "complete":', pageContent.toLowerCase().includes('complete'));
                    console.log('Page contains "processing":', pageContent.toLowerCase().includes('processing'));
                    console.log('Page contains "model":', pageContent.toLowerCase().includes('model'));

                    // Check for any modals or overlays
                    const modals = await this.page.$$('div[class*="modal"], div[class*="overlay"], div[class*="dialog"]');
                    console.log('Found modals/overlays:', modals.length);

                    // Check for any buttons with text
                    const buttons = await this.page.$$('button');
                    console.log('Found buttons:', buttons.length);
                    for (let i = 0; i < Math.min(buttons.length, 5); i++) {
                        const buttonText = await this.page.evaluate(el => el.textContent, buttons[i]);
                        if (buttonText && buttonText.trim()) {
                            console.log(`Button ${i}: "${buttonText.trim()}"`);
                        }
                    }

                    // Check if we're still on upload page
                    const currentUrl = this.page.url();
                    if (currentUrl.includes('/upload/')) {
                        console.log('Still on upload page, waiting a bit more...');
                        await this.page.waitForTimeout(5000);

                        // Try to find any success indicators again
                        const successElements = await this.page.$$('div, span, p');
                        for (const el of successElements) {
                            const text = await this.page.evaluate(element => element.textContent, el);
                            if (text && (
                                text.includes('success') ||
                                text.includes('complete') ||
                                text.includes('processing') ||
                                text.includes('model')
                            )) {
                                console.log('Found potential success indicator:', text);
                            }
                        }
                    }

                    // Navigate to home page anyway
                    console.log('Navigating to home page as fallback...');
                    try {
                        await this.page.goto('https://www.kiriengine.app/webapp/mymodel', {
                            waitUntil: 'networkidle2',
                            timeout: 30000
                        });
                        console.log('Successfully navigated to home page');
                    } catch (navError) {
                        console.log('Navigation to home page failed:', navError.message);
                    }
                }
            } else {
                console.log('Create button not found');
            }

            console.log('Project settings configured successfully');
            return { success: true, message: 'Project settings configured and upload process completed' };

        } catch (error) {
            console.error('Project configuration error:', error.message);
            return { success: false, message: `Project configuration failed: ${error.message}` };
        }
    }

    async uploadFile(filePath) {
        try {
            if (!this.isLoggedIn) {
                throw new Error('Not logged in. Please login first.');
            }

            console.log(`Uploading file: ${filePath}`);

            // Check for and close Kiri Engine Pro advertisement modal if it appears
            await this.closeProAdvertisementModal();

            // First, navigate to the main webapp page if not already there
            const currentUrl = this.page.url();
            console.log('Current URL before upload:', currentUrl);
            
            if (!currentUrl.includes('/webapp') || currentUrl.includes('/share/') || currentUrl.includes('/download/')) {
                console.log('Navigating to webapp main page...');
                await this.page.goto('https://www.kiriengine.app/webapp/', {
                    waitUntil: 'networkidle2',
                    timeout: 30000
                });
                await this.page.waitForTimeout(3000);
            }

            // Check for and close any modals that might be blocking
            await this.closeProAdvertisementModal();

            // First, click on Photo Scan to start the upload process
            console.log('Clicking Photo Scan to start upload process...');
            
            // Wait for page to be fully loaded
            await this.page.waitForTimeout(2000);

            // Use page.evaluate to find Photo Scan card by text content (Puppeteer compatible)
            let photoScanCard = await this.page.evaluateHandle(() => {
                // Try multiple approaches to find Photo Scan card
                const allDivs = document.querySelectorAll('div');
                for (const div of allDivs) {
                    const text = div.textContent || '';
                    // Look for div that contains "Photo Scan" text
                    if (text.includes('Photo Scan') && 
                        (div.classList.contains('a_l') || 
                         div.classList.contains('card') ||
                         div.classList.contains('scan-card') ||
                         div.querySelector('.title') ||
                         div.querySelector('h3') ||
                         div.querySelector('h4'))) {
                        return div;
                    }
                }
                
                // Fallback: Look for specific class patterns
                const cardSelectors = [
                    'div.a_l',
                    'div[class*="card"]',
                    'div[class*="scan"]',
                    'div[class*="photo"]'
                ];
                
                for (const selector of cardSelectors) {
                    const elements = document.querySelectorAll(selector);
                    for (const el of elements) {
                        if (el.textContent && el.textContent.includes('Photo Scan')) {
                            return el;
                        }
                    }
                }
                
                return null;
            });

            // Check if we got a valid element
            const isValidElement = await this.page.evaluate(el => el !== null && el.tagName !== undefined, photoScanCard);
            
            if (!isValidElement) {
                // Log what's on the page for debugging
                const pageContent = await this.page.evaluate(() => {
                    const cards = document.querySelectorAll('div[class*="card"], div[class*="scan"], div.a_l');
                    return Array.from(cards).map(c => ({
                        className: c.className,
                        text: c.textContent?.substring(0, 100)
                    }));
                });
                console.log('Available cards on page:', JSON.stringify(pageContent, null, 2));
                throw new Error('Could not find Photo Scan card');
            }

            console.log('Photo Scan card found');

            // Click the Photo Scan card
            await photoScanCard.click();
            console.log('Photo Scan card clicked');
            await this.page.waitForTimeout(3000);

            // Now look for file upload input
            console.log('Looking for file upload input...');
            
            // Wait for upload page to load
            await this.page.waitForTimeout(2000);

            let uploadElement = await this.page.$('input[type="file"]');
            
            if (!uploadElement) {
                // Try to find hidden file input
                uploadElement = await this.page.evaluateHandle(() => {
                    const inputs = document.querySelectorAll('input[type="file"]');
                    if (inputs.length > 0) return inputs[0];
                    return null;
                });
                
                const isValid = await this.page.evaluate(el => el !== null && el.tagName !== undefined, uploadElement);
                if (!isValid) uploadElement = null;
            }

            if (!uploadElement) {
                // Click any visible upload button/area first
                const uploadAreaClicked = await this.page.evaluate(() => {
                    const uploadSelectors = [
                        'div[class*="upload"]',
                        'div[class*="drop"]',
                        'button[class*="upload"]',
                        '.upload-area',
                        '.dropzone'
                    ];
                    
                    for (const selector of uploadSelectors) {
                        const el = document.querySelector(selector);
                        if (el && el.offsetParent !== null) {
                            el.click();
                            return true;
                        }
                    }
                    return false;
                });
                
                if (uploadAreaClicked) {
                    console.log('Clicked upload area, waiting for file input...');
                    await this.page.waitForTimeout(2000);
                }
                
                // Try to find file input again
                uploadElement = await this.page.$('input[type="file"]');
            }

            if (!uploadElement) {
                throw new Error('Could not find file upload element after clicking Photo Scan');
            }

            console.log('File upload input found');

            // Upload the file
            await uploadElement.uploadFile(filePath);
            console.log('File uploaded successfully');

            // Wait for upload to complete and project settings to appear
            console.log('Waiting for project settings to appear on the upload page...');
            // Removed timeout - let the upload complete naturally

            // Configure project settings directly on the upload page
            console.log('Configuring project settings on the upload page...');
            await this.configureProjectSettings();

            // Look for processing indicators
            const processingSelectors = [
                '.processing',
                '.loading',
                '.progress',
                '[data-testid="processing"]',
                '.spinner',
                '.upload-progress'
            ];

            let processingStarted = false;
            for (const selector of processingSelectors) {
                try {
                    await this.page.waitForSelector(selector, { timeout: 5000 });
                    processingStarted = true;
                    break;
                } catch (e) {
                    continue;
                }
            }

            if (!processingStarted) {
                console.log('Processing indicators not found, but upload may have succeeded');
            }

            return { success: true, message: 'File uploaded and processing started' };

        } catch (error) {
            console.error('Upload error:', error.message);
            return { success: false, message: `Upload failed: ${error.message}` };
        }
    }

    async uploadMultipleFiles(filePaths) {
        try {
            if (!this.isLoggedIn) {
                throw new Error('Not logged in. Please login first.');
            }

            console.log(`Uploading ${filePaths.length} files`);

            // First, navigate to the main webapp page if not already there
            const currentUrl = this.page.url();
            console.log('Current URL before upload:', currentUrl);
            
            if (!currentUrl.includes('/webapp') || currentUrl.includes('/share/') || currentUrl.includes('/download/')) {
                console.log('Navigating to webapp main page...');
                await this.page.goto('https://www.kiriengine.app/webapp/', {
                    waitUntil: 'networkidle2',
                    timeout: 30000
                });
                await this.page.waitForTimeout(3000);
            }

            // Check for and close Kiri Engine Pro advertisement modal if it appears
            await this.closeProAdvertisementModal();

            // First, click on Photo Scan to start the upload process
            console.log('Clicking Photo Scan to start upload process...');
            
            // Wait for page to be fully loaded
            await this.page.waitForTimeout(2000);

            // Use page.evaluate to find Photo Scan card by text content (Puppeteer compatible)
            let photoScanCard = await this.page.evaluateHandle(() => {
                // Try multiple approaches to find Photo Scan card
                const allDivs = document.querySelectorAll('div');
                for (const div of allDivs) {
                    const text = div.textContent || '';
                    // Look for div that contains "Photo Scan" text
                    if (text.includes('Photo Scan') && 
                        (div.classList.contains('a_l') || 
                         div.classList.contains('card') ||
                         div.classList.contains('scan-card') ||
                         div.querySelector('.title') ||
                         div.querySelector('h3') ||
                         div.querySelector('h4'))) {
                        return div;
                    }
                }
                
                // Fallback: Look for specific class patterns
                const cardSelectors = [
                    'div.a_l',
                    'div[class*="card"]',
                    'div[class*="scan"]',
                    'div[class*="photo"]'
                ];
                
                for (const selector of cardSelectors) {
                    const elements = document.querySelectorAll(selector);
                    for (const el of elements) {
                        if (el.textContent && el.textContent.includes('Photo Scan')) {
                            return el;
                        }
                    }
                }
                
                return null;
            });

            // Check if we got a valid element
            const isValidElement = await this.page.evaluate(el => el !== null && el.tagName !== undefined, photoScanCard);
            
            if (!isValidElement) {
                // Log what's on the page for debugging
                const pageContent = await this.page.evaluate(() => {
                    const cards = document.querySelectorAll('div[class*="card"], div[class*="scan"], div.a_l');
                    return Array.from(cards).map(c => ({
                        className: c.className,
                        text: c.textContent?.substring(0, 100)
                    }));
                });
                console.log('Available cards on page:', JSON.stringify(pageContent, null, 2));
                throw new Error('Could not find Photo Scan card');
            }

            console.log('Photo Scan card found');

            // Click the Photo Scan card
            await photoScanCard.click();
            console.log('Photo Scan card clicked');
            await this.page.waitForTimeout(3000);

            // Now look for file upload input
            console.log('Looking for file upload input...');
            
            // Wait for upload page to load
            await this.page.waitForTimeout(2000);

            let uploadElement = await this.page.$('input[type="file"]');
            
            if (!uploadElement) {
                // Try to find hidden file input
                uploadElement = await this.page.evaluateHandle(() => {
                    const inputs = document.querySelectorAll('input[type="file"]');
                    if (inputs.length > 0) return inputs[0];
                    return null;
                });
                
                const isValid = await this.page.evaluate(el => el !== null && el.tagName !== undefined, uploadElement);
                if (!isValid) uploadElement = null;
            }

            if (!uploadElement) {
                // Click any visible upload button/area first
                const uploadAreaClicked = await this.page.evaluate(() => {
                    const uploadSelectors = [
                        'div[class*="upload"]',
                        'div[class*="drop"]',
                        'button[class*="upload"]',
                        '.upload-area',
                        '.dropzone'
                    ];
                    
                    for (const selector of uploadSelectors) {
                        const el = document.querySelector(selector);
                        if (el && el.offsetParent !== null) {
                            el.click();
                            return true;
                        }
                    }
                    return false;
                });
                
                if (uploadAreaClicked) {
                    console.log('Clicked upload area, waiting for file input...');
                    await this.page.waitForTimeout(2000);
                }
                
                // Try to find file input again
                uploadElement = await this.page.$('input[type="file"]');
            }

            if (!uploadElement) {
                throw new Error('Could not find file upload element after clicking Photo Scan');
            }

            console.log('File upload input found');

            // Upload all files at once
            await uploadElement.uploadFile(...filePaths);
            console.log(`${filePaths.length} files uploaded successfully`);

            // Wait for upload to complete and project settings to appear
            console.log('Waiting for project settings to appear on the upload page...');
            // Removed timeout - let the upload complete naturally

            // Configure project settings directly on the upload page
            console.log('Configuring project settings on the upload page...');
            await this.configureProjectSettings();

            // Look for processing indicators
            const processingSelectors = [
                '.processing',
                '.loading',
                '.progress',
                '[data-testid="processing"]',
                '.spinner',
                '.upload-progress'
            ];

            let processingStarted = false;
            for (const selector of processingSelectors) {
                try {
                    await this.page.waitForSelector(selector, { timeout: 5000 });
                    processingStarted = true;
                    break;
                } catch (e) {
                    continue;
                }
            }

            if (!processingStarted) {
                console.log('Processing indicators not found, but upload may have succeeded');
            }

            return { success: true, message: `${filePaths.length} files uploaded and processing started` };

        } catch (error) {
            console.error('Upload error:', error.message);
            return { success: false, message: `Upload failed: ${error.message}` };
        }
    }

    async waitForProcessing(timeout = 300000) {
        try {
            console.log('Waiting for processing to complete...');

            const startTime = Date.now();
            const checkInterval = 5000; // Check every 5 seconds

            while (Date.now() - startTime < timeout) {
                // Look for completion indicators
                const completionSelectors = [
                    '.processing-complete',
                    '.done',
                    '.success',
                    '[data-testid="complete"]',
                    '.download-ready',
                    '.model-ready'
                ];

                let isComplete = false;
                for (const selector of completionSelectors) {
                    try {
                        const element = await this.page.$(selector);
                        if (element) {
                            console.log('Processing complete!');
                            isComplete = true;
                            break;
                        }
                    } catch (e) {
                        continue;
                    }
                }

                if (isComplete) {
                    return { success: true, message: 'Processing completed successfully' };
                }

                // Check for error indicators
                const errorSelectors = [
                    '.error',
                    '.failed',
                    '.processing-error',
                    '[data-testid="error"]'
                ];

                for (const selector of errorSelectors) {
                    try {
                        const element = await this.page.$(selector);
                        if (element) {
                            const errorText = await this.page.evaluate(el => el.textContent, element);
                            return { success: false, message: `Processing failed: ${errorText}` };
                        }
                    } catch (e) {
                        continue;
                    }
                }

                console.log('Processing still in progress...');
                await this.page.waitForTimeout(checkInterval);
            }

            return { success: false, message: 'Processing timeout - taking longer than expected' };

        } catch (error) {
            console.error('Error waiting for processing:', error.message);
            return { success: false, message: `Error waiting for processing: ${error.message}` };
        }
    }

    /**
     * Wait for the model preview page to finish loading (spinner gone)
     * before attempting to interact with the fullscreen button.
     * NOTE: This should NEVER throw - always continues even on failure
     */
    async waitForModelViewerToLoad(timeoutMs = 10000) {
        try {
            console.log('Waiting for model viewer to finish loading...');

            // Check if page is valid first
            if (!this.page) {
                console.log('Page not available, skipping model viewer wait');
                return;
            }

            // Use a simple polling approach instead of waitForFunction to avoid frame issues
            const startTime = Date.now();
            let spinnerGone = false;
            
            while (Date.now() - startTime < timeoutMs && !spinnerGone) {
                try {
                    // Try to check for spinner
                    spinnerGone = await this.page.evaluate(() => {
                        try {
                            const paths = Array.from(document.querySelectorAll('svg path'));
                            const spinnerPath = paths.find(p => {
                                const stroke = p.getAttribute('stroke') || '';
                                const strokeWidth = p.getAttribute('stroke-width') || '';
                                return stroke.includes('113,250,248') && strokeWidth === '12';
                            });
                            return !spinnerPath;
                        } catch (e) {
                            return true; // Assume loaded on error
                        }
                    });
                    
                    if (spinnerGone) {
                        console.log('Model viewer loaded (spinner not detected)');
                        return;
                    }
                } catch (evalError) {
                    // If evaluate fails (frame issues), wait and retry
                    console.log('Spinner check failed:', evalError.message);
                }
                
                // Wait before next check using native setTimeout
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            console.log('Model viewer wait completed (timeout or spinner gone)');
        } catch (error) {
            // NEVER throw - just log and continue
            console.log('Model viewer wait error (non-fatal):', error.message);
        }
    }

    /**
     * Click fullscreen button and take a screenshot of the 3D model
     * Returns the path to the saved screenshot
     * NOTE: This is OPTIONAL - failures here should NEVER break the export process
     */
    async clickFullscreenAndTakeScreenshot() {
        try {
            console.log('📸 Starting fullscreen screenshot sequence...');
            
            // CRITICAL: Check if page is in a valid state first
            if (!this.page) {
                console.log('⚠️ Page not available - skipping screenshot');
                return null;
            }
            
            // Check page state before ANY operation
            try {
                // Try a simple operation to verify page is responsive
                const url = this.page.url();
                console.log('Current page URL:', url);
            } catch (urlError) {
                console.log('⚠️ Page not responsive - skipping screenshot:', urlError.message);
                return null;
            }

            // Wait for page to be fully stable before proceeding
            console.log('Waiting for page to stabilize...');
            try {
                await new Promise(resolve => setTimeout(resolve, 3000));
            } catch (e) {
                // Ignore timeout errors
            }

            // Ensure the 3D viewer is fully loaded before interacting
            try {
                await this.waitForModelViewerToLoad();
            } catch (loadError) {
                console.log('⚠️ Model viewer load check failed:', loadError.message);
                // Continue anyway - the model might still be viewable
            }

            console.log('Looking for fullscreen button...');

            // Find the fullscreen button using safe evaluation
            let fullscreenButton = null;
            const fullscreenButtonSelectors = [
                'div.screenfull button',
                'div[data-v-97fcb96b].screenfull button',
                '.screenfull button'
            ];

            for (const selector of fullscreenButtonSelectors) {
                try {
                    fullscreenButton = await this.page.$(selector);
                    if (fullscreenButton) {
                        console.log(`Fullscreen button found with selector: ${selector}`);
                        break;
                    }
                } catch (e) {
                    console.log(`Selector ${selector} failed:`, e.message);
                    continue;
                }
            }

            // Alternative: Find by evaluating in page context (safer)
            if (!fullscreenButton) {
                console.log('Trying alternative button search...');
                try {
                    fullscreenButton = await this.page.evaluateHandle(() => {
                        const divs = document.querySelectorAll('div.screenfull, div[class*="screenfull"]');
                        for (const div of divs) {
                            const btn = div.querySelector('button');
                            if (btn) return btn;
                        }
                        return null;
                    });
                    
                    const isValid = await this.page.evaluate(el => el !== null && el.tagName === 'BUTTON', fullscreenButton);
                    if (!isValid) fullscreenButton = null;
                    else console.log('Fullscreen button found via alternative search');
                } catch (e) {
                    console.log('Alternative search failed:', e.message);
                    fullscreenButton = null;
                }
            }

            if (!fullscreenButton) {
                console.log('⚠️ Fullscreen button not found - taking screenshot without fullscreen');
            } else {
                // Click fullscreen button
                console.log('Clicking fullscreen button...');
                try {
                    await fullscreenButton.click();
                    console.log('Fullscreen button clicked');
                    // Wait for fullscreen transition
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } catch (clickError) {
                    console.log('⚠️ Fullscreen click failed:', clickError.message);
                    // Continue anyway - we can still take a screenshot
                }
            }

            // Take screenshot (with or without fullscreen)
            console.log('Taking screenshot...');

            const timestamp = Date.now();
            const screenshotFilename = `model_screenshot_${timestamp}.png`;
            const extractedDir = path.resolve(__dirname, 'extracted');

            // Ensure extracted directory exists
            try {
                await fs.ensureDir(extractedDir);
            } catch (dirError) {
                console.log('⚠️ Failed to create extracted directory:', dirError.message);
                return null;
            }

            const screenshotPath = path.join(extractedDir, screenshotFilename);
            
            // Take screenshot with multiple retry attempts
            let screenshotTaken = false;
            const maxAttempts = 3;
            
            for (let attempt = 1; attempt <= maxAttempts && !screenshotTaken; attempt++) {
                try {
                    console.log(`Screenshot attempt ${attempt}/${maxAttempts}...`);
                    
                    // Additional wait before each attempt
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    // Take the screenshot - use viewport screenshot instead of fullPage to avoid frame issues
                    await this.page.screenshot({
                        path: screenshotPath,
                        fullPage: false  // CHANGED: Use viewport only to avoid "main frame too early" error
                    });
                    
                    screenshotTaken = true;
                    console.log(`✅ Screenshot saved: ${screenshotPath}`);
                } catch (screenshotError) {
                    console.log(`Screenshot attempt ${attempt} failed:`, screenshotError.message);
                    
                    // If it's the "main frame too early" error, wait longer
                    if (screenshotError.message.includes('main frame') || 
                        screenshotError.message.includes('too early') ||
                        screenshotError.message.includes('detached')) {
                        console.log('Page frame issue detected, waiting longer...');
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    } else {
                        await new Promise(resolve => setTimeout(resolve, 1500));
                    }
                }
            }

            // Exit fullscreen if we entered it
            if (fullscreenButton && screenshotTaken) {
                try {
                    await fullscreenButton.click();
                    await new Promise(resolve => setTimeout(resolve, 500));
                    console.log('Exited fullscreen mode');
                } catch (e) {
                    // Ignore - fullscreen exit is not critical
                }
            }

            return screenshotTaken ? screenshotPath : null;

        } catch (error) {
            // CRITICAL: Catch ALL errors - screenshot is optional and should NEVER break export
            console.error('⚠️ Screenshot sequence failed (non-fatal):', error.message);
            return null;
        }
    }

    async waitForProjectCompletionAndExport() {
        try {
            console.log('Waiting for project to complete processing...');

            // Wait for the page to redirect back to home after OK button click
            await this.page.waitForTimeout(3000);

            // Poll for project completion with page reloads
            const maxAttempts = 150; //setting max attempts on reloading the page 
            let attempts = 0;
            let projectReady = false;

            while (attempts < maxAttempts && !projectReady) {
                attempts++;
                console.log(`Checking project status (attempt ${attempts}/${maxAttempts})...`);

                // Reload the page to get updated project status
                if (attempts > 1) {
                    console.log('Reloading page to check project status...');
                    await this.page.reload({ waitUntil: 'networkidle2' });
                    await this.page.waitForTimeout(2000);
                }

                // Look for project card and check if it's ready
                const projectCardSelectors = [
                    'div[data-v-d562c7af].model-cover',
                    '.model-cover',
                    'div[class*="card"]',
                    'div[class*="project"]'
                ];

                let projectCard = null;
                for (const selector of projectCardSelectors) {
                    try {
                        projectCard = await this.page.$(selector);
                        if (projectCard) {
                            console.log(`Project card found with selector: ${selector}`);
                            break;
                        }
                    } catch (e) {
                        continue;
                    }
                }

                if (!projectCard) {
                    // Try to find any project card by looking for images or project-related elements
                    const allCards = await this.page.$$('div[class*="card"], div[class*="project"], div[class*="model"]');
                    for (const card of allCards) {
                        const text = await this.page.evaluate(el => el.textContent, card);
                        if (text && (text.includes('Project') || text.includes('Photo Scan'))) {
                            projectCard = card;
                            console.log('Project card found by text content');
                            break;
                        }
                    }
                }

                if (projectCard) {
                    // Check if project is ready (not queuing/processing)
                    const cardText = await this.page.evaluate(el => el.textContent, projectCard);
                    const isProcessing = cardText && (cardText.includes('Queuing') || cardText.includes('Processing') || cardText.includes('...'));

                    if (!isProcessing) {
                        console.log('Project appears to be ready! Attempting to click...');
                        projectReady = true;

                        // Try to click the project card with proper navigation handling
                        try {
                            // Start listening for navigation before clicking
                            const navigationPromise = this.page.waitForNavigation({ 
                                waitUntil: 'networkidle2', 
                                timeout: 15000 
                            }).catch(err => {
                                console.log('Navigation wait after click timed out:', err.message);
                                return null;
                            });
                            
                            await projectCard.click();
                            console.log('Project card clicked - waiting for navigation...');
                            
                            // Wait for navigation to complete
                            await navigationPromise;
                            console.log('Navigation to model view completed');
                            
                            // Additional stabilization wait
                            await this.page.waitForTimeout(2000);
                            break;
                        } catch (e) {
                            console.log('Failed to click project card, will retry...', e.message);
                            projectReady = false;
                        }
                    } else {
                        console.log(`Project still processing: ${cardText}`);
                    }
                } else {
                    console.log('Project card not found, will retry...');
                }

                if (!projectReady) {
                    console.log(`Waiting 5 seconds before next check... (${attempts}/${maxAttempts})`);
                    await this.page.waitForTimeout(5000);
                }
            }

            if (!projectReady) {
                throw new Error('Project did not complete processing within the expected time');
            }

            // Model view page should now be loaded (navigation was handled in click handler)
            console.log('Verifying model view page is ready...');
            
            // Verify page is ready before taking screenshot - use safe timeout
            try {
                // Use native setTimeout instead of page.waitForTimeout to avoid frame issues
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                // Try to check document ready state, but don't fail if it errors
                try {
                    const isReady = await this.page.evaluate(() => document.readyState === 'complete');
                    console.log('Document ready state:', isReady ? 'complete' : 'not complete');
                } catch (evalError) {
                    console.log('Could not check document state:', evalError.message);
                }
            } catch (readyError) {
                console.log('Page ready check failed, continuing...', readyError.message);
            }
            
            // Final stabilization wait using native setTimeout
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Click fullscreen button and take screenshot before downloading
            // This is OPTIONAL - wrapped in try-catch to ensure export continues even if screenshot fails
            console.log('Attempting fullscreen button and screenshot (optional)...');
            let screenshotPath = null;
            try {
                screenshotPath = await this.clickFullscreenAndTakeScreenshot();
                if (screenshotPath) {
                    console.log(`Screenshot saved to: ${screenshotPath}`);
                    this.lastScreenshotPath = screenshotPath;
                } else {
                    console.log('Screenshot skipped or failed (non-fatal)');
                }
            } catch (screenshotError) {
                console.log('⚠️ Screenshot failed (non-fatal):', screenshotError.message);
                // Continue with export - screenshot is optional
            }

            // Click the Export button
            console.log('Looking for Export button...');
            const exportButtonSelectors = [
                'button[data-v-2e999170].h-btn',
                'button.h-btn',
                'button[class*="export"]',
                'button[class*="btn"]'
            ];

            let exportButton = null;
            for (const selector of exportButtonSelectors) {
                try {
                    const buttons = await this.page.$$(selector);
                    for (const button of buttons) {
                        const buttonText = await this.page.evaluate(el => el.textContent, button);
                        if (buttonText && buttonText.includes('Export')) {
                            exportButton = button;
                            console.log(`Export button found with selector: ${selector}`);
                            break;
                        }
                    }
                    if (exportButton) break;
                } catch (e) {
                    continue;
                }
            }

            if (exportButton) {
                await exportButton.click();
                console.log('Export button clicked - waiting for export modal...');

                // Wait for export modal to appear
                console.log('Waiting for export modal to appear...');
                try {
                    await this.page.waitForSelector('button[data-v-af1943bc].download-btn.mask-button_hover.l-h-btn', { timeout: 10000 });
                    console.log('Export modal appeared');
                } catch (e) {
                    console.log('Export modal not found with specific selector, trying alternative approach...');
                    await this.page.waitForTimeout(3000);
                }

                // Wait for export modal and click Download button
                console.log('Looking for Download button in export modal...');
                const downloadButtonSelectors = [
                    'button[data-v-af1943bc].download-btn.mask-button_hover.l-h-btn',
                    'button.download-btn.mask-button_hover.l-h-btn',
                    'button.download-btn.mask-button_hover',
                    'button[class*="download"]',
                    'button[class*="btn"]'
                ];

                let downloadButton = null;

                // First try the specific selectors
                for (const selector of downloadButtonSelectors) {
                    try {
                        const buttons = await this.page.$$(selector);
                        for (const button of buttons) {
                            const buttonText = await this.page.evaluate(el => el.textContent, button);
                            if (buttonText && buttonText.includes('Download')) {
                                downloadButton = button;
                                console.log(`Download button found with selector: ${selector}`);
                                break;
                            }
                        }
                        if (downloadButton) break;
                    } catch (e) {
                        continue;
                    }
                }

                // If not found with specific selectors, try finding by text content
                if (!downloadButton) {
                    console.log('Download button not found with specific selectors, trying text-based search...');
                    try {
                        const allButtons = await this.page.$$('button');
                        for (const button of allButtons) {
                            const buttonText = await this.page.evaluate(el => el.textContent, button);
                            if (buttonText && buttonText.trim() === 'Download') {
                                downloadButton = button;
                                console.log('Download button found by text content');
                                break;
                            }
                        }
                    } catch (e) {
                        console.log('Error in text-based search:', e.message);
                    }
                }

                if (downloadButton) {
                    // Set up download behavior before clicking
                    console.log('Setting up download behavior...');
                    try {
                        // Try the newer CDP method first
                        const client = await this.page.target().createCDPSession();
                        // Use app's downloads directory
                        const appDownloadsDir = path.resolve(__dirname, 'downloads');
                        console.log('Setting up download behavior with directory:', appDownloadsDir);

                        await client.send('Page.setDownloadBehavior', {
                            behavior: 'allow',
                            downloadPath: appDownloadsDir
                        });
                        console.log('Download behavior set to app directory:', appDownloadsDir);

                        // Additional Chrome-specific download settings
                        if (this.browserType === 'chrome') {
                            await client.send('Page.setDownloadBehavior', {
                                behavior: 'allow',
                                downloadPath: appDownloadsDir
                            });
                            console.log('Chrome download behavior configured with app path:', appDownloadsDir);
                        }
                    } catch (cdpError) {
                        console.log('CDP method failed, trying alternative approach:', cdpError.message);
                        // Fallback: try to set download behavior using page.evaluate
                        try {
                            await this.page.evaluateOnNewDocument(() => {
                                // Override the default download behavior
                                window.addEventListener('beforeunload', () => {
                                    // This might help with download path
                                });
                            });
                            console.log('Alternative download behavior set');
                        } catch (evalError) {
                            console.log('Alternative method also failed:', evalError.message);
                            console.log('Proceeding without explicit download path setting');
                        }
                    }

                    // Set up download event listeners before clicking
                    let downloadStarted = false;
                    let downloadFinished = false;

                    // Listen for download events
                    this.page.on('response', async (response) => {
                        const url = response.url();
                        if (url.includes('download') || url.includes('.zip') || url.includes('.glb')) {
                            console.log('Download response detected:', url);
                            downloadStarted = true;
                        }
                    });

                    await downloadButton.click();
                    console.log('Download button clicked - 3D model download started');

                    // Wait for download to actually complete by monitoring download events
                    console.log('Waiting for download to complete...');
                    let downloadCompleted = false;
                    let downloadTimeout = 0;
                    const maxDownloadTimeout = 120000; // 2 minutes max

                    // Get initial file count in default downloads directory
                    const fs = require('fs');
                    const path = require('path');
                    const os = require('os');
                    const downloadsDir = path.join(os.homedir(), 'Downloads');

                    // Ensure downloads directory exists
                    if (!fs.existsSync(downloadsDir)) {
                        fs.mkdirSync(downloadsDir, { recursive: true });
                    }

                    const initialFiles = fs.readdirSync(downloadsDir);
                    console.log(`Monitoring downloads in: ${downloadsDir}`);
                    console.log(`Initial files in downloads directory: ${initialFiles.length}`);

                    // Monitor for download completion
                    while (!downloadCompleted && downloadTimeout < maxDownloadTimeout) {
                        try {
                            // Check if new files appeared in downloads directory
                            const currentFiles = fs.readdirSync(downloadsDir);
                            if (currentFiles.length > initialFiles.length) {
                                console.log('New files detected in downloads directory!');
                                const newFiles = currentFiles.filter(file => !initialFiles.includes(file));
                                console.log('Downloaded files:', newFiles);

                                // Check if files are actually complete (not just created)
                                let allFilesComplete = true;
                                for (const file of newFiles) {
                                    const filePath = path.join(downloadsDir, file);
                                    const stats = fs.statSync(filePath);

                                    // Check if file is still being written (size is 0 or very small)
                                    if (stats.size < 1024) { // Less than 1KB
                                        console.log(`File ${file} is still being written (${stats.size} bytes)`);
                                        allFilesComplete = false;
                                        break;
                                    }

                                    // Check if file was modified recently (within last 5 seconds)
                                    const now = Date.now();
                                    const fileModified = stats.mtime.getTime();
                                    if (now - fileModified < 5000) {
                                        console.log(`File ${file} was modified recently, still downloading...`);
                                        allFilesComplete = false;
                                        break;
                                    }
                                }

                                if (allFilesComplete) {
                                    console.log('All files appear to be complete');
                                    downloadCompleted = true;
                                    break;
                                }
                            }

                            // Check if download is complete by looking for download indicators
                            const downloadIndicators = await this.page.evaluate(() => {
                                // Look for download completion indicators on the page
                                const indicators = [
                                    'Download complete',
                                    'Download finished',
                                    'Download successful',
                                    'File downloaded',
                                    'Downloaded successfully'
                                ];

                                const pageText = document.body.textContent.toLowerCase();
                                return indicators.some(indicator =>
                                    pageText.includes(indicator.toLowerCase())
                                );
                            });

                            if (downloadIndicators) {
                                console.log('Download completion indicators found');
                                downloadCompleted = true;
                                break;
                            }

                            // Check if download button is still present (indicates download in progress)
                            const downloadButtonStillPresent = await this.page.evaluate(() => {
                                const buttons = document.querySelectorAll('button');
                                for (const button of buttons) {
                                    const text = button.textContent;
                                    if (text && text.includes('Download')) {
                                        return true;
                                    }
                                }
                                return false;
                            });

                            if (!downloadButtonStillPresent) {
                                console.log('Download button disappeared - download may be complete');
                                downloadCompleted = true;
                                break;
                            }

                            // Wait a bit before checking again
                            await this.page.waitForTimeout(2000);
                            downloadTimeout += 2000;

                        } catch (e) {
                            console.log('Error checking download status:', e.message);
                            await this.page.waitForTimeout(2000);
                            downloadTimeout += 2000;
                        }
                    }

                    if (downloadCompleted) {
                        console.log('Download completed successfully');

                        // Verify files are actually downloaded and accessible
                        const finalFiles = fs.readdirSync(downloadsDir);
                        const downloadedFiles = finalFiles.filter(file => !initialFiles.includes(file));

                        if (downloadedFiles.length > 0) {
                            console.log('Successfully downloaded files:');
                            for (const file of downloadedFiles) {
                                const filePath = path.join(downloadsDir, file);
                                const stats = fs.statSync(filePath);
                                console.log(`- ${file} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
                            }
                        } else {
                            console.log('Warning: No new files found in downloads directory');
                        }
                    } else {
                        console.log('Download timeout reached - checking for partial downloads...');

                        // Check for any files that might have been downloaded
                        const finalFiles = fs.readdirSync(downloadsDir);
                        const downloadedFiles = finalFiles.filter(file => !initialFiles.includes(file));

                        if (downloadedFiles.length > 0) {
                            console.log('Found partial downloads:');
                            for (const file of downloadedFiles) {
                                const filePath = path.join(downloadsDir, file);
                                const stats = fs.statSync(filePath);
                                console.log(`- ${file} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
                            }
                        }
                    }

                    // Navigate away from download/share page as soon as we detect success
                    console.log('Navigating away from download page to mymodel page...');
                    const currentUrl = this.page.url();
                    console.log('Current URL before navigation:', currentUrl);

                    // Check if we're on a download/share page (handle variants with/without trailing slash or query)
                    const isDownloadPage = currentUrl.includes('/share/download') || currentUrl.includes('/download');
                    if (isDownloadPage) {
                        console.log('Detected download/share page - navigating to mymodel immediately...');
                        try {
                            await this.page.goto('https://www.kiriengine.app/webapp/mymodel', {
                                waitUntil: 'networkidle2',
                                timeout: 30000
                            });
                            await this.page.waitForTimeout(2000);
                            console.log('Successfully navigated to mymodel page');
                        } catch (navError) {
                            console.log('Navigation to mymodel failed, trying again...', navError.message);
                            // Retry navigation with a more lenient strategy
                            try {
                                await this.page.goto('https://www.kiriengine.app/webapp/mymodel', {
                                    waitUntil: 'domcontentloaded',
                                    timeout: 30000
                                });
                                await this.page.waitForTimeout(2000);
                                console.log('Successfully navigated to mymodel page (fallback)');
                            } catch (retryError) {
                                console.log('Retry navigation also failed:', retryError.message);
                            }
                        }
                    }

                    // After successful download, return success without closing browser
                    // Let the server handle browser closure after all progress broadcasts complete
                    console.log('Download process completed - returning success...');

                    return { success: true, message: '3D model export and download completed' };
                } else {
                    console.log('Download button not found in export modal');
                    return { success: false, message: 'Download button not found' };
                }
            } else {
                console.log('Export button not found');
                return { success: false, message: 'Export button not found' };
            }

        } catch (error) {
            console.error('Export process error:', error.message);
            return { success: false, message: `Export process failed: ${error.message}` };
        }
    }

    /**
     * Logout from Kiri Engine account
     * Navigates to mymodel page, clicks avatar, and logs out
     */
    async logout() {
        try {
            console.log('Logging out from Kiri Engine...');

            // Check current URL and navigate away from download/share pages
            const currentUrl = this.page.url();
            console.log('Current URL before logout navigation:', currentUrl);

            // Navigate back to mymodel page (especially if we're on a download/share page)
            console.log('Navigating to mymodel page...');

            // If we're on a download/share page, use a more aggressive navigation approach
            if (currentUrl.includes('/share/download/') || currentUrl.includes('/download/')) {
                console.log('Detected download/share page - using direct navigation...');
                try {
                    // Try to stop any ongoing navigation first
                    await this.page.evaluate(() => {
                        if (window.stop) {
                            window.stop();
                        }
                    });
                    await this.page.waitForTimeout(500);
                } catch (e) {
                    // Ignore errors
                }
            }

            // Navigate to mymodel page with retry logic
            let navigationSuccess = false;
            const maxNavAttempts = 3;

            for (let attempt = 1; attempt <= maxNavAttempts && !navigationSuccess; attempt++) {
                try {
                    console.log(`Navigation attempt ${attempt}/${maxNavAttempts}...`);
                    await this.page.goto('https://www.kiriengine.app/webapp/mymodel', {
                        waitUntil: 'networkidle2',
                        timeout: 30000
                    });
                    navigationSuccess = true;
                    console.log('Successfully navigated to mymodel page');
                } catch (navError) {
                    console.log(`Navigation attempt ${attempt} failed:`, navError.message);
                    if (attempt < maxNavAttempts) {
                        // Try with domcontentloaded as fallback
                        try {
                            await this.page.goto('https://www.kiriengine.app/webapp/mymodel', {
                                waitUntil: 'domcontentloaded',
                                timeout: 30000
                            });
                            navigationSuccess = true;
                            console.log('Successfully navigated using domcontentloaded');
                        } catch (fallbackError) {
                            console.log('Fallback navigation also failed:', fallbackError.message);
                            await this.page.waitForTimeout(2000);
                        }
                    }
                }
            }

            if (!navigationSuccess) {
                console.log('⚠️ Failed to navigate to mymodel page after multiple attempts');
                // Continue anyway - might still be able to find logout button
            }

            await this.page.waitForTimeout(2000);

            // Find and click the avatar/header-right-item to open dropdown
            console.log('Looking for avatar/header-right-item to open dropdown...');
            const avatarSelectors = [
                'div.header-right-item.avatar-container',
                'div[data-v-ac439b1a].header-right-item.avatar-container',
                'div.avatar-container.header-right-item',
                'div.has-avatar.mask-button_hover',
                'div[data-v-ac439b1a].has-avatar.mask-button_hover'
            ];

            let avatarElement = null;
            for (const selector of avatarSelectors) {
                try {
                    avatarElement = await this.page.$(selector);
                    if (avatarElement) {
                        console.log(`Avatar element found with selector: ${selector}`);
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }

            if (!avatarElement) {
                // Try to find by looking for the has-avatar div
                const hasAvatarDiv = await this.page.$('div.has-avatar');
                if (hasAvatarDiv) {
                    avatarElement = hasAvatarDiv;
                    console.log('Avatar element found via has-avatar div');
                }
            }

            if (avatarElement) {
                console.log('Clicking avatar to open dropdown...');
                await avatarElement.click();
                await this.page.waitForTimeout(1000); // Wait for dropdown to appear

                // Find and click the Log Out button
                console.log('Looking for Log Out button...');
                const logoutSelectors = [
                    'div.log-out.avatar-dropdown-nav',
                    'div[data-v-ac439b1a].log-out.avatar-dropdown-nav',
                    'div.avatar-dropdown-nav.log-out',
                    'a.avatar-dropdown-nav:has-text("Log Out")',
                    'div.avatar-dropdown-content_item div.log-out'
                ];

                let logoutButton = null;
                for (const selector of logoutSelectors) {
                    try {
                        logoutButton = await this.page.$(selector);
                        if (logoutButton) {
                            // Verify it's the logout button by checking for "Log Out" text
                            const buttonText = await this.page.evaluate(el => el.textContent, logoutButton);
                            if (buttonText && buttonText.includes('Log Out')) {
                                console.log(`Log Out button found with selector: ${selector}`);
                                break;
                            } else {
                                logoutButton = null;
                            }
                        }
                    } catch (e) {
                        continue;
                    }
                }

                // Alternative: Find by text content
                if (!logoutButton) {
                    console.log('Log Out button not found with selectors, trying text-based search...');
                    const allDropdownItems = await this.page.$$('div.avatar-dropdown-nav, a.avatar-dropdown-nav');
                    for (const item of allDropdownItems) {
                        const itemText = await this.page.evaluate(el => el.textContent, item);
                        if (itemText && itemText.trim() === 'Log Out') {
                            logoutButton = item;
                            console.log('Log Out button found by text content');
                            break;
                        }
                    }
                }

                if (logoutButton) {
                    console.log('Clicking Log Out button...');
                    await logoutButton.click();
                    await this.page.waitForTimeout(2000); // Wait for logout to complete
                    console.log('✅ Successfully logged out');
                } else {
                    console.log('⚠️ Log Out button not found - may already be logged out');
                }
            } else {
                console.log('⚠️ Avatar element not found - may already be logged out or on different page');
            }

        } catch (error) {
            console.error('Error during logout:', error.message);
            // Don't throw error - logout is optional, we'll still close the browser
        }
    }

    /**
     * Start the 5-second page reload cycle for monitoring processes
     */
    async startPageReloadCycle() {
        try {
            console.log('Starting page reload cycle...');

            if (this.reloadInterval) {
                console.log('Reload cycle already running, stopping existing one first...');
                this.stopPageReloadCycle();
            }

            // Start the reload cycle
            this.reloadInterval = setInterval(async () => {
                await this.performPageReload();
            }, 5000);

            console.log('Page reload cycle started (5-second intervals)');

            // Perform initial reload immediately
            await this.performPageReload();

        } catch (error) {
            console.error('Error starting page reload cycle:', error.message);
        }
    }

    /**
     * Stop the page reload cycle
     */
    stopPageReloadCycle() {
        try {
            if (this.reloadInterval) {
                clearInterval(this.reloadInterval);
                this.reloadInterval = null;
                console.log('Page reload cycle stopped');
            }
        } catch (error) {
            console.error('Error stopping page reload cycle:', error.message);
        }
    }

    /**
     * Perform a single page reload and check for processes
     */
    async performPageReload() {
        try {
            if (this.isReloading) {
                console.log('Reload already in progress, skipping...');
                return;
            }

            if (!this.page || !this.isLoggedIn) {
                console.log('Page not ready or not logged in, cannot reload');
                return;
            }

            this.isReloading = true;
            console.log('🔄 Performing page reload to check for new processes...');

            // Reload the page to get updated project status
            await this.page.reload({ waitUntil: 'networkidle2' });
            await this.page.waitForTimeout(2000);

            // Check if we're still logged in after reload
            const stillLoggedIn = await this.checkLoginStatus();
            if (!stillLoggedIn) {
                console.log('❌ No longer logged in after reload, stopping reload cycle...');
                this.stopPageReloadCycle();
                return;
            }

            // Get all project cards
            const projectCards = await this.page.$$('div[data-v-d562c7af].model-cover, .model-cover, div[class*="card"], div[class*="project"]');
            console.log(`Found ${projectCards.length} total project cards`);

            // If we don't have a tracked project yet, look for a new processing one
            if (!this.trackedProjectId) {
                console.log('No tracked project, looking for new processing project...');
                for (const card of projectCards) {
                    const projectTitle = await this.page.evaluate(el => {
                        const titleEl = el.querySelector('.title') || el.querySelector('.name');
                        return titleEl ? titleEl.textContent.trim() : null;
                    }, card);

                    const statusMask = await card.$('.status-mask');
                    if (statusMask) {
                        const statusText = await this.page.evaluate(el => {
                            const span = el.querySelector('.status span');
                            return span ? span.textContent.trim() : '';
                        }, statusMask);

                        if (statusText.includes('Processing') || statusText.includes('Queuing')) {
                            this.trackedProjectId = projectTitle || `Project_${Date.now()}`;
                            this.trackedProjectTitle = projectTitle;
                            console.log('🆕 Found new project to track:', this.trackedProjectId);
                            console.log('Status:', statusText);

                            if (global.io) {
                                global.io.emit('reload-status', {
                                    timestamp: new Date().toISOString(),
                                    hasNewProcesses: true,
                                    processStatus: `Started tracking new project "${this.trackedProjectId}"`,
                                    projectCount: projectCards.length
                                });

                                // Emit progress event for processing step
                                if (statusText.includes('Processing')) {
                                    console.log('🚀 EMITTING PROCESSING PROGRESS EVENT');
                                    global.io.emit('progress', { step: 'processing', message: 'Processing 3D model in Kiri Engine...' });

                                    // Also update pipeline state via API to ensure server-side state is updated
                                    try {
                                        const updateUrl = 'http://localhost:3002/api/update-pipeline-state';
                                        const updatePayload = {
                                            pipeline: 'scan',
                                            stepIndex: 2,
                                            stepName: 'Processing Photogrammetry',
                                            status: 'active',
                                            message: 'Processing 3D model in Kiri Engine...'
                                        };
                                        await (typeof fetch !== 'undefined' ? fetch : require('node-fetch'))(updateUrl, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify(updatePayload)
                                        });
                                    } catch (e) {
                                        console.error('Error updating pipeline state:', e.message);
                                    }
                                    console.log('🚀 PROCESSING PROGRESS EVENT EMITTED');
                                }
                            }
                            break;
                        }
                    }
                }
            }
            // If we have a tracked project, check its status
            else {
                console.log('Checking tracked project:', this.trackedProjectId);
                let foundTrackedProject = false;
                let hasStatusMask = false;

                for (const card of projectCards) {
                    const projectTitle = await this.page.evaluate(el => {
                        const titleEl = el.querySelector('.title') || el.querySelector('.name');
                        return titleEl ? titleEl.textContent.trim() : null;
                    }, card);

                    if (projectTitle === this.trackedProjectTitle) {
                        foundTrackedProject = true;
                        const statusMask = await card.$('.status-mask');

                        if (statusMask) {
                            hasStatusMask = true;
                            const statusText = await this.page.evaluate(el => {
                                const span = el.querySelector('.status span');
                                return span ? span.textContent.trim() : '';
                            }, statusMask);
                            console.log('Tracked project status:', statusText);

                            if (global.io) {
                                global.io.emit('reload-status', {
                                    timestamp: new Date().toISOString(),
                                    hasNewProcesses: true,
                                    processStatus: `Tracked project "${this.trackedProjectId}" status: ${statusText}`,
                                    projectCount: projectCards.length
                                });

                                const lowerStatus = statusText.toLowerCase();

                                // Emit progress event when tracked project status is "Processing.."
                                if (lowerStatus.includes('processing')) {
                                    console.log('🚀 EMITTING PROCESSING PROGRESS EVENT FOR TRACKED PROJECT');
                                    global.io.emit('progress', { step: 'processing', message: 'Processing 3D model in Kiri Engine...' });

                                    // Also update pipeline state via API to ensure server-side state is updated
                                    try {
                                        const updateUrl = 'http://localhost:3002/api/update-pipeline-state';
                                        const updatePayload = {
                                            pipeline: 'scan',
                                            stepIndex: 2,
                                            stepName: 'Processing Photogrammetry',
                                            status: 'active',
                                            message: 'Processing 3D model in Kiri Engine...'
                                        };
                                        await (typeof fetch !== 'undefined' ? fetch : require('node-fetch'))(updateUrl, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify(updatePayload)
                                        });
                                    } catch (e) {
                                        console.error('Error updating pipeline state:', e.message);
                                    }

                                    try {
                                        const motorOffUrl = 'http://localhost:3002/api/motor/control/off';
                                        const motorResponse = await (typeof fetch !== 'undefined' ? fetch : require('node-fetch'))(motorOffUrl, { method: 'POST' });
                                        const motorResult = await motorResponse.json().catch(() => ({}));
                                        console.log('🔌 MOTOR: Motor OFF response:', motorResult);
                                    } catch (e) {
                                        console.error('🔌 MOTOR: Error turning off motor during processing:', e.message);
                                    }
                                }

                                // If tracked project status is Failed, emit error and stop monitoring/reload
                                if (lowerStatus.includes('failed')) {
                                    console.log('❌ TRACKED PROJECT FAILED, EMITTING ERROR EVENT AND STOPPING RELOAD');
                                    global.io.emit('progress', {
                                        step: 'error',
                                        message: `Tracked project failed in Kiri Engine: ${statusText}`
                                    });

                                    // Also update pipeline state via API to mark as failed
                                    try {
                                        const updateUrl = 'http://localhost:3002/api/update-pipeline-state';
                                        const updatePayload = {
                                            pipeline: 'scan',
                                            stepIndex: 2,
                                            stepName: 'Processing Photogrammetry',
                                            status: 'failed',
                                            message: `Tracked project failed in Kiri Engine: ${statusText}`
                                        };
                                        await (typeof fetch !== 'undefined' ? fetch : require('node-fetch'))(updateUrl, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify(updatePayload)
                                        });
                                    } catch (e) {
                                        console.error('Error updating pipeline state:', e.message);
                                    }

                                    // Stop the monitoring cycle inside automation
                                    try {
                                        this.stopPageReloadCycle();
                                    } catch (e) {
                                        console.log('Error stopping page reload cycle after failure:', e.message);
                                    }

                                    // Clear monitoring flags in the Kiri page
                                    try {
                                        await this.page.evaluate(() => {
                                            localStorage.removeItem('kiri_monitoring_active');
                                            localStorage.removeItem('kiri_scan_start_time');
                                        });
                                    } catch (e) {
                                        console.log('Error clearing monitoring flags after failure:', e.message);
                                    }

                                    // Do not proceed to completion/export when failed
                                    return;
                                }
                            }
                        } else {
                            // Project has completed! Stop monitoring and start export
                            console.log('🎉 Tracked project has completed:', this.trackedProjectId);

                            if (global.io) {
                                global.io.emit('reload-status', {
                                    timestamp: new Date().toISOString(),
                                    hasNewProcesses: false,
                                    processStatus: `Project "${this.trackedProjectId}" completed!`,
                                    projectCount: projectCards.length
                                });

                                // Emit progress event for download step
                                global.io.emit('progress', { step: 'download', message: 'Downloading 3D model files...' });

                                // Also update pipeline state via API to ensure server-side state is updated
                                try {
                                    const updateUrl = 'http://localhost:3002/api/update-pipeline-state';
                                    const updatePayload = {
                                        pipeline: 'scan',
                                        stepIndex: 3,
                                        stepName: 'Downloading 3D',
                                        status: 'active',
                                        message: 'Downloading 3D model files...'
                                    };
                                    await (typeof fetch !== 'undefined' ? fetch : require('node-fetch'))(updateUrl, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify(updatePayload)
                                    });
                                } catch (e) {
                                    console.error('Error updating pipeline state:', e.message);
                                }
                            }

                            // Stop the monitoring cycle
                            this.stopPageReloadCycle();

                            // Clear tracking info
                            await this.page.evaluate(() => {
                                localStorage.removeItem('kiri_monitoring_active');
                                localStorage.removeItem('kiri_scan_start_time');
                            });

                            // Click this specific card
                            await card.click();
                            console.log('Clicked completed project card');
                            await this.page.waitForTimeout(2000);

                            // Start export process
                            await this.waitForProjectCompletionAndExport();
                            return;
                        }
                        break;
                    }
                }

                if (!foundTrackedProject) {
                    console.log('⚠️ Could not find tracked project:', this.trackedProjectId);
                    // Keep monitoring in case the page hasn't fully loaded
                }
            }

        } catch (error) {
            console.error('Error during page reload:', error.message);
        } finally {
            this.isReloading = false;
        }
    }

    /**
     * Check for processing projects using the specific selector
     */
    async checkForProcessingProjects() {
        try {
            if (!this.page || !this.isLoggedIn) {
                return { hasProcessingProjects: false, message: 'Page not ready or not logged in' };
            }

            console.log('🔍 Checking for processing projects...');

            // Look for the specific processing status elements
            const processingElements = await this.page.$$('div[data-v-d562c7af] .status-mask .status span');

            if (processingElements.length > 0) {
                for (const element of processingElements) {
                    const statusText = await this.page.evaluate(el => el.textContent, element);

                    // Check if the text is exactly "Processing.." (note the two dots)
                    if (statusText && statusText.trim() === 'Processing..') {
                        console.log('✅ Found project with "Processing.." status');
                        return {
                            hasProcessingProjects: true,
                            message: 'Found project with "Processing.." status',
                            statusText: statusText
                        };
                    }
                }
            }

            console.log('❌ No processing projects found');
            return {
                hasProcessingProjects: false,
                message: 'No processing projects found'
            };

        } catch (error) {
            console.error('Error checking for processing projects:', error.message);
            return {
                hasProcessingProjects: false,
                message: `Error: ${error.message}`
            };
        }
    }


    async close() {
        try {
            // Stop the reload cycle first
            this.stopPageReloadCycle();

            if (this.page) {
                await this.page.close();
            }
            if (this.browser) {
                await this.browser.close();
            }
            console.log('Browser closed');
        } catch (error) {
            console.error('Error closing browser:', error.message);
        }
    }
}

module.exports = KiriEngineAutomation;