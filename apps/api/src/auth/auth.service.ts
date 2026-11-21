import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserInfo, SESSION_TTL_MS } from './auth.types';

export const BCRYPT_ROUNDS = 12;
// Kullanıcı bulunamadığında da bcrypt çalışsın diye (zamanlama farkıyla e-posta tespiti engellenir).
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_ROUNDS);

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async login(email: string, password: string): Promise<{ token: string; expiresAt: Date; user: CurrentUserInfo }> {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok || !user.isActive || user.deletedAt) {
      throw new UnauthorizedException('E-posta veya şifre hatalı');
    }
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    const session = await this.prisma.session.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt },
    });
    return {
      token,
      expiresAt,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, sessionId: session.id },
    };
  }

  /** Geçerli oturumu ve aktif kullanıcıyı döndürür; yoksa null. Her istekte DB'den okunur, böylece pasife alınan kullanıcı anında düşer. */
  async resolveSession(token: string): Promise<CurrentUserInfo | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;
    const u = session.user;
    if (!u.isActive || u.deletedAt) return null;
    // lastSeenAt'i en fazla dakikada bir güncelle (her istekte yazma yapmamak için)
    if (Date.now() - session.lastSeenAt.getTime() > 60_000) {
      await this.prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
    }
    return { id: u.id, email: u.email, name: u.name, role: u.role, sessionId: session.id };
  }

  async logout(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
