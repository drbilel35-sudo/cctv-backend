const Stream = require('node-rtsp-stream');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const util = require('util');
const logger = require('../utils/logger');

const execAsync = util.promisify(exec);
const streams = new Map();

// Check if FFmpeg is available
let ffmpegAvailable = false;

// Initialize FFmpeg check
(async function checkFFmpeg() {
  try {
    await execAsync('which ffmpeg');
    ffmpegAvailable = true;
    logger.info('FFmpeg is available on the system');
  } catch (error) {
    logger.warn('FFmpeg is not available. Streaming functionality will be limited.');
    ffmpegAvailable = false;
  }
})();

// Start RTSP to WebSocket stream (Render-compatible)
exports.startRTSPStream = async (camera, streamKey, options = {}) => {
  return new Promise((resolve, reject) => {
    try {
      // Check if we're in Render environment
      const isRender = process.env.RENDER || process.env.NODE_ENV === 'production';
      
      if (isRender && !ffmpegAvailable) {
        return reject(new Error('FFmpeg not available in Render environment. Consider using HLS streaming instead.'));
      }

      const { quality = 'medium', port = 8000 } = options;
      
      // Construct RTSP URL with credentials if provided
      let rtspUrl = camera.streamUrl;
      if (camera.username && camera.password) {
        // Handle special characters in credentials
        const encodedUsername = encodeURIComponent(camera.username);
        const encodedPassword = encodeURIComponent(camera.password);
        rtspUrl = rtspUrl.replace('rtsp://', `rtsp://${encodedUsername}:${encodedPassword}@`);
      }

      // Use dynamic port assignment for Render
      const wsPort = isRender ? getAvailablePort(port) : port + Math.floor(Math.random() * 1000);

      const streamOptions = {
        name: streamKey,
        streamUrl: rtspUrl,
        wsPort: wsPort,
        ffmpegOptions: getFFmpegOptions(quality),
        width: 1280,
        height: 720,
        ffmpegPath: getFFmpegPath() // Use system FFmpeg if available
      };

      // Add timeout for stream initialization
      const initializationTimeout = setTimeout(() => {
        reject(new Error('Stream initialization timeout'));
      }, 30000);

      const stream = new Stream(streamOptions);

      stream.on('start', () => {
        clearTimeout(initializationTimeout);
        logger.info(`RTSP stream started: ${streamKey} on port ${streamOptions.wsPort}`);
        
        streams.set(streamKey, {
          stream,
          port: streamOptions.wsPort,
          startTime: new Date(),
          cameraId: camera._id,
          quality: quality
        });

        // Get the actual server URL for Render
        const baseUrl = isRender ? 
          `wss://${process.env.RENDER_SERVICE_NAME}.onrender.com` : 
          'ws://localhost';

        resolve({
          streamKey,
          streamUrl: `${baseUrl}:${streamOptions.wsPort}`,
          websocketUrl: `${baseUrl}:${streamOptions.wsPort}`,
          quality,
          status: 'active',
          port: streamOptions.wsPort
        });
      });

      stream.on('error', (error) => {
        clearTimeout(initializationTimeout);
        logger.error(`RTSP stream error for ${streamKey}:`, error);
        streams.delete(streamKey);
        reject(new Error(`Stream error: ${error.message}`));
      });

      stream.on('exit', (code, signal) => {
        logger.info(`RTSP stream stopped: ${streamKey}, code: ${code}, signal: ${signal}`);
        streams.delete(streamKey);
      });

      // Handle FFmpeg-specific events
      stream.stream.on('error', (error) => {
        logger.error(`FFmpeg error for stream ${streamKey}:`, error);
      });

    } catch (error) {
      logger.error('Error starting RTSP stream:', error);
      reject(error);
    }
  });
};

// Stop RTSP stream
exports.stopRTSPStream = (streamKey) => {
  return new Promise((resolve) => {
    const streamData = streams.get(streamKey);
    
    if (streamData) {
      try {
        streamData.stream.stop();
        logger.info(`RTSP stream stopped: ${streamKey}`);
      } catch (error) {
        logger.error(`Error stopping stream ${streamKey}:`, error);
      } finally {
        streams.delete(streamKey);
      }
    }
    
    resolve();
  });
};

// Get FFmpeg path based on environment
function getFFmpegPath() {
  // Try to use system FFmpeg first
  if (ffmpegAvailable) {
    return 'ffmpeg';
  }
  
  // Fallback to relative path (if bundled)
  const possiblePaths = [
    '/usr/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    './ffmpeg/ffmpeg',
    process.env.FFMPEG_PATH
  ];
  
  for (const path of possiblePaths) {
    if (path && fs.existsSync(path)) {
      return path;
    }
  }
  
  return 'ffmpeg'; // Let node-rtsp-stream handle it
}

