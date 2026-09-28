import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { instanceToPlain } from 'class-transformer';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

jest.mock('bcrypt');

const bcryptMock = jest.mocked(bcrypt);

/** La fila COMPLETA que devuelve findByEmailWithPassword: con password y con hash. */
const usuarioEnDb = {
  id: 'uuid-del-usuario',
  email: 'gabriel@integrar.com',
  name: 'Gabriel',
  role: 'USER',
  password: 'hash_de_la_password',
  hashedRefreshToken: 'hash_del_refresh_viejo',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const credenciales = { email: 'gabriel@integrar.com', password: 'Secreta123!' };

const SECRETS: Record<string, string> = {
  JWT_SECRET: 'secret_de_acceso',
  JWT_REFRESH_SECRET: 'secret_de_refresh',
  JWT_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN: '7d',
};

describe('AuthService', () => {
  let service: AuthService;
  let usersService: {
    create: jest.Mock;
    findByEmailWithPassword: jest.Mock;
    findByIdWithRefreshToken: jest.Mock;
    updateRefreshToken: jest.Mock;
  };
  let jwtService: { signAsync: jest.Mock };

  beforeEach(async () => {
    usersService = {
      create: jest.fn(),
      findByEmailWithPassword: jest.fn(),
      findByIdWithRefreshToken: jest.fn(),
      updateRefreshToken: jest.fn(),
    };
    jwtService = { signAsync: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        // ⚠️ AuthService lo inyecta:
        // sin este provider, Nest no puede resolver las dependencias y el spec ni arranca.
        {
          provide: ConfigService,
          useValue: { get: (k: string) => SECRETS[k] },
        },
      ],
    }).compile();

    service = moduleRef.get(AuthService);

    // El primer signAsync es el access, el segundo el refresh (ese es el orden del
    // Promise.all de generarTokens).
    jwtService.signAsync
      .mockResolvedValueOnce('access.token.falso')
      .mockResolvedValueOnce('refresh.token.falso');
    bcryptMock.hash.mockResolvedValue('hash_del_refresh_nuevo' as never);
  });

  describe('register', () => {
    it('crea el usuario y devuelve el par de tokens', async () => {
      usersService.create.mockResolvedValue(usuarioEnDb);

      const resultado = await service.register({
        email: 'gabriel@integrar.com',
        password: 'Secreta123!',
        name: 'Gabriel',
      });

      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'gabriel@integrar.com' }),
      );
      expect(resultado.access_token).toBe('access.token.falso');
      expect(resultado.refresh_token).toBe('refresh.token.falso');
    });

    it('guarda el hash del refresh token al registrarse', async () => {
      usersService.create.mockResolvedValue(usuarioEnDb);

      await service.register({
        email: 'gabriel@integrar.com',
        password: 'Secreta123!',
        name: 'Gabriel',
      });

      expect(usersService.updateRefreshToken).toHaveBeenCalledWith(
        'uuid-del-usuario',
        'hash_del_refresh_nuevo',
      );
    });
  });

  describe('login', () => {
    beforeEach(() => {
      usersService.findByEmailWithPassword.mockResolvedValue(usuarioEnDb);
      bcryptMock.compare.mockResolvedValue(true as never);
    });

    it('devuelve el usuario y los dos tokens con credenciales correctas', async () => {
      const resultado = await service.login(credenciales);

      expect(resultado.user.email).toBe('gabriel@integrar.com');
      expect(resultado.access_token).toBe('access.token.falso');
      expect(resultado.refresh_token).toBe('refresh.token.falso');
    });

    it('nunca expone el password ni el hashedRefreshToken en el JSON que se serializa', async () => {
      const resultado = await service.login(credenciales);

      // ⚠️ Asertamos sobre instanceToPlain y no sobre la instancia cruda a propósito.
      // login() hace `new UserEntity(user)` sobre la fila COMPLETA, así que la instancia
      // en memoria todavía tiene password y hashedRefreshToken. Lo que protege al cliente
      // es el @Exclude() + el ClassSerializerInterceptor, y eso es exactamente lo que
      // testea instanceToPlain: el JSON que sale por HTTP.
      // (El e2e vuelve a verificarlo de punta a punta sobre res.body.)
      const serializado = instanceToPlain(resultado.user);

      expect(serializado).not.toHaveProperty('password');
      expect(serializado).not.toHaveProperty('hashedRefreshToken');
      expect(JSON.stringify(serializado)).not.toContain('hash_de_la_password');
    });

    it('firma el payload con sub, email y role, y con nada más', async () => {
      await service.login(credenciales);

      expect(jwtService.signAsync).toHaveBeenCalledWith(
        {
          sub: 'uuid-del-usuario',
          email: 'gabriel@integrar.com',
          role: 'USER',
        },
        expect.anything(),
      );
    });

    it('firma el access token con JWT_SECRET y el refresh con JWT_REFRESH_SECRET', async () => {
      await service.login(credenciales);

      const [, opcionesAccess] = jwtService.signAsync.mock.calls[0];
      const [, opcionesRefresh] = jwtService.signAsync.mock.calls[1];

      // Si los dos secrets fueran el mismo, un refresh token serviría como access token.
      expect(opcionesAccess.secret).toBe('secret_de_acceso');
      expect(opcionesRefresh.secret).toBe('secret_de_refresh');
      expect(opcionesAccess.secret).not.toBe(opcionesRefresh.secret);
    });

    it('rota el refresh token: guarda el hash nuevo en la base', async () => {
      await service.login(credenciales);

      expect(usersService.updateRefreshToken).toHaveBeenCalledWith(
        'uuid-del-usuario',
        'hash_del_refresh_nuevo',
      );
    });

    it('lanza UnauthorizedException si el email no existe', async () => {
      usersService.findByEmailWithPassword.mockResolvedValue(null);

      await expect(service.login(credenciales)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('no firma ningún token si el email no existe', async () => {
      usersService.findByEmailWithPassword.mockResolvedValue(null);

      await expect(service.login(credenciales)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(jwtService.signAsync).not.toHaveBeenCalled();
    });

    it('lanza UnauthorizedException si la contraseña no coincide', async () => {
      bcryptMock.compare.mockResolvedValue(false as never);

      await expect(service.login(credenciales)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('devuelve EL MISMO mensaje y el MISMO status si el email no existe o si la contraseña está mal', async () => {
      // ⭐ El test más valioso del archivo. Si los mensajes difirieran, un atacante
      // prueba 10.000 emails y se queda con los que están registrados: eso es
      // *user enumeration*, y es el primer paso de un ataque dirigido.
      const capturarError = async (): Promise<UnauthorizedException> => {
        try {
          await service.login(credenciales);
          throw new Error('se esperaba que el login fallara y no falló');
        } catch (e) {
          return e as UnauthorizedException;
        }
      };

      usersService.findByEmailWithPassword.mockResolvedValue(null);
      const errorSinUsuario = await capturarError();

      usersService.findByEmailWithPassword.mockResolvedValue(usuarioEnDb);
      bcryptMock.compare.mockResolvedValue(false as never);
      const errorPasswordMala = await capturarError();

      expect(errorSinUsuario).toBeInstanceOf(UnauthorizedException);
      expect(errorPasswordMala).toBeInstanceOf(UnauthorizedException);
      expect(errorSinUsuario.message).toBe(errorPasswordMala.message);
      expect(errorSinUsuario.getStatus()).toBe(errorPasswordMala.getStatus());
    });
  });

  describe('refresh', () => {
    beforeEach(() => {
      usersService.findByIdWithRefreshToken.mockResolvedValue(usuarioEnDb);
      bcryptMock.compare.mockResolvedValue(true as never);
    });

    it('devuelve un par de tokens nuevo si el refresh token coincide', async () => {
      const resultado = await service.refresh(
        'uuid-del-usuario',
        'refresh.token.viejo',
      );

      expect(resultado).toEqual({
        access_token: 'access.token.falso',
        refresh_token: 'refresh.token.falso',
      });
    });

    it('pisa el hash guardado con el del token nuevo', async () => {
      await service.refresh('uuid-del-usuario', 'refresh.token.viejo');

      expect(usersService.updateRefreshToken).toHaveBeenCalledWith(
        'uuid-del-usuario',
        'hash_del_refresh_nuevo',
      );
    });

    it('no devuelve el usuario, solo los tokens', async () => {
      // Asimetría real con login/register, que sí devuelven `user`. El test la documenta
      // para que nadie la "arregle" sin darse cuenta de que rompe el contrato.
      const resultado = await service.refresh(
        'uuid-del-usuario',
        'refresh.token.viejo',
      );

      expect(resultado).not.toHaveProperty('user');
    });

    it('lanza ForbiddenException si el usuario ya había hecho logout', async () => {
      usersService.findByIdWithRefreshToken.mockResolvedValue({
        ...usuarioEnDb,
        hashedRefreshToken: null,
      });

      await expect(
        service.refresh('uuid-del-usuario', 'refresh.token.viejo'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lanza ForbiddenException si el refresh token no es el último emitido', async () => {
      bcryptMock.compare.mockResolvedValue(false as never);

      await expect(
        service.refresh('uuid-del-usuario', 'refresh.token.robado'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('mata la sesión entera cuando detecta el reuso de un token', async () => {
      bcryptMock.compare.mockResolvedValue(false as never);

      await expect(
        service.refresh('uuid-del-usuario', 'refresh.token.robado'),
      ).rejects.toThrow(ForbiddenException);

      // No alcanza con rechazar: hay que invalidar TODO, porque no sabemos si el que
      // llegó primero fue el usuario o el ladrón.
      expect(usersService.updateRefreshToken).toHaveBeenCalledWith(
        'uuid-del-usuario',
        null,
      );
    });
  });

  describe('logout', () => {
    it('deja el hashedRefreshToken en null', async () => {
      await service.logout('uuid-del-usuario');

      expect(usersService.updateRefreshToken).toHaveBeenCalledWith(
        'uuid-del-usuario',
        null,
      );
    });
  });
});
