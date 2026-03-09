import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';
import { AuthModule } from './modules/auth/auth.module';
import { EnrichmentModule } from './modules/enrichment/enrichment.module';
import { LeadsModule } from './modules/leads/leads.module';
import { ScraperModule } from './modules/scraper/scraper.module';
import { UsersModule } from './modules/users/users.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';

@Module({
  imports: [
    PrismaModule,
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST ?? '127.0.0.1',
        port: Number.parseInt(process.env.REDIS_PORT ?? '6379', 10),
        username: process.env.REDIS_USERNAME || undefined,
        password: process.env.REDIS_PASSWORD || undefined,
        db: Number.parseInt(process.env.REDIS_DB ?? '0', 10),
        ...(process.env.REDIS_TLS === 'true' ? { tls: {} } : {}),
      },
    }),
    QueueModule,
    ApiKeysModule,
    UsersModule,
    AuthModule,
    LeadsModule,
    ScraperModule,
    EnrichmentModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
