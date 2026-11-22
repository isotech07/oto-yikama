import type { INestApplication } from '@nestjs/common';
import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Tek servisli kurulum (ör. Render): WEB_DIST_DIR verilirse API, derlenmiş web arayüzünü de sunar.
 * /api dışındaki GET istekleri dosyaya, yoksa index.html'e (SPA) yönlenir.
 */
export function serveWeb(app: INestApplication, dir = process.env.WEB_DIST_DIR) {
  if (!dir) return;
  const root = resolve(dir);
  const indexHtml = join(root, 'index.html');
  if (!existsSync(indexHtml)) throw new Error(`WEB_DIST_DIR geçersiz: ${root}/index.html yok`);

  const noCache = new Set(['/sw.js', '/index.html', '/manifest.webmanifest', '/registerSW.js']);
  app.use(
    express.static(root, {
      index: false,
      setHeaders: (res, path) => {
        const rel = '/' + path.slice(root.length + 1).replace(/\\/g, '/');
        if (rel.startsWith('/assets/')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        else if (noCache.has(rel)) res.setHeader('Cache-Control', 'no-cache');
      },
    }),
  );
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexHtml);
  });
}

/** Güvenlik başlıkları (Caddy'nin yaptığını tek servisli kurulumda API yapar). */
export function securityHeaders(app: INestApplication) {
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    next();
  });
}
