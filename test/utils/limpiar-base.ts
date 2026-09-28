import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Deja la base vacía. Se llama en el beforeEach de cada suite para que ningún test
 * dependa de lo que dejó el anterior: un test que solo pasa si corre segundo no es un
 * test, es una casualidad.
 *
 * ⚠️ EL ORDEN IMPORTA: de los hijos a los padres. Post.authorId apunta a User.id, así
 * que borrar los usuarios primero violaría la foreign key.
 *
 * (En este schema Post tiene onDelete: Cascade, así que técnicamente el primer
 * deleteMany sobra. Lo dejamos explícito igual porque la REGLA — hijos antes que padres
 * — es la que se transfiere a cualquier otro schema, y la mayoría no tiene cascade.)
 */
export async function limpiarBase(prisma: PrismaService): Promise<void> {
  await prisma.post.deleteMany();
  await prisma.user.deleteMany();
}
