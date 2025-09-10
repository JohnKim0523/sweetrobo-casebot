import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { QueueService } from './queue.service';
import { PrintProcessor } from './print.processor';
import { ChituModule } from '../chitu/chitu.module';
import { S3Module } from '../s3/s3.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'print-jobs',
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: false,
        removeOnFail: false,
      },
    }),
    ChituModule,
    S3Module,
  ],
  providers: [QueueService, PrintProcessor],
  exports: [QueueService],
})
export class QueueModule {}