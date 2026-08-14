import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * 🛑 No tiene `authorId`. El autor sale del token, nunca del body: si lo aceptáramos
 * acá, cualquiera podría publicar posts a nombre de otro.
 */
export class CreatePostDto {
  @IsString({ message: 'El título debe ser un texto' })
  @MinLength(3, { message: 'El título debe tener al menos 3 caracteres' })
  @MaxLength(120, { message: 'El título no puede superar los 120 caracteres' })
  title: string;

  @IsOptional()
  @IsString({ message: 'El contenido debe ser un texto' })
  @MaxLength(5000, {
    message: 'El contenido no puede superar los 5000 caracteres',
  })
  content?: string;

  @IsOptional()
  @IsBoolean({ message: 'published debe ser true o false' })
  published?: boolean;
}
