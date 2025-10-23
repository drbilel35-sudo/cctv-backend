const express = require('express');
const {
  getCameras,
  getCamera,
  createCamera,
  updateCamera,
  deleteCamera,
  discoverCameras,
  checkCameraHealth
} = require('../controllers/cameraController');
const { auth, authorize, checkPermission } = require('../middleware/auth');

const router = express.Router();

// Apply auth middleware to all routes
router.use(auth);

// Public routes (require authentication but not specific permissions)
router.get('/', getCameras);
router.get('/discover', checkPermission('view_cameras'), discoverCameras);
router.get('/:id', getCamera);
router.get('/:id/health', checkPermission('view_cameras'), checkCameraHealth);

// Protected routes (require specific permissions)
router.post('/', checkPermission('manage_cameras'), createCamera);
router.put('/:id', checkPermission('manage_cameras'), updateCamera);
router.delete('/:id', checkPermission('manage_cameras'), deleteCamera);

module.exports = router;
