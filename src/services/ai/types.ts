export const AI_PROVIDER_IDS = [
  'openai',
  'gemini',
  'anthropic',
  'openrouter',
  'groq',
  'deepseek',
  'mistral',
  'xai',
  'together',
  'custom',
] as const;

export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];

export const AI_TASK_IDS = [
  'cleanup',
  'proofread',
  'rewrite',
  'summarize',
  'translate',
  'simplify',
  'academic',
  'academic-tone',
  'keypoints',
  'bullets',
  'explain',
  'custom',
] as const;

export type AiTaskId = (typeof AI_TASK_IDS)[number];

export const AI_TONES = ['academic', 'professional', 'casual'] as const;

export type AiTone = (typeof AI_TONES)[number];

export const AI_OUTPUT_LENGTHS = ['short', 'balanced', 'detailed'] as const;

export type AiOutputLength = (typeof AI_OUTPUT_LENGTHS)[number];

export const AI_TRANSLATION_STYLES = ['natural', 'formal', 'literal'] as const;

export type AiTranslationStyle = (typeof AI_TRANSLATION_STYLES)[number];

export const AI_SOURCE_LANGUAGE_MODES = ['auto', 'manual'] as const;

export type AiSourceLanguageMode = (typeof AI_SOURCE_LANGUAGE_MODES)[number];

/** Tasks that send an image to a vision-capable provider. */
export const AI_IMAGE_TASK_IDS = ['image-analysis', 'image-enhance'] as const;

export type AiImageTaskId = (typeof AI_IMAGE_TASK_IDS)[number];

export type AiRequestTask = AiTaskId | AiImageTaskId;

export interface AiImageInput {
  /** Data URL (`data:image/jpeg;base64,…`) of the image sent to the provider. */
  dataUrl: string;
  mimeType: string;
}

export interface AiGuardrails {
  maxInputChars: number;
  maxOutputTokens: number;
  timeoutMs: number;
  maxRetries: number;
  maxConcurrent: number;
  dailyRequestLimit: number;
  monthlyRequestLimit: number;
  warningThreshold: number;
}

export interface AiCacheSettings {
  enabled: boolean;
  expiryDays: number;
  maxEntries: number;
}

export interface AiPreset {
  id: string;
  name: string;
  instruction: string;
}

/**
 * Defaults for the AI text assistant. These are user preferences, not
 * credentials: they are read by both the assistant and the translator.
 */
export interface AiAssistantPreferences {
  translationTargetLanguage: string;
  sourceLanguageMode: AiSourceLanguageMode;
  sourceLanguage: string;
  translationStyle: AiTranslationStyle;
  tone: AiTone;
  outputLength: AiOutputLength;
  preserveFormatting: boolean;
  contextAwareness: boolean;
  favoriteActions: string[];
  presets: AiPreset[];
  historyEnabled: boolean;
}

export interface AiSettings {
  providerId: AiProviderId;
  model: string;
  customBaseUrl: string;
  rememberKey: boolean;
  guardrails: AiGuardrails;
  cache: AiCacheSettings;
  assistant: AiAssistantPreferences;
}

/** Per-request task modifiers. They never change provider credentials. */
export interface AiTaskOptions {
  tone?: AiTone;
  outputLength?: AiOutputLength;
  preserveFormatting?: boolean;
  contextAwareness?: boolean;
  translationStyle?: AiTranslationStyle;
  customInstruction?: string;
}

export interface AiRequestOptions {
  settings: AiSettings;
  apiKey: string;
  task: AiRequestTask;
  text: string;
  targetLanguage?: string;
  sourceLanguage?: string;
  detectSourceLanguage?: boolean;
  /** Optional task modifiers; they affect both the prompt and the cache key. */
  options?: AiTaskOptions;
  /** Optional image for the image tasks. Image requests are never cached. */
  image?: AiImageInput;
  signal?: AbortSignal;
}

export interface AiResponse {
  text: string;
  providerId: AiProviderId;
  model: string;
  retries: number;
  inputChars: number;
  outputChars: number;
  cached: boolean;
  detectedSourceLanguage?: string;
}

export const DEFAULT_AI_GUARDRAILS: AiGuardrails = {
  maxInputChars: 6000,
  maxOutputTokens: 1024,
  timeoutMs: 30000,
  maxRetries: 1,
  maxConcurrent: 1,
  dailyRequestLimit: 50,
  monthlyRequestLimit: 500,
  warningThreshold: 80,
};

export const DEFAULT_AI_CACHE_SETTINGS: AiCacheSettings = {
  enabled: false,
  expiryDays: 7,
  maxEntries: 50,
};

export const DEFAULT_AI_FAVORITE_ACTIONS = ['proofread', 'rewrite', 'summarize'];

export const DEFAULT_AI_ASSISTANT_PREFERENCES: AiAssistantPreferences = {
  translationTargetLanguage: 'en',
  sourceLanguageMode: 'auto',
  sourceLanguage: 'en',
  translationStyle: 'natural',
  tone: 'professional',
  outputLength: 'balanced',
  preserveFormatting: true,
  contextAwareness: true,
  favoriteActions: [...DEFAULT_AI_FAVORITE_ACTIONS],
  presets: [],
  historyEnabled: false,
};

export const DEFAULT_AI_SETTINGS: AiSettings = {
  providerId: 'openai',
  model: '',
  customBaseUrl: '',
  rememberKey: false,
  guardrails: DEFAULT_AI_GUARDRAILS,
  cache: DEFAULT_AI_CACHE_SETTINGS,
  assistant: DEFAULT_AI_ASSISTANT_PREFERENCES,
};

export function isAiProviderId(value: string | null | undefined): value is AiProviderId {
  return !!value && (AI_PROVIDER_IDS as readonly string[]).includes(value);
}

export function isAiTone(value: unknown): value is AiTone {
  return typeof value === 'string' && (AI_TONES as readonly string[]).includes(value);
}

export function isAiOutputLength(value: unknown): value is AiOutputLength {
  return typeof value === 'string' && (AI_OUTPUT_LENGTHS as readonly string[]).includes(value);
}

export function isAiTranslationStyle(value: unknown): value is AiTranslationStyle {
  return typeof value === 'string' && (AI_TRANSLATION_STYLES as readonly string[]).includes(value);
}

export function isAiSourceLanguageMode(value: unknown): value is AiSourceLanguageMode {
  return (
    typeof value === 'string' && (AI_SOURCE_LANGUAGE_MODES as readonly string[]).includes(value)
  );
}

export function isAiTaskId(value: string | null | undefined): value is AiTaskId {
  return !!value && (AI_TASK_IDS as readonly string[]).includes(value);
}

export function isAiImageTaskId(value: string | null | undefined): value is AiImageTaskId {
  return !!value && (AI_IMAGE_TASK_IDS as readonly string[]).includes(value);
}
