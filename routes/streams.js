const express = require('express');
const {
  startStream,
  stopStream,
  getStream,
  getActiveStreams,
  getStreamStats,
  updateStreamSettings,
  joinStream,
  leaveStream,
  recordStream,
  getStreamHealth
} = require('../controllers/streamController');
const { auth, checkPermission } = require('../middleware/auth');

const router = express.Router();

// Apply auth middleware to all routes
router.use(auth);

// Stream management routes
router.get('/active', checkPermission('view_streams'), getActiveStreams);
router.post('/:cameraId/start', checkPermission('view_streams'), startStream);
router.post('/:streamKey/stop', checkPermission('view_streams'), stopStream);
router.get('/:streamKey', checkPermission('view_streams'), getStream);
router.get('/:streamKey/stats', checkPermission('view_streams'), getStreamStats);
router.get('/:streamKey/health', checkPermission('view_streams'), getStreamHealth);
router.put('/:streamKey/settings', checkPermission('manage_streams'), updateStreamSettings);

// Viewer management
router.post('/:streamKey/join', checkPermission('view_streams'), joinStream);
router.post('/:streamKey/leave', checkPermission('view_streams'), leaveStream);

// Recording
router.post('/:streamKey/record', checkPermission('manage_streams'), recordStream);

module.exports = router;
