const streamService = require('../services/streamService');
const rtspService = require('../services/rtspService');
const Camera = require('../models/Camera');
const Stream = require('../models/Stream');
const logger = require('../utils/logger');

// Start stream
exports.startStream = async (req, res) => {
  try {
    const { cameraId } = req.params;
    const { 
      quality = 'medium', 
      maxViewers = 10, 
      useHLS = true,
      recordingEnabled = false 
    } = req.body;

    // Validate camera ID
    if (!cameraId) {
      return res.status(400).json({
        success: false,
        message: 'Camera ID is required'
      });
    }

    // Check if user has access to camera
    const camera = await Camera.findById(cameraId);
    if (!camera) {
      return res.status(404).json({
        success: false,
        message: 'Camera not found'
      });
    }

    // Check permissions
    if (req.user.role !== 'admin' && !camera.isPublic && 
        !camera.accessGroups.some(group => req.user.permissions.includes(group))) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this camera'
      });
    }

    // Check if camera is online
    if (camera.status === 'offline') {
      return res.status(400).json({
        success: false,
        message: 'Camera is currently offline'
      });
    }

    // Check if stream already exists and is active
    let existingStream = await Stream.findOne({ 
      camera: cameraId, 
      status: 'active' 
    });

    if (existingStream) {
      const streamInfo = rtspService.getStreamInfo(existingStream.streamKey);
      
      if (streamInfo) {
        return res.status(200).json({
          success: true,
          data: {
            ...streamInfo,
            message: 'Stream is already active'
          },
          message: 'Stream is already running'
        });
      } else {
        // Stream exists in DB but not in service, update status
        existingStream.status = 'inactive';
        await existingStream.save();
      }
    }

    // Create new stream record
    const stream = await Stream.create({
      camera: cameraId,
      settings: {
        quality,
        maxViewers,
        recordingEnabled
      }
    });

    const options = {
      quality,
      maxViewers,
      recordingEnabled
    };

    let streamInfo;

    // Choose streaming method based on environment and preference
    const isRender = process.env.RENDER || process.env.NODE_ENV === 'production';
    
    if (useHLS && isRender) {
      // Use HLS streaming for Render (recommended)
      try {
        streamInfo = await rtspService.startHLSStream(camera, stream.streamKey, options);
        logger.info(`HLS stream started for camera: ${camera.name}`);
      } catch (hlsError) {
        logger.warn(`HLS streaming failed, falling back to RTSP: ${hlsError.message}`);
        // Fallback to RTSP
        streamInfo = await rtspService.startRTSPStream(camera, stream.streamKey, options);
      }
    } else {
      // Use RTSP streaming
      streamInfo = await rtspService.startRTSPStream(camera, stream.streamKey, options);
    }

    // Update stream with service information
    stream.status = 'active';
    await stream.save();

    // Add initial viewer
    await streamService.addViewer(stream.streamKey, req.user.id, req.ip);

    logger.info(`Stream started successfully: ${stream.streamKey} for user ${req.user.username}`);

    res.status(200).json({
      success: true,
      data: {
        streamId: stream._id,
        ...streamInfo,
        camera: {
          id: camera._id,
          name: camera.name,
          location: camera.location
        },
        settings: stream.settings
      },
      message: 'Stream started successfully'
    });

  } catch (error) {
    logger.error('Start stream error:', error);
    
    // Clean up any created stream record on error
    if (req.params.cameraId) {
      await Stream.deleteOne({ camera: req.params.cameraId, status: 'active' });
    }

    res.status(500).json({
      success: false,
      message: `Error starting stream: ${error.message}`
    });
  }
};

// Stop stream
exports.stopStream = async (req, res) => {
  try {
    const { streamKey } = req.params;

    if (!streamKey) {
      return res.status(400).json({
        success: false,
        message: 'Stream key is required'
      });
    }

    // Find stream
    const stream = await Stream.findOne({ streamKey }).populate('camera');
    if (!stream) {
      return res.status(404).json({
        success: false,
        message: 'Stream not found'
      });
    }

    // Check permissions
    if (req.user.role !== 'admin' && !stream.camera.isPublic && 
        !stream.camera.accessGroups.some(group => req.user.permissions.includes(group))) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this stream'
      });
    }

    // Stop the stream service
    await rtspService.stopRTSPStream(streamKey);
    
    // Stop HLS stream if active
    const streamInfo = rtspService.getStreamInfo(streamKey);
    if (streamInfo && streamInfo.type === 'hls') {
      // Additional cleanup for HLS streams
      await cleanupHLSStream(streamKey);
    }

    // Update stream status
    stream.status = 'inactive';
    stream.viewers = []; // Clear viewers
    await stream.save();

    logger.info(`Stream stopped: ${streamKey} by user ${req.user.username}`);

    res.status(200).json({
      success: true,
      data: {
        streamKey,
        stoppedAt: new Date()
      },
      message: 'Stream stopped successfully'
    });

  } catch (error) {
    logger.error('Stop stream error:', error);
    res.status(500).json({
      success: false,
      message: `Error stopping stream: ${error.message}`
    });
  }
};

