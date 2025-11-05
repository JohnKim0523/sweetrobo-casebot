import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { S3Module } from '../s3/s3.module';
import { ChituModule } from '../chitu/chitu.module';

@Module({
  imports: [S3Module, ChituModule],
  controllers: [AdminController],
})
export class AdminModule {}