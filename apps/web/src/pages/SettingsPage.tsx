import { type FormEvent, useEffect, useState } from 'react';
import { Alert, Button, Card, Input, Loading, PageHeader } from '../components/ui';
import { api, type Settings } from '../lib/api';
import { useAsync } from '../lib/useAsync';

export function SettingsPage() {
  const { data, error, loading } = useAsync(() => api.settings.get(), []);
  const [form, setForm] = useState<Settings | null>(null);
  const [msg, setMsg] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => setForm(data), [data]);

  if (loading || !form) return error ? <Alert>{error}</Alert> : <Loading />;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setForm({ ...form, [k]: v });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      setForm(await api.settings.update(form!));
      setMsg({ tone: 'info', text: 'Kaydedildi' });
    } catch (err) {
      setMsg({ tone: 'error', text: err instanceof Error ? err.message : 'Kaydedilemedi' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Ayarlar" />
      <form onSubmit={submit} className="grid max-w-4xl gap-4 lg:grid-cols-2">
        <Card title="İşletme bilgileri (fişte görünür)">
          <div className="space-y-3">
            <Input label="İşletme adı" value={form.name} onChange={(e) => set('name', e.target.value)} required />
            <Input label="Adres" value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} />
            <Input label="Telefon" value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Vergi dairesi" value={form.taxOffice ?? ''} onChange={(e) => set('taxOffice', e.target.value)} />
              <Input label="VKN / TCKN" inputMode="numeric" value={form.taxNumber ?? ''} onChange={(e) => set('taxNumber', e.target.value)} />
            </div>
            <Input label="Fiş alt notu" value={form.receiptFooter ?? ''} onChange={(e) => set('receiptFooter', e.target.value)} placeholder="Bizi tercih ettiğiniz için teşekkürler" />
          </div>
        </Card>
        <Card title="SMS bildirimi">
          <div className="space-y-3">
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={form.smsEnabled} onChange={(e) => set('smsEnabled', e.target.checked)} />
              <span>
                Araç <b>Hazır</b> olunca müşteriye SMS gönder
                <span className="block text-xs text-slate-500">Yalnız SMS izni verilmiş ve telefonu kayıtlı müşterilere gider.</span>
              </span>
            </label>
            <Input
              label="Mesaj şablonu"
              value={form.smsReadyTemplate}
              onChange={(e) => set('smsReadyTemplate', e.target.value)}
              hint="Kullanılabilir: {musteri} {plaka} {isletme}"
            />
            <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
              Önizleme: {form.smsReadyTemplate.replace('{musteri}', 'Ayşe Yılmaz').replace('{plaka}', '34ABC123').replace('{isletme}', form.name)}
            </p>
          </div>
        </Card>
        <div className="lg:col-span-2 flex items-center gap-3">
          <Button type="submit" busy={saving}>
            Kaydet
          </Button>
          {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        </div>
      </form>
    </>
  );
}
