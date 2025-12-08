import { Module, Global } from '@nestjs/common';
import { OrderMappingService } from './order-mapping.service';

@Global()
@Module({
  providers: [OrderMappingService],
  exports: [OrderMappingService],
})
export class OrderMappingModule {}
