import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { loadEnv } from 'vite';

/**
 * Test veritabanına bekleyen migration'ları uygular (yıkıcı değil).
 * Testler veri silmez; her test benzersiz e-posta/plaka üretir.
 */
export default function setup() {
  const root = resolve(__dirname, '..');
  const env = { ...process.env, ...loadEnv('test', root, '') };
  if (!env.DATABASE_URL?.includes('_test')) {
    throw new Error('Testler yalnızca adı _test içeren veritabanında çalışır');
  }
  execSync('npx prisma migrate deploy', { cwd: root, env, stdio: 'pipe' });
}
