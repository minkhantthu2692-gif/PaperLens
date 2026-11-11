import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_AI_GUARDRAILS } from './types';
import {
  estimateTokens,
  getAiAllowance,
  getAiUsageSummary,
  recordAiUsage,
  resetAiUsage,
} from './usage';

beforeEach(() => {
  localStorage.clear();
});

describe('AI usage guardrails', () => {
  it('estimates tokens from characters', () => {
    expect(estimateTokens(0)).toBe(0);
    expect(estimateTokens(1)).toBe(1);
    expect(estimateTokens(8)).toBe(2);
  });

  it('records today and month usage', () => {
    recordAiUsage(40, 20);
    recordAiUsage(40, 20);

    const summary = getAiUsageSummary();
    expect(summary.todayRequests).toBe(2);
    expect(summary.monthRequests).toBe(2);
    expect(summary.todayTokens).toBe(30);
  });

  it('does not block when limits are disabled', () => {
    recordAiUsage(10, 10);
    const allowance = getAiAllowance({
      ...DEFAULT_AI_GUARDRAILS,
      dailyRequestLimit: 0,
      monthlyRequestLimit: 0,
    });
    expect(allowance.blocked).toBeUndefined();
  });

  it('blocks when the daily request limit is reached', () => {
    recordAiUsage(10, 10);
    recordAiUsage(10, 10);
    const allowance = getAiAllowance({
      ...DEFAULT_AI_GUARDRAILS,
      dailyRequestLimit: 2,
      monthlyRequestLimit: 10,
    });
    expect(allowance.blocked).toBe('daily-limit');
  });

  it('warns before the daily limit is reached', () => {
    recordAiUsage(10, 10);
    const allowance = getAiAllowance({
      ...DEFAULT_AI_GUARDRAILS,
      dailyRequestLimit: 2,
      monthlyRequestLimit: 10,
      warningThreshold: 50,
    });
    expect(allowance.warning).toBe('daily');
    expect(allowance.blocked).toBeUndefined();
  });

  it('resets usage counters', () => {
    recordAiUsage(10, 10);
    resetAiUsage();
    expect(getAiUsageSummary().todayRequests).toBe(0);
  });
});
