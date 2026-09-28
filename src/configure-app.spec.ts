import { NestExpressApplication } from '@nestjs/platform-express';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { configureApp } from './configure-app';

/**
 * La red de seguridad del refactor de la clase 39.
 *
 * configureApp() existe para que main.ts y los tests e2e levanten EXACTAMENTE la misma
 * app. Si alguien mueve una de estas líneas de vuelta a main.ts, los e2e seguirían
 * pasando (porque probarían una app sin esa pieza) y nadie se enteraría. Este spec es
 * el que avisa.
 */
function crearAppFalsa() {
  return {
    use: jest.fn(),
    useBodyParser: jest.fn(),
    enableCors: jest.fn(),
    useGlobalFilters: jest.fn(),
    get: jest.fn().mockReturnValue({ get: () => 'http://localhost:3000' }),
  };
}

describe('configureApp', () => {
  let app: ReturnType<typeof crearAppFalsa>;

  beforeEach(() => {
    app = crearAppFalsa();
    configureApp(app as unknown as NestExpressApplication);
  });

  it('aplica helmet', () => {
    expect(app.use).toHaveBeenCalledTimes(1);
    expect(app.use).toHaveBeenCalledWith(expect.any(Function));
  });

  it('limita el body de json a 1mb', () => {
    expect(app.useBodyParser).toHaveBeenCalledWith('json', { limit: '1mb' });
  });

  it('limita el body de urlencoded a 1mb', () => {
    expect(app.useBodyParser).toHaveBeenCalledWith('urlencoded', {
      limit: '1mb',
      extended: true,
    });
  });

  it('habilita CORS con el origin que sale del ConfigService', () => {
    // Del ConfigService y no de process.env: así la validación de entorno sigue siendo
    // la única fuente de verdad de la configuración.
    expect(app.enableCors).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: 'http://localhost:3000',
        credentials: true,
      }),
    );
  });

  it('registra el AllExceptionsFilter', () => {
    // Este es el que el pedido original se había olvidado. Sin él, el body de error en
    // los e2e es el de Nest ({statusCode, message, error}) y no el nuestro
    // ({statusCode, path, timestamp, message}).
    expect(app.useGlobalFilters).toHaveBeenCalledWith(
      expect.any(AllExceptionsFilter),
    );
  });

  it('no aplica un prefijo global', () => {
    // docs/clase-39.md mete setGlobalPrefix('api') en este helper, pero esta API nunca
    // lo tuvo: las rutas son /health, /auth/..., /users/..., /posts/....
    // Si alguien lo agrega, la app falsa no tiene ese método y este spec explota.
    expect(app).not.toHaveProperty('setGlobalPrefix');
  });
});
