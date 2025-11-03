import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { ChituService } from './chitu.service';
import { ChituController } from './chitu.controller';
import { S3Service } from '../s3/s3.service';
import { SimpleQueueService } from '../queue/simple-queue.service';
import { MqttModule } from '../mqtt/mqtt.module';

@Module({
  imports: [ConfigModule, HttpModule, MqttModule],
  providers: [ChituService, S3Service, SimpleQueueService],
  controllers: [ChituController],
  exports: [ChituService, SimpleQueueService],
})
export class ChituModule {}