const onvif = require('node-onvif');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const logger = require('../utils/logger');

class CameraDiscovery {
  constructor() {
    this.discoveredCameras = [];
  }

  // Discover ONVIF cameras
  async discoverOnvifCameras() {
    return new Promise((resolve, reject) => {
      const devices = [];
      
      const discovery = new onvif.Discovery({
        timeout: parseInt(process.env.ONVIF_DISCOVERY_TIMEOUT) || 5000
      });

      discovery.on('device', (device) => {
        devices.push({
          name: device.name || `Camera-${device.urn}`,
          ipAddress: device.hostname,
          port: device.port || 80,
          protocol: 'onvif',
          manufacturer: device.manufacturer,
          model: device.model,
          streamUrl: this.constructStreamUrl(device),
          discoveredVia: 'onvif'
        });
      });

      discovery.on('error', (error) => {
        logger.error('ONVIF discovery error:', error);
        reject(error);
      });

      discovery.on('done', () => {
        logger.info(`ONVIF discovery found ${devices.length} devices`);
        resolve(devices);
      });

      discovery.discover();
    });
  }

  // Construct stream URL from ONVIF device
  constructStreamUrl(device) {
    // This is a simplified implementation
    // In practice, you'd need to get the actual RTSP URL from the device
    return `rtsp://${device.hostname}:554/stream1`;
  }

  // Network scan for RTSP cameras
  async scanNetworkForCameras() {
    const subnet = process.env.NETWORK_SCAN_SUBNET || '192.168.1.0/24';
    const commonPorts = [554, 8554, 10554]; // Common RTSP ports
    
    const cameras = [];

    // This is a simplified implementation
    // In practice, you'd use nmap or similar tools
    for (let i = 1; i < 255; i++) {
      const ip = `192.168.1.${i}`;
      
      for (const port of commonPorts) {
        try {
          // Simulate port checking (replace with actual implementation)
          const isReachable = await this.checkPort(ip, port);
          
          if (isReachable) {
            cameras.push({
              name: `Discovered-Camera-${ip}`,
              ipAddress: ip,
              port: port,
              protocol: 'rtsp',
              streamUrl: `rtsp://${ip}:${port}/stream1`,
              discoveredVia: 'network-scan'
            });
          }
        } catch (error) {
          // Continue scanning other IPs
        }
      }
    }

    return cameras;
  }

  // Check if port is open (simplified)
  async checkPort(ip, port) {
    return new Promise((resolve) => {
      const net = require('net');
      const socket = new net.Socket();
      
      socket.setTimeout(1000);
      
      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });
      
      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      
      socket.on('error', () => {
        resolve(false);
      });
      
      socket.connect(port, ip);
    });
  }

  // Main discovery method
  async discover() {
    logger.info('Starting camera discovery...');
    
    const discoveredCameras = [];
    
    try {
      // Discover ONVIF cameras
      const onvifCameras = await this.discoverOnvifCameras();
      discoveredCameras.push(...onvifCameras);
    } catch (error) {
      logger.error('ONVIF discovery failed:', error);
    }

    try {
      // Scan network for RTSP cameras
      const networkCameras = await this.scanNetworkForCameras();
      discoveredCameras.push(...networkCameras);
    } catch (error) {
      logger.error('Network scan failed:', error);
    }

    // Remove duplicates based on IP address
    const uniqueCameras = discoveredCameras.filter((camera, index, self) =>
      index === self.findIndex((c) => c.ipAddress === camera.ipAddress)
    );

    logger.info(`Camera discovery completed. Found ${uniqueCameras.length} unique cameras.`);
    
    return uniqueCameras;
  }
}

const cameraDiscovery = new CameraDiscovery();

exports.discoverCameras = async () => {
  return await cameraDiscovery.discover();
};
