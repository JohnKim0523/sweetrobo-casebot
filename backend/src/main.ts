import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as bodyParser from 'body-parser';
import * as dotenv from 'dotenv';
import helmet from 'helmet';

// Load environment variables
dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Apply Helmet for security headers
  app.use(
    helmet({
      contentSecurityPolicy: false, // Disable for image uploads
      crossOriginEmbedderPolicy: false, // Allow cross-origin resources
    }),
  );

  // Increase body size limit for image uploads
  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

  // Configure CORS for production
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    process.env.FRONTEND_URL || 'http://localhost:3000',
    // Production domains - always include for Railway deployment
    'https://sweetrobo.com',
    'https://www.sweetrobo.com',
    'https://sweetrobo-casebot.vercel.app',
    'https://sweetrobo.vercel.app',
  ];

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or Postman)
      if (!origin) return callback(null, true);

      // Log the origin for debugging
      console.log('🌐 CORS request from origin:', origin);
      console.log('✅ Allowed origins:', allowedOrigins);

      if (allowedOrigins.includes(origin) || origin.includes('localhost')) {
        console.log('✅ Origin allowed:', origin);
        callback(null, true);
      } else if (process.env.NODE_ENV !== 'production') {
        // In development, allow all origins
        console.log('✅ Development mode - allowing origin:', origin);
        callback(null, true);
      } else {
        console.log('❌ Origin blocked:', origin);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    exposedHeaders: ['Content-Type', 'Authorization'],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  // Security headers
  app.use((req, res, next) => {
    res.header('X-Content-Type-Options', 'nosniff');
    res.header('X-Frame-Options', 'DENY');
    res.header('X-XSS-Protection', '1; mode=block');
    next();
  });

  const port = process.env.PORT || 3001;
  await app.listen(port, '0.0.0.0'); // Listen on all network interfaces
  console.log(`🚀 Backend server is running on http://localhost:${port}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔒 CORS enabled for: ${allowedOrigins.join(', ')}`);
}
bootstrap();
