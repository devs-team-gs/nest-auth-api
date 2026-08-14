import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Filtro global de excepciones.
 *
 * La regla: **el detalle va al log, el mensaje genérico va al cliente.**
 * Un stack trace en la respuesta le cuenta a cualquiera qué ORM usás, cómo se llaman
 * tus archivos y cómo es tu schema. Vos necesitás esa info; el atacante no.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // 🔑 El detalle real va al LOG (para nosotros), no a la respuesta (para el cliente)
    this.logger.error(
      `${request.method} ${request.url} → ${status}`,
      (exception as Error)?.stack,
    );

    const message =
      exception instanceof HttpException
        ? this.extraerMensaje(exception)
        : 'Error interno del servidor'; // 👈 genérico para los 500

    response.status(status).json({
      statusCode: status,
      path: request.url,
      timestamp: new Date().toISOString(),
      message,
    });
  }

  /**
   * getResponse() devuelve un string o un objeto tipo
   * `{ statusCode, message, error }` (es lo que arma el ValidationPipe con el array
   * de errores). Nos quedamos solo con el `message` para no anidar dos veces el status.
   */
  private extraerMensaje(exception: HttpException): string | string[] {
    const respuesta = exception.getResponse();

    if (typeof respuesta === 'string') return respuesta;

    const { message } = respuesta as { message?: string | string[] };
    return message ?? exception.message;
  }
}
