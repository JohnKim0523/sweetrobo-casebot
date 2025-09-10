import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { S3Module } from '../s3/s3.module';

@Module({
  imports: [S3Module],
  controllers: [AiController],
})
export class AiModule {}