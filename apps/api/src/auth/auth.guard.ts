import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@prisma/client';
import { AuthService } from './auth.service';
import { AuthedRequest, SESSION_COOKIE } from './auth.types';
import { IS_PUBLIC_KEY, ROLES_KEY } from './decorators';

/**
 * Global guard: kimlik doğrulama + rol yetkisi.
 * - @Public() yoksa geçerli oturum zorunlu (401).
 * - @Roles(...) yoksa istek reddedilir (403) — yetki tanımı unutulan endpoint açık kalmaz.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    const user = typeof token === 'string' && token ? await this.auth.resolveSession(token) : null;
    if (!user) throw new UnauthorizedException('Oturum açmanız gerekiyor');
    req.user = user;

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    if (!roles || roles.length === 0) throw new ForbiddenException('Bu işlem için yetkiniz yok');
    if (!roles.includes(user.role)) throw new ForbiddenException('Bu işlem için yetkiniz yok');
    return true;
  }
}
