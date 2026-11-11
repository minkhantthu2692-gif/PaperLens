import { describe, expect, it } from 'vitest';
import { normalizeLinkHref } from './format';

describe('normalizeLinkHref', () => {
  it('keeps supported absolute links', () => {
    expect(normalizeLinkHref('https://example.com/path')).toBe('https://example.com/path');
    expect(normalizeLinkHref('http://example.com')).toBe('http://example.com/');
    expect(normalizeLinkHref('mailto:hello@example.com')).toBe('mailto:hello@example.com');
    expect(normalizeLinkHref('tel:+15551234567')).toBe('tel:+15551234567');
  });

  it('adds https to bare domains', () => {
    expect(normalizeLinkHref('  example.com/path  ')).toBe('https://example.com/path');
  });

  it('rejects unsafe or invalid values', () => {
    expect(normalizeLinkHref('')).toBeNull();
    expect(normalizeLinkHref('javascript:alert(1)')).toBeNull();
    expect(normalizeLinkHref('data:text/html,hi')).toBeNull();
    expect(normalizeLinkHref('ftp://example.com')).toBeNull();
    expect(normalizeLinkHref('not a link')).toBeNull();
  });
});
