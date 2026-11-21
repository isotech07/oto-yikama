/**
 * Plakayı normalize eder: büyük harf (Türkçe kurallarıyla), boşluk/tire/nokta temizlenmiş.
 * Geçersizse null döner. Ör. "34 abc 123" -> "34ABC123"
 */
export function normalizePlate(input: string): string | null {
  const cleaned = input.toLocaleUpperCase('tr-TR').replace(/[\s\-.]/g, '');
  // Türkçe büyük harf dönüşümü "i" -> "İ" yapar; plakada yalnız ASCII harf geçerlidir.
  const ascii = cleaned.replace(/İ/g, 'I');
  return /^[A-Z0-9]{2,12}$/.test(ascii) ? ascii : null;
}

/** Loglarda kişisel veri yazmamak için plakayı maskeler: "34ABC123" -> "34*****3" */
export function maskPlate(plate: string): string {
  if (plate.length <= 3) return '*'.repeat(plate.length);
  return plate.slice(0, 2) + '*'.repeat(plate.length - 3) + plate.slice(-1);
}