// Get available port (simplified for Render)
function getAvailablePort(basePort) {
  // In Render, we need to use the assigned port
  // This is a simplified implementation
  return basePort + Math.floor(Math.random() * 100) + 1000;
}

// Get FFmpeg options based on quality (Render-optimized)
function getFFmpegOptions(quality) {
  const baseOptions = [
    '-re',
    '-i', '-',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-tune', 'zerolatency',
    '-c:a', 'aac',
    '-ar', '44100',
    '-f', 'mpegts',
    '-r', '25',
    '-flags', '+global_header'
  ];

  switch (quality) {
    case 'low':
      return [
        ...baseOptions,
        '-b:v', '500k',
        '-maxrate', '500k',
        '-bufsize', '1000k',
        '-s', '640x360',
        '-g', '50' // GOP size
      ];
    case 'medium':
      return [
        ...baseOptions,
        '-b:v', '1000k',
        '-maxrate', '1000k',
        '-bufsize', '2000k',
        '-s', '854x480',
        '-g', '50'
      ];
    case 'high':
      return [
        ...baseOptions,
        '-b:v', '2500k',
        '-maxrate', '2500k',
        '-bufsize', '5000k',
        '-s', '1280x720',
        '-g', '50'
      ];
    case 'original':
    default:
      return [
        ...baseOptions,
        '-b:v', '5000k',
        '-maxrate', '5000k',
        '-bufsize', '10000k',
        '-g', '50'
      ];
  }
}

