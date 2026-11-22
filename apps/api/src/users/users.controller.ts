import { BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, NotFoundException, Patch, Post } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { z } from 'zod';
import { BCRYPT_ROUNDS } from '../auth/auth.service';
import type { CurrentUserInfo } from '../auth/auth.types';
import { CurrentUser, Roles } from '../auth/decorators';
import { IdParam } from '../common/params';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';

const password = z.string().min(8, 'Şifre en az 8 karakter olmalı').max(200);
const role = z.enum(['ADMIN', 'CASHIER', 'WORKER']);

const CreateUser = z.object({
  email: z.string().trim().toLowerCase().email('Geçerli bir e-posta girin').max(254),
  name: z.string().trim().min(2).max(120),
  role,
  password,
});
const UpdateUser = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  role: role.optional(),
  isActive: z.boolean().optional(),
  password: password.optional(),
});

const select = { id: true, email: true, name: true, role: true, isActive: true, createdAt: true } as const;

@Controller('users')
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Roles('ADMIN')
  @Get()
  list() {
    return this.prisma.user.findMany({ where: { deletedAt: null }, orderBy: [{ role: 'asc' }, { name: 'asc' }], select });
  }

  /** İş emri ataması için aktif personel listesi. */
  @Roles('ADMIN', 'CASHIER')
  @Get('workers')
  workers() {
    return this.prisma.user.findMany({
      where: { deletedAt: null, isActive: true, role: 'WORKER' },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  }

  @Roles('ADMIN')
  @Post()
  async create(@Body(new ZodPipe(CreateUser)) body: z.infer<typeof CreateUser>) {
    const exists = await this.prisma.user.count({ where: { email: body.email } });
    if (exists) throw new ConflictException('Bu e-posta ile kayıtlı bir kullanıcı var');
    const { password: pw, ...rest } = body;
    return this.prisma.user.create({ data: { ...rest, passwordHash: await bcrypt.hash(pw, BCRYPT_ROUNDS) }, select });
  }

  @Roles('ADMIN')
  @Patch(':id')
  async update(
    @IdParam() id: string,
    @Body(new ZodPipe(UpdateUser)) body: z.infer<typeof UpdateUser>,
    @CurrentUser() me: CurrentUserInfo,
  ) {
    if (Object.keys(body).length === 0) throw new BadRequestException('Değişiklik yok');
    if (id === me.id && ((body.role && body.role !== me.role) || body.isActive === false)) {
      throw new BadRequestException('Kendi rolünüzü değiştiremez veya hesabınızı pasife alamazsınız');
    }
    const { password: pw, ...rest } = body;
    const data = { ...rest, ...(pw ? { passwordHash: await bcrypt.hash(pw, BCRYPT_ROUNDS) } : {}) };
    await this.prisma.$transaction(async (tx) => {
      const r = await tx.user.updateMany({ where: { id, deletedAt: null }, data });
      if (r.count === 0) throw new NotFoundException('Kullanıcı bulunamadı');
      // Şifre, rol veya aktiflik değişirse açık oturumlar kapatılır (kendi oturumu hariç).
      if (pw || body.role || body.isActive === false) {
        await tx.session.updateMany({
          where: { userId: id, revokedAt: null, ...(id === me.id ? { NOT: { id: me.sessionId } } : {}) },
          data: { revokedAt: new Date() },
        });
      }
    });
    return this.prisma.user.findUniqueOrThrow({ where: { id }, select });
  }

  @Roles('ADMIN')
  @Delete(':id')
  @HttpCode(204)
  async remove(@IdParam() id: string, @CurrentUser() me: CurrentUserInfo) {
    if (id === me.id) throw new BadRequestException('Kendi hesabınızı silemezsiniz');
    await this.prisma.$transaction(async (tx) => {
      const r = await tx.user.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date(), isActive: false } });
      if (r.count === 0) throw new NotFoundException('Kullanıcı bulunamadı');
      await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    });
  }
}
