import {
  DEFAULT_REFINEMENT_PARAMS,
  normalizeRefinementParams,
  type AiImageReport,
  type ImageIssueCode,
  type IssueSeverity,
  type RefinementParams,
  type RefinementPresetId,
} from '@/domain/refinement';
import { getPresetParams } from '@/services/image/presets';
import { AiError, requestAi } from './client';
import type { AiImageInput, AiSettings } from './types';

export type AiImageMode = 'analysis' | 'enhancement';

const ISSUE_CODES: ReadonlySet<string> = new Set<ImageIssueCode>([
  'low-light',
  'over-exposed',
  'low-contrast',
  'blur',
  'noise',
  'skew',
  'uneven-lighting',
  'faint-text',
  'curvature',
  'perspective',
  'handwriting',
  'difficult-regions',
]);

const SEVERITIES: ReadonlySet<string> = new Set<IssueSeverity>(['low', 'medium', 'high']);

const PRESETS: ReadonlySet<string> = new Set<RefinementPresetId>([
  'document',
  'handwriting',
  'old-scan',
  'camera',
  'low-contrast',
]);

const BOOLEAN_KEYS = ['autoEnhance', 'deskew', 'grayscale', 'shadowRemoval', 'dewarp'] as const;

const NUMBER_RANGES: Record<string, [number, number]> = {
  rotation: [-180, 180],
  denoise: [0, 100],
  brightness: [-100, 100],
  contrast: [-100, 100],
  threshold: [0, 100],
  sharpen: [0, 100],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stripCodeFences(value: string): string {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const cleaned = stripCodeFences(raw);
  const candidates = [cleaned];
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(cleaned.slice(firstBrace, lastBrace + 1));
  }
  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (isRecord(parsed)) {
        return parsed;
      }
    } catch {
      // Try the next candidate shape.
    }
  }
  throw new AiError('invalid-response');
}

function parseIssues(value: unknown): AiImageReport['issues'] {
  if (!Array.isArray(value)) {
    return [];
  }
  const issues: AiImageReport['issues'] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }
    const code = entry['code'];
    const severity = entry['severity'];
    if (typeof code !== 'string' || !ISSUE_CODES.has(code) || seen.has(code)) {
      continue;
    }
    seen.add(code);
    const detail = entry['detail'];
    issues.push({
      code: code as ImageIssueCode,
      severity:
        typeof severity === 'string' && SEVERITIES.has(severity)
          ? (severity as IssueSeverity)
          : 'medium',
      ...(typeof detail === 'string' && detail.trim()
        ? { detail: detail.trim().slice(0, 200) }
        : {}),
    });
    if (issues.length >= 8) {
      break;
    }
  }
  return issues;
}

function parseRecommendations(value: unknown): Partial<RefinementParams> {
  if (!isRecord(value)) {
    return {};
  }
  const recommendations: Partial<RefinementParams> = {};
  for (const key of BOOLEAN_KEYS) {
    const entry = value[key];
    if (typeof entry === 'boolean') {
      recommendations[key] = entry;
    }
  }
  if (value['binarize'] === 'adaptive' || value['binarize'] === 'none') {
    recommendations.binarize = value['binarize'];
  }
  for (const [key, [min, max]] of Object.entries(NUMBER_RANGES)) {
    const entry = value[key];
    if (typeof entry === 'number' && Number.isFinite(entry)) {
      recommendations[key as keyof RefinementParams] = Math.min(
        max,
        Math.max(min, Math.round(entry)),
      ) as never;
    }
  }
  return recommendations;
}

/** Validates and normalizes an AI report. Untrusted provider output is never trusted. */
export function parseAiImageReport(raw: string): AiImageReport {
  const parsed = parseJsonObject(raw);
  const summary = parsed['summary'];
  const recommendedPreset = parsed['recommendedPreset'];
  return {
    summary: typeof summary === 'string' ? summary.trim().slice(0, 600) : '',
    issues: parseIssues(parsed['issues']),
    recommendedPreset:
      typeof recommendedPreset === 'string' && PRESETS.has(recommendedPreset)
        ? (recommendedPreset as RefinementPresetId)
        : null,
    recommendations: parseRecommendations(parsed['recommendations']),
  };
}

export interface AiImageRefinementRequest {
  settings: AiSettings;
  apiKey: string;
  image: AiImageInput;
  mode: AiImageMode;
  signal?: AbortSignal;
}

/**
 * Sends the selected image to the configured provider for analysis or
 * enhancement guidance. The provider returns a structured report; the pixels
 * themselves are only ever changed by the local pipeline.
 */
export async function requestAiImageRefinement(
  request: AiImageRefinementRequest,
): Promise<AiImageReport> {
  const { settings, apiKey, image, mode, signal } = request;
  const response = await requestAi({
    settings,
    apiKey,
    task: mode === 'analysis' ? 'image-analysis' : 'image-enhance',
    text:
      mode === 'analysis'
        ? 'Analyze the quality of the attached document image and recommend local refinement settings.'
        : 'Recommend stronger local refinement settings for the attached document image.',
    image,
    ...(signal ? { signal } : {}),
  });
  return parseAiImageReport(response.text);
}

/**
 * Combines the AI recommendations with a local baseline. Perspective corners
 * are never taken from the provider because it cannot know the user's crop.
 */
export function mergeAiRefinementParams(
  base: RefinementParams,
  report: AiImageReport,
): RefinementParams {
  const baseline = report.recommendedPreset
    ? getPresetParams(report.recommendedPreset)
    : { ...DEFAULT_REFINEMENT_PARAMS, ...base };
  const merged = normalizeRefinementParams({ ...baseline, ...report.recommendations });
  return { ...merged, perspective: base.perspective };
}
