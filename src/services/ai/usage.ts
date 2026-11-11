import type { AiGuardrails } from './types';

const USAGE_STORAGE_KEY = 'paperlens.ai.usage';
const MAX_DAYS = 70;

interface UsageBucket {
  requests: number;
  inputChars: number;
  outputChars: number;
}

interface UsageState {
  days: Record<string, UsageBucket>;
}

export interface AiUsageSummary {
  todayRequests: number;
  monthRequests: number;
  todayTokens: number;
  monthTokens: number;
}

export type AiUsageBlockReason = 'daily-limit' | 'monthly-limit';
export type AiUsageWarning = 'daily' | 'monthly';

export interface AiAllowance {
  blocked?: AiUsageBlockReason;
  warning?: AiUsageWarning;
  summary: AiUsageSummary;
}

export function estimateTokens(characters: number): number {
  if (!Number.isFinite(characters) || characters <= 0) {
    return 0;
  }
  return Math.ceil(characters / 4);
}

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function monthPrefix(date: Date): string {
  return dateKey(date).slice(0, 7);
}

function emptyBucket(): UsageBucket {
  return { requests: 0, inputChars: 0, outputChars: 0 };
}

function isBucket(value: unknown): value is UsageBucket {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record['requests'] === 'number' &&
    typeof record['inputChars'] === 'number' &&
    typeof record['outputChars'] === 'number'
  );
}

function readUsage(): UsageState {
  try {
    const raw = localStorage.getItem(USAGE_STORAGE_KEY);
    if (!raw) {
      return { days: {} };
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return { days: {} };
    }
    const days = (parsed as Record<string, unknown>)['days'];
    if (typeof days !== 'object' || days === null) {
      return { days: {} };
    }
    const valid: Record<string, UsageBucket> = {};
    for (const [key, value] of Object.entries(days)) {
      if (isBucket(value)) {
        valid[key] = value;
      }
    }
    return { days: valid };
  } catch {
    return { days: {} };
  }
}

function writeUsage(state: UsageState): void {
  try {
    localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Usage tracking still applies for this session when storage is unavailable.
  }
}

function prune(state: UsageState, now: Date): UsageState {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - MAX_DAYS);
  const cutoffKey = dateKey(cutoff);
  const days: Record<string, UsageBucket> = {};
  for (const [key, value] of Object.entries(state.days)) {
    if (key >= cutoffKey) {
      days[key] = value;
    }
  }
  return { days };
}

export function recordAiUsage(inputChars: number, outputChars: number): void {
  const now = new Date();
  const state = prune(readUsage(), now);
  const key = dateKey(now);
  const bucket = state.days[key] ?? emptyBucket();
  state.days[key] = {
    requests: bucket.requests + 1,
    inputChars: bucket.inputChars + Math.max(0, Math.round(inputChars)),
    outputChars: bucket.outputChars + Math.max(0, Math.round(outputChars)),
  };
  writeUsage(state);
}

export function getAiUsageSummary(now = new Date()): AiUsageSummary {
  const state = readUsage();
  const today = state.days[dateKey(now)] ?? emptyBucket();
  const prefix = monthPrefix(now);
  let monthRequests = 0;
  let monthInputChars = 0;
  let monthOutputChars = 0;

  for (const [key, bucket] of Object.entries(state.days)) {
    if (key.startsWith(prefix)) {
      monthRequests += bucket.requests;
      monthInputChars += bucket.inputChars;
      monthOutputChars += bucket.outputChars;
    }
  }

  return {
    todayRequests: today.requests,
    monthRequests,
    todayTokens: estimateTokens(today.inputChars) + estimateTokens(today.outputChars),
    monthTokens: estimateTokens(monthInputChars) + estimateTokens(monthOutputChars),
  };
}

function isWarning(count: number, limit: number, threshold: number): boolean {
  if (limit <= 0) {
    return false;
  }
  return count >= Math.ceil((limit * threshold) / 100) && count < limit;
}

export function getAiAllowance(guardrails: AiGuardrails, now = new Date()): AiAllowance {
  const summary = getAiUsageSummary(now);
  const { dailyRequestLimit, monthlyRequestLimit, warningThreshold } = guardrails;

  if (dailyRequestLimit > 0 && summary.todayRequests >= dailyRequestLimit) {
    return { blocked: 'daily-limit', summary };
  }
  if (monthlyRequestLimit > 0 && summary.monthRequests >= monthlyRequestLimit) {
    return { blocked: 'monthly-limit', summary };
  }

  if (isWarning(summary.todayRequests, dailyRequestLimit, warningThreshold)) {
    return { warning: 'daily', summary };
  }
  if (isWarning(summary.monthRequests, monthlyRequestLimit, warningThreshold)) {
    return { warning: 'monthly', summary };
  }

  return { summary };
}

export function resetAiUsage(): void {
  try {
    localStorage.removeItem(USAGE_STORAGE_KEY);
  } catch {
    // Nothing else to do when storage is unavailable.
  }
}
