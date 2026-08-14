import { plainToInstance } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
  validateSync,
} from 'class-validator';

/**
 * Validación de las variables de entorno AL ARRANCAR.
 *
 * ¿Por qué no alcanza el ValidationPipe global? Porque el ValidationPipe valida
 * *requests* (body, query, params). Las variables de entorno se leen cuando la app
 * arranca, antes de que exista una sola request. Son dos momentos distintos del ciclo
 * de vida y necesitan mecanismos distintos.
 *
 * Reusamos class-validator (los MISMOS decoradores que en los DTOs) en vez de sumar Joi.
 */
class EnvironmentVariables {
  @IsString({ message: 'DATABASE_URL es obligatoria' })
  DATABASE_URL: string;

  @IsString()
  @MinLength(32, { message: 'JWT_SECRET debe tener al menos 32 caracteres' })
  JWT_SECRET: string;

  @IsString()
  JWT_EXPIRES_IN: string;

  @IsString()
  @MinLength(32, {
    message: 'JWT_REFRESH_SECRET debe tener al menos 32 caracteres',
  })
  JWT_REFRESH_SECRET: string;

  @IsString()
  JWT_REFRESH_EXPIRES_IN: string;

  @IsNumber({}, { message: 'PORT debe ser un número' })
  PORT: number;

  @IsString({
    message: 'CORS_ORIGIN es obligatoria (ej: http://localhost:3000)',
  })
  CORS_ORIGIN: string;

  // Las consume docker-compose.yml. Son opcionales para la app en sí, pero se declaran
  // acá igual: ver el comentario de abajo sobre qué devuelve validate().
  @IsOptional()
  @IsString()
  POSTGRES_USER?: string;

  @IsOptional()
  @IsString()
  POSTGRES_PASSWORD?: string;

  @IsOptional()
  @IsString()
  POSTGRES_DB?: string;

  @IsOptional()
  @IsNumber()
  POSTGRES_PORT?: number;

  @IsOptional()
  @IsString()
  NODE_ENV?: string;
}

export function validate(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    // 👇 todo llega como string desde process.env; sin esto, @IsNumber() en PORT falla
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    // errors.toString() imprime el NOMBRE de la regla que falló ("minLength"), no el
    // mensaje que escribimos arriba. Los sacamos a mano para que el error sirva.
    const mensajes = errors.flatMap((error) =>
      Object.values(error.constraints ?? {}),
    );

    // 💥 Corta el arranque. Principio de fail fast: mejor un error ruidoso al inicio
    // que firmar tokens con un secret vacío durante tres semanas.
    throw new Error(
      `❌ Error en las variables de entorno:\n  - ${mensajes.join('\n  - ')}`,
    );
  }

  return validated;
}

// ⚠️ IMPORTANTE: @nestjs/config usa como configuración EL OBJETO QUE DEVUELVE validate().
// Toda variable que no sea propiedad de esta clase desaparece de ConfigService.
// Por eso CORS_ORIGIN está declarada acá: si no, config.get('CORS_ORIGIN') sería undefined.
export type { EnvironmentVariables };
