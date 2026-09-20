/** 统一 UTC ISO 时间戳 */
export function nowIso(): string {
  return new Date().toISOString();
}

/** 新建时间戳对 */
export function timestamps(): { created_at: string; updated_at: string } {
  const ts = nowIso();
  return { created_at: ts, updated_at: ts };
}
