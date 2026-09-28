import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AuthGuard } from './auth.guard';

/**
 * Un guard NO necesita TestingModule: es una clase con dos dependencias. `new` y listo.
 * Lo único incómodo es el ExecutionContext, que es una interfaz enorme — pero el guard
 * solo usa tres métodos, así que implementamos esos tres y nada más.
 */
function crearContexto(headers: Record<string, string> = {}) {
  const request: { headers: Record<string, string>; user?: unknown } = {
    headers,
  };

  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
    // 👇 no es parte de ExecutionContext: es nuestro atajo para espiar request.user
    __request: request,
  } as unknown as ExecutionContext & { __request: typeof request };
}

const payload = {
  sub: 'uuid-del-usuario',
  email: 'gabriel@integrar.com',
  role: 'USER',
};

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let jwtService: { verifyAsync: jest.Mock };
  let reflector: { getAllAndOverride: jest.Mock };

  beforeEach(() => {
    jwtService = { verifyAsync: jest.fn() };
    // Por defecto: la ruta NO es pública. Cada test que necesite lo contrario lo dice.
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };

    guard = new AuthGuard(
      jwtService as unknown as JwtService,
      reflector as unknown as Reflector,
    );
  });

  it('deja pasar sin token si la ruta está marcada con @Public()', async () => {
    reflector.getAllAndOverride.mockReturnValue(true); // @IsPublic() en la ruta
    const ctx = crearContexto();

    await expect(guard.canActivate(ctx)).resolves.toBe(true);

    // El assert que hace que el test sirva: no basta con que devuelva true, tiene que
    // NI SIQUIERA mirar el token.
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
  });

  it('lanza 401 si no viene el header Authorization', async () => {
    await expect(guard.canActivate(crearContexto())).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('lanza 401 si el esquema no es Bearer', async () => {
    const ctx = crearContexto({ authorization: 'Basic dXNlcjpwYXNz' });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
  });

  it('lanza 401 si el token está vencido o la firma no valida', async () => {
    jwtService.verifyAsync.mockRejectedValue(new Error('jwt expired'));
    const ctx = crearContexto({ authorization: 'Bearer token.vencido.falso' });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('deja el payload verificado en request.user cuando el token es válido', async () => {
    jwtService.verifyAsync.mockResolvedValue(payload);
    const ctx = crearContexto({ authorization: 'Bearer token.valido.falso' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);

    // Esto es lo que después consumen el RolesGuard y el @CurrentUser().
    expect(ctx.__request.user).toEqual(payload);
    expect(jwtService.verifyAsync).toHaveBeenCalledWith('token.valido.falso');
  });
});
