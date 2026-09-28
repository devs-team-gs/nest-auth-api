// ⚠️ Import obligatorio y fácil de olvidar: class-transformer y class-validator leen
// metadata de los decoradores con Reflect.getMetadata. En los demás specs lo trae
// @nestjs/testing por transitividad; acá no importamos nada de Nest, así que hay que
// pedirlo a mano o todos los tests explotan con "Reflect.getMetadata is not a function".
import 'reflect-metadata';
import { validate } from './env.validation';

/**
 * Una función pura: entra un objeto, sale un objeto o explota. No hace falta ni
 * TestingModule ni mocks. Es el tipo de test más barato y más rápido que existe.
 */
const ENV_VALIDO = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db?schema=public',
  JWT_SECRET: 'un_secret_de_acceso_de_mas_de_32_caracteres',
  JWT_EXPIRES_IN: '15m',
  JWT_REFRESH_SECRET: 'un_secret_de_refresh_de_mas_de_32_caracteres',
  JWT_REFRESH_EXPIRES_IN: '7d',
  PORT: '3000',
  CORS_ORIGIN: 'http://localhost:3000',
};

/** Devuelve una copia del entorno válido a la que le falta una variable. */
function sinLaVariable(clave: keyof typeof ENV_VALIDO) {
  const copia: Record<string, unknown> = { ...ENV_VALIDO };
  delete copia[clave];
  return copia;
}

describe('validate (variables de entorno)', () => {
  it('acepta una configuración completa y válida', () => {
    expect(() => validate(ENV_VALIDO)).not.toThrow();
  });

  it('convierte PORT de string a número', () => {
    // process.env entrega TODO como string; sin enableImplicitConversion el @IsNumber()
    // de PORT fallaría siempre.
    const resultado = validate(ENV_VALIDO);

    expect(resultado.PORT).toBe(3000);
    expect(typeof resultado.PORT).toBe('number');
  });

  it('lanza un error si falta DATABASE_URL', () => {
    expect(() => validate(sinLaVariable('DATABASE_URL'))).toThrow(
      /DATABASE_URL/,
    );
  });

  it('lanza un error si JWT_SECRET tiene menos de 32 caracteres', () => {
    // Un secret corto es un secret adivinable: con 8 caracteres se fuerza por fuerza
    // bruta y el atacante se firma sus propios tokens.
    expect(() => validate({ ...ENV_VALIDO, JWT_SECRET: 'corto' })).toThrow(
      /al menos 32 caracteres/,
    );
  });

  it('lanza un error si JWT_REFRESH_SECRET tiene menos de 32 caracteres', () => {
    expect(() =>
      validate({ ...ENV_VALIDO, JWT_REFRESH_SECRET: 'corto' }),
    ).toThrow(/JWT_REFRESH_SECRET/);
  });

  it('lanza un error si falta CORS_ORIGIN', () => {
    expect(() => validate(sinLaVariable('CORS_ORIGIN'))).toThrow(/CORS_ORIGIN/);
  });

  it('junta TODOS los mensajes de error en uno solo', () => {
    // Fail fast, pero completo: si te faltan tres variables querés enterarte de las
    // tres de una, no arreglar una y volver a arrancar.
    const error = (() => {
      try {
        validate({ PORT: '3000' });
      } catch (e) {
        return e as Error;
      }
    })();

    expect(error?.message).toMatch(/DATABASE_URL/);
    expect(error?.message).toMatch(/JWT_SECRET/);
    expect(error?.message).toMatch(/CORS_ORIGIN/);
  });

  it('usa los mensajes escritos a mano y no el nombre de la regla de class-validator', () => {
    const error = (() => {
      try {
        validate({ ...ENV_VALIDO, JWT_SECRET: 'corto' });
      } catch (e) {
        return e as Error;
      }
    })();

    expect(error?.message).not.toMatch(/minLength/);
  });

  it('CONSERVA las variables que no están declaradas en la clase', () => {
    // 🔍 Este test documenta algo que el comentario de env.validation.ts (líneas 96-98)
    // dice al revés: afirma que "toda variable que no sea propiedad de esta clase
    // desaparece de ConfigService".
    //
    // No es así. plainToInstance() copia TODAS las propiedades del objeto plano sobre la
    // instancia, salvo que se le pase `excludeExtraneousValues: true` (que no se le pasa).
    // O sea que una variable no declarada sobrevive a validate() y sigue llegando al
    // ConfigService.
    //
    // Lo que SÍ pasa es que una variable no declarada no se valida ni se convierte de
    // tipo: llega como el string crudo de process.env.
    const resultado = validate({
      ...ENV_VALIDO,
      THROTTLE_E2E: 'true',
    }) as unknown as Record<string, unknown>;

    expect(resultado.THROTTLE_E2E).toBe('true');
  });

  it('no convierte el tipo de las variables no declaradas', () => {
    // La consecuencia práctica de lo de arriba: si declarás la variable, @IsNumber() +
    // enableImplicitConversion te la dan como number; si no la declarás, te queda string.
    const resultado = validate({
      ...ENV_VALIDO,
      UN_NUMERO: '42',
    }) as unknown as Record<string, unknown>;

    expect(resultado.UN_NUMERO).toBe('42');
    expect(typeof resultado.UN_NUMERO).toBe('string');
  });

  it('deja pasar las variables opcionales de POSTGRES cuando no vienen', () => {
    expect(() => validate(ENV_VALIDO)).not.toThrow();
  });

  it('acepta las variables opcionales de POSTGRES cuando sí vienen', () => {
    const resultado = validate({
      ...ENV_VALIDO,
      POSTGRES_USER: 'test',
      POSTGRES_PASSWORD: 'test',
      POSTGRES_DB: 'integrar_test',
      POSTGRES_PORT: '5434',
      NODE_ENV: 'test',
    });

    expect(resultado.POSTGRES_PORT).toBe(5434);
    expect(resultado.NODE_ENV).toBe('test');
  });
});
