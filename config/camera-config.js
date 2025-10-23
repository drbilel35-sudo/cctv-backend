module.exports = {
  // Default camera settings
  defaultSettings: {
    port: 554,
    protocol: 'rtsp',
    status: 'offline',
    isPublic: false,
    specifications: {
      fps: 25,
      type: 'indoor',
      resolution: '1920x1080'
    }
  },

  // Supported protocols
  supportedProtocols: ['rtsp', 'http', 'https', 'rtmp'],

  // Camera types
  cameraTypes: ['indoor', 'outdoor', 'ptz', 'dome', 'bullet'],

  // Stream qualities
  streamQualities: [
    { value: 'low', label: 'Low (640x360)', bitrate: '500k' },
    { value: 'medium', label: 'Medium (854x480)', bitrate: '1000k' },
    { value: 'high', label: 'High (1280x720)', bitrate: '2500k' },
    { value: 'original', label: 'Original', bitrate: '5000k' }
  ],

  // Health check intervals (in milliseconds)
  healthCheck: {
    interval: 30000, // 30 seconds
    timeout: 5000    // 5 seconds
  }
};
