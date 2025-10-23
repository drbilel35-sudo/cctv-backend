const express = require('express');
const router = express.Router();

// GET /api/cameras - Simple test route
router.get('/', (req, res) => {
    console.log('GET /api/cameras called');
    res.json({
        success: true,
        message: 'Cameras route is working!',
        data: [
            {
                _id: '1',
                name: 'Main Entrance Camera',
                ip: '192.168.1.100',
                type: 'rtsp',
                location: 'Building A',
                status: 'online',
                isPublic: true
            },
            {
                _id: '2',
                name: 'Parking Lot Camera',
                ip: '192.168.1.101',
                type: 'rtsp',
                location: 'Parking Area', 
                status: 'online',
                isPublic: true
            }
        ]
    });
});

// GET /api/cameras/:id
router.get('/:id', (req, res) => {
    res.json({
        success: true,
        data: {
            _id: req.params.id,
            name: `Camera ${req.params.id}`,
            ip: '192.168.1.100',
            status: 'online'
        }
    });
});

module.exports = router;
