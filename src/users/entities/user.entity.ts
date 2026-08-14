import { Exclude } from 'class-transformer';

/**
 * Capa 2 contra la filtración de datos sensibles.
 *
 * La capa 1 es el `select`/`omit` explícito en las queries de Prisma (el dato ni
 * siquiera sale de la base). Esta es la red de seguridad por si algún día se escapa un
 * select: el ClassSerializerInterceptor global borra del JSON todo lo marcado con
 * @Exclude().
 *
 * 🛑 El error clásico: devolver el objeto de Prisma directo. class-transformer solo
 * aplica @Exclude() sobre **instancias de la clase**. Si devolvés `{ ...user }`, el
 * interceptor no tiene forma de saber qué reglas aplicar. Tiene que ser
 * `new UserEntity(user)`.
 */
export class UserEntity {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;

  @Exclude()
  password?: string;

  @Exclude()
  hashedRefreshToken?: string | null;

  constructor(partial: Partial<UserEntity>) {
    Object.assign(this, partial);
  }
}
