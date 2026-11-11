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

export const AI_TASK_IDS = ['cleanup', 'proofread', 'rewrite', 'summarize', 'translate'] as const;

export type AiTaskId = (typeof AI_TASK_IDS)[number];

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

export interface AiSettings {
  providerId: AiProviderId;
  model: string;
  customBaseUrl: string;
  rememberKey: boolean;
  guardrails: AiGuardrails;
  cache: AiCacheSettings;
}

export interface AiRequestOptions {
  settings: AiSettings;
  apiKey: string;
  task: AiTaskId;
  text: string;
  targetLanguage?: string;
  sourceLanguage?: string;
  detectSourceLanguage?: boolean;
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

export const DEFAULT_AI_SETTINGS: AiSettings = {
  providerId: 'openai',
  model: '',
  customBaseUrl: '',
  rememberKey: false,
  guardrails: DEFAULT_AI_GUARDRAILS,
  cache: DEFAULT_AI_CACHE_SETTINGS,
};

export function isAiProviderId(value: string | null | undefined): value is AiProviderId {
  return !!value && (AI_PROVIDER_IDS as readonly string[]).includes(value);
}

export function isAiTaskId(value: string | null | undefined): value is AiTaskId {
  return !!value && (AI_TASK_IDS as readonly string[]).includes(value);
}
