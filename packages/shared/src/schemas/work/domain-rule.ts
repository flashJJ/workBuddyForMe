/** v2.13 M5：策略域名规则匹配（core 求值与 desktop 导航复核共用，避免两份实现） */
export function matchesDomainRule(rule: string, domain: string): boolean {
  const trimmed = rule.trim().toLowerCase();
  const target = domain.trim().toLowerCase();
  if (!trimmed || !target) return false;
  if (trimmed.startsWith('*.')) {
    const suffix = trimmed.slice(2);
    return target === suffix || target.endsWith(`.${suffix}`);
  }
  return target === trimmed;
}
