module.exports = {
  // Development-specific settings
  logging: {
    level: 'debug',
    fileEnabled: true
  },
  streaming: {
    enableHLS: false, // Use RTSP for development
    ffmpegAvailable: true
  },
  security: {
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 200 // More generous in development
    }
  },
  database: {
    debug: true
  }
};
