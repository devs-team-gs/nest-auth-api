/**
 * Espejo del enum `Role` del schema.prisma.
 *
 * Lo escribimos a mano para que el código de la app (decoradores, guards, comparaciones)
 * no dependa del cliente generado de Prisma. Los valores tienen que coincidir sí o sí
 * con los del schema.
 */
export enum Role {
  USER = 'USER',
  ADMIN = 'ADMIN',
  MODERATOR = 'MODERATOR',
}
