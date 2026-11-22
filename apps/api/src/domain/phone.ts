/**
 * Türkiye cep/sabit telefonunu 10 haneye normalize eder: "0532 123 45 67" / "+90 532..." -> "5321234567".
 * Geçersizse null.
 */
export function normalizePhone(input: string): string | null {
  let d = input.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('90')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[2-5]\d{9}$/.test(d) ? d : null;
}

/** "5321234567" -> "0532 123 45 67" */
export function formatPhone(p: string): string {
  return `0${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6, 8)} ${p.slice(8)}`;
}
