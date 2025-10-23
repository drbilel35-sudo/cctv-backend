const Camera = require('../models/Camera');
const Stream = require('../models/Stream');
const { discoverCameras } = require('../services/cameraDiscovery');
const logger = require('../utils/logger');

// Get all cameras
exports.getCameras = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      location,
      type,
      search
    } = req.query;

    const query = {};

    // Filter by status
    if (status) query.status = status;
    
    // Filter by type
    if (type) query['specifications.type'] = type;
    
    // Filter by location
    if (location) query.location = new RegExp(location, 'i');
    
    // Search in name and location
    if (search) {
      query.$or = [
        { name: new RegExp(search, 'i') },
        { location: new RegExp(search, 'i') },
        { description: new RegExp(search, 'i') }
      ];
    }

    // For non-admin users, only show public cameras or cameras in their access groups
    if (req.user.role !== 'admin') {
      query.$or = [
        { isPublic: true },
        { accessGroups: { $in: req.user.permissions } }
      ];
    }

    const cameras = await Camera.find(query)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await Camera.countDocuments(query);

    res.status(200).json({
      success: true,
      data: cameras,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Get cameras error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching cameras'
    });
  }
};

// Get camera by ID
exports.getCamera = async (req, res) => {
  try {
    const camera = await Camera.findById(req.params.id);
    
    if (!camera) {
      return res.status(404).json({
        success: false,
        message: 'Camera not found'
      });
    }

    // Check access permissions
    if (req.user.role !== 'admin' && !camera.isPublic && 
        !camera.accessGroups.some(group => req.user.permissions.includes(group))) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this camera'
      });
    }

    res.status(200).json({
      success: true,
      data: camera
    });
  } catch (error) {
    logger.error('Get camera error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching camera'
    });
  }
};

// Create new camera
exports.createCamera = async (req, res) => {
  try {
    const cameraData = {
      ...req.body,
      // Ensure status is set appropriately
      status: 'offline'
    };

    const camera = await Camera.create(cameraData);

    // Create a stream for the camera
    await Stream.create({
      camera: camera._id
    });

    logger.info(`Camera created: ${camera.name} by user ${req.user.username}`);

    res.status(201).json({
      success: true,
      data: camera,
      message: 'Camera created successfully'
    });
  } catch (error) {
    logger.error('Create camera error:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Camera with this IP address or name already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error creating camera'
    });
  }
};

// Update camera
exports.updateCamera = async (req, res) => {
  try {
    const camera = await Camera.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!camera) {
      return res.status(404).json({
        success: false,
        message: 'Camera not found'
      });
    }

    logger.info(`Camera updated: ${camera.name} by user ${req.user.username}`);

    res.status(200).json({
      success: true,
      data: camera,
      message: 'Camera updated successfully'
    });
  } catch (error) {
    logger.error('Update camera error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating camera'
    });
  }
};

// Delete camera
exports.deleteCamera = async (req, res) => {
  try {
    const camera = await Camera.findById(req.params.id);
    
    if (!camera) {
      return res.status(404).json({
        success: false,
        message: 'Camera not found'
      });
    }

    // Delete associated stream
    await Stream.deleteOne({ camera: camera._id });

    await Camera.findByIdAndDelete(req.params.id);

    logger.info(`Camera deleted: ${camera.name} by user ${req.user.username}`);

    res.status(200).json({
      success: true,
      message: 'Camera deleted successfully'
    });
  } catch (error) {
    logger.error('Delete camera error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting camera'
    });
  }
};

// Discover cameras on network
exports.discoverCameras = async (req, res) => {
  try {
    const discoveredCameras = await discoverCameras();
    
    res.status(200).json({
      success: true,
      data: discoveredCameras,
      message: `Found ${discoveredCameras.length} cameras`
    });
  } catch (error) {
    logger.error('Camera discovery error:', error);
    res.status(500).json({
      success: false,
      message: 'Error discovering cameras'
    });
  }
};

// Check camera health
exports.checkCameraHealth = async (req, res) => {
  try {
    const camera = await Camera.findById(req.params.id);
    
    if (!camera) {
      return res.status(404).json({
        success: false,
        message: 'Camera not found'
      });
    }

    // Simulate health check (in real implementation, ping camera)
    const healthCheck = {
      lastChecked: new Date(),
      responseTime: Math.random() * 100 + 50, // Simulated response time
      packetLoss: Math.random() * 5 // Simulated packet loss
    };

    // Update camera health
    camera.healthCheck = healthCheck;
    camera.status = healthCheck.packetLoss < 2 ? 'online' : 'offline';
    camera.lastSeen = new Date();
    
    await camera.save();

    res.status(200).json({
      success: true,
      data: healthCheck,
      status: camera.status
    });
  } catch (error) {
    logger.error('Camera health check error:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking camera health'
    });
  }
};
