import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

async function bootstrapWorker() {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  const logger = new Logger('WorkerBootstrap');
  logger.log('Worker process started and listening for BullMQ jobs');

  const shutdown = async (): Promise<void> => {
    logger.log('Shutting down worker process');
    await app.close();
    process.exit(0);
  };

  process.once('SIGINT', () => {
    void shutdown();
  });

  process.once('SIGTERM', () => {
    void shutdown();
  });
}

void bootstrapWorker();
