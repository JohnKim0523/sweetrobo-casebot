import { Module } from '@nestjs/common';
import { ChituService } from './chitu.service';
import { ChituController } from './chitu.controller';
import { S3Service } from '../s3/s3.service';
import { SimpleQueueService } from '../queue/simple-queue.service';

@Module({
  providers: [ChituService, S3Service, SimpleQueueService],
  controllers: [ChituController],
  exports: [ChituService, SimpleQueueService],
})
export class ChituModule {}