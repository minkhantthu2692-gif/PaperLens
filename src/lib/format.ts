export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

export function formatDate(timestamp: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp));
}

export function countWords(text: string): number {
  const normalized = text.trim();
  if (!normalized) {
    return 0;
  }
  return normalized.split(/\s+/u).length;
}

const LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

export function normalizeLinkHref(raw: string): string | null {
  const value = raw.trim();
  if (!value || /\s/u.test(value)) {
    return null;
  }
  const hasScheme = /^[a-z][a-z0-9+.-]*:/iu.test(value);
  const candidate = hasScheme ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    if (!LINK_PROTOCOLS.has(url.protocol.toLowerCase())) {
      return null;
    }
    if ((url.protocol === 'http:' || url.protocol === 'https:') && !url.hostname) {
      return null;
    }
    if ((url.protocol === 'mailto:' || url.protocol === 'tel:') && url.pathname.length === 0) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}
