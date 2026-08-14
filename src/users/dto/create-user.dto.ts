import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * El contrato de la puerta de entrada: lo único que un cliente puede mandar para
 * crear un usuario.
 *
 * 🛑 Fijate que NO tiene el campo `role`. Es a propósito: con `whitelist: true` en el
 * ValidationPipe, si alguien manda `{"role": "ADMIN"}` en el registro, ese campo
 * directamente no existe cuando llega al service. Eso frena el ataque de
 * *mass assignment* (auto-ascenderse a administrador mandando un campo de más).
 */
export class CreateUserDto {
  @IsEmail({}, { message: 'El email no tiene un formato válido' })
  email: string;

  @IsString({ message: 'La contraseña debe ser un texto' })
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  // bcrypt trunca en silencio todo lo que pase de 72 bytes: mejor rechazarlo acá
  // que dejar que el usuario crea que su contraseña de 100 caracteres es más segura.
  @MaxLength(72, {
    message: 'La contraseña no puede superar los 72 caracteres',
  })
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'La contraseña debe tener mayúscula, minúscula y número',
  })
  password: string;

  @IsString({ message: 'El nombre debe ser un texto' })
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(50, { message: 'El nombre no puede superar los 50 caracteres' })
  name: string;
}
