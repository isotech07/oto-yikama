import { useEffect, useState } from 'react';

/** İnternet kopunca üstte uyarı: işlemler sunucuya ulaşmaz, tahsilat kaydedilmez. */
export function OfflineBanner() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  if (online) return null;
  return (
    <div role="alert" className="sticky top-0 z-50 bg-red-600 px-4 py-2 text-center text-sm font-medium text-white print:hidden">
      İnternet bağlantısı yok — işlemler ve tahsilatlar kaydedilmez. Bağlantı gelince sayfayı yenileyin.
    </div>
  );
}