// Get stream information
exports.getStream = async (req, res) => {
  try {
    const { streamKey } = req.params;

    if (!streamKey) {
      return res.status(400).json({
        success: false,
        message: 'Stream key is required'
      });
    }

    const stream = await Stream.findOne({ streamKey })
      .populate('camera')
      .populate('viewers.user', 'username email role');

    if (!stream) {
      return res.status(404).json({
        success: false,
        message: 'Stream not found'
      });
    }

    // Check permissions
    if (req.user.role !== 'admin' && !stream.camera.isPublic && 
        !stream.camera.accessGroups.some(group => req.user.permissions.includes(group))) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this stream'
      });
    }

    // Get real-time stream information
    const streamInfo = rtspService.getStreamInfo(streamKey);
    const stats = await streamService.getStreamStats(streamKey);

    // Combine all information
    const response = {
      stream: {
        id: stream._id,
        streamKey: stream.streamKey,
        status: stream.status,
        createdAt: stream.createdAt,
        updatedAt: stream.updatedAt,
        settings: stream.settings
      },
      camera: {
        id: stream.camera._id,
        name: stream.camera.name,
        location: stream.camera.location,
        status: stream.camera.status,
        isPublic: stream.camera.isPublic
      },
      realTime: streamInfo,
      statistics: stats,
      viewers: {
        current: stream.viewers.length,
        list: stream.viewers.map(viewer => ({
          user: viewer.user,
          joinedAt: viewer.joinedAt,
          ipAddress: viewer.ipAddress
        }))
      }
    };

    res.status(200).json({
      success: true,
      data: response
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
    const {
      page = 1,
      limit = 20,
      search,
      status = 'active'
    } = req.query;

    // Build query
    const query = { status };

    // Search in camera name or location
    if (search) {
      const cameraQuery = {
        $or: [
          { name: new RegExp(search, 'i') },
          { location: new RegExp(search, 'i') }
        ]
      };
      
      const cameras = await Camera.find(cameraQuery).select('_id');
      const cameraIds = cameras.map(cam => cam._id);
      
      query.camera = { $in: cameraIds };
    }

    // For non-admin users, only show accessible streams
    if (req.user.role !== 'admin') {
      const accessibleCameras = await Camera.find({
        $or: [
          { isPublic: true },
          { accessGroups: { $in: req.user.permissions } }
        ]
      }).select('_id');
      
      const accessibleCameraIds = accessibleCameras.map(cam => cam._id);
      query.camera = { ...query.camera, $in: accessibleCameraIds };
    }

    const streams = await Stream.find(query)
      .populate('camera', 'name location status isPublic')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await Stream.countDocuments(query);

    // Enhance with real-time information
    const enhancedStreams = await Promise.all(
      streams.map(async (stream) => {
        const streamInfo = rtspService.getStreamInfo(stream.streamKey);
        const stats = await streamService.getStreamStats(stream.streamKey);
        
        return {
          id: stream._id,
          streamKey: stream.streamKey,
          status: stream.status,
          camera: stream.camera,
          settings: stream.settings,
          realTime: streamInfo,
          statistics: stats,
          currentViewers: stream.viewers.length,
          createdAt: stream.createdAt
        };
      })
    );

    res.status(200).json({
      success: true,
      data: enhancedStreams,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
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

    if (!streamKey) {
      return res.status(400).json({
        success: false,
        message: 'Stream key is required'
      });
    }

    const stream = await Stream.findOne({ streamKey }).populate('camera');
    if (!stream) {
      return res.status(404).json({
        success: false,
        message: 'Stream not found'
      });
    }

    // Check permissions
    if (req.user.role !== 'admin' && !stream.camera.isPublic && 
        !stream.camera.accessGroups.some(group => req.user.permissions.includes(group))) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this stream'
      });
    }

    const stats = await streamService.getStreamStats(streamKey);
    const streamInfo = rtspService.getStreamInfo(streamKey);

    res.status(200).json({
      success: true,
      data: {
        streamKey,
        camera: {
          id: stream.camera._id,
          name: stream.camera.name
        },
        ...stats,
        realTime: streamInfo
      }
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
    const { 
      quality, 
      maxViewers, 
      recordingEnabled,
      useHLS 
    } = req.body;

    if (!streamKey) {
      return res.status(400).json({
        success: false,
        message: 'Stream key is required'
      });
    }

    const stream = await Stream.findOne({ streamKey }).populate('camera');
    if (!stream) {
      return res.status(404).json({
        success: false,
        message: 'Stream not found'
      });
    }

    // Check permissions
    if (req.user.role !== 'admin' && !stream.camera.isPublic && 
        !stream.camera.accessGroups.some(group => req.user.permissions.includes(group))) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this stream'
      });
    }

    const updates = {};
    const restartRequired = [];

    // Check if quality changed (requires stream restart)
    if (quality && quality !== stream.settings.quality) {
      updates['settings.quality'] = quality;
      restartRequired.push('quality');
    }

    // Check if streaming method changed
    if (useHLS !== undefined && useHLS !== (stream.settings.useHLS || true)) {
      updates['settings.useHLS'] = useHLS;
      restartRequired.push('streaming method');
    }

    // Update other settings that don't require restart
    if (maxViewers !== undefined) {
      updates['settings.maxViewers'] = Math.max(1, Math.min(50, maxViewers)); // Limit to 1-50
    }

    if (recordingEnabled !== undefined) {
      updates['settings.recordingEnabled'] = recordingEnabled;
    }

    // Apply updates
    if (Object.keys(updates).length > 0) {
      await Stream.updateOne({ streamKey }, { $set: updates });
      
      // Restart stream if required
      if (restartRequired.length > 0 && stream.status === 'active') {
        logger.info(`Restarting stream ${streamKey} due to changes: ${restartRequired.join(', ')}`);
        
        // Stop current stream
        await rtspService.stopRTSPStream(streamKey);
        
        // Start new stream with updated settings
        const updatedStream = await Stream.findOne({ streamKey }).populate('camera');
        const options = {
          quality: updatedStream.settings.quality,
          maxViewers: updatedStream.settings.maxViewers,
          recordingEnabled: updatedStream.settings.recordingEnabled
        };

        if (updatedStream.settings.useHLS) {
          await rtspService.startHLSStream(updatedStream.camera, streamKey, options);
        } else {
          await rtspService.startRTSPStream(updatedStream.camera, streamKey, options);
        }
      }
    }

    const updatedStream = await Stream.findOne({ streamKey });

    logger.info(`Stream settings updated: ${streamKey} by user ${req.user.username}`);

    res.status(200).json({
      success: true,
      data: {
        streamKey,
        settings: updatedStream.settings,
        restartRequired: restartRequired.length > 0,
        changes: restartRequired
      },
      message: `Stream settings updated successfully${restartRequired.length > 0 ? '. Stream was restarted.' : ''}`
    });

  } catch (error) {
    logger.error('Update stream settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating stream settings'
    });
  }
};

