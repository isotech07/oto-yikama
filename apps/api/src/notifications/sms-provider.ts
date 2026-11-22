import { Logger } from '@nestjs/common';

export interface SmsProvider {
  readonly name: string;
  /** Başarısızlıkta hata fırlatır; mesaj loglanabilir olmalı (telefon/metin içermemeli). */
  send(toPhone: string, body: string): Promise<void>;
}

/** Geliştirme/test: gerçekten göndermez, maskelenmiş log yazar. */
export class LogSmsProvider implements SmsProvider {
  readonly name = 'log';
  private readonly logger = new Logger('SMS');
  async send(toPhone: string, body: string) {
    this.logger.log(`[log sağlayıcı] ${toPhone.slice(0, 3)}****${toPhone.slice(-2)} numarasına ${body.length} karakter`);
  }
}

/**
 * Netgsm HTTP GET API (https://api.netgsm.com.tr/sms/send/get).
 * Başarılı yanıt "00 <görev no>" ile başlar; diğer kodlar hatadır.
 * NOT: Netgsm hesabıyla canlı doğrulanmadı; ilk kullanımda test SMS'i gönderin.
 */
export class NetgsmSmsProvider implements SmsProvider {
  readonly name = 'netgsm';
  constructor(
    private readonly usercode: string,
    private readonly password: string,
    private readonly header: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async send(toPhone: string, body: string) {
    const url = new URL('https://api.netgsm.com.tr/sms/send/get');
    url.searchParams.set('usercode', this.usercode);
    url.searchParams.set('password', this.password);
    url.searchParams.set('gsmno', `90${toPhone}`);
    url.searchParams.set('message', body);
    url.searchParams.set('msgheader', this.header);
    url.searchParams.set('dil', 'TR');
    const res = await this.fetchFn(url, { signal: AbortSignal.timeout(10_000) });
    const text = (await res.text()).trim();
    if (!res.ok) throw new Error(`Netgsm HTTP ${res.status}`);
    if (!/^0[0-2]\s/.test(text) && text !== '00') throw new Error(`Netgsm hata kodu ${text.slice(0, 3)}`);
  }
}

export function createSmsProvider(env = process.env): SmsProvider {
  if (env.SMS_PROVIDER === 'netgsm') {
    const { NETGSM_USERCODE, NETGSM_PASSWORD, NETGSM_HEADER } = env;
    if (!NETGSM_USERCODE || !NETGSM_PASSWORD || !NETGSM_HEADER) {
      throw new Error('SMS_PROVIDER=netgsm için NETGSM_USERCODE, NETGSM_PASSWORD, NETGSM_HEADER gerekli');
    }
    return new NetgsmSmsProvider(NETGSM_USERCODE, NETGSM_PASSWORD, NETGSM_HEADER);
  }
  return new LogSmsProvider();
}

export const SMS_PROVIDER = Symbol('SMS_PROVIDER');
