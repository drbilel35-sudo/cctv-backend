const mongoose = require('mongoose');

const cameraSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Camera name is required'],
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  location: {
    type: String,
    required: [true, 'Camera location is required']
  },
  ipAddress: {
    type: String,
    required: [true, 'IP address is required'],
    match: [/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/, 'Please enter a valid IP address']
  },
  port: {
    type: Number,
    default: 554
  },
  streamUrl: {
    type: String,
    required: [true, 'Stream URL is required']
  },
  protocol: {
    type: String,
    enum: ['rtsp', 'http', 'https', 'rtmp'],
    default: 'rtsp'
  },
  username: {
    type: String,
    trim: true
  },
  password: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['online', 'offline', 'maintenance'],
    default: 'offline'
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  accessGroups: [{
    type: String
  }],
  coordinates: {
    latitude: Number,
    longitude: Number
  },
  specifications: {
    resolution: String,
    fps: Number,
    type: {
      type: String,
      enum: ['indoor', 'outdoor', 'ptz', 'dome', 'bullet'],
      default: 'indoor'
    },
    manufacturer: String,
    model: String
  },
  lastSeen: {
    type: Date
  },
  healthCheck: {
    lastChecked: Date,
    responseTime: Number,
    packetLoss: Number
  }
}, {
  timestamps: true
});

// Index for geospatial queries
cameraSchema.index({ coordinates: '2dsphere' });
cameraSchema.index({ location: 'text', name: 'text' });

module.exports = mongoose.model('Camera', cameraSchema);
