import { Module, DynamicModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Order } from './entities/order.entity';
import { Session } from './entities/session.entity';

@Module({})
export class DatabaseModule {
  static forRoot(): DynamicModule {
    const configService = new ConfigService();
    const databaseUrl = configService.get('DATABASE_URL');
    const databaseHost = configService.get('DATABASE_HOST');

    // Skip database if not configured (local development without PostgreSQL)
    if (!databaseUrl && !databaseHost) {
      console.log('⚠️  Database not configured - running in memory mode (dev only)');
      return {
        module: DatabaseModule,
        imports: [],
        exports: [],
      };
    }

    // Database is configured - connect normally
    return {
      module: DatabaseModule,
      imports: [
        TypeOrmModule.forRootAsync({
          imports: [ConfigModule],
          useFactory: (configService: ConfigService) => {
            const databaseUrl = configService.get('DATABASE_URL');

            if (databaseUrl) {
              // Railway/Render style: postgresql://user:pass@host:port/db
              console.log('🗄️  Connecting to PostgreSQL (DATABASE_URL)');
              return {
                type: 'postgres',
                url: databaseUrl,
                entities: [Order, Session],
                synchronize: true, // Auto-create tables (disable in production!)
                ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
              };
            }

            // Local development style: individual variables
            console.log('🗄️  Connecting to PostgreSQL (local)');
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
    };
  }
}
