import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { JwtPayload } from '../decorators/current-user.decorator';

/**
 * Valida el REFRESH token, que viene también como `Authorization: Bearer <...>`
 * pero está firmado con el otro secret (JWT_REFRESH_SECRET).
 *
 * Se aplica solo en POST /auth/refresh con @UseGuards(), no globalmente.
 */
@Injectable()
export class RefreshTokenGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const [type, token] = request.headers.authorization?.split(' ') ?? [];

    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException('Falta el refresh token');
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'), // 👈 el OTRO secret
      });
      request['user'] = payload;
      // Dejamos el token CRUDO disponible: el service lo necesita para compararlo
      // con bcrypt contra el hash guardado en la base.
      request['refreshToken'] = token;
    } catch {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }

    return true;
  }
}
