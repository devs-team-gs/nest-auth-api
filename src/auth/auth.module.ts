import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [
    UsersModule,
    // registerAsync (y no register) porque necesitamos ESPERAR a que el ConfigService
    // esté listo para leer el .env. El secret nunca va hardcodeado en el código.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: {
          // jsonwebtoken tipa `expiresIn` como un literal ('15m', '7d'...) y del .env
          // sale un string genérico, así que hace falta el cast. Es seguro: el valor
          // ya se validó al arrancar (src/config/env.validation.ts).
          expiresIn: config.get<string>(
            'JWT_EXPIRES_IN',
          ) as JwtSignOptions['expiresIn'],
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  // 👇 para que el AuthGuard global (registrado en AppModule) pueda inyectar JwtService
  exports: [JwtModule],
})
export class AuthModule {}
