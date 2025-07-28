import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrintModule } from './print/print.module';

@Module({
  imports: [PrintModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
