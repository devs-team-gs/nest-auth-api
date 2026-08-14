import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

/**
 * 💡 Fijate que NO repite las reglas de fortaleza de la contraseña (@MinLength(8),
 * @Matches(...)). Esas van solo en el registro. Acá o coincide o no coincide; validar
 * de más solo filtraría información sobre el formato de tus passwords.
 */
export class LoginDto {
  @IsEmail({}, { message: 'El email no tiene un formato válido' })
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'La contraseña es obligatoria' })
  password: string;
}
