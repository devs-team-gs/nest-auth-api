import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marca una ruta como pública para que el AuthGuard global la deje pasar sin token.
 *
 * `SetMetadata` solo pega una etiqueta: no hace nada por sí solo. Alguien tiene que ir
 * a leerla, y ese alguien es el `Reflector` dentro del AuthGuard.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
