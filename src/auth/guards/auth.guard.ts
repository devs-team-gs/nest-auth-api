import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { JwtPayload } from '../decorators/current-user.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Guard de autenticación propio (sin Passport).
 *
 * Está registrado globalmente con APP_GUARD, así que **todo endpoint nace protegido**
 * y abrirlo es una decisión explícita con `@Public()`. Eso es "secure by default":
 * lo seguro es lo que pasa si no hacés nada.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector, // 👈 el lector de metadata
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // getAllAndOverride busca primero en el método y después en la clase: el método gana.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true; // 👈 pasa de largo, ni mira el token

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Falta el token de acceso');
    }

    try {
      // Verifica la FIRMA y la EXPIRACIÓN con el secret del JwtModule
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      // 🔑 Pegamos el payload en el request para que lo usen los handlers y el RolesGuard
      request['user'] = payload;
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }

    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
