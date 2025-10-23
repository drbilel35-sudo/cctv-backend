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
