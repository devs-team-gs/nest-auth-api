import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { createHash } from 'node:crypto';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

// ⚠️ Este archivo existe SOLO para poder usar bcrypt DE VERDAD.
//
// jest.mock('bcrypt') es de alcance de archivo: una vez mockeado, no se puede
// "desmockear" para un test suelto de forma legible. Y acá bcrypt tiene que ser real,
// porque lo que se prueba es una propiedad del algoritmo: **bcrypt trunca su entrada a
// 72 bytes en silencio**. Con un mock, esa propiedad no existe y el test no prueba nada.
//
// Costo: ~200 ms de hasheo real. Barato para la red de seguridad que da.

const USER_ID = 'ef9a1f4c-6c2a-4f0e-9f3a-1b2c3d4e5f60';
const EMAIL = 'gabriel@integrar.com';

const usuario = {
  id: USER_ID,
  email: EMAIL,
  name: 'Gabriel',
  role: 'USER',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

/** Arma un JWT realista (header.payload.firma) sin necesidad de firmar de verdad. */
function jwtFalso(payload: Record<string, unknown>, firma: string): string {
  const b64 = (o: object) =>
    Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.${firma}`;
}

const base = { sub: USER_ID, email: EMAIL, role: 'USER' };
// Dos refresh tokens del MISMO usuario emitidos con un segundo de diferencia.
// Lo único que cambia son iat, exp y la firma: todo eso cae MÁS ALLÁ del byte 72.
const REFRESH_A = jwtFalso(
  { ...base, iat: 1767225600, exp: 1767830400 },
  'firma-A',
);
const REFRESH_B = jwtFalso(
  { ...base, iat: 1767225601, exp: 1767830401 },
  'firma-B',
);

const sha256 = (t: string) => createHash('sha256').update(t).digest('hex');

describe('AuthService — rotación del refresh token (con bcrypt real)', () => {
  let service: AuthService;
  let usersService: {
    create: jest.Mock;
    findByIdWithRefreshToken: jest.Mock;
    updateRefreshToken: jest.Mock;
  };

  /** Emite un par de tokens con REFRESH_A y devuelve el hash que quedó "en la base". */
  async function emitirYCapturarHash(): Promise<string> {
    usersService.create.mockResolvedValue(usuario);
    await service.register({
      email: EMAIL,
      password: 'Secreta123!',
      name: 'Gabriel',
    });

    const [, hashGuardado] = usersService.updateRefreshToken.mock.calls[0] as [
      string,
      string,
    ];
    usersService.updateRefreshToken.mockClear();
    return hashGuardado;
  }

  beforeEach(async () => {
    usersService = {
      create: jest.fn(),
      findByIdWithRefreshToken: jest.fn(),
      updateRefreshToken: jest.fn(),
    };

    const jwtService = {
      signAsync: jest
        .fn()
        .mockResolvedValueOnce('access.A') // 1º del register: el access
        .mockResolvedValueOnce(REFRESH_A) // 2º del register: el refresh
        .mockResolvedValue('token.posterior'), // cualquier emisión siguiente
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        {
          provide: ConfigService,
          useValue: { get: () => 'un_secret_cualquiera_de_mas_de_32_chars' },
        },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  it('los dos refresh tokens del mismo usuario comparten los primeros 72 bytes', () => {
    // Esta es la PREMISA del bug, y conviene verificarla explícitamente: si algún día
    // el payload cambiara (por ejemplo si se le agregara un jti aleatorio), este test
    // se pondría rojo y avisaría que el resto del archivo ya no prueba lo mismo.
    expect(REFRESH_A.slice(0, 72)).toBe(REFRESH_B.slice(0, 72));
    expect(REFRESH_A).not.toBe(REFRESH_B);
  });

  it('guarda el bcrypt del SHA-256 del refresh token, nunca el token crudo', async () => {
    const hashGuardado = await emitirYCapturarHash();

    // 64 caracteres hex entran cómodos en los 72 bytes de bcrypt.
    await expect(bcrypt.compare(sha256(REFRESH_A), hashGuardado)).resolves.toBe(
      true,
    );
    // Y el token crudo NO matchea: prueba que el resumen previo existe.
    await expect(bcrypt.compare(REFRESH_A, hashGuardado)).resolves.toBe(false);
  });

  it('acepta el refresh token correcto', async () => {
    // Control negativo: prueba que el test de abajo falla por el TOKEN y no por el setup.
    const hashGuardado = await emitirYCapturarHash();
    usersService.findByIdWithRefreshToken.mockResolvedValue({
      ...usuario,
      hashedRefreshToken: hashGuardado,
    });

    await expect(service.refresh(USER_ID, REFRESH_A)).resolves.toHaveProperty(
      'access_token',
    );
  });

  it('detecta el reuso de un refresh token viejo aunque comparta los primeros 72 bytes con el nuevo', async () => {
    // ⭐ EL TEST. Si alguien borra el `this.resumir(...)` de generarTokens y de refresh,
    // bcrypt recibe los tokens crudos, trunca los dos a sus primeros 72 bytes —que son
    // IDÉNTICOS— y compare() devuelve true: la detección de reuso deja de detectar nada
    // y este test se pone rojo. Falla en silencio, que es la peor forma de fallar.
    const hashGuardado = await emitirYCapturarHash();
    usersService.findByIdWithRefreshToken.mockResolvedValue({
      ...usuario,
      hashedRefreshToken: hashGuardado,
    });

    await expect(service.refresh(USER_ID, REFRESH_B)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('mata la sesión entera al detectar el reuso', async () => {
    const hashGuardado = await emitirYCapturarHash();
    usersService.findByIdWithRefreshToken.mockResolvedValue({
      ...usuario,
      hashedRefreshToken: hashGuardado,
    });

    await expect(service.refresh(USER_ID, REFRESH_B)).rejects.toThrow(
      ForbiddenException,
    );
    expect(usersService.updateRefreshToken).toHaveBeenCalledWith(USER_ID, null);
  });
});