// Join stream as viewer
exports.joinStream = async (req, res) => {
  try {
    const { streamKey } = req.params;

    if (!streamKey) {
      return res.status(400).json({
        success: false,
        message: 'Stream key is required'
      });
    }

    const stream = await Stream.findOne({ streamKey }).populate('camera');
    if (!stream) {
      return res.status(404).json({
        success: false,
        message: 'Stream not found'
      });
    }

    // Check permissions
    if (req.user.role !== 'admin' && !stream.camera.isPublic && 
        !stream.camera.accessGroups.some(group => req.user.permissions.includes(group))) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this stream'
      });
    }

    // Check if stream is active
    if (stream.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Stream is not active'
      });
    }

    // Check viewer limit
    if (stream.viewers.length >= stream.settings.maxViewers) {
      return res.status(429).json({
        success: false,
        message: 'Stream has reached maximum viewer limit'
      });
    }

    // Add viewer
    await streamService.addViewer(streamKey, req.user.id, req.ip);

    // Get stream information for client
    const streamInfo = rtspService.getStreamInfo(streamKey);

    logger.debug(`User ${req.user.username} joined stream ${streamKey}`);

    res.status(200).json({
      success: true,
      data: {
        streamKey,
        streamInfo,
        joinedAt: new Date(),
        currentViewers: stream.viewers.length + 1
      },
      message: 'Successfully joined stream'
    });

  } catch (error) {
    logger.error('Join stream error:', error);
    res.status(500).json({
      success: false,
      message: 'Error joining stream'
    });
  }
};

