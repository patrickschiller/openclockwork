import { resolve } from 'node:path';
import { defineConfig } from 'prisma/config';

const baselineDirectory = process.env.PRISMA_BASE_DIR;

if (!baselineDirectory) {
  throw new Error('PRISMA_BASE_DIR must point to the pre-update checkout.');
}

export default defineConfig({
  schema: resolve(baselineDirectory, 'prisma/schema.prisma'),
  migrations: {
    path: resolve(baselineDirectory, 'prisma/migrations'),
  },
});
