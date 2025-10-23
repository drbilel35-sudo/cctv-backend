const streamService = require('../services/streamService');
const Camera = require('../models/Camera');
const Stream = require('../models/Stream');
const logger = require('../utils/logger');

// Start stream
exports.startStream = async (req, res) => {
  try {
    const { cameraId } = req.params;
    const { quality, maxViewers } = req.body;

    // Check if user has access to camera
    const camera = await Camera.findById(cameraId);
    if (!camera) {
      return res.status(404).json({
        success: false,
        message: 'Camera not found'
      });
    }

    if (req.user.role !== 'admin' && !camera.isPublic && 
        !camera.accessGroups.some(group => req.user.permissions.includes(group))) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this camera'
      });
    }

    const options = {
      quality: quality || 'medium',
      maxViewers: maxViewers || 10
    };

    const streamInfo = await streamService.startStream(cameraId, req.user.id, options);

    res.status(200).json({
      success: true,
      data: streamInfo,
      message: 'Stream started successfully'
    });
  } catch (error) {
    logger.error('Start stream error:', error);
    res.status(500).json({
      success: false,
      message: 'Error starting stream: ' + error.message
    });
  }
};

// Stop stream
exports.stopStream = async (req, res) => {
  try {
    const { streamKey } = req.params;

    await streamService.stopStream(streamKey);

    res.status(200).json({
      success: true,
      message: 'Stream stopped successfully'
    });
  } catch (error) {
    logger.error('Stop stream error:', error);
    res.status(500).json({
      success: false,
      message: 'Error stopping stream: ' + error.message
    });
  }
};

// Get stream information
exports.getStream = async (req, res) => {
  try {
    const { streamKey } = req.params;

    const stream = await Stream.findOne({ streamKey })
      .populate('camera')
      .populate('viewers.user', 'username email');

    if (!stream) {
      return res.status(404).json({
        success: false,
        message: 'Stream not found'
      });
    }

    // Check camera access
    if (req.user.role !== 'admin' && !stream.camera.isPublic && 
        !stream.camera.accessGroups.some(group => req.user.permissions.includes(group))) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this stream'
      });
    }

    const stats = await streamService.getStreamStats(streamKey);

    res.status(200).json({
      success: true,
      data: {
        stream,
        stats
      }
    });
  } catch (error) {
    logger.error('Get stream error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching stream information'
    });
  }
};

// Get all active streams
exports.getActiveStreams = async (req, res) => {
  try {
    const activeStreams = streamService.getActiveStreams();

    res.status(200).json({
      success: true,
      data: activeStreams,
      count: activeStreams.length
    });
  } catch (error) {
    logger.error('Get active streams error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching active streams'
    });
  }
};

// Get stream statistics
exports.getStreamStats = async (req, res) => {
  try {
    const { streamKey } = req.params;

    const stats = await streamService.getStreamStats(streamKey);

    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Get stream stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching stream statistics'
    });
  }
};

// Update stream settings
exports.updateStreamSettings = async (req, res) => {
  try {
    const { streamKey } = req.params;
    const { quality, maxViewers, recordingEnabled } = req.body;

    const stream = await Stream.findOne({ streamKey });
    if (!stream) {
      return res.status(404).json({
        success: false,
        message: 'Stream not found'
      });
    }

    // Update settings
    if (quality) stream.settings.quality = quality;
    if (maxViewers) stream.settings.maxViewers = maxViewers;
    if (typeof recordingEnabled === 'boolean') {
      stream.settings.recordingEnabled = recordingEnabled;
    }

    await stream.save();

    res.status(200).json({
      success: true,
      data: stream.settings,
      message: 'Stream settings updated successfully'
    });
  } catch (error) {
    logger.error('Update stream settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating stream settings'
    });
  }
};
