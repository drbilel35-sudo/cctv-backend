const { Server } = require('socket.io');
const streamService = require('./streamService');
const logger = require('../utils/logger');

let io;

exports.initializeWebSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
      methods: ['GET', 'POST']
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });

  io.on('connection', (socket) => {
    logger.info(`Client connected: ${socket.id}`);

    // Join stream room
    socket.on('join_stream', async (data) => {
      try {
        const { streamKey, userId } = data;
        
        if (!streamKey) {
          socket.emit('error', { message: 'Stream key is required' });
          return;
        }

        // Add viewer to stream
        await streamService.addViewer(streamKey, userId, socket.handshake.address);
        
        socket.join(streamKey);
        socket.currentStream = streamKey;
        
        // Notify others about new viewer
        socket.to(streamKey).emit('viewer_joined', {
          userId,
          timestamp: new Date()
        });

        logger.debug(`User ${userId} joined stream ${streamKey}`);
        
        socket.emit('stream_joined', {
          streamKey,
          message: 'Successfully joined stream'
        });

      } catch (error) {
        logger.error('Error joining stream:', error);
        socket.emit('error', { message: error.message });
      }
    });

    // Leave stream
    socket.on('leave_stream', async (data) => {
      try {
        const { streamKey, userId } = data;
        
        if (streamKey) {
          await streamService.removeViewer(streamKey, userId);
          socket.leave(streamKey);
          
          // Notify others about viewer leaving
          socket.to(streamKey).emit('viewer_left', {
            userId,
            timestamp: new Date()
          });

          logger.debug(`User ${userId} left stream ${streamKey}`);
        }
      } catch (error) {
        logger.error('Error leaving stream:', error);
      }
    });

    // Stream control commands
    socket.on('stream_control', async (data) => {
      try {
        const { streamKey, command, value } = data;
        
        switch (command) {
          case 'pause':
            socket.to(streamKey).emit('stream_paused', { timestamp: new Date() });
            break;
          case 'resume':
            socket.to(streamKey).emit('stream_resumed', { timestamp: new Date() });
            break;
          case 'quality_change':
            socket.to(streamKey).emit('quality_changed', { quality: value });
            break;
          default:
            socket.emit('error', { message: 'Unknown command' });
        }
      } catch (error) {
        logger.error('Stream control error:', error);
        socket.emit('error', { message: error.message });
      }
    });

    // Get stream stats
    socket.on('get_stream_stats', async (data) => {
      try {
        const { streamKey } = data;
        const stats = await streamService.getStreamStats(streamKey);
        socket.emit('stream_stats', stats);
      } catch (error) {
        logger.error('Error getting stream stats:', error);
        socket.emit('error', { message: error.message });
      }
    });

    // Handle disconnection
    socket.on('disconnect', async () => {
      try {
        if (socket.currentStream) {
          await streamService.removeViewer(socket.currentStream, socket.userId);
          socket.to(socket.currentStream).emit('viewer_left', {
            userId: socket.userId,
            timestamp: new Date()
          });
        }
        logger.info(`Client disconnected: ${socket.id}`);
      } catch (error) {
        logger.error('Error handling disconnect:', error);
      }
    });

    // Error handling
    socket.on('error', (error) => {
      logger.error(`Socket error from ${socket.id}:`, error);
    });
  });

  return io;
};

// Emit event to specific stream room
exports.emitToStream = (streamKey, event, data) => {
  if (io) {
    io.to(streamKey).emit(event, data);
  }
};

// Emit event to all connected clients
exports.emitToAll = (event, data) => {
  if (io) {
    io.emit(event, data);
  }
};

// Get connected clients count for a stream
exports.getStreamViewerCount = (streamKey) => {
  if (io) {
    const room = io.sockets.adapter.rooms.get(streamKey);
    return room ? room.size : 0;
  }
  return 0;
};
