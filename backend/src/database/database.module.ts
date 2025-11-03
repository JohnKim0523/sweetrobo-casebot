import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Order } from './entities/order.entity';
import { Session } from './entities/session.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        // Use DATABASE_URL from Railway/Render, or construct from individual vars
        const databaseUrl = configService.get('DATABASE_URL');

        if (databaseUrl) {
          // Railway/Render style: postgresql://user:pass@host:port/db
          return {
            type: 'postgres',
            url: databaseUrl,
            entities: [Order, Session],
            synchronize: true, // Auto-create tables (disable in production!)
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
          };
        }

        // Local development style: individual variables
        return {
          type: 'postgres',
          host: configService.get('DATABASE_HOST', 'localhost'),
          port: configService.get<number>('DATABASE_PORT', 5432),
          username: configService.get('DATABASE_USER', 'postgres'),
          password: configService.get('DATABASE_PASSWORD', 'postgres'),
          database: configService.get('DATABASE_NAME', 'sweetrobo'),
          entities: [Order, Session],
          synchronize: true, // Auto-create tables
          ssl: false,
        };
      },
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([Order, Session]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
