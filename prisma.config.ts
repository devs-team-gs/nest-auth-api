// Configuración del CLI de Prisma (Prisma 7).
// En v7 las variables de entorno NO se cargan solas: por eso el `import "dotenv/config"`.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // En v7 el seed ya no se configura en package.json#prisma.seed, va acá.
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
