import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
// `import type` obligatorio: es un tipo usado en una firma decorada, y el proyecto
// compila con isolatedModules + emitDecoratorMetadata.
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { Role } from '../auth/enums/role.enum';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserEntity } from './entities/user.entity';
import { UsersService } from './users.service';
import { Roles } from 'src/auth/decorators/roles.decorator';

/**
 * Todos los endpoints de acá nacen protegidos: el AuthGuard es global y ninguno está
 * marcado con @Public().
 */
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

  @Get()
  @Auth(Role.ADMIN) // 👈 solo el admin lista toda la base de usuarios
  async findAll() {
    const users = await this.usersService.findAll();
    return users.map((user) => new UserEntity(user));
  }

  // ⚠️ /me va declarado ANTES que /:id. Nest evalúa las rutas en orden de declaración:
  // si /:id fuera primero, el ParseUUIDPipe se comería el string "me" y devolvería 400.

  /**
   * Ownership, solución 1 (la mejor): el id sale del token, no de la URL.
   * No hay nada que validar porque no hay nada que el cliente pueda manipular.
   */
  @Get('me')
  async getMe(@CurrentUser('sub') userId: string) {
    return new UserEntity(await this.usersService.findOne(userId));
  }

  @Patch('me')
  async updateMe(@CurrentUser() user: JwtPayload, @Body() dto: UpdateUserDto) {
    return new UserEntity(await this.usersService.update(user.sub, dto, user));
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return new UserEntity(await this.usersService.findOne(id));
  }

  /** Ownership, solución 2: permitido si sos el dueño O si sos ADMIN (se chequea en el service). */
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return new UserEntity(await this.usersService.update(id, dto, user));
  }

  @Delete(':id')
  @Auth(Role.ADMIN)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return new UserEntity(await this.usersService.remove(id));
  }
}
