import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BullModule } from '@nestjs/bull';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ChituModule } from './chitu/chitu.module';
import { AiModule } from './ai/ai.module';
import { AdminModule } from './admin/admin.module';
import { MqttModule } from './mqtt/mqtt.module';
import { WebsocketModule } from './websocket/websocket.module';
import { VertexAIController } from './vertexai.controller';
import { DatabaseModule } from './database/database.module';
import { OrderMappingModule } from './order-mapping/order-mapping.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // Rate limiting configuration
    // For 100 users/day max, allow higher burst traffic
    ThrottlerModule.forRoot([{
      ttl: 60000, // 1 minute
      limit: 100, // 100 requests per minute per IP (allows ~15 simultaneous users)
    }]),
    EventEmitterModule.forRoot(),
    // Redis/Bull Queue - ENABLED for multi-instance deployment
    // Skips Redis if not configured (local dev without Redis)
    ...(process.env.REDIS_URL || process.env.REDIS_HOST
      ? [
          BullModule.forRoot({
            redis: {
              host: process.env.REDIS_HOST || 'localhost',
              port: parseInt(process.env.REDIS_PORT || '6379'),
              password: process.env.REDIS_PASSWORD || undefined,
              // Railway/Render Redis URL support
              ...(process.env.REDIS_URL && { url: process.env.REDIS_URL }),
            },
          }),
        ]
      : []),
    DatabaseModule.forRoot(),
    ChituModule,
    AiModule,
    AdminModule,
    MqttModule,
    WebsocketModule,
    OrderMappingModule,
  ],
  controllers: [AppController, VertexAIController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard, // Apply rate limiting globally
    },
  ],
})
export class AppModule {}
