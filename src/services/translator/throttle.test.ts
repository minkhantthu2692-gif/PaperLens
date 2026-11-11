import { afterEach, describe, expect, it } from 'vitest';
import { claimTranslationRequest, resetTranslationThrottle } from './throttle';

afterEach(() => {
  resetTranslationThrottle();
});

describe('translation request throttle', () => {
  it('allows one request per cooldown and reopens after 1.5 seconds', () => {
    expect(claimTranslationRequest(10_000)).toBe(true);
    expect(claimTranslationRequest(11_499)).toBe(false);
    expect(claimTranslationRequest(11_500)).toBe(true);
  });
});
