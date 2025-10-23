const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

async function setupDefaultUsers() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Default users data
    const defaultUsers = [
      {
        username: 'admin',
        email: 'admin@cctv.com',
        password: 'admin123',
        role: 'admin',
        permissions: ['view_cameras', 'manage_cameras', 'view_streams', 'manage_streams', 'admin'],
        isActive: true
      },
      {
        username: 'viewer',
        email: 'viewer@cctv.com',
        password: 'viewer123',
        role: 'user',
        permissions: ['view_cameras', 'view_streams'],
        isActive: true
      },
      {
        username: 'operator',
        email: 'operator@cctv.com',
        password: 'operator123',
        role: 'user',
        permissions: ['view_cameras', 'manage_cameras', 'view_streams'],
        isActive: true
      }
    ];

    for (const userData of defaultUsers) {
      const userExists = await User.findOne({ email: userData.email });
      
      if (!userExists) {
        await User.create(userData);
        console.log(`✅ Created user: ${userData.username}`);
      } else {
        console.log(`⚠️ User already exists: ${userData.username}`);
      }
    }

    console.log('\n📋 Default Users Created:');
    console.log('👑 Admin: admin@cctv.com / admin123');
    console.log('👀 Viewer: viewer@cctv.com / viewer123');
    console.log('⚙️ Operator: operator@cctv.com / operator123');

    await mongoose.connection.close();
    console.log('Setup completed!');

  } catch (error) {
    console.error('Error setting up default users:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  setupDefaultUsers();
}

module.exports = setupDefaultUsers;
