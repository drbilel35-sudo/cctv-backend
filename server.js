const app = require('./app');
const mongoose = require('mongoose');
const { createServer } = require('http');
const { initializeWebSocket } = require('./services/websocketService');
const logger = require('./utils/logger');

// Use Render's port or default to 5000
const PORT = process.env.PORT || 5000;

// Create HTTP server
const server = createServer(app);

// Initialize WebSocket
initializeWebSocket(server);

// MongoDB connection with Render compatibility
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cctv_streaming';

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  logger.info('Connected to MongoDB');
  server.listen(PORT, '0.0.0.0', () => {
    logger.info(`CCTV Backend Server running on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV}`);
  });
})
.catch((error) => {
  logger.error('MongoDB connection error:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    mongoose.connection.close();
    process.exit(0);
  });
});
