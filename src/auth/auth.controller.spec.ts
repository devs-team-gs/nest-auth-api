import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RefreshTokenGuard } from './guards/refresh-token.guard';

/**
 * Un controller bien escrito casi no tiene lógica: recibe, delega, devuelve. Así que el
 * unitario es corto a propósito.
 *
 * ⚠️ Acá NO corren ni el ValidationPipe, ni los guards, ni el @HttpCode(200) del login,
 * ni el @Throttle. Todo eso es infraestructura de Nest y se prueba en los e2e
 * (test/auth.e2e-spec.ts). Si acá "probáramos" que el login devuelve 200, estaríamos
 * mintiéndonos: el método ni siquiera sabe qué status code lo envuelve.
 */
describe('AuthController', () => {
  let controller: AuthController;
  let authService: {
    register: jest.Mock;
    login: jest.Mock;
    refresh: jest.Mock;
    logout: jest.Mock;
  };

  beforeEach(async () => {
    authService = {
      register: jest.fn(),
      login: jest.fn(),
      refresh: jest.fn(),
      logout: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    })
      // POST /auth/refresh tiene @UseGuards(RefreshTokenGuard). Aunque el guard no se
      // EJECUTA en un unitario, Nest igual lo instancia al construir el módulo, y ahí
      // pide JwtService y ConfigService. Lo reemplazamos por un doble para no tener que
      // arrastrar medio AuthModule a un test que solo prueba delegación.
      .overrideGuard(RefreshTokenGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = moduleRef.get(AuthController);
  });

  it('delega el registro en el AuthService y devuelve su resultado', async () => {
    const dto = {
      email: 'gabriel@integrar.com',
      password: 'Secreta123!',
      name: 'Gabriel',
    };
    const esperado = { user: {}, access_token: 'a', refresh_token: 'r' };
    authService.register.mockResolvedValue(esperado);

    await expect(controller.register(dto)).resolves.toBe(esperado);
    expect(authService.register).toHaveBeenCalledWith(dto);
  });

  it('delega el login en el AuthService', async () => {
    const dto = { email: 'gabriel@integrar.com', password: 'Secreta123!' };
    const esperado = { user: {}, access_token: 'a', refresh_token: 'r' };
    authService.login.mockResolvedValue(esperado);

    await expect(controller.login(dto)).resolves.toBe(esperado);
    expect(authService.login).toHaveBeenCalledWith(dto);
  });

  it('le pasa al refresh el sub del payload y el token crudo que dejó el RefreshTokenGuard', async () => {
    const req = {
      user: { sub: 'uuid-del-usuario' },
      refreshToken: 'refresh.token.crudo',
    } as unknown as Request;

    await controller.refresh(req);

    // El id sale del token verificado, nunca del body: eso lo puede escribir el cliente.
    expect(authService.refresh).toHaveBeenCalledWith(
      'uuid-del-usuario',
      'refresh.token.crudo',
    );
  });

  it('delega el logout pasando el id que salió del token', async () => {
    await controller.logout('uuid-del-usuario');

    expect(authService.logout).toHaveBeenCalledWith('uuid-del-usuario');
  });
});
