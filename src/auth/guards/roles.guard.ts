import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtPayload } from '../decorators/current-user.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Role } from '../enums/role.enum';

/**
 * Guard de autorización por rol (RBAC).
 *
 * ⚠️ Depende de que el AuthGuard haya corrido antes y haya dejado el payload en
 * `request.user`. Por eso en app.module.ts el AuthGuard se declara PRIMERO en el array
 * de providers: con APP_GUARD, los guards corren en el orden en que los declarás.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Si el endpoint no pide ningún rol, no es asunto de este guard.
    // Esto es lo que permite registrarlo globalmente sin romper el resto de la app.
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<{ user?: JwtPayload }>();

    if (!user) {
      // Llegar acá significa que el AuthGuard no corrió: error de configuración
      throw new ForbiddenException('No se pudo determinar el usuario');
    }

    const tienePermiso = requiredRoles.includes(user.role as Role);
    if (!tienePermiso) {
      // 403, NO 401: sabemos quién sos, pero no podés.
      throw new ForbiddenException(
        'No tenés permiso para realizar esta acción',
      );
    }

    return true;
  }
}
