import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { RefreshTokenGuard } from './refresh-token.guard';

function crearContexto(headers: Record<string, string> = {}) {
  const request: {
    headers: Record<string, string>;
    user?: unknown;
    refreshToken?: string;
  } = { headers };

  return {
    switchToHttp: () => ({ getRequest: () => request }),
    __request: request,
  } as unknown as ExecutionContext & { __request: typeof request };
}

const payload = {
  sub: 'uuid-del-usuario',
  email: 'gabriel@integrar.com',
  role: 'USER',
};

describe('RefreshTokenGuard', () => {
  let guard: RefreshTokenGuard;
  let jwtService: { verifyAsync: jest.Mock };

  beforeEach(() => {
    jwtService = { verifyAsync: jest.fn() };
    const config = { get: jest.fn().mockReturnValue('secret_de_refresh') };

    guard = new RefreshTokenGuard(
      jwtService as unknown as JwtService,
      config as unknown as ConfigService,
    );
  });

  it('lanza 401 si falta el header Authorization', async () => {
    await expect(guard.canActivate(crearContexto())).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('lanza 401 si el esquema no es Bearer', async () => {
    const ctx = crearContexto({ authorization: 'Basic dXNlcjpwYXNz' });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('verifica el token con JWT_REFRESH_SECRET y no con el secret del access', async () => {
    jwtService.verifyAsync.mockResolvedValue(payload);
    await guard.canActivate(
      crearContexto({ authorization: 'Bearer refresh.token.falso' }),
    );

    // Si verificara con el secret del access, un access token serviría como refresh y se
    // perdería toda la separación entre las dos credenciales.
    expect(jwtService.verifyAsync).toHaveBeenCalledWith('refresh.token.falso', {
      secret: 'secret_de_refresh',
    });
  });

  it('deja el payload en request.user y el token CRUDO en request.refreshToken', async () => {
    jwtService.verifyAsync.mockResolvedValue(payload);
    const ctx = crearContexto({ authorization: 'Bearer refresh.token.falso' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);

    expect(ctx.__request.user).toEqual(payload);
    // El token crudo hace falta después: el service lo compara con bcrypt contra el hash.
    expect(ctx.__request.refreshToken).toBe('refresh.token.falso');
  });

  it('lanza 401 si el refresh token está vencido', async () => {
    jwtService.verifyAsync.mockRejectedValue(new Error('jwt expired'));
    const ctx = crearContexto({
      authorization: 'Bearer refresh.token.vencido',
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });
});
