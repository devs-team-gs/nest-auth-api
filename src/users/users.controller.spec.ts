import { Test } from '@nestjs/testing';
import { JwtPayload } from '../auth/decorators/current-user.decorator';
import { UserEntity } from './entities/user.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

// Los guards y los pipes (incluido el ParseUUIDPipe) NO corren en un unitario de
// controller: se prueban en test/users.e2e-spec.ts.

const usuario = {
  id: 'uuid-del-usuario',
  email: 'gabriel@integrar.com',
  name: 'Gabriel',
  role: 'USER',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const token: JwtPayload = {
  sub: 'uuid-del-usuario',
  email: 'gabriel@integrar.com',
  role: 'USER',
  iat: 0,
  exp: 0,
};

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: {
    findAll: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };

  beforeEach(async () => {
    usersService = {
      findAll: jest.fn().mockResolvedValue([usuario]),
      findOne: jest.fn().mockResolvedValue(usuario),
      update: jest.fn().mockResolvedValue(usuario),
      remove: jest.fn().mockResolvedValue(usuario),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: usersService }],
    }).compile();

    controller = moduleRef.get(UsersController);
  });

  it('devuelve los usuarios envueltos en UserEntity', async () => {
    const resultado = await controller.findAll();

    // Tiene que ser una INSTANCIA: class-transformer solo aplica @Exclude() sobre
    // instancias de la clase. Si devolviera el objeto plano de Prisma, el
    // ClassSerializerInterceptor no tendría reglas que aplicar.
    expect(resultado[0]).toBeInstanceOf(UserEntity);
  });

  it('getMe usa el sub del token y nunca un id de la URL', async () => {
    await controller.getMe('uuid-del-usuario');

    expect(usersService.findOne).toHaveBeenCalledWith('uuid-del-usuario');
  });

  it('updateMe le pasa al service el sub del token como id', async () => {
    await controller.updateMe(token, { name: 'Gabriel G.' });

    expect(usersService.update).toHaveBeenCalledWith(
      'uuid-del-usuario',
      { name: 'Gabriel G.' },
      token,
    );
  });

  it('findOne delega en el service y envuelve en UserEntity', async () => {
    const resultado = await controller.findOne('uuid-del-usuario');

    expect(usersService.findOne).toHaveBeenCalledWith('uuid-del-usuario');
    expect(resultado).toBeInstanceOf(UserEntity);
  });

  it('update le pasa al service el usuario solicitante para que decida el ownership', async () => {
    await controller.update('uuid-de-otro', { name: 'Editado' }, token);

    // El controller no decide permisos: pasa quién pide y el service resuelve.
    expect(usersService.update).toHaveBeenCalledWith(
      'uuid-de-otro',
      { name: 'Editado' },
      token,
    );
  });

  it('remove delega en el service', async () => {
    await controller.remove('uuid-del-usuario');

    expect(usersService.remove).toHaveBeenCalledWith('uuid-del-usuario');
  });
});
