module.exports = {
  // Production-specific settings
  logging: {
    level: 'warn',
    fileEnabled: false // Use console logging in production
  },
  streaming: {
    enableHLS: true, // Use HLS for production
    maxConcurrentStreams: 3, // Limit for free tier
    ffmpegAvailable: false // Assume no FFmpeg in Render free tier
  },
  security: {
    rateLimit: {
      windowMs: 15 * 60 * 1000,
      max: 50 // Stricter limits in production
    }
  },
  cors: {
    origin: process.env.CORS_ORIGIN || 'https://your-frontend-app.onrender.com'
  }
};
