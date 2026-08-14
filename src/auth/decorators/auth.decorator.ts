import { applyDecorators } from '@nestjs/common';
import { Role } from '../enums/role.enum';
import { Roles } from './roles.decorator';

/**
 * Agrupa en un solo decorador todo lo que hace falta para restringir un endpoint por rol.
 *
 * ⚠️ Fijate que NO lleva `UseGuards(AuthGuard, RolesGuard)`.
 *
 * En muchos ejemplos vas a ver `applyDecorators(Roles(...roles), UseGuards(AuthGuard,
 * RolesGuard))`. Eso aplica cuando los guards se ponen endpoint por endpoint. Nosotros
 * elegimos la otra estrategia: los dos guards están registrados globalmente con
 * `APP_GUARD` en app.module.ts, así que YA corren en todas las requests. Agregarlos acá
 * los instanciaría una segunda vez por endpoint, sin ningún beneficio.
 *
 * Lo que sigue haciendo falta es la metadata de roles, y eso es exactamente `Roles()`.
 */
export function Auth(...roles: Role[]) {
  return applyDecorators(Roles(...roles));
}
