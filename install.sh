#!/bin/bash

echo "Installing 3D Scanner - Photogrammetry Automation"
echo "================================================"

echo ""
echo "Installing Node.js dependencies..."
npm install

echo ""
echo "Creating uploads directory..."
mkdir -p uploads

echo ""
echo "Setting up environment file..."
if [ ! -f .env ]; then
    cp env.example .env
    echo "Created .env file from template"
    echo "Please edit .env file with your Kiri Engine credentials"
else
    echo ".env file already exists"
fi

echo ""
echo "Making install script executable..."
chmod +x install.sh

echo ""
echo "Installation complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env file with your Kiri Engine credentials"
echo "2. Run: npm start"
echo "3. Open http://localhost:3000 in your browser"
echo ""
