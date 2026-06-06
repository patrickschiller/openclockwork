/**
 * Headless bootstrap that turns the live AppModule into an OpenAPI 3.0
 * document and writes it to apps/api/openapi.json.
 *
 * Run via `pnpm generate:api`. PrismaService connects, so a reachable test
 * database is required (the e2e test DB is fine — same Postgres container).
 */
import 'reflect-metadata';
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app/app.module';

async function main() {
  // Provide harmless defaults if the caller forgot to set them; the script
  // never actually serves traffic.
  process.env.JWT_SECRET ??= 'codegen-dummy-secret';
  process.env.ERP_API_KEY ??= 'codegen-dummy-erp';
  process.env.API_CORS_ORIGINS ??= 'http://localhost:4200';
  process.env.DATABASE_URL ??=
    'postgresql://openclockwork:openclockwork@localhost:5433/openclockwork_test?schema=public';

  // eslint-disable-next-line no-console
  console.log('Bootstrapping NestJS for OpenAPI generation…');
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  app.setGlobalPrefix('api');

  const config = new DocumentBuilder()
    .setTitle('OpenClockwork API')
    .setDescription('Self-hostable working-time tracker — REST + WebSocket surface.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);

  const out = resolve(__dirname, '..', 'openapi.json');
  writeFileSync(out, JSON.stringify(document, null, 2) + '\n');
  // eslint-disable-next-line no-console
  console.log(`Wrote ${out}`);

  await app.close();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
