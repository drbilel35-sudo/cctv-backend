const Joi = require('joi');

// Environment variables schema
const envVarsSchema = Joi.object({
  // Application
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number()
    .default(5000),
  CORS_ORIGIN: Joi.string()
    .default('http://localhost:3000'),

  // Database
  MONGODB_URI: Joi.string()
    .required()
    .description('MongoDB connection string'),

  // Authentication
  JWT_SECRET: Joi.string()
    .required()
    .min(32)
    .description('JWT secret key'),
  JWT_EXPIRES_IN: Joi.string()
    .default('7d'),

  // Streaming
  RTSP_STREAM_PORT: Joi.number()
    .default(8000),
  ENABLE_HLS_STREAMING: Joi.boolean()
    .default(true),
  MAX_CONCURRENT_STREAMS: Joi.number()
    .default(5),

  // Security
  RATE_LIMIT_WINDOW_MS: Joi.number()
    .default(15 * 60 * 1000), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: Joi.number()
    .default(100),

  // Camera Discovery
  ONVIF_DISCOVERY_TIMEOUT: Joi.number()
    .default(5000),

}).unknown()
  .required();

const { error, value: envVars } = envVarsSchema.validate(process.env);

if (error) {
  throw new Error(`Environment validation error: ${error.message}`);
}

const config = {
  env: envVars.NODE_ENV,
  port: envVars.PORT,
  corsOrigin: envVars.CORS_ORIGIN,
  
  // Database
  mongoose: {
    url: envVars.MONGODB_URI + (envVars.NODE_ENV === 'test' ? '_test' : ''),
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    },
  },

  // JWT
  jwt: {
    secret: envVars.JWT_SECRET,
    expiresIn: envVars.JWT_EXPIRES_IN,
  },

  // Streaming
  streaming: {
    rtspPort: envVars.RTSP_STREAM_PORT,
    enableHLS: envVars.ENABLE_HLS_STREAMING,
    maxConcurrentStreams: envVars.MAX_CONCURRENT_STREAMS,
    isRender: !!envVars.RENDER,
  },

  // Security
  rateLimit: {
    windowMs: envVars.RATE_LIMIT_WINDOW_MS,
    max: envVars.RATE_LIMIT_MAX_REQUESTS,
  },

  // Camera
  camera: {
    discoveryTimeout: envVars.ONVIF_DISCOVERY_TIMEOUT,
  },
};

module.exports = config;
