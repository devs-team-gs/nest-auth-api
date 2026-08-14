import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtPayload } from '../auth/decorators/current-user.decorator';
import { Role } from '../auth/enums/role.enum';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';

/** El autor se incluye, pero solo con los campos que es seguro mostrar. */
const INCLUDE_AUTOR = {
  author: { select: { id: true, name: true, email: true } },
} as const;

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreatePostDto, autorId: string) {
    return this.prisma.post.create({
      data: { ...dto, authorId: autorId },
      include: INCLUDE_AUTOR,
    });
  }

  findAll() {
    return this.prisma.post.findMany({
      include: INCLUDE_AUTOR,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: INCLUDE_AUTOR,
    });

    if (!post) throw new NotFoundException('Post no encontrado');
    return post;
  }

  async update(id: string, dto: UpdatePostDto, solicitante: JwtPayload) {
    await this.verificarOwnership(id, solicitante);

    return this.prisma.post.update({
      where: { id },
      data: dto,
      include: INCLUDE_AUTOR,
    });
  }

  async remove(id: string, solicitante: JwtPayload) {
    await this.verificarOwnership(id, solicitante);

    return this.prisma.post.delete({
      where: { id },
      include: INCLUDE_AUTOR,
    });
  }

  /**
   * Ownership sobre un recurso que NO es el propio usuario.
   *
   * Acá los roles no alcanzan: "¿puede editar ESTE post?" depende de si lo escribió él,
   * o sea del recurso concreto. Y el chequeo va en el service (y no en un guard) porque
   * necesita consultar la base para saber quién es el dueño — y el service la va a
   * consultar igual.
   *
   * 🔑 Sin esto, tenés un IDOR: cambiás el id de la URL y editás el post de cualquiera.
   */
  private async verificarOwnership(id: string, solicitante: JwtPayload) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      select: { authorId: true },
    });

    if (!post) throw new NotFoundException('Post no encontrado');

    const esElDueño = post.authorId === solicitante.sub;
    const esAdmin = (solicitante.role as Role) === Role.ADMIN;

    if (!esElDueño && !esAdmin) {
      throw new ForbiddenException('Solo podés modificar tus propios posts');
    }
  }
}
