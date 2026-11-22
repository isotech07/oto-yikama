import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { IS_PUBLIC_KEY, ROLES_KEY } from '../src/auth/decorators';
import { AuthModule } from '../src/auth/auth.module';

/** Her endpoint'te ya @Public ya da @Roles olmalı. Guard zaten reddeder; bu test unutulanı erken yakalar. */
describe('endpoint yetki denetimi', () => {
  const controllers: Function[] = [
    ...(Reflect.getMetadata('controllers', AppModule) ?? []),
    ...(Reflect.getMetadata('controllers', AuthModule) ?? []),
  ];

  it('controller listesi boş değil', () => expect(controllers.length).toBeGreaterThan(5));

  const routes: { name: string; fn: Function; cls: Function }[] = [];
  for (const cls of controllers) {
    for (const key of Object.getOwnPropertyNames(cls.prototype)) {
      const fn = cls.prototype[key];
      if (key === 'constructor' || typeof fn !== 'function') continue;
      if (Reflect.getMetadata(PATH_METADATA, fn) === undefined || Reflect.getMetadata(METHOD_METADATA, fn) === undefined) continue;
      routes.push({ name: `${cls.name}.${key}`, fn, cls });
    }
  }

  it.each(routes.map((r) => [r.name, r] as const))('%s yetki tanımlı', (_, r) => {
    const isPublic = Reflect.getMetadata(IS_PUBLIC_KEY, r.fn) ?? Reflect.getMetadata(IS_PUBLIC_KEY, r.cls);
    const roles = Reflect.getMetadata(ROLES_KEY, r.fn) ?? Reflect.getMetadata(ROLES_KEY, r.cls);
    expect(isPublic === true || (Array.isArray(roles) && roles.length > 0)).toBe(true);
  });
});
