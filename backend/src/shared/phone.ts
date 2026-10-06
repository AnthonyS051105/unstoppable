/** Menyamarkan nomor telepon untuk response & log, mis. "081234567890" -> "0812****7890". */
export function maskPhoneNumber(phone: string): string {
  if (phone.length < 8) return phone;
  const head = phone.slice(0, 4);
  const tail = phone.slice(-4);
  return `${head}****${tail}`;
}
