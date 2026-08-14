import { ClassSerializerInterceptor, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { AuthGuard } from './auth/guards/auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { validate } from './config/env.validation';
import { PostsModule } from './posts/posts.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    // isGlobal: disponible en toda la app sin re-importar.
    // validate: si falta o es inválida cualquier variable requerida, la app NO arranca.
    ConfigModule.forRoot({ isGlobal: true, validate }),

    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 3 }, // 3 requests por segundo
      { name: 'long', ttl: 60000, limit: 100 }, // 100 por minuto
    ]),

    PrismaModule,
    UsersModule,
    // AuthModule exporta JwtModule: es lo que le permite al AuthGuard global
    // inyectar JwtService.
    AuthModule,
    PostsModule,
  ],
  controllers: [AppController],
  providers: [
    // ⚠️ EL ORDEN IMPORTA. Con APP_GUARD, los guards corren en el orden en que están
    // declarados en este array. El RolesGuard lee `request.user`, que lo pone el
    // AuthGuard: si corriera primero, sería undefined y todo se rompe.
    { provide: APP_GUARD, useClass: ThrottlerGuard }, // 1º: ¿no estás abusando?
    { provide: APP_GUARD, useClass: AuthGuard }, // 2º: ¿quién sos?
    { provide: APP_GUARD, useClass: RolesGuard }, // 3º: ¿qué podés hacer?

    // Segunda capa contra la filtración de datos: borra del JSON todo lo marcado con
    // @Exclude() en las entities (ver users/entities/user.entity.ts).
    { provide: APP_INTERCEPTOR, useClass: ClassSerializerInterceptor },
  ],
})
export class AppModule {}
