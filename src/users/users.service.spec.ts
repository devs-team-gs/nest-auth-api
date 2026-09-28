import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { JwtPayload } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

// Reemplaza el módulo entero de bcrypt por mocks. En un unitario no queremos hashear de
// verdad: son ~100ms por llamada y encima el resultado es distinto cada vez (el salt es
// aleatorio), así que no podríamos assertar sobre él.
jest.mock('bcrypt');

const bcryptMock = jest.mocked(bcrypt);

/** El usuario tal como lo devuelve Prisma con SELECT_PUBLICO: sin password. */
const usuarioGuardado = {
  id: 'uuid-del-usuario',
  email: 'gabriel@integrar.com',
  name: 'Gabriel',
  role: 'USER',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const dto = {
  email: 'gabriel@integrar.com',
  password: 'Secreta123!',
  name: 'Gabriel',
};

describe('UsersService', () => {
  let service: UsersService;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();

    const moduleRef = await Test.createTestingModule({
      // El objeto bajo prueba es REAL. Lo único falso son sus dependencias.
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(UsersService);
    bcryptMock.hash.mockResolvedValue('hash_falso' as never);
  });

  it('está definido', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('hashea la contraseña con 10 rondas y nunca guarda el texto plano', async () => {
      // 1️⃣ Arrange
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(usuarioGuardado as never);

      // 2️⃣ Act
      await service.create(dto);

      // 3️⃣ Assert
      expect(bcryptMock.hash).toHaveBeenCalledWith('Secreta123!', 10);

      // El assert que de verdad importa: qué le pasamos a la base.
      const argumentos = prisma.user.create.mock.calls[0][0];
      expect(argumentos.data.password).toBe('hash_falso');
      expect(argumentos.data.password).not.toBe('Secreta123!');
    });

    it('pide a la base solo los campos públicos al crear', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(usuarioGuardado as never);

      await service.create(dto);

      const argumentos = prisma.user.create.mock.calls[0][0];
      expect(argumentos.select).toEqual({
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      });
    });

    it('lanza ConflictException si el email ya está registrado', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'otro-uuid' } as never);

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });

    it('no llama a prisma.user.create cuando el email ya está registrado', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'otro-uuid' } as never);

      await expect(service.create(dto)).rejects.toThrow(ConflictException);

      // Sin este assert, el test anterior pasaría igual aunque el service creara el
      // usuario y DESPUÉS tirara la excepción.
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('devuelve el usuario sin el password ni el hashedRefreshToken', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(usuarioGuardado as never);

      const resultado = await service.create(dto);

      expect(resultado).toEqual(usuarioGuardado);
      expect(resultado).not.toHaveProperty('password');
      expect(resultado).not.toHaveProperty('hashedRefreshToken');
    });
  });

  describe('findAll', () => {
    it('ordena los usuarios por fecha de creación ascendente', async () => {
      prisma.user.findMany.mockResolvedValue([usuarioGuardado] as never);

      await service.findAll();

      const argumentos = prisma.user.findMany.mock.calls[0][0];
      expect(argumentos?.orderBy).toEqual({ createdAt: 'asc' });
    });
  });

  describe('findOne', () => {
    it('devuelve el usuario si existe', async () => {
      prisma.user.findUnique.mockResolvedValue(usuarioGuardado as never);

      await expect(service.findOne('uuid-del-usuario')).resolves.toEqual(
        usuarioGuardado,
      );
    });

    it('lanza NotFoundException si el usuario no existe', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.findOne('no-existe')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findByEmailWithPassword', () => {
    it('consulta sin select para traer el password, que es su única razón de ser', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...usuarioGuardado,
        password: 'hash_falso',
      } as never);

      const resultado = await service.findByEmailWithPassword(
        'gabriel@integrar.com',
      );

      // Si alguien le agrega un `select`, el login deja de funcionar: este assert avisa.
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'gabriel@integrar.com' },
      });
      expect(resultado).toHaveProperty('password');
    });
  });

  describe('findByIdWithRefreshToken', () => {
    it('trae el hashedRefreshToken además de los campos públicos', async () => {
      prisma.user.findUnique.mockResolvedValue(usuarioGuardado as never);

      await service.findByIdWithRefreshToken('uuid-del-usuario');

      const argumentos = prisma.user.findUnique.mock.calls[0][0];
      expect(argumentos.select).toMatchObject({
        hashedRefreshToken: true,
        id: true,
      });
    });
  });

  describe('updateRefreshToken', () => {
    it('guarda el hash del refresh token', async () => {
      prisma.user.update.mockResolvedValue({ id: 'uuid-del-usuario' } as never);

      await service.updateRefreshToken('uuid-del-usuario', 'hash_del_refresh');

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'uuid-del-usuario' },
          data: { hashedRefreshToken: 'hash_del_refresh' },
        }),
      );
    });

    it('acepta null para matar la sesión en el logout y en la detección de reuso', async () => {
      prisma.user.update.mockResolvedValue({ id: 'uuid-del-usuario' } as never);

      await service.updateRefreshToken('uuid-del-usuario', null);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { hashedRefreshToken: null } }),
      );
    });
  });

  describe('update', () => {
    const dueño: JwtPayload = {
      sub: 'uuid-del-usuario',
      email: 'gabriel@integrar.com',
      role: 'USER',
      iat: 0,
      exp: 0,
    };
    const admin: JwtPayload = {
      ...dueño,
      sub: 'uuid-del-admin',
      role: 'ADMIN',
    };
    const intruso: JwtPayload = {
      ...dueño,
      sub: 'uuid-del-intruso',
      role: 'USER',
    };

    it('deja que el dueño edite su propio perfil', async () => {
      prisma.user.findUnique.mockResolvedValue(usuarioGuardado as never);
      prisma.user.update.mockResolvedValue(usuarioGuardado as never);

      await expect(
        service.update('uuid-del-usuario', { name: 'Gabriel G.' }, dueño),
      ).resolves.toEqual(usuarioGuardado);
    });

    it('deja que un ADMIN edite el perfil de otro', async () => {
      prisma.user.findUnique.mockResolvedValue(usuarioGuardado as never);
      prisma.user.update.mockResolvedValue(usuarioGuardado as never);

      await expect(
        service.update(
          'uuid-del-usuario',
          { name: 'Editado por admin' },
          admin,
        ),
      ).resolves.toEqual(usuarioGuardado);
    });

    it('lanza ForbiddenException si no sos el dueño ni ADMIN', async () => {
      await expect(
        service.update('uuid-del-usuario', { name: 'Hackeado' }, intruso),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rechaza por permisos antes de tocar la base', async () => {
      await expect(
        service.update('uuid-del-usuario', { name: 'Hackeado' }, intruso),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('lanza NotFoundException si el usuario no existe', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.update('uuid-del-usuario', { name: 'Gabriel G.' }, dueño),
      ).rejects.toThrow(NotFoundException);
    });

    it('lanza ConflictException si el email nuevo ya lo usa otro usuario', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(usuarioGuardado as never) // el findOne interno
        .mockResolvedValueOnce({ id: 'uuid-de-otro' } as never); // el chequeo de email

      await expect(
        service.update(
          'uuid-del-usuario',
          { email: 'ocupado@integrar.com' },
          dueño,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('permite reenviar el mismo email que ya tenías', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(usuarioGuardado as never)
        .mockResolvedValueOnce({ id: 'uuid-del-usuario' } as never);
      prisma.user.update.mockResolvedValue(usuarioGuardado as never);

      await expect(
        service.update(
          'uuid-del-usuario',
          { email: 'gabriel@integrar.com' },
          dueño,
        ),
      ).resolves.toEqual(usuarioGuardado);
    });
  });

  describe('remove', () => {
    it('lanza NotFoundException antes de borrar si el usuario no existe', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.remove('no-existe')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it('devuelve el usuario borrado sin el password', async () => {
      prisma.user.findUnique.mockResolvedValue(usuarioGuardado as never);
      prisma.user.delete.mockResolvedValue(usuarioGuardado as never);

      const resultado = await service.remove('uuid-del-usuario');

      expect(resultado).not.toHaveProperty('password');
    });
  });
});
