import { randomUUID } from 'node:crypto';
import { nowIso } from '../../utils/time';

export function newId(): string {
  return randomUUID();
}

export function parseJsonArray<T>(raw: string): T[] {
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? (value as T[]) : [];
  } catch {
    return [];
  }
}

export { nowIso };
