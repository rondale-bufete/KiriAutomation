# 3D Scanner - Photogrammetry Automation

A web application that automates the photogrammetry process using Kiri Engine. This application uses Puppeteer to automate browser interactions with the Kiri Engine web application, allowing users to upload images or videos and automatically process them into 3D models.

## Features

- 🎯 **Automated Processing**: Automatically logs into Kiri Engine and processes files
- 📁 **File Upload**: Support for images (JPG, PNG) and videos (MP4, MOV, AVI)
- 🔄 **Real-time Progress**: Live updates on processing status via WebSocket
- 💾 **Session Management**: Persistent login to avoid repeated authentication
- 🎨 **Modern UI**: Beautiful, responsive web interface
- ⚡ **Error Handling**: Comprehensive error handling and user feedback

## Prerequisites

- Node.js (v14 or higher)
- A Kiri Engine account
- Chrome/Chromium browser (for Puppeteer)

## Installation

1. **Clone or download the project**
   ```bash
   git clone <repository-url>
   cd PhotogrammetryAutomation
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Kiri Engine credentials**
   
   Edit the `config.js` file and update the hardcoded credentials:
   ```javascript
   KIRI_EMAIL: 'your-email@example.com',
   KIRI_PASSWORD: 'your-password',
   ```

4. **Create necessary directories**
   ```bash
   mkdir uploads
   ```

## Usage

1. **Start the server**
   ```bash
   npm start
   ```
   
   For development with auto-restart:
   ```bash
   npm run dev
   ```

2. **Open your browser**
   Navigate to `http://localhost:3000`

3. **Upload and process files**
   - Drag and drop or click to select your image/video files
   - Click "Start 3D Processing"
   - Monitor the progress in real-time
   - Download your 3D model when processing is complete

## How It Works

1. **Login Automation**: Uses Puppeteer to automatically log into Kiri Engine
2. **File Upload**: Automatically uploads your files to the Kiri Engine platform
3. **Processing**: Monitors the photogrammetry processing in real-time
4. **Download**: Automatically retrieves the processed 3D model

## Configuration

### Hardcoded Settings

All configuration is now hardcoded in `config.js` for simplicity:

- `KIRI_EMAIL`: Your Kiri Engine email address (update in config.js)
- `KIRI_PASSWORD`: Your Kiri Engine password (update in config.js)
- `PORT`: Server port (default: 3002)
- `NODE_ENV`: Environment (development/production)
- `BROWSER_TYPE`: Browser type (chrome/chromium/firefox/edge)

### Browser Settings

The application runs Puppeteer in non-headless mode by default for debugging. To run in production:

```javascript
// In server.js, change:
headless: false
// to:
headless: true
```

## API Endpoints

- `GET /`: Main web interface
- `POST /upload`: File upload endpoint
- `GET /status`: Server status and processing state
- WebSocket: Real-time progress updates

## File Support

### Images
- JPEG (.jpg, .jpeg)
- PNG (.png)

### Videos
- MP4 (.mp4)
- MOV (.mov)
- AVI (.avi)

## Troubleshooting

### Common Issues

1. **Login Failed**
   - Verify your Kiri Engine credentials in the `.env` file
   - Check if your account is active
   - Ensure the Kiri Engine website is accessible

2. **File Upload Issues**
   - Check file size (max 100MB)
   - Verify file format is supported
   - Ensure stable internet connection

3. **Processing Timeout**
   - Large files may take longer to process
   - Check Kiri Engine server status
   - Verify your internet connection

4. **Browser Issues**
   - Ensure Chrome/Chromium is installed
   - Check Puppeteer installation
   - Try running with `--no-sandbox` flag

### Debug Mode

To enable debug mode, set `NODE_ENV=development` in your `.env` file. This will:
- Show browser window during automation
- Enable detailed logging
- Provide more verbose error messages

## Security Considerations

- Store credentials securely in environment variables
- Use HTTPS in production
- Implement rate limiting for production use
- Consider implementing user authentication for multi-user scenarios

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review the Kiri Engine documentation
3. Create an issue in the repository

## Disclaimer

This application is for educational and personal use. Please ensure compliance with Kiri Engine's terms of service when using this automation tool.
