const TRANSLATION_COOLDOWN_MS = 1500;

let lastTranslationAt = 0;

export function claimTranslationRequest(now = Date.now()): boolean {
  if (now - lastTranslationAt < TRANSLATION_COOLDOWN_MS) {
    return false;
  }
  lastTranslationAt = now;
  return true;
}

export function resetTranslationThrottle(): void {
  lastTranslationAt = 0;
}
