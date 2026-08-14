/**
 * Seed de datos de prueba.
 *
 * Se corre con `pnpm prisma:seed` (que por debajo es `prisma db seed`, y el comando
 * real está declarado en prisma.config.ts → migrations.seed).
 *
 * Ojo: este script NO pasa por NestJS, así que instancia su propio PrismaClient
 * con el driver adapter y carga el .env a mano con dotenv.
 */
import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

if (!process.env.DATABASE_URL) {
  throw new Error('Falta DATABASE_URL en el .env');
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const SALT_ROUNDS = 10;

async function main() {
  console.log('🌱 Sembrando la base...');

  // Las tres contraseñas cumplen las reglas del CreateUserDto:
  // 8+ caracteres, con mayúscula, minúscula y número.
  const [adminPassword, anaPassword, brunoPassword] = await Promise.all([
    bcrypt.hash('Admin1234', SALT_ROUNDS),
    bcrypt.hash('Usuario123', SALT_ROUNDS),
    bcrypt.hash('Usuario123', SALT_ROUNDS),
  ]);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@integrar.com' },
    update: {},
    create: {
      email: 'admin@integrar.com',
      name: 'Admin',
      password: adminPassword,
      role: 'ADMIN',
    },
  });

  const ana = await prisma.user.upsert({
    where: { email: 'ana@integrar.com' },
    update: {},
    create: {
      email: 'ana@integrar.com',
      name: 'Ana',
      password: anaPassword,
      role: 'USER',
    },
  });

  const bruno = await prisma.user.upsert({
    where: { email: 'bruno@integrar.com' },
    update: {},
    create: {
      email: 'bruno@integrar.com',
      name: 'Bruno',
      password: brunoPassword,
      role: 'USER',
    },
  });

  // Un post por usuario común: sirven para probar ownership
  // (Ana no debería poder editar el post de Bruno, el admin sí).
  await prisma.post.deleteMany({ where: { authorId: { in: [ana.id, bruno.id] } } });
  await prisma.post.createMany({
    data: [
      {
        title: 'El primer post de Ana',
        content: 'Contenido de prueba para demostrar ownership.',
        published: true,
        authorId: ana.id,
      },
      {
        title: 'Borrador de Bruno',
        content: 'Este todavía no está publicado.',
        published: false,
        authorId: bruno.id,
      },
    ],
  });

  console.log('✅ Listo:');
  console.table([
    { email: admin.email, password: 'Admin1234', role: admin.role },
    { email: ana.email, password: 'Usuario123', role: ana.role },
    { email: bruno.email, password: 'Usuario123', role: bruno.role },
  ]);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Error en el seed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
