import { NestExpressApplication } from '@nestjs/platform-express';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { crearApp } from './utils/crear-app';
import { limpiarBase } from './utils/limpiar-base';
import {
  PASSWORD_VALIDA,
  crearUsuarioDto,
  registrar,
  tokenVencido,
} from './utils/factories';

// 📌 Nota: en los e2e bcrypt NO se mockea. Acá se usa de verdad, que es justamente lo
// que queremos verificar: que lo guardado en la base es un hash real.
//
// 📌 Nota 2: docs/clase-39.md usa `import * as request from 'supertest'`. Este proyecto
// compila con esModuleInterop: true, donde ese import da un namespace NO invocable
// (TS2349). La forma correcta acá es el default import.

describe('Auth (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  // Lo caro va en beforeAll: levantar la app entera por cada test es tirar segundos.
  beforeAll(async () => {
    ({ app, prisma } = await crearApp());
  });

  // Lo sucio va en beforeEach: cada test arranca con la base vacía.
  beforeEach(async () => {
    await limpiarBase(prisma);
  });

  afterAll(async () => {
    await limpiarBase(prisma);
    // Sin app.close() Jest se queda colgado con el pool de Postgres abierto.
    // La solución NO es --forceExit: es cerrar bien.
    await app.close();
  });

  describe('POST /auth/register', () => {
    it('crea el usuario y devuelve 201 con el par de tokens', async () => {
      const dto = crearUsuarioDto();

      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send(dto)
        .expect(201);

      expect(res.body.user.email).toBe(dto.email);
      expect(res.body.access_token).toEqual(expect.any(String));
      expect(res.body.refresh_token).toEqual(expect.any(String));
    });

    it('NUNCA devuelve el password ni el hashedRefreshToken', async () => {
      const dto = crearUsuarioDto();

      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send(dto)
        .expect(201);

      expect(res.body.user).not.toHaveProperty('password');
      expect(res.body.user).not.toHaveProperty('hashedRefreshToken');
      // El assert bruto: que el texto plano no aparezca en NINGÚN lado del JSON.
      expect(JSON.stringify(res.body)).not.toContain(dto.password);
    });

    it('guarda el password hasheado con bcrypt, nunca en texto plano', async () => {
      const dto = crearUsuarioDto();
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(dto)
        .expect(201);

      const enDb = await prisma.user.findUnique({
        where: { email: dto.email },
      });

      expect(enDb!.password).not.toBe(dto.password);
      expect(enDb!.password).toMatch(/^\$2[aby]\$/); // el patrón de bcrypt
      await expect(bcrypt.compare(dto.password, enDb!.password)).resolves.toBe(
        true,
      );
    });

    it('guarda el hash del refresh token al registrarse', async () => {
      const dto = crearUsuarioDto();
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send(dto)
        .expect(201);

      const enDb = await prisma.user.findUnique({
        where: { email: dto.email },
      });

      expect(enDb!.hashedRefreshToken).toEqual(expect.any(String));
      // Guardado hasheado, no crudo: si te filtran la base, el token no sirve.
      expect(enDb!.hashedRefreshToken).not.toBe(res.body.refresh_token);
    });

    it('devuelve 409 si el email ya está registrado', async () => {
      const dto = crearUsuarioDto();
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(dto)
        .expect(201);

      await request(app.getHttpServer())
        .post('/auth/register')
        .send(dto)
        .expect(409);
    });
  });

  describe('POST /auth/register — validación (ValidationPipe global)', () => {
    it('devuelve 400 si el email no tiene formato válido', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send(crearUsuarioDto({ email: 'no-es-un-email' }))
        .expect(400);

      // El mensaje viene en español y es un ARRAY: lo arma el ValidationPipe y el
      // AllExceptionsFilter lo pasa tal cual.
      expect(res.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining('email')]),
      );
    });

    it('el body de error tiene la forma del AllExceptionsFilter', async () => {
      // Si alguien saca configureApp() de crear-app.ts, este test es el que avisa:
      // sin el filtro, Nest devuelve {statusCode, message, error} y no hay path ni timestamp.
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'no-es-un-email' })
        .expect(400);

      expect(res.body).toMatchObject({
        statusCode: 400,
        path: '/auth/register',
        timestamp: expect.any(String),
      });
    });

    it('devuelve 400 si faltan los campos obligatorios', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({})
        .expect(400);
    });

    it('devuelve 400 si la contraseña no tiene mayúscula, minúscula y número', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send(crearUsuarioDto({ password: 'todominuscula' }))
        .expect(400);

      expect(res.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining('mayúscula')]),
      );
    });

    it('🛡️ NO permite auto-asignarse el rol ADMIN (mass assignment)', async () => {
      const dto = crearUsuarioDto();

      // forbidNonWhitelisted rechaza cualquier campo que no esté en el DTO.
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ ...dto, role: 'ADMIN' })
        .expect(400);

      expect(res.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining('role')]),
      );

      // Y el otro lado de la moneda: un registro NORMAL nace siempre con rol USER.
      // No alcanza con verificar el 400: hay que confirmar en la base que la única
      // puerta de entrada no puede producir un ADMIN.
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(dto)
        .expect(201);
      const enDb = await prisma.user.findUnique({
        where: { email: dto.email },
      });
      expect(enDb!.role).toBe('USER');
    });
  });

  describe('POST /auth/login', () => {
    it('devuelve 200 (NO 201) con credenciales correctas', async () => {
      const { dto } = await registrar(app);

      // Un POST devuelve 201 por defecto. El 200 viene del @HttpCode del controller, y
      // eso SOLO se puede verificar acá: en un unitario el método no sabe qué status lo
      // envuelve.
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: dto.email, password: dto.password })
        .expect(200);
    });

    it('devuelve un access_token con tres partes separadas por punto', async () => {
      const { dto } = await registrar(app);

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: dto.email, password: dto.password })
        .expect(200);

      expect(res.body.access_token.split('.')).toHaveLength(3);
    });

    it('devuelve 401 con la contraseña incorrecta', async () => {
      const { dto } = await registrar(app);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: dto.email, password: 'OtraCosa123!' })
        .expect(401);
    });

    it('devuelve 401 con un email que no existe', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'nadie@integrar.com', password: PASSWORD_VALIDA })
        .expect(401);
    });

    it('devuelve EL MISMO mensaje en los dos casos de error (user enumeration)', async () => {
      const { dto } = await registrar(app);

      const passwordMala = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: dto.email, password: 'OtraCosa123!' })
        .expect(401);

      const sinUsuario = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'nadie@integrar.com', password: PASSWORD_VALIDA })
        .expect(401);

      expect(passwordMala.body.message).toBe(sinUsuario.body.message);
    });

    it('rota el refresh token: el hash guardado cambia después de loguearse', async () => {
      const { dto } = await registrar(app);
      const antes = await prisma.user.findUnique({
        where: { email: dto.email },
      });

      await new Promise((r) => setTimeout(r, 1100)); // ver el comentario de POST /auth/refresh
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: dto.email, password: dto.password })
        .expect(200);

      const despues = await prisma.user.findUnique({
        where: { email: dto.email },
      });
      expect(despues!.hashedRefreshToken).not.toBe(antes!.hashedRefreshToken);
    });
  });

  describe('GET /users/me (la ruta protegida)', () => {
    // 📌 docs/clase-39.md prueba esto contra GET /auth/me, pero esta API no tiene ese
    // endpoint: el equivalente real es GET /users/me. Probamos lo que existe.

    it('devuelve 401 sin token', async () => {
      await request(app.getHttpServer()).get('/users/me').expect(401);
    });

    it('devuelve 401 con un token inventado', async () => {
      await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', 'Bearer esto.no.es-un-token')
        .expect(401);
    });

    it('devuelve 401 si el esquema no es Bearer', async () => {
      const { accessToken } = await registrar(app);

      // El token es válido; lo que está mal es el esquema.
      await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Basic ${accessToken}`)
        .expect(401);
    });

    it('devuelve 401 con un token vencido', async () => {
      const { id, dto } = await registrar(app);
      const vencido = await tokenVencido(app, {
        sub: id,
        email: dto.email,
        role: 'USER',
      });

      await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${vencido}`)
        .expect(401);
    });

    it('devuelve 200 y el usuario correcto con un token válido', async () => {
      const { accessToken, dto } = await registrar(app);

      const res = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.email).toBe(dto.email);
      expect(res.body).not.toHaveProperty('password');
      expect(res.body).not.toHaveProperty('hashedRefreshToken');
    });
  });

  describe('POST /auth/refresh', () => {
    it('devuelve 401 sin refresh token', async () => {
      await request(app.getHttpServer()).post('/auth/refresh').expect(401);
    });

    it('devuelve 401 si mandás el ACCESS token en vez del refresh', async () => {
      const { accessToken } = await registrar(app);

      // Está firmado con JWT_SECRET, no con JWT_REFRESH_SECRET. Este test es el que
      // justifica que existan dos secrets distintos.
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);
    });

    it('devuelve 200 y un par de tokens nuevo', async () => {
      const { refreshToken } = await registrar(app);

      // ⏱️ La espera NO es un parche de test lento: es obligatoria por un bug real de
      // la API. El payload firmado es {sub, email, role} + iat/exp, y iat/exp tienen
      // resolución de SEGUNDOS. Dos tokens del mismo usuario emitidos dentro del mismo
      // segundo salen byte a byte idénticos, así que la "rotación" no rota nada.
      // Se arregla agregando un jti aleatorio al payload del refresh.
      await new Promise((r) => setTimeout(r, 1100));

      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Authorization', `Bearer ${refreshToken}`)
        .expect(200);

      expect(res.body.access_token).toEqual(expect.any(String));
      expect(res.body.refresh_token).not.toBe(refreshToken);
    });

    it('🚨 devuelve 403 al reusar un refresh token ya rotado', async () => {
      const { refreshToken } = await registrar(app);
      await new Promise((r) => setTimeout(r, 1100));

      // Primer uso: OK, y rota.
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Authorization', `Bearer ${refreshToken}`)
        .expect(200);

      // Segundo uso del MISMO token: el JWT sigue firmado y sin vencer, pero ya no es
      // el último que emitimos. O te lo robaron, o es una copia vieja.
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Authorization', `Bearer ${refreshToken}`)
        .expect(403);
    });

    it('🚨 después de detectar el reuso, mata la sesión entera', async () => {
      const { id, refreshToken } = await registrar(app);
      await new Promise((r) => setTimeout(r, 1100));

      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Authorization', `Bearer ${refreshToken}`)
        .expect(200);
      const tokenNuevo = res.body.refresh_token;

      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Authorization', `Bearer ${refreshToken}`)
        .expect(403);

      // El hashedRefreshToken queda en null: ni el ladrón ni el usuario legítimo pueden
      // seguir refrescando. El usuario puede volver a loguearse; el ladrón no, porque
      // no tiene la contraseña.
      const enDb = await prisma.user.findUnique({ where: { id } });
      expect(enDb!.hashedRefreshToken).toBeNull();

      // Y ni siquiera el token NUEVO sirve ya.
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Authorization', `Bearer ${tokenNuevo}`)
        .expect(403);
    });
  });

  describe('POST /auth/logout', () => {
    it('devuelve 204 sin cuerpo', async () => {
      const { accessToken } = await registrar(app);

      const res = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      expect(res.body).toEqual({});
    });

    it('devuelve 401 sin token', async () => {
      await request(app.getHttpServer()).post('/auth/logout').expect(401);
    });

    it('deja el hashedRefreshToken en null y el refresh posterior falla', async () => {
      const { id, accessToken, refreshToken } = await registrar(app);

      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      const enDb = await prisma.user.findUnique({ where: { id } });
      expect(enDb!.hashedRefreshToken).toBeNull();

      // Este es el "logout de verdad" que el JWT stateless por sí solo no puede dar.
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Authorization', `Bearer ${refreshToken}`)
        .expect(403);
    });
  });
});
