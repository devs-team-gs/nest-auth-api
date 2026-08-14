import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash } from 'node:crypto';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { UserEntity } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private readonly SALT_ROUNDS = 10;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: CreateUserDto) {
    const user = await this.usersService.create(dto); // ya hashea adentro
    const tokens = await this.generarTokens(user.id, user.email, user.role);

    return { user: new UserEntity(user), ...tokens };
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmailWithPassword(dto.email);

    // ⚠️ MISMO mensaje si el usuario no existe o si la contraseña está mal.
    // Si no, le regalás a un atacante un verificador de cuentas: prueba 10.000 emails
    // y se queda con los que están registrados (*user enumeration*).
    if (!user) throw new UnauthorizedException('Credenciales inválidas');

    const passwordOk = await bcrypt.compare(dto.password, user.password);
    if (!passwordOk) throw new UnauthorizedException('Credenciales inválidas');

    const tokens = await this.generarTokens(user.id, user.email, user.role);

    return { user: new UserEntity(user), ...tokens };
  }

  async refresh(userId: string, refreshToken: string) {
    const user = await this.usersService.findByIdWithRefreshToken(userId);

    if (!user?.hashedRefreshToken) {
      throw new ForbiddenException('Acceso denegado'); // ya hizo logout
    }

    const coincide = await bcrypt.compare(
      this.resumir(refreshToken),
      user.hashedRefreshToken,
    );

    if (!coincide) {
      // 🚨 Detección de reuso: el token está firmado y no venció, pero no es el último
      // que emitimos. O te lo robaron, o es una copia vieja. Por las dudas matamos la
      // sesión entera y los dos (vos y el ladrón) tienen que loguearse de nuevo.
      // Vos podés; el ladrón no, porque no tiene tu contraseña.
      await this.usersService.updateRefreshToken(userId, null);
      throw new ForbiddenException('Acceso denegado');
    }

    // 🔄 Rotación: emitimos un par nuevo y el anterior deja de servir
    return this.generarTokens(user.id, user.email, user.role);
  }

  async logout(userId: string) {
    // El refresh queda muerto al instante: esto es el "logout de verdad" que el JWT
    // stateless por sí solo no puede darte.
    await this.usersService.updateRefreshToken(userId, null);
  }

  /**
   * Firma el par de tokens y guarda el hash del refresh en la base.
   *
   * El refresh token se hashea con bcrypt igual que una contraseña: es una credencial
   * de 7 días, y si te filtran la base en texto plano el atacante se hace pasar por
   * cualquier usuario durante una semana.
   */
  private async generarTokens(userId: string, email: string, role: string) {
    // 🔑 Solo lo mínimo e indispensable: el payload del JWT lo lee cualquiera.
    const payload = { sub: userId, email, role };

    const [access_token, refresh_token] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.config.get<string>('JWT_SECRET'),
        expiresIn: this.expiresIn('JWT_EXPIRES_IN'), // 15m
      }),
      this.jwtService.signAsync(payload, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'), // 👈 el OTRO secret
        expiresIn: this.expiresIn('JWT_REFRESH_EXPIRES_IN'), // 7d
      }),
    ]);

    const hashedRefreshToken = await bcrypt.hash(
      this.resumir(refresh_token),
      this.SALT_ROUNDS,
    );
    await this.usersService.updateRefreshToken(userId, hashedRefreshToken);

    return { access_token, refresh_token };
  }

  /**
   * 🛑 Paso IMPRESCINDIBLE antes de pasarle un JWT a bcrypt.
   *
   * Acordate del límite de 72 bytes de bcrypt (el mismo por el que el CreateUserDto
   * tiene @MaxLength(72)): todo lo que pase de ahí se trunca EN SILENCIO. Un refresh
   * token mide ~250 caracteres, y los primeros 72 bytes de dos tokens distintos del
   * MISMO usuario son idénticos — son el header (siempre igual) más el principio del
   * payload (`{"sub":"<uuid>","email":...`). Lo único que los diferencia son el `iat`,
   * el `exp` y la firma... que quedan todos más allá del byte 72.
   *
   * O sea: si hasheás el token crudo, `bcrypt.compare(tokenViejo, hash(tokenNuevo))`
   * devuelve **true** y la rotación con detección de reuso no detecta absolutamente
   * nada. Falla en silencio, que es la peor forma de fallar.
   *
   * La solución estándar: primero SHA-256 (te da 64 caracteres, entran cómodos en los
   * 72) y recién ese resumen va a bcrypt.
   */
  private resumir(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * jsonwebtoken tipa `expiresIn` como un literal ('15m', '7d'...) y del .env sale un
   * string genérico, así que hace falta el cast. Es seguro: el valor ya se validó al
   * arrancar (src/config/env.validation.ts).
   */
  private expiresIn(key: 'JWT_EXPIRES_IN' | 'JWT_REFRESH_EXPIRES_IN') {
    return this.config.get<string>(key) as JwtSignOptions['expiresIn'];
  }
}