// Leave stream as viewer
exports.leaveStream = async (req, res) => {
  try {
    const { streamKey } = req.params;

    if (!streamKey) {
      return res.status(400).json({
        success: false,
        message: 'Stream key is required'
      });
    }

    // Remove viewer
    await streamService.removeViewer(streamKey, req.user.id);

    logger.debug(`User ${req.user.username} left stream ${streamKey}`);

    res.status(200).json({
      success: true,
      data: {
        streamKey,
        leftAt: new Date()
      },
      message: 'Successfully left stream'
    });

  } catch (error) {
    logger.error('Leave stream error:', error);
    res.status(500).json({
      success: false,
      message: 'Error leaving stream'
    });
  }
};

// Record stream
exports.recordStream = async (req, res) => {
  try {
    const { streamKey } = req.params;
    const { duration = 3600 } = req.body; // Default 1 hour

    if (!streamKey) {
      return res.status(400).json({
        success: false,
        message: 'Stream key is required'
      });
    }

    const stream = await Stream.findOne({ streamKey }).populate('camera');
    if (!stream) {
      return res.status(404).json({
        success: false,
        message: 'Stream not found'
      });
    }

    // Check permissions
    if (req.user.role !== 'admin' && !stream.camera.isPublic && 
        !stream.camera.accessGroups.some(group => req.user.permissions.includes(group))) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this stream'
      });
    }

    // Check if recording is enabled for this stream
    if (!stream.settings.recordingEnabled) {
      return res.status(400).json({
        success: false,
        message: 'Recording is not enabled for this stream'
      });
    }

    // Start recording
    const recording = await rtspService.recordStream(stream.camera, duration);

    logger.info(`Recording started for stream ${streamKey} by user ${req.user.username}`);

    res.status(200).json({
      success: true,
      data: recording,
      message: 'Recording started successfully'
    });

  } catch (error) {
    logger.error('Record stream error:', error);
    res.status(500).json({
      success: false,
      message: 'Error starting recording: ' + error.message
    });
  }
};

// Get stream health
exports.getStreamHealth = async (req, res) => {
  try {
    const { streamKey } = req.params;

    if (!streamKey) {
      return res.status(400).json({
        success: false,
        message: 'Stream key is required'
      });
    }

    const stream = await Stream.findOne({ streamKey }).populate('camera');
    if (!stream) {
      return res.status(404).json({
        success: false,
        message: 'Stream not found'
      });
    }

    // Check permissions
    if (req.user.role !== 'admin' && !stream.camera.isPublic && 
        !stream.camera.accessGroups.some(group => req.user.permissions.includes(group))) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this stream'
      });
    }

    const streamInfo = rtspService.getStreamInfo(streamKey);
    const stats = await streamService.getStreamStats(streamKey);

    // Calculate health score
    const health = calculateStreamHealth(stream, streamInfo, stats);

    res.status(200).json({
      success: true,
      data: {
        streamKey,
        status: stream.status,
        health,
        lastUpdated: new Date(),
        details: {
          streamInfo,
          statistics: stats,
          cameraStatus: stream.camera.status
        }
      }
    });

  } catch (error) {
    logger.error('Get stream health error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching stream health'
    });
  }
};

// Helper function to calculate stream health
function calculateStreamHealth(stream, streamInfo, stats) {
  let score = 100;

  // Deduct points based on various factors
  if (stream.status !== 'active') score -= 50;
  if (!streamInfo) score -= 30;
  if (stats.currentViewers > stats.maxViewers * 0.8) score -= 10;
  if (streamInfo && streamInfo.uptime < 60000) score -= 5; // Less than 1 minute

  return Math.max(0, Math.min(100, score));
}

// Helper function to cleanup HLS streams
async function cleanupHLSStream(streamKey) {
  try {
    const fs = require('fs').promises;
    const path = require('path');
    
    const hlsPath = process.env.RENDER ? 
      path.join('/tmp/hls', streamKey) : 
      path.join(__dirname, '../public/hls', streamKey);

    if (fs.existsSync(hlsPath)) {
      await fs.rm(hlsPath, { recursive: true, force: true });
      logger.info(`Cleaned up HLS directory for stream: ${streamKey}`);
    }
  } catch (error) {
    logger.error(`Error cleaning up HLS stream ${streamKey}:`, error);
  }
}
