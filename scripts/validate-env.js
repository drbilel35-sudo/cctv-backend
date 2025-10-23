const fs = require('fs');
require('dotenv').config();

function validateEnvironment() {
  const required = [
    'MONGODB_URI',
    'JWT_SECRET'
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(key => {
      console.error(`   - ${key}`);
    });
    console.log('\n💡 Please check your .env file or Render environment variables.');
    process.exit(1);
  }

  // Validate JWT secret strength
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    console.error('❌ JWT_SECRET is too short. Minimum 32 characters required.');
    process.exit(1);
  }

  // Check for production settings
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.CORS_ORIGIN) {
      console.warn('⚠️  CORS_ORIGIN not set in production. This may cause CORS issues.');
    }
    
    if (process.env.JWT_EXPIRES_IN === '7d') {
      console.warn('⚠️  Using long JWT expiry in production. Consider using shorter duration.');
    }
  }

  console.log('✅ Environment variables validated successfully!');
  console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
  console.log(`🚀 Port: ${process.env.PORT}`);
  console.log(`📊 CORS Origin: ${process.env.CORS_ORIGIN}`);
}

validateEnvironment();
