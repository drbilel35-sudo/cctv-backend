const app = require('./app');
const mongoose = require('mongoose');
const { createServer } = require('http');
const { initializeWebSocket } = require('./services/websocketService');
const logger = require('./utils/logger');

// Render-compatible port configuration
const PORT = process.env.PORT || 5000;

// Create HTTP server
const server = createServer(app);

// Initialize WebSocket
initializeWebSocket(server);

// MongoDB connection with Render compatibility
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  logger.error('MONGODB_URI environment variable is not set');
  process.exit(1);
}

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  logger.info('Connected to MongoDB');
  
  // Start server on all interfaces for Render
  server.listen(PORT, '0.0.0.0', () => {
    logger.info(`CCTV Backend Server running on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV}`);
    logger.info(`Render: ${process.env.RENDER ? 'Yes' : 'No'}`);
    
    // Log streaming configuration
    logger.info(`HLS Streaming: ${process.env.ENABLE_HLS_STREAMING ? 'Enabled' : 'Disabled'}`);
  });
})
.catch((error) => {
  logger.error('MongoDB connection error:', error);
  process.exit(1);
});

// Graceful shutdown for Render
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    mongoose.connection.close();
    logger.info('Server shut down gracefully');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
