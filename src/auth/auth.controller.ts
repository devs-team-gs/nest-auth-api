import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { seconds, Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import type { JwtPayload } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenGuard } from './guards/refresh-token.guard';
import { CreateUserDto } from '../users/dto/create-user.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() dto: CreateUserDto) {
    return this.authService.register(dto); // 201 por defecto
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK) // 👈 sin esto, POST devuelve 201; acá no creamos nada
  // El endpoint más atacado de cualquier API. Límite mucho más estricto que el global:
  // 5 intentos por minuto. Pasado eso, Nest responde 429 solo.
  @Throttle({ short: { limit: 5, ttl: seconds(60) } })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  /**
   * 💡 Ojo con el @Public(): es público **para el AuthGuard** (no pide access token,
   * porque justamente el access token está vencido), pero lo protege el
   * RefreshTokenGuard. No es un endpoint abierto: pide una credencial distinta.
   */
  @Public()
  @UseGuards(RefreshTokenGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Req() req: Request) {
    const user = req['user'] as JwtPayload;
    const refreshToken = req['refreshToken'] as string;

    return this.authService.refresh(user.sub, refreshToken);
  }

  /** Este sí necesita el access token normal. */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT) // 204
  logout(@CurrentUser('sub') userId: string) {
    return this.authService.logout(userId);
  }
}
