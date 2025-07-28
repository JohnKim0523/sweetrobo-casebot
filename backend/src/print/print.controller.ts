import { Controller, Post, Body } from '@nestjs/common';
import { PrintService } from './print.service';

@Controller('print')
export class PrintController {
  constructor(private readonly printService: PrintService) {}

  @Post('send')
  async sendToPrinter(@Body() body: { imageBase64: string; phoneModel: string }) {
    const result = await this.printService.simulatePrint(body.imageBase64, body.phoneModel);
    return { status: 'queued', path: result };
  }
}
