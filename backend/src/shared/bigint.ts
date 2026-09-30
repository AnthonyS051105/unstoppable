// PathNode.id / PathEdge.id bertipe BigInt (syarat pgRouting — docs/DATA_MODEL.md
// Keputusan B). JSON.stringify(BigInt) melempar TypeError, jadi apa pun yang
// mungkin mengandung BigInt (langsung atau bersarang di objek/array) harus lewat
// serializeBigInt() dulu sebelum res.json(). Hasilnya BigInt -> string.
export function serializeBigInt<T>(value: T): T {
  if (typeof value === "bigint") {
    return value.toString() as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => serializeBigInt(item)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = serializeBigInt(val);
    }
    return result as T;
  }
  return value;
}
