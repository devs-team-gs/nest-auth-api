import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * @Global() para no tener que importar PrismaModule en cada módulo que use la base.
 * Es la excepción, no la regla: se justifica en providers de infraestructura como este.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
