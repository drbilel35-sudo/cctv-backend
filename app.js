const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');

const authRoutes = require('./routes/auth');
const cameraRoutes = require('./routes/cameras');
const streamRoutes = require('./routes/streams');
const adminRoutes = require('./routes/admin');
// Add this to your app.js after other routes
const hlsRoutes = require('./routes/hls');
app.use('/hls', hlsRoutes);
require('dotenv').config();

// Validate environment on startup
require('./scripts/validate-env')();

const config = require('./config/env');

console.log(`Starting application in ${config.env} mode`);
console.log(`Database: ${config.mongoose.url}`);
console.log(`Streaming: HLS ${config.streaming.enableHLS ? 'enabled' : 'disabled'}`);
// Serve recordings statically
app.use('/recordings', express.static(path.join(__dirname, 'public/recordings')));
const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');

const app = express();

// Security Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Mock user for demo (replace with real authentication)
const mockUser = {
  id: 1,
  username: 'admin',
  password: 'admin', // In production, use hashed passwords!
  name: 'Administrator'
};

// Login endpoint - FIXES THE JSON ERROR
app.post('/api/login', (req, res) => {
  try {
    const { username, password } = req.body;

    // Set proper JSON header
    res.setHeader('Content-Type', 'application/json');

    // Simple authentication check
    if (username === mockUser.username && password === mockUser.password) {
      res.json({
        success: true,
        message: 'Login successful',
        user: {
          id: mockUser.id,
          name: mockUser.name,
          username: mockUser.username
        },
        token: 'demo-token-' + Date.now() // In production, use JWT
      });
    } else {
      res.status(401).json({
        success: false,
        error: 'Invalid username or password'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error during login'
    });
  }
});

// Stream endpoint - Public access to stream URL
app.get('/api/stream', (req, res) => {
  res.json({
    success: true,
    streamUrl: process.env.STREAM_URL || 'https://example.com/your-stream.m3u8',
    type: 'hls'
  });
});

// Public stream access (bypasses login)
app.get('/public', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>CCTV Stream - Public Access</title>
        <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
        <style>
            body { margin: 0; padding: 20px; background: #1a1a1a; color: white; }
            .container { max-width: 1200px; margin: 0 auto; }
            #videoPlayer { width: 100%; max-width: 800px; background: black; }
            .stats { margin: 20px 0; padding: 15px; background: #2a2a2a; border-radius: 5px; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🔴 CCTV Live Stream - Public Access</h1>
            <div class="stats">
                <strong>Current Viewers:</strong> <span id="viewers">1</span> | 
                <strong>Stream Uptime:</strong> <span id="uptime">00:00:00</span>
            </div>
            <video id="videoPlayer" controls autoplay muted></video>
        </div>

        <script>
            const streamUrl = '${process.env.STREAM_URL || 'https://example.com/your-stream.m3u8'}';
            const video = document.getElementById('videoPlayer');
            
            if (Hls.isSupported()) {
                const hls = new Hls();
                hls.loadSource(streamUrl);
                hls.attachMedia(video);
                hls.on(Hls.Events.MANIFEST_PARSED, function() {
                    video.play();
                });
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = streamUrl;
                video.addEventListener('loadedmetadata', function() {
                    video.play();
                });
            }
            
            // Simulate viewer count and uptime
            let startTime = Date.now();
            setInterval(() => {
                const uptime = Math.floor((Date.now() - startTime) / 1000);
                const hours = Math.floor(uptime / 3600).toString().padStart(2, '0');
                const minutes = Math.floor((uptime % 3600) / 60).toString().padStart(2, '0');
                const seconds = (uptime % 60).toString().padStart(2, '0');
                document.getElementById('uptime').textContent = \`\${hours}:\${minutes}:\${seconds}\`;
            }, 1000);
        </script>
    </body>
    </html>
  `);
});
// CORS Configuration
// CORS Configuration for Render
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://your-frontend-app.onrender.com',
    process.env.CORS_ORIGIN
  ].filter(Boolean),
  credentials: true
}));

// Rate Limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// Body Parsing Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request Logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path} - IP: ${req.ip}`);
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/cameras', cameraRoutes);
app.use('/api/streams', streamRoutes);
app.use('/api/admin', adminRoutes);

// Health Check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
  });
});

// 404 Handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`
  });
});

// Error Handling Middleware
app.use(errorHandler);

module.exports = app;
