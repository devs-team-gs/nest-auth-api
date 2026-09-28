import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { JwtPayload } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { PostsService } from './posts.service';

const AUTOR_ID = 'uuid-del-autor';
const OTRO_ID = 'uuid-de-otro';

const post = {
  id: 'uuid-del-post',
  title: 'Un título de prueba',
  content: 'Contenido',
  published: true,
  authorId: AUTOR_ID,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const autor: JwtPayload = {
  sub: AUTOR_ID,
  email: 'autor@integrar.com',
  role: 'USER',
  iat: 0,
  exp: 0,
};
const intruso: JwtPayload = {
  ...autor,
  sub: OTRO_ID,
  email: 'intruso@integrar.com',
};
const admin: JwtPayload = { ...intruso, role: 'ADMIN' };

describe('PostsService', () => {
  let service: PostsService;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();

    const moduleRef = await Test.createTestingModule({
      providers: [PostsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(PostsService);
  });

  describe('create', () => {
    it('usa el autorId que recibe y nunca uno que venga en el dto', async () => {
      prisma.post.create.mockResolvedValue(post);

      // El dto trae un authorId espurio: el service tiene que ignorarlo.
      await service.create(
        { title: 'Un título de prueba', authorId: 'uuid-inventado' } as never,
        AUTOR_ID,
      );

      const argumentos = prisma.post.create.mock.calls[0][0];
      expect(argumentos.data.authorId).toBe(AUTOR_ID);
    });

    it('incluye del autor solo los campos que es seguro mostrar', async () => {
      prisma.post.create.mockResolvedValue(post);

      await service.create({ title: 'Un título de prueba' }, AUTOR_ID);

      const argumentos = prisma.post.create.mock.calls[0][0];
      expect(argumentos.include).toEqual({
        author: { select: { id: true, name: true, email: true } },
      });
    });
  });

  describe('findAll', () => {
    it('ordena los posts por fecha de creación descendente', async () => {
      prisma.post.findMany.mockResolvedValue([post] as never);

      await service.findAll();

      const argumentos = prisma.post.findMany.mock.calls[0][0];
      expect(argumentos?.orderBy).toEqual({ createdAt: 'desc' });
    });
  });

  describe('findOne', () => {
    it('devuelve el post si existe', async () => {
      prisma.post.findUnique.mockResolvedValue(post);

      await expect(service.findOne('uuid-del-post')).resolves.toEqual(post);
    });

    it('lanza NotFoundException si el post no existe', async () => {
      prisma.post.findUnique.mockResolvedValue(null);

      await expect(service.findOne('no-existe')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('deja que el autor edite su propio post', async () => {
      prisma.post.findUnique.mockResolvedValue({ authorId: AUTOR_ID } as never);
      prisma.post.update.mockResolvedValue(post);

      await expect(
        service.update(
          'uuid-del-post',
          { title: 'Editado por el autor' },
          autor,
        ),
      ).resolves.toEqual(post);
    });

    it('deja que un ADMIN edite el post de otro', async () => {
      prisma.post.findUnique.mockResolvedValue({ authorId: AUTOR_ID } as never);
      prisma.post.update.mockResolvedValue(post);

      await expect(
        service.update('uuid-del-post', { title: 'Editado por admin' }, admin),
      ).resolves.toEqual(post);
    });

    it('lanza ForbiddenException si el post es de otro usuario (IDOR)', async () => {
      prisma.post.findUnique.mockResolvedValue({ authorId: AUTOR_ID } as never);

      // 🔑 Sin este chequeo alcanza con cambiar el id de la URL para editar el post
      // de cualquiera. Es el bug de autorización más común que existe.
      await expect(
        service.update('uuid-del-post', { title: 'Hackeado' }, intruso),
      ).rejects.toThrow(ForbiddenException);
    });

    it('no llama a prisma.post.update cuando rechaza por ownership', async () => {
      prisma.post.findUnique.mockResolvedValue({ authorId: AUTOR_ID } as never);

      await expect(
        service.update('uuid-del-post', { title: 'Hackeado' }, intruso),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.post.update).not.toHaveBeenCalled();
    });

    it('lanza NotFoundException si el post no existe', async () => {
      prisma.post.findUnique.mockResolvedValue(null);

      await expect(
        service.update('no-existe', { title: 'Editado' }, autor),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deja que el autor borre su propio post', async () => {
      prisma.post.findUnique.mockResolvedValue({ authorId: AUTOR_ID } as never);
      prisma.post.delete.mockResolvedValue(post);

      await expect(service.remove('uuid-del-post', autor)).resolves.toEqual(
        post,
      );
    });

    it('lanza ForbiddenException si el post es de otro usuario', async () => {
      prisma.post.findUnique.mockResolvedValue({ authorId: AUTOR_ID } as never);

      await expect(service.remove('uuid-del-post', intruso)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.post.delete).not.toHaveBeenCalled();
    });
  });
});
