import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateUserDto } from './create-user.dto';

/**
 * Todos los campos de CreateUserDto, pero opcionales (es un PATCH) y sin password
 * (cambiar la contraseña es un flujo aparte, con la contraseña actual de por medio).
 *
 * Lo mejor de mapped-types: las validaciones se heredan. El @IsEmail() sigue aplicando
 * acá sin que lo escribas de nuevo, así que no hay dos lugares que mantener.
 */
export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['password'] as const),
) {}
