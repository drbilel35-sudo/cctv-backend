#!/bin/bash
echo "Starting build process on Render..."

# Install dependencies
npm install

# Check if ffmpeg is available (Render doesn't have it by default)
if ! command -v ffmpeg &> /dev/null; then
    echo "FFmpeg not found. This may affect RTSP streaming functionality."
    echo "Consider using a custom Docker image with FFmpeg pre-installed."
fi

echo "Build completed successfully!"
