const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();

// Serve HLS files
router.use('/:streamKey', (req, res, next) => {
  const { streamKey } = req.params;
  
  // Security check - validate streamKey format
  if (!/^[a-zA-Z0-9_-]+$/.test(streamKey)) {
    return res.status(400).json({ error: 'Invalid stream key' });
  }

  const hlsPath = process.env.RENDER ? 
    path.join('/tmp/hls', streamKey) : 
    path.join(__dirname, '../public/hls', streamKey);

  // Check if the stream directory exists
  if (!fs.existsSync(hlsPath)) {
    return res.status(404).json({ error: 'Stream not found' });
  }

  // Serve static files from the HLS directory
  express.static(hlsPath)(req, res, next);
});

module.exports = router;
