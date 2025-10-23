const Stream = require('../models/Stream');
const Camera = require('../models/Camera');
const { startRTSPStream, stopRTSPStream } = require('./rtspService');
const logger = require('../utils/logger');

class StreamService {
  constructor() {
    this.activeStreams = new Map();
  }

  // Start camera stream
  async startStream(cameraId, userId, options = {}) {
    try {
      const camera = await Camera.findById(cameraId);
      if (!camera) {
        throw new Error('Camera not found');
      }

      // Check if stream already exists and is active
      let stream = await Stream.findOne({ camera: cameraId });
      
      if (!stream) {
        stream = await Stream.create({ camera: cameraId });
      }

      // Start RTSP stream
      const streamInfo = await startRTSPStream(camera, stream.streamKey, options);
      
      // Update stream status
      stream.status = 'active';
      stream.stats.maxViewers = Math.max(stream.stats.maxViewers, stream.viewers.length);
      await stream.save();

      // Store in active streams
      this.activeStreams.set(stream.streamKey, {
        stream,
        camera,
        startTime: new Date(),
        viewers: new Set()
      });

      logger.info(`Stream started for camera: ${camera.name}, key: ${stream.streamKey}`);

      return {
        streamKey: stream.streamKey,
        streamUrl: streamInfo.streamUrl,
        websocketUrl: streamInfo.websocketUrl
      };
    } catch (error) {
      logger.error('Error starting stream:', error);
      throw error;
    }
  }

  // Stop camera stream
  async stopStream(streamKey) {
    try {
      const streamData = this.activeStreams.get(streamKey);
      if (!streamData) {
        throw new Error('Stream not found or not active');
      }

      // Stop RTSP stream
      await stopRTSPStream(streamKey);

      // Update stream in database
      const stream = await Stream.findOne({ streamKey });
      if (stream) {
        stream.status = 'inactive';
        stream.stats.totalViewTime += Date.now() - streamData.startTime;
        await stream.save();
      }

      // Remove from active streams
      this.activeStreams.delete(streamKey);

      logger.info(`Stream stopped: ${streamKey}`);
    } catch (error) {
      logger.error('Error stopping stream:', error);
      throw error;
    }
  }

  // Add viewer to stream
  async addViewer(streamKey, userId, ipAddress) {
    try {
      const stream = await Stream.findOne({ streamKey });
      if (!stream) {
        throw new Error('Stream not found');
      }

      // Check if user is already viewing
      const existingViewer = stream.viewers.find(v => v.user.toString() === userId);
      
      if (!existingViewer) {
        stream.viewers.push({
          user: userId,
          ipAddress,
          joinedAt: new Date()
        });
        
        stream.stats.totalViewers += 1;
        stream.stats.maxViewers = Math.max(stream.stats.maxViewers, stream.viewers.length);
        
        await stream.save();
      }

      // Update active streams map
      const streamData = this.activeStreams.get(streamKey);
      if (streamData) {
        streamData.viewers.add(userId);
      }

      logger.debug(`Viewer ${userId} added to stream ${streamKey}`);
    } catch (error) {
      logger.error('Error adding viewer:', error);
      throw error;
    }
  }

  // Remove viewer from stream
  async removeViewer(streamKey, userId) {
    try {
      const stream = await Stream.findOne({ streamKey });
      if (!stream) {
        return;
      }

      stream.viewers = stream.viewers.filter(v => v.user.toString() !== userId);
      await stream.save();

      // Update active streams map
      const streamData = this.activeStreams.get(streamKey);
      if (streamData) {
        streamData.viewers.delete(userId);
      }

      logger.debug(`Viewer ${userId} removed from stream ${streamKey}`);
    } catch (error) {
      logger.error('Error removing viewer:', error);
    }
  }

  // Get stream statistics
  async getStreamStats(streamKey) {
    const stream = await Stream.findOne({ streamKey }).populate('camera');
    if (!stream) {
      throw new Error('Stream not found');
    }

    const streamData = this.activeStreams.get(streamKey);
    
    return {
      streamKey,
      camera: stream.camera.name,
      status: stream.status,
      currentViewers: stream.viewers.length,
      totalViewers: stream.stats.totalViewers,
      maxViewers: stream.stats.maxViewers,
      totalViewTime: stream.stats.totalViewTime,
      bandwidth: stream.stats.bandwidth,
      uptime: streamData ? Date.now() - streamData.startTime : 0
    };
  }

  // Get all active streams
  getActiveStreams() {
    return Array.from(this.activeStreams.values()).map(data => ({
      camera: data.camera.name,
      streamKey: data.stream.streamKey,
      startTime: data.startTime,
      currentViewers: data.viewers.size,
      status: data.stream.status
    }));
  }
}

const streamService = new StreamService();

module.exports = streamService;
