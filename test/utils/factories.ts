import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';

export const PASSWORD_VALIDA = 'Secreta123!';

/**
 * Email único por llamada.
 *
 * ⚠️ randomUUID() y NO Date.now(): los e2e corren con --runInBand y dos llamadas
 * seguidas caen en el mismo milisegundo, así que Date.now() genera emails repetidos y
 * el registro devuelve 409 "aleatoriamente".
 */
export function crearUsuarioDto(overrides: Record<string, unknown> = {}) {
  return {
    email: `user-${randomUUID().slice(0, 8)}@integrar.com`,
    password: PASSWORD_VALIDA,
    name: 'Usuario de prueba',
    ...overrides,
  };
}

export function crearPostDto(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Un título de prueba',
    content: 'Contenido del post de prueba.',
    published: true,
    ...overrides,
  };
}

/** Lo que devuelven /auth/register y /auth/login. Tiparlo evita arrastrar `any`. */
interface RespuestaAuth {
  user: { id: string; email: string; role: string };
  access_token: string;
  refresh_token: string;
}

export interface UsuarioRegistrado {
  dto: ReturnType<typeof crearUsuarioDto>;
  id: string;
  accessToken: string;
  refreshToken: string;
}

/** Registra un usuario POR LA API (queda con rol USER) y devuelve sus tokens. */
export async function registrar(
  app: NestExpressApplication,
  overrides: Record<string, unknown> = {},
): Promise<UsuarioRegistrado> {
  const dto = crearUsuarioDto(overrides);

  const res = await request(app.getHttpServer())
    .post('/auth/register')
    .send(dto)
    .expect(201);

  const body = res.body as RespuestaAuth;

  return {
    dto,
    id: body.user.id,
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
  };
}

/**
 * Crea un ADMIN.
 *
 * 🔑 Se inserta DIRECTO con Prisma, no por POST /auth/register — y eso no es una
 * limitación del test, es la conducta correcta de la API: el CreateUserDto no tiene
 * campo `role`, así que nadie puede auto-asignarse ADMIN desde afuera (mass assignment).
 * Después se loguea por la API como cualquier hijo de vecino.
 */
export async function crearAdmin(
  app: NestExpressApplication,
  prisma: PrismaService,
): Promise<UsuarioRegistrado> {
  const dto = crearUsuarioDto({ name: 'Administradora' });

  const user = await prisma.user.create({
    data: {
      email: dto.email,
      name: dto.name,
      password: await bcrypt.hash(dto.password, 10),
      role: 'ADMIN',
    },
    select: { id: true },
  });

  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email: dto.email, password: dto.password })
    .expect(200);

  const body = res.body as RespuestaAuth;

  return {
    dto,
    id: user.id,
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
  };
}

/**
 * Firma un access token ya vencido. Permite testear el 401 por expiración sin tener
 * que esperar los 15 minutos que dura un token de verdad.
 */
export async function tokenVencido(
  app: NestExpressApplication,
  payload: { sub: string; email: string; role: string },
): Promise<string> {
  const jwt = app.get(JwtService);
  const config = app.get(ConfigService);

  return jwt.signAsync(payload, {
    secret: config.get<string>('JWT_SECRET'),
    expiresIn: '-1s',
  });
}
