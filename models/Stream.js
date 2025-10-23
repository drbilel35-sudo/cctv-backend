const mongoose = require('mongoose');

const streamSchema = new mongoose.Schema({
  camera: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Camera',
    required: true
  },
  streamKey: {
    type: String,
    unique: true,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'error'],
    default: 'inactive'
  },
  viewers: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    ipAddress: String
  }],
  stats: {
    totalViewers: {
      type: Number,
      default: 0
    },
    maxViewers: {
      type: Number,
      default: 0
    },
    totalViewTime: {
      type: Number,
      default: 0
    },
    bandwidth: {
      type: Number,
      default: 0
    }
  },
  settings: {
    quality: {
      type: String,
      enum: ['low', 'medium', 'high', 'original'],
      default: 'medium'
    },
    maxViewers: {
      type: Number,
      default: 10
    },
    recordingEnabled: {
      type: Boolean,
      default: false
    }
  }
}, {
  timestamps: true
});

// Generate stream key before saving
streamSchema.pre('save', function(next) {
  if (!this.streamKey) {
    this.streamKey = `stream_${this.camera}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  next();
});

module.exports = mongoose.model('Stream', streamSchema);
