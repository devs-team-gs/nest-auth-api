import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { crearAdmin, registrar } from './utils/factories';
import { crearApp } from './utils/crear-app';
import { limpiarBase } from './utils/limpiar-base';

const UUID_INEXISTENTE = '00000000-0000-4000-8000-000000000000';

describe('Users (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await crearApp());
  });

  beforeEach(async () => {
    await limpiarBase(prisma);
  });

  afterAll(async () => {
    await limpiarBase(prisma);
    await app.close();
  });

  describe('GET /users (solo ADMIN)', () => {
    it('devuelve 401 sin token', async () => {
      await request(app.getHttpServer()).get('/users').expect(401);
    });

    it('devuelve 403 (NO 401) si el usuario no es ADMIN', async () => {
      const { accessToken } = await registrar(app);

      // ⭐ La diferencia entre 401 y 403 es la diferencia entre "no sé quién sos" y
      // "sé quién sos y no podés". Si acá saliera 401, significaría que los guards
      // quedaron en el orden equivocado en app.module.ts.
      await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    });

    it('devuelve 200 si el usuario es ADMIN', async () => {
      const admin = await crearAdmin(app, prisma);

      await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);
    });

    it('ningún usuario de la lista trae password ni hashedRefreshToken', async () => {
      const admin = await crearAdmin(app, prisma);
      await registrar(app);

      const res = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);

      expect(res.body.length).toBeGreaterThan(1);
      for (const user of res.body) {
        expect(user).not.toHaveProperty('password');
        expect(user).not.toHaveProperty('hashedRefreshToken');
      }
    });
  });

  describe('GET /users/me', () => {
    it('devuelve el usuario del token', async () => {
      const { accessToken, dto, id } = await registrar(app);

      const res = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toMatchObject({ id, email: dto.email });
    });

    it('no confunde /users/me con /users/:id', async () => {
      // /me está declarado ANTES que /:id en el controller a propósito: si estuviera
      // después, el ParseUUIDPipe se comería el string "me" y devolvería 400.
      const { accessToken } = await registrar(app);

      await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });
  });

  describe('PATCH /users/me', () => {
    it('actualiza el nombre del usuario del token', async () => {
      const { accessToken } = await registrar(app);

      const res = await request(app.getHttpServer())
        .patch('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Nombre nuevo' })
        .expect(200);

      expect(res.body.name).toBe('Nombre nuevo');
    });

    it('devuelve 400 si mandás el campo password', async () => {
      // UpdateUserDto es PartialType(OmitType(CreateUserDto, ['password'])): la
      // contraseña se cambia por un endpoint aparte, no por un PATCH genérico.
      const { accessToken } = await registrar(app);

      await request(app.getHttpServer())
        .patch('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ password: 'OtraCosa123!' })
        .expect(400);
    });

    it('devuelve 409 si el email nuevo ya lo usa otro usuario', async () => {
      const otro = await registrar(app);
      const { accessToken } = await registrar(app);

      await request(app.getHttpServer())
        .patch('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ email: otro.dto.email })
        .expect(409);
    });
  });

  describe('GET /users/:id', () => {
    it('devuelve 400 si el id no es un UUID', async () => {
      const { accessToken } = await registrar(app);

      // Lo rechaza el ParseUUIDPipe antes de llegar al service.
      await request(app.getHttpServer())
        .get('/users/no-es-un-uuid')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });

    it('devuelve 404 si el UUID no existe', async () => {
      const { accessToken } = await registrar(app);

      await request(app.getHttpServer())
        .get(`/users/${UUID_INEXISTENTE}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('PATCH /users/:id (ownership)', () => {
    it('deja que el dueño edite su propio perfil', async () => {
      const { accessToken, id } = await registrar(app);

      await request(app.getHttpServer())
        .patch(`/users/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Editado por el dueño' })
        .expect(200);
    });

    it('devuelve 403 si un USER intenta editar el perfil de otro', async () => {
      const victima = await registrar(app);
      const intruso = await registrar(app);

      await request(app.getHttpServer())
        .patch(`/users/${victima.id}`)
        .set('Authorization', `Bearer ${intruso.accessToken}`)
        .send({ name: 'Hackeado' })
        .expect(403);
    });

    it('deja que un ADMIN edite el perfil de otro', async () => {
      const usuario = await registrar(app);
      const admin = await crearAdmin(app, prisma);

      await request(app.getHttpServer())
        .patch(`/users/${usuario.id}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ name: 'Editado por admin' })
        .expect(200);
    });
  });

  describe('DELETE /users/:id (solo ADMIN)', () => {
    it('devuelve 403 si no sos ADMIN, incluso sobre tu propio usuario', async () => {
      const { accessToken, id } = await registrar(app);

      await request(app.getHttpServer())
        .delete(`/users/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    });

    it('borra el usuario si sos ADMIN', async () => {
      const usuario = await registrar(app);
      const admin = await crearAdmin(app, prisma);

      await request(app.getHttpServer())
        .delete(`/users/${usuario.id}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);

      const enDb = await prisma.user.findUnique({ where: { id: usuario.id } });
      expect(enDb).toBeNull();
    });

    it('borra en cascada los posts del usuario', async () => {
      const usuario = await registrar(app);
      const admin = await crearAdmin(app, prisma);

      await request(app.getHttpServer())
        .post('/posts')
        .set('Authorization', `Bearer ${usuario.accessToken}`)
        .send({ title: 'Post que se va a ir con su autor' })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/users/${usuario.id}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);

      // Lo garantiza el onDelete: Cascade del schema. Sin él, el DELETE fallaría con
      // un error de foreign key.
      const posts = await prisma.post.findMany({
        where: { authorId: usuario.id },
      });
      expect(posts).toHaveLength(0);
    });
  });

  describe('ningún endpoint filtra datos sensibles', () => {
    it('no aparece el password en ninguna respuesta de /users', async () => {
      const usuario = await registrar(app);
      const admin = await crearAdmin(app, prisma);
      const auth = { Authorization: `Bearer ${admin.accessToken}` };

      const respuestas = await Promise.all([
        request(app.getHttpServer()).get('/users').set(auth),
        request(app.getHttpServer()).get('/users/me').set(auth),
        request(app.getHttpServer()).get(`/users/${usuario.id}`).set(auth),
        request(app.getHttpServer())
          .patch(`/users/${usuario.id}`)
          .set(auth)
          .send({ name: 'Editado' }),
      ]);

      for (const res of respuestas) {
        const cuerpo = JSON.stringify(res.body);
        expect(cuerpo).not.toContain('"password"');
        expect(cuerpo).not.toContain('"hashedRefreshToken"');
        expect(cuerpo).not.toContain('$2b$'); // el prefijo de cualquier hash de bcrypt
      }
    });
  });
});
