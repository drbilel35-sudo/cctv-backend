const express = require('express');
const {
  startStream,
  stopStream,
  getStream,
  getActiveStreams,
  getStreamStats,
  updateStreamSettings
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
router.put('/:streamKey/settings', checkPermission('manage_streams'), updateStreamSettings);

module.exports = router;
