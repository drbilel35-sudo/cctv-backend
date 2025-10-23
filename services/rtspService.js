const Stream = require('node-rtsp-stream');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

const streams = new Map();

// Start RTSP to WebSocket stream
exports.startRTSPStream = async (camera, streamKey, options = {}) => {
  return new Promise((resolve, reject) => {
    try {
      const { quality = 'medium', port = 8000 } = options;
      
      // Construct RTSP URL with credentials if provided
      let rtspUrl = camera.streamUrl;
      if (camera.username && camera.password) {
        const url = new URL(camera.streamUrl);
        url.username = camera.username;
        url.password = camera.password;
        rtspUrl = url.toString();
      }

      const streamOptions = {
        name: streamKey,
        streamUrl: rtspUrl,
        wsPort: port + Math.floor(Math.random() * 1000), // Dynamic port assignment
        ffmpegOptions: getFFmpegOptions(quality),
        width: 1280,
        height: 720
      };

      const stream = new Stream(streamOptions);

      stream.on('start', () => {
        logger.info(`RTSP stream started: ${streamKey} on port ${streamOptions.wsPort}`);
        
        streams.set(streamKey, {
          stream,
          port: streamOptions.wsPort,
          startTime: new Date()
        });

        resolve({
          streamKey,
          streamUrl: `ws://localhost:${streamOptions.wsPort}`,
          quality,
          status: 'active'
        });
      });

      stream.on('error', (error) => {
        logger.error(`RTSP stream error for ${streamKey}:`, error);
        streams.delete(streamKey);
        reject(error);
      });

      stream.on('exit', (code, signal) => {
        logger.info(`RTSP stream stopped: ${streamKey}, code: ${code}, signal: ${signal}`);
        streams.delete(streamKey);
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
      streamData.stream.stop();
      streams.delete(streamKey);
      logger.info(`RTSP stream stopped: ${streamKey}`);
    }
    
    resolve();
  });
};

// Get FFmpeg options based on quality
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
    '-r', '25'
  ];

  switch (quality) {
    case 'low':
      return [
        ...baseOptions,
        '-b:v', '500k',
        '-maxrate', '500k',
        '-bufsize', '1000k',
        '-s', '640x360'
      ];
    case 'medium':
      return [
        ...baseOptions,
        '-b:v', '1000k',
        '-maxrate', '1000k',
        '-bufsize', '2000k',
        '-s', '854x480'
      ];
    case 'high':
      return [
        ...baseOptions,
        '-b:v', '2500k',
        '-maxrate', '2500k',
        '-bufsize', '5000k',
        '-s', '1280x720'
      ];
    case 'original':
    default:
      return [
        ...baseOptions,
        '-b:v', '5000k',
        '-maxrate', '5000k',
        '-bufsize', '10000k'
      ];
  }
}

// Record stream to file
exports.recordStream = (camera, duration = 3600) => {
  return new Promise((resolve, reject) => {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `recording_${camera.name}_${timestamp}.mp4`;
      const outputPath = path.join(__dirname, '../public/recordings', filename);

      // Ensure recordings directory exists
      const recordingsDir = path.dirname(outputPath);
      if (!fs.existsSync(recordingsDir)) {
       
      fs.mkdirSync(recordingsDir, { recursive: true });

              // Construct RTSP URL with credentials
      let rtspUrl = camera.streamUrl;
      if (camera.username && camera.password) {
        const url = new URL(camera.streamUrl);
        url.username = camera.username;
        url.password = camera.password;
        rtspUrl = url.toString();
      }

      const command = ffmpeg(rtspUrl)
        .output(outputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .duration(duration)
        .on('start', (commandLine) => {
          logger.info(`Recording started: ${filename}`);
          logger.debug(`FFmpeg command: ${commandLine}`);
        })
        .on('end', () => {
          logger.info(`Recording completed: ${filename}`);
          resolve({
            filename,
            path: outputPath,
            duration,
            size: fs.statSync(outputPath).size
          });
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

// Get stream information
exports.getStreamInfo = (streamKey) => {
  const streamData = streams.get(streamKey);
  return streamData ? {
    streamKey,
    port: streamData.port,
    uptime: Date.now() - streamData.startTime,
    status: 'active'
  } : null;
};

// Get all active RTSP streams
exports.getActiveRTSPStreams = () => {
  return Array.from(streams.entries()).map(([streamKey, data]) => ({
    streamKey,
    port: data.port,
    uptime: Date.now() - data.startTime
  }));
};
