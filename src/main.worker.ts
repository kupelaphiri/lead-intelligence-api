import * as http from 'http';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

async function bootstrapWorker() {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  const logger = new Logger('WorkerBootstrap');

  const port = Number(process.env.PORT ?? 8080);
  const healthServer = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('worker-ok');
  });
  healthServer.listen(port, () => {
    logger.log(`Worker health server listening on :${port}`);
  });

  logger.log('Worker process started and listening for BullMQ jobs');

  const shutdown = async (): Promise<void> => {
    logger.log('Shutting down worker process');
    healthServer.close();
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
