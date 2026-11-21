import { Body, Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe';
import { AuthService } from './auth.service';
import { CurrentUserInfo, SESSION_COOKIE } from './auth.types';
import { CurrentUser, Public, Roles } from './decorators';

const LoginSchema = z.object({
  email: z.string().trim().email('Geçerli bir e-posta girin').max(254),
  password: z.string().min(1, 'Şifre gerekli').max(200),
});
type LoginDto = z.infer<typeof LoginSchema>;

function publicUser(u: CurrentUserInfo) {
  return { id: u.id, email: u.email, name: u.name, role: u.role };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  // Kaba kuvvete karşı: IP başına dakikada LOGIN_RATE_LIMIT (varsayılan 10) deneme.
  @Throttle({ default: { limit: () => Number(process.env.LOGIN_RATE_LIMIT ?? 10), ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(@Body(new ZodPipe(LoginSchema)) body: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { token, expiresAt, user } = await this.auth.login(body.email, body.password);
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      expires: expiresAt,
    });
    return { user: publicUser(user) };
  }

  @Roles('ADMIN', 'CASHIER', 'WORKER')
  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentUser() user: CurrentUserInfo, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(user.sessionId);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  @Roles('ADMIN', 'CASHIER', 'WORKER')
  @Get('me')
  me(@CurrentUser() user: CurrentUserInfo) {
    return { user: publicUser(user) };
  }
}
