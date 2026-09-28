import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

/**
 * El filtro decide QUÉ ve el cliente cuando algo sale mal. Es la diferencia entre
 * devolver "Error interno del servidor" y regalarle a un atacante el stack trace con
 * el nombre de tu ORM, tus archivos y tu schema.
 */
function crearHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const response = { status };
  const request = { method: 'POST', url: '/auth/register' };

  return {
    host: {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    } as unknown as ArgumentsHost,
    status,
    json,
  };
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    // El filtro loguea con Logger.error: lo silenciamos para no ensuciar la salida de
    // los tests con stacks rojos de errores que estamos provocando a propósito.
    jest.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
  });

  it('responde con statusCode, path, timestamp y message', () => {
    const { host, status, json } = crearHost();

    filter.catch(new NotFoundException('Usuario no encontrado'), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      statusCode: 404,
      path: '/auth/register',
      timestamp: expect.any(String),
      message: 'Usuario no encontrado',
    });
  });

  it('usa el status de la HttpException', () => {
    const { host, status } = crearHost();

    filter.catch(new ForbiddenException('No tenés permiso'), host);

    expect(status).toHaveBeenCalledWith(403);
  });

  it('responde 500 con un mensaje genérico si el error no es una HttpException', () => {
    const { host, status, json } = crearHost();

    filter.catch(new Error('connect ECONNREFUSED 127.0.0.1:5432'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Error interno del servidor' }),
    );
  });

  it('nunca filtra el detalle interno ni el stack en la respuesta', () => {
    const { host, json } = crearHost();

    filter.catch(new Error('connect ECONNREFUSED 127.0.0.1:5432'), host);

    const cuerpo = JSON.stringify(json.mock.calls[0][0]);
    expect(cuerpo).not.toContain('ECONNREFUSED');
    expect(cuerpo).not.toContain('at ');
  });

  it('devuelve el array de mensajes del ValidationPipe sin anidar el statusCode', () => {
    const { host, json } = crearHost();
    // Esto es exactamente lo que arma el ValidationPipe cuando falla un DTO.
    const excepcion = new BadRequestException({
      statusCode: 400,
      message: ['El email no tiene un formato válido'],
      error: 'Bad Request',
    });

    filter.catch(excepcion, host);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: ['El email no tiene un formato válido'],
      }),
    );
  });

  it('devuelve el string tal cual si getResponse() es un string', () => {
    const { host, json } = crearHost();

    filter.catch(new BadRequestException('Petición inválida'), host);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Petición inválida' }),
    );
  });

  it('cae al message de la excepción si el objeto de respuesta no trae message', () => {
    const { host, json } = crearHost();
    const excepcion = new BadRequestException({
      statusCode: 400,
      error: 'Bad Request',
    });

    filter.catch(excepcion, host);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.any(String) }),
    );
  });

  it('manda el detalle real al log, que es donde sí lo queremos', () => {
    const { host } = crearHost();

    filter.catch(new Error('connect ECONNREFUSED'), host);

    expect(filter['logger'].error).toHaveBeenCalled();
  });
});
