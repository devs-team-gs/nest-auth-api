import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../enums/role.enum';
import { RolesGuard } from './roles.guard';

function crearContexto(user?: { role: string }) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: { getAllAndOverride: jest.Mock };

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  it('deja pasar si el endpoint no declara @Roles()', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    // Es lo que permite registrarlo globalmente sin romper los endpoints sin rol.
    expect(guard.canActivate(crearContexto({ role: 'USER' }))).toBe(true);
  });

  it('deja pasar si el endpoint declara un array vacío de roles', () => {
    reflector.getAllAndOverride.mockReturnValue([]);

    expect(guard.canActivate(crearContexto({ role: 'USER' }))).toBe(true);
  });

  it('deja pasar si el rol del usuario está entre los permitidos', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN, Role.MODERATOR]);

    expect(guard.canActivate(crearContexto({ role: 'ADMIN' }))).toBe(true);
  });

  it('lanza 403 si el rol no alcanza', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);

    // 403 y no 401: sabemos perfectamente quién sos, lo que no tenés es permiso.
    expect(() => guard.canActivate(crearContexto({ role: 'USER' }))).toThrow(
      ForbiddenException,
    );
  });

  it('lanza 403 si no hay usuario en el request porque el AuthGuard no corrió', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);

    // Llegar acá es un error de configuración: los guards quedaron en el orden
    // equivocado en app.module.ts.
    expect(() => guard.canActivate(crearContexto(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
