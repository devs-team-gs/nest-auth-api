import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { crearAdmin, crearPostDto, registrar } from './utils/factories';
import { crearApp } from './utils/crear-app';
import { limpiarBase } from './utils/limpiar-base';

const UUID_INEXISTENTE = '00000000-0000-4000-8000-000000000000';

describe('Posts (e2e)', () => {
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

  /** Crea un post por la API y devuelve su id. */
  async function crearPost(token: string, overrides = {}): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/posts')
      .set('Authorization', `Bearer ${token}`)
      .send(crearPostDto(overrides))
      .expect(201);

    return (res.body as { id: string }).id;
  }

  describe('POST /posts', () => {
    it('devuelve 401 sin token', async () => {
      await request(app.getHttpServer())
        .post('/posts')
        .send(crearPostDto())
        .expect(401);
    });

    it('crea el post y el authorId sale del token, no del body', async () => {
      const autor = await registrar(app);

      const res = await request(app.getHttpServer())
        .post('/posts')
        .set('Authorization', `Bearer ${autor.accessToken}`)
        .send(crearPostDto())
        .expect(201);

      expect(res.body.authorId).toBe(autor.id);
      expect(res.body.author).toMatchObject({
        id: autor.id,
        email: autor.dto.email,
      });
    });

    it('rechaza con 400 si intentás mandar el authorId en el body', async () => {
      const autor = await registrar(app);

      // El CreatePostDto no tiene authorId, y forbidNonWhitelisted rechaza los campos
      // de más. Si no, cualquiera podría publicar a nombre de otro.
      await request(app.getHttpServer())
        .post('/posts')
        .set('Authorization', `Bearer ${autor.accessToken}`)
        .send(crearPostDto({ authorId: UUID_INEXISTENTE }))
        .expect(400);
    });

    it('devuelve 400 si el título tiene menos de 3 caracteres', async () => {
      const autor = await registrar(app);

      await request(app.getHttpServer())
        .post('/posts')
        .set('Authorization', `Bearer ${autor.accessToken}`)
        .send(crearPostDto({ title: 'ab' }))
        .expect(400);
    });
  });

  describe('GET /posts', () => {
    it('responde sin token porque está marcado con @Public()', async () => {
      await request(app.getHttpServer()).get('/posts').expect(200);
    });

    it('incluye del autor solo id, name y email, nunca su password', async () => {
      const autor = await registrar(app);
      await crearPost(autor.accessToken);

      const res = await request(app.getHttpServer()).get('/posts').expect(200);
      const posts = res.body as { author: Record<string, unknown> }[];

      expect(Object.keys(posts[0].author).sort()).toEqual([
        'email',
        'id',
        'name',
      ]);
      expect(JSON.stringify(res.body)).not.toContain('$2b$');
    });
  });

  describe('GET /posts/:id', () => {
    it('devuelve 404 si el post no existe', async () => {
      await request(app.getHttpServer())
        .get(`/posts/${UUID_INEXISTENTE}`)
        .expect(404);
    });

    it('devuelve 400 si el id no es un UUID', async () => {
      await request(app.getHttpServer())
        .get('/posts/no-es-un-uuid')
        .expect(400);
    });
  });

  describe('PATCH /posts/:id (ownership)', () => {
    it('deja que el autor edite su propio post', async () => {
      const autor = await registrar(app);
      const postId = await crearPost(autor.accessToken);

      await request(app.getHttpServer())
        .patch(`/posts/${postId}`)
        .set('Authorization', `Bearer ${autor.accessToken}`)
        .send({ title: 'Editado por el autor' })
        .expect(200);
    });

    it('🔑 devuelve 403 si un USER intenta editar el post de otro (IDOR)', async () => {
      const autor = await registrar(app);
      const intruso = await registrar(app);
      const postId = await crearPost(autor.accessToken);

      // El rol no alcanza para decidir esto: "¿puede editar ESTE post?" depende del
      // recurso concreto. Sin el chequeo, alcanza con cambiar el id de la URL.
      await request(app.getHttpServer())
        .patch(`/posts/${postId}`)
        .set('Authorization', `Bearer ${intruso.accessToken}`)
        .send({ title: 'Hackeado' })
        .expect(403);
    });

    it('deja que un ADMIN edite el post de otro', async () => {
      const autor = await registrar(app);
      const admin = await crearAdmin(app, prisma);
      const postId = await crearPost(autor.accessToken);

      await request(app.getHttpServer())
        .patch(`/posts/${postId}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ title: 'Moderado por admin' })
        .expect(200);
    });
  });

  describe('DELETE /posts/:id (ownership)', () => {
    it('devuelve 403 si el post es de otro usuario', async () => {
      const autor = await registrar(app);
      const intruso = await registrar(app);
      const postId = await crearPost(autor.accessToken);

      await request(app.getHttpServer())
        .delete(`/posts/${postId}`)
        .set('Authorization', `Bearer ${intruso.accessToken}`)
        .expect(403);
    });

    it('deja que el autor borre su propio post', async () => {
      const autor = await registrar(app);
      const postId = await crearPost(autor.accessToken);

      await request(app.getHttpServer())
        .delete(`/posts/${postId}`)
        .set('Authorization', `Bearer ${autor.accessToken}`)
        .expect(200);

      expect(
        await prisma.post.findUnique({ where: { id: postId } }),
      ).toBeNull();
    });

    it('deja que un ADMIN borre el post de otro', async () => {
      const autor = await registrar(app);
      const admin = await crearAdmin(app, prisma);
      const postId = await crearPost(autor.accessToken);

      await request(app.getHttpServer())
        .delete(`/posts/${postId}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);
    });
  });
});
