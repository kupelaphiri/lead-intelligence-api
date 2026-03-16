import cookieParser from 'cookie-parser';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Local Business Lead Intelligence API')
    .setDescription(
      'API for lead retrieval, scraping orchestration, enrichment, and auth.',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .addCookieAuth(process.env.AUTH_COOKIE_NAME ?? 'li_auth')
    .addApiKey(
      {
        type: 'apiKey',
        in: 'header',
        name: 'x-api-key',
      },
      'x-api-key',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  app.get(PrismaService).enableShutdownHooks(app);
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
