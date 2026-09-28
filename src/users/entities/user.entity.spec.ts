import { instanceToPlain } from 'class-transformer';
import { UserEntity } from './user.entity';

/**
 * La capa 2 contra la filtración de datos. Lo que se testea acá es exactamente lo que
 * hace el ClassSerializerInterceptor global antes de mandar el JSON.
 */
describe('UserEntity', () => {
  const filaCompleta = {
    id: 'uuid-del-usuario',
    email: 'gabriel@integrar.com',
    name: 'Gabriel',
    role: 'USER',
    password: 'hash_de_la_password',
    hashedRefreshToken: 'hash_del_refresh',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  it('borra el password del JSON serializado', () => {
    const plano = instanceToPlain(new UserEntity(filaCompleta));

    expect(plano).not.toHaveProperty('password');
  });

  it('borra el hashedRefreshToken del JSON serializado', () => {
    const plano = instanceToPlain(new UserEntity(filaCompleta));

    expect(plano).not.toHaveProperty('hashedRefreshToken');
  });

  it('conserva los campos públicos', () => {
    const plano = instanceToPlain(new UserEntity(filaCompleta));

    expect(plano).toMatchObject({
      id: 'uuid-del-usuario',
      email: 'gabriel@integrar.com',
      name: 'Gabriel',
      role: 'USER',
    });
  });

  it('no deja rastro del hash en el string serializado', () => {
    const plano = instanceToPlain(new UserEntity(filaCompleta));

    expect(JSON.stringify(plano)).not.toContain('hash_de_la_password');
  });
});