// Record stream to file (Render-compatible)
exports.recordStream = (camera, duration = 3600) => {
  return new Promise((resolve, reject) => {
    try {
      if (!ffmpegAvailable) {
        return reject(new Error('FFmpeg not available for recording'));
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `recording_${camera.name}_${timestamp}.mp4`;
      
      // Use Render's persistent storage or fallback to tmp
      const outputDir = process.env.RENDER ? 
        '/tmp/recordings' : 
        path.join(__dirname, '../public/recordings');
      
      const outputPath = path.join(outputDir, filename);

      // Ensure recordings directory exists
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Construct RTSP URL with credentials
      let rtspUrl = camera.streamUrl;
      if (camera.username && camera.password) {
        const encodedUsername = encodeURIComponent(camera.username);
        const encodedPassword = encodeURIComponent(camera.password);
        rtspUrl = rtspUrl.replace('rtsp://', `rtsp://${encodedUsername}:${encodedPassword}@`);
      }

      const command = ffmpeg(rtspUrl)
        .output(outputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .duration(duration)
        .outputOptions([
          '-preset veryfast',
          '-tune zerolatency',
          '-movflags +faststart'
        ])
        .on('start', (commandLine) => {
          logger.info(`Recording started: ${filename}`);
          logger.debug(`FFmpeg command: ${commandLine}`);
        })
        .on('end', () => {
          logger.info(`Recording completed: ${filename}`);
          // Check if file exists and get stats
          if (fs.existsSync(outputPath)) {
            const stats = fs.statSync(outputPath);
            resolve({
              filename,
              path: outputPath,
              duration,
              size: stats.size,
              url: `/recordings/${filename}`
            });
          } else {
            reject(new Error('Recording file was not created'));
          }
        })
        .on('error', (error) => {
          logger.error(`Recording error: ${error.message}`);
          reject(error);
        })
        .on('stderr', (stderrLine) => {
          logger.debug(`FFmpeg: ${stderrLine}`);
        });

      command.run();

    } catch (error) {
      logger.error('Error starting recording:', error);
      reject(error);
    }
  });
};

// Alternative HLS streaming for Render (recommended)
exports.startHLSStream = async (camera, streamKey, options = {}) => {
  return new Promise((resolve, reject) => {
    try {
      const { quality = 'medium' } = options;
      
      // HLS output directory
      const outputDir = process.env.RENDER ? 
        '/tmp/hls' : 
        path.join(__dirname, '../public/hls');
      
      const outputPath = path.join(outputDir, streamKey);

      if (!fs.existsSync(outputPath)) {
        fs.mkdirSync(outputPath, { recursive: true });
      }

      // Construct RTSP URL with credentials
      let rtspUrl = camera.streamUrl;
      if (camera.username && camera.password) {
        const encodedUsername = encodeURIComponent(camera.username);
        const encodedPassword = encodeURIComponent(camera.password);
        rtspUrl = rtspUrl.replace('rtsp://', `rtsp://${encodedUsername}:${encodedPassword}@`);
      }

      const hlsOptions = getHLSOptions(quality, outputPath, streamKey);

      const command = ffmpeg(rtspUrl)
        .addOptions(hlsOptions)
        .on('start', (commandLine) => {
          logger.info(`HLS stream started: ${streamKey}`);
          logger.debug(`FFmpeg HLS command: ${commandLine}`);
        })
        .on('error', (error) => {
          logger.error(`HLS stream error for ${streamKey}:`, error);
          reject(error);
        })
        .on('stderr', (stderrLine) => {
          logger.debug(`FFmpeg HLS: ${stderrLine}`);
        });

      command.run();

      // Store HLS stream info
      streams.set(streamKey, {
        type: 'hls',
        outputPath: outputPath,
        startTime: new Date(),
        cameraId: camera._id,
        quality: quality
      });

      resolve({
        streamKey,
        streamUrl: `/hls/${streamKey}/stream.m3u8`,
        type: 'hls',
        quality,
        status: 'active'
      });

    } catch (error) {
      logger.error('Error starting HLS stream:', error);
      reject(error);
    }
  });
};

// Get HLS options
function getHLSOptions(quality, outputPath, streamKey) {
  const baseOptions = [
    '-preset veryfast',
    '-tune zerolatency',
    '-g 50',
    '-keyint_min 50',
    '-hls_time 4',
    '-hls_list_size 6',
    '-hls_flags delete_segments',
    '-hls_segment_filename', `${outputPath}/segment%03d.ts`
  ];

  switch (quality) {
    case 'low':
      return [
        ...baseOptions,
        '-b:v 500k',
        '-maxrate 500k',
        '-bufsize 1000k',
        '-s 640x360',
        '-f hls',
        `${outputPath}/stream.m3u8`
      ];
    case 'medium':
      return [
        ...baseOptions,
        '-b:v 1000k',
        '-maxrate 1000k',
        '-bufsize 2000k',
        '-s 854x480',
        '-f hls',
        `${outputPath}/stream.m3u8`
      ];
    case 'high':
      return [
        ...baseOptions,
        '-b:v 2500k',
        '-maxrate 2500k',
        '-bufsize 5000k',
        '-s 1280x720',
        '-f hls',
        `${outputPath}/stream.m3u8`
      ];
    default:
      return [
        ...baseOptions,
        '-b:v 5000k',
        '-maxrate 5000k',
        '-bufsize 10000k',
        '-f hls',
        `${outputPath}/stream.m3u8`
      ];
  }
}

// Get stream information
exports.getStreamInfo = (streamKey) => {
  const streamData = streams.get(streamKey);
  if (!streamData) return null;

  const baseInfo = {
    streamKey,
    uptime: Date.now() - streamData.startTime,
    status: 'active',
    type: streamData.type || 'rtsp',
    quality: streamData.quality
  };

  if (streamData.type === 'hls') {
    return {
      ...baseInfo,
      streamUrl: `/hls/${streamKey}/stream.m3u8`
    };
  } else {
    return {
      ...baseInfo,
      port: streamData.port,
      streamUrl: `ws://localhost:${streamData.port}`
    };
  }
};

// Get all active streams
exports.getActiveRTSPStreams = () => {
  return Array.from(streams.entries()).map(([streamKey, data]) => ({
    streamKey,
    type: data.type || 'rtsp',
    port: data.port,
    uptime: Date.now() - data.startTime,
    quality: data.quality,
    cameraId: data.cameraId
  }));
};

// Health check for streams
exports.healthCheck = () => {
  const activeStreams = Array.from(streams.entries());
  const now = Date.now();
  
  // Remove streams that have been inactive for too long
  for (const [streamKey, data] of activeStreams) {
    if (now - data.startTime > 24 * 60 * 60 * 1000) { // 24 hours
      this.stopRTSPStream(streamKey);
      logger.info(`Removed stale stream: ${streamKey}`);
    }
  }

  return {
    totalStreams: streams.size,
    ffmpegAvailable: ffmpegAvailable,
    isRender: !!process.env.RENDER
  };
};

// Cleanup all streams
exports.cleanup = () => {
  const streamKeys = Array.from(streams.keys());
  streamKeys.forEach(streamKey => {
    this.stopRTSPStream(streamKey);
  });
  logger.info('All streams cleaned up');
};
