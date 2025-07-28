import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class PrintService {
  async simulatePrint(base64: string, model: string): Promise<string> {
    const buffer = Buffer.from(base64.split(',')[1], 'base64');
    const filename = `${model}-${Date.now()}.png`;
    const outputPath = path.join(__dirname, '..', '..', 'print-output', filename);

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, buffer);

    console.log(`🖨️ Simulated print job written to ${outputPath}`);
    return outputPath;
  }
}
