# Quick Setup Guide

## 🚀 Get Started in 3 Steps

### 1. Install Dependencies
```bash
npm install
```

### 2. Update Your Credentials
Edit `config.js` and update these lines with your Kiri Engine credentials:

```javascript
KIRI_EMAIL: 'your-email@example.com',    // ← Change this
KIRI_PASSWORD: 'your-password',          // ← Change this
```

### 3. Start the Server
```bash
npm start
```

Then open your browser to: `http://localhost:3002`

## ✅ That's it!

Your photogrammetry automation app is now ready to use. Just upload your images/videos and let it automatically process them into 3D models!

## 🔧 Optional Settings

You can also modify these settings in `config.js` if needed:

- `PORT`: Change the server port (default: 3002)
- `BROWSER_TYPE`: Change browser type (chrome/chromium/firefox/edge)
- `NODE_ENV`: Set to 'production' for production use

## 🆘 Need Help?

- Make sure you have a valid Kiri Engine account
- Ensure Chrome browser is installed
- Check that your internet connection is stable