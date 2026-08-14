import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

/**
 * Abstrae el PrismaClient detrás de un provider de Nest, para que el resto de la app
 * lo reciba por inyección de dependencias y exista una sola instancia (y por lo tanto
 * un solo pool de conexiones) en todo el proceso.
 *
 * En Prisma 7 el cliente NO se conecta solo: hay que pasarle un driver adapter.
 * `new PrismaClient()` sin argumentos tira error.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
