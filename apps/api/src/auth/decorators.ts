import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Role } from '@prisma/client';
import type { AuthedRequest, CurrentUserInfo } from './auth.types';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';

/** Oturum gerektirmeyen endpoint (ör. giriş). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Endpoint'e erişebilecek roller. Public olmayan HER endpoint'te zorunludur;
 * unutulursa RolesGuard isteği 403 ile reddeder (varsayılan: reddet).
 */
export const Roles = (...roles: [Role, ...Role[]]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): CurrentUserInfo => ctx.switchToHttp().getRequest<AuthedRequest>().user!,
);
