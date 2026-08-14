import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Lo que viaja adentro del JWT. Nada sensible: el payload lo puede leer cualquiera. */
export interface JwtPayload {
  sub: string; // id del usuario
  email: string;
  role: string;
  iat: number;
  exp: number;
}

/**
 * Devuelve el usuario que el AuthGuard dejó en `request.user`.
 *
 * Se puede pedir el objeto entero — `@CurrentUser() user: JwtPayload` — o un solo
 * campo — `@CurrentUser('sub') userId: string`.
 *
 * ⚠️ La identidad sale SIEMPRE del token verificado, nunca del body ni de un query
 * param: eso lo escribe el cliente y lo puede cambiar.
 */
export const CurrentUser = createParamDecorator(
  (data: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = request.user;

    return data ? user?.[data] : user;
  },
);
