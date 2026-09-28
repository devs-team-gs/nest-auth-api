import { Test } from '@nestjs/testing';
import { JwtPayload } from '../auth/decorators/current-user.decorator';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';

const usuario: JwtPayload = {
  sub: 'uuid-del-autor',
  email: 'autor@integrar.com',
  role: 'USER',
  iat: 0,
  exp: 0,
};

describe('PostsController', () => {
  let controller: PostsController;
  let postsService: {
    create: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };

  beforeEach(async () => {
    postsService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [PostsController],
      providers: [{ provide: PostsService, useValue: postsService }],
    }).compile();

    controller = moduleRef.get(PostsController);
  });

  it('le pasa al service el autorId que salió del token', async () => {
    await controller.create({ title: 'Un título de prueba' }, 'uuid-del-autor');

    // El segundo argumento viene de @CurrentUser('sub'), no del body.
    expect(postsService.create).toHaveBeenCalledWith(
      { title: 'Un título de prueba' },
      'uuid-del-autor',
    );
  });

  it('findAll delega en el service', async () => {
    await controller.findAll();

    expect(postsService.findAll).toHaveBeenCalled();
  });

  it('findOne delega en el service', async () => {
    await controller.findOne('uuid-del-post');

    expect(postsService.findOne).toHaveBeenCalledWith('uuid-del-post');
  });

  it('update le pasa el usuario solicitante para que el service decida el ownership', async () => {
    await controller.update('uuid-del-post', { title: 'Editado' }, usuario);

    expect(postsService.update).toHaveBeenCalledWith(
      'uuid-del-post',
      { title: 'Editado' },
      usuario,
    );
  });

  it('remove le pasa el usuario solicitante', async () => {
    await controller.remove('uuid-del-post', usuario);

    expect(postsService.remove).toHaveBeenCalledWith('uuid-del-post', usuario);
  });
});
