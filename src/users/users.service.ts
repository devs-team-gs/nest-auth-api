import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { JwtPayload } from '../auth/decorators/current-user.decorator';
import { Role } from '../auth/enums/role.enum';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

/**
 * Capa 1 contra la filtración de datos: este `select` se usa en TODAS las queries
 * públicas. El password y el hashedRefreshToken ni siquiera salen de la base de datos.
 * No se puede filtrar algo que nunca trajiste (y encima es más eficiente).
 */
const SELECT_PUBLICO = {
  id: true,
  email: true,
  name: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  private readonly SALT_ROUNDS = 10;

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto) {
    const existe = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });

    if (existe) {
      throw new ConflictException('Ya existe un usuario con ese email'); // 409
    }

    // 🔑 El hasheo vive acá, en el service. El controller no tiene por qué saber
    // CÓMO se guardan las cosas.
    const hashedPassword = await bcrypt.hash(dto.password, this.SALT_ROUNDS);

    return this.prisma.user.create({
      data: { ...dto, password: hashedPassword },
      select: SELECT_PUBLICO,
    });
  }

  findAll() {
    return this.prisma.user.findMany({
      select: SELECT_PUBLICO,
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: SELECT_PUBLICO,
    });

    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  /** Búsqueda normal: NO trae el password. Es la que usa el resto de la app. */
  findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      select: SELECT_PUBLICO,
    });
  }

  /**
   * ⚠️ Este SÍ trae el password: lo necesita el login para comparar con bcrypt.
   * El nombre grita lo que hace justamente para que nadie lo use por accidente.
   */
  findByEmailWithPassword(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  /** Uso interno del flujo de refresh token. */
  findByIdWithRefreshToken(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: { ...SELECT_PUBLICO, hashedRefreshToken: true },
    });
  }

  /** Guarda bcrypt(refresh_token), o null para matar la sesión (logout / reuso). */
  async updateRefreshToken(userId: string, hashedRefreshToken: string | null) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { hashedRefreshToken },
      select: { id: true },
    });
  }

  /**
   * Ownership, solución 2: verificar en el service.
   *
   * Se usa cuando la ruta con :id tiene que existir igual (porque el admin también la
   * usa). Permitido si sos el dueño O si sos ADMIN; 403 en cualquier otro caso.
   */
  async update(id: string, dto: UpdateUserDto, solicitante: JwtPayload) {
    const esElMismo = solicitante.sub === id;
    const esAdmin = (solicitante.role as Role) === Role.ADMIN;

    if (!esElMismo && !esAdmin) {
      throw new ForbiddenException('Solo podés editar tu propio perfil');
    }

    await this.findOne(id); // 404 si no existe

    if (dto.email) {
      const enUso = await this.prisma.user.findUnique({
        where: { email: dto.email },
        select: { id: true },
      });
      if (enUso && enUso.id !== id) {
        throw new ConflictException('Ya existe un usuario con ese email');
      }
    }

    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: SELECT_PUBLICO,
    });
  }

  async remove(id: string) {
    await this.findOne(id); // 404 si no existe

    return this.prisma.user.delete({
      where: { id },
      select: SELECT_PUBLICO,
    });
  }
}
