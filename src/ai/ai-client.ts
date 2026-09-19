// ─── AI Client Layer for LeetCode Complexity & Approach Analysis ───────────
// Multi-provider client supporting Gemini, Groq, OpenAI, Anthropic, OpenRouter, and Custom endpoints.
// All requests are direct client-side HTTPS calls with auto-model discovery, fallback, and strict timeouts.

import type { AIProvider, AIAnalysisResult } from "@/types/settings";
import { logger } from "@/utils/logger";

export interface AnalyzeComplexityParams {
  provider: AIProvider;
  apiKey: string;
  model?: string;
  customEndpoint?: string;
  title: string;
  language: string;
  code: string;
}

export interface TestAiConnectionParams {
  provider: AIProvider;
  apiKey: string;
  model?: string;
  customEndpoint?: string;
}

export const DEFAULT_AI_MODELS: Record<AIProvider, string> = {
  gemini: "gemini-2.0-flash",
  groq: "llama-3.3-70b-versatile",
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-haiku-latest",
  openrouter: "openrouter/auto",
  custom: "default",
};

const SYSTEM_PROMPT = `You are an expert algorithms and data structures analyzer. 
Analyze the provided LeetCode solution code and provide:
1. "approach": A concise 1-2 sentence summary of the algorithmic approach and core intuition.
2. "timeComplexity": Big-O notation for Time Complexity (e.g., "O(N)", "O(N log N)", "O(V + E)").
3. "timeReason": A concise 1-sentence mathematical explanation for the time complexity.
4. "spaceComplexity": Big-O notation for Auxiliary Space Complexity (e.g., "O(1)", "O(N)"). Count auxiliary/extra space and recursion stack separately from return value memory.
5. "spaceReason": A concise 1-sentence mathematical explanation for the space complexity.

Respond ONLY with a valid JSON object matching this exact schema:
{
  "approach": "string",
  "timeComplexity": "string",
  "timeReason": "string",
  "spaceComplexity": "string",
  "spaceReason": "string"
}`;

// ── Memory Caches ────────────────────────────────────────────────────────────

const cachedProviderModels: Partial<Record<AIProvider, string[]>> = {};
const cachedWorkingModels: Partial<Record<AIProvider, string>> = {};

/**
 * Fallback static model lists if network listing is unavailable.
 */
export function getDefaultModelsForProvider(provider: AIProvider): string[] {
  switch (provider) {
    case "gemini":
      return [
        "gemini-2.0-flash",
        "gemini-1.5-flash-latest",
        "gemini-1.5-flash-002",
        "gemini-1.5-flash-001",
        "gemini-1.5-flash",
        "gemini-2.5-flash",
        "gemini-1.5-pro",
      ];
    case "groq":
      return [
        "llama-3.3-70b-versatile",
        "llama-3.1-8b-instant",
        "llama-3.1-70b-versatile",
        "mixtral-8x7b-32768",
        "gemma2-9b-it",
        "llama3-70b-8192",
        "llama3-8b-8192",
      ];
    case "openai":
      return ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"];
    case "anthropic":
      return [
        "claude-3-5-haiku-latest",
        "claude-3-5-sonnet-latest",
        "claude-3-haiku-20240307",
        "claude-3-5-sonnet-20241022",
        "claude-3-opus-20240229",
      ];
    case "openrouter":
      return [
        "openrouter/auto",
        "meta-llama/llama-3.3-70b-instruct:free",
        "google/gemini-2.0-flash-exp:free",
        "deepseek/deepseek-chat",
        "meta-llama/llama-3.1-8b-instruct:free",
        "mistralai/mistral-7b-instruct:free",
      ];
    case "custom":
      return ["default"];
  }
}

/**
 * Dynamically fetch the available text/chat models for an API key directly from the provider.
 */
export async function fetchAvailableModels(
  provider: AIProvider,
  apiKey: string,
  customEndpoint?: string
): Promise<string[]> {
  const cleanKey = (apiKey || "").trim();

  if (!cleanKey && provider !== "custom") {
    return getDefaultModelsForProvider(provider);
  }

  try {
    switch (provider) {
      case "gemini": {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(cleanKey)}`;
        const res = await fetch(url, {
          headers: { "x-goog-api-key": cleanKey },
        });
        if (!res.ok) throw new Error(`Gemini models API returned HTTP ${res.status}`);
        const data = (await res.json()) as {
          models?: Array<{ name: string; supportedGenerationMethods?: string[] }>;
        };
        if (Array.isArray(data.models)) {
          const textModels = data.models
            .filter((m) => {
              const name = (m.name || "").toLowerCase();
              const isGen = m.supportedGenerationMethods?.includes("generateContent");
              const isNonText =
                name.includes("tts") ||
                name.includes("audio") ||
                name.includes("embed") ||
                name.includes("imagen") ||
                name.includes("aqa") ||
                name.includes("robotics");
              return isGen && !isNonText;
            })
            .map((m) => m.name.replace(/^models\//, ""));

          if (textModels.length > 0) {
            textModels.sort((a, b) => {
              const aFlash = a.includes("flash") ? -1 : 1;
              const bFlash = b.includes("flash") ? -1 : 1;
              return aFlash - bFlash;
            });
            cachedProviderModels.gemini = textModels;
            return textModels;
          }
        }
        break;
      }

      case "groq": {
        const res = await fetch("https://api.groq.com/openai/v1/models", {
          headers: {
            Authorization: `Bearer ${cleanKey}`,
          },
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          const errMsg = (errBody as { error?: { message?: string } })?.error?.message;
          throw new Error(errMsg || `Groq returned HTTP ${res.status}`);
        }
        const data = (await res.json()) as { data?: Array<{ id: string; active?: boolean }> };
        if (Array.isArray(data.data)) {
          const groqModels = data.data
            .map((m) => m.id)
            .filter((id) => {
              const lower = id.toLowerCase();
              return (
                !lower.includes("whisper") &&
                !lower.includes("guard") &&
                !lower.includes("safeguard") &&
                !lower.includes("vision") &&
                !lower.includes("embed")
              );
            });

          if (groqModels.length > 0) {
            groqModels.sort((a, b) => {
              const getPriority = (name: string) => {
                const n = name.toLowerCase();
                if (n.includes("llama-3.3-70b")) return 1;
                if (n.includes("llama-3.1-8b-instant")) return 2;
                if (n.includes("llama-3.1-70b")) return 3;
                if (n.includes("mixtral-8x7b")) return 4;
                if (n.includes("gemma2-9b")) return 5;
                if (n.includes("llama3-70b")) return 6;
                if (n.includes("llama3-8b")) return 7;
                return 10;
              };
              return getPriority(a) - getPriority(b);
            });
            cachedProviderModels.groq = groqModels;
            return groqModels;
          }
        }
        break;
      }

      case "openai": {
        const res = await fetch("https://api.openai.com/v1/models", {
          headers: {
            Authorization: `Bearer ${cleanKey}`,
          },
        });
        if (!res.ok) throw new Error(`OpenAI returned HTTP ${res.status}`);
        const data = (await res.json()) as { data?: Array<{ id: string }> };
        if (Array.isArray(data.data)) {
          const gptModels = data.data
            .map((m) => m.id)
            .filter((id) => {
              const lower = id.toLowerCase();
              return (
                (lower.startsWith("gpt-") || lower.startsWith("o1") || lower.startsWith("o3")) &&
                !lower.includes("realtime") &&
                !lower.includes("audio") &&
                !lower.includes("tts") &&
                !lower.includes("transcription") &&
                !lower.includes("dall-e") &&
                !lower.includes("embedding") &&
                !lower.includes("instruct") &&
                !lower.includes("search")
              );
            });

          if (gptModels.length > 0) {
            gptModels.sort((a, b) => {
              const getPriority = (name: string) => {
                const n = name.toLowerCase();
                if (n.startsWith("gpt-4o-mini")) return 1;
                if (n.startsWith("gpt-4o")) return 2;
                if (n.startsWith("gpt-4.1")) return 3;
                if (n.startsWith("gpt-3.5-turbo")) return 4;
                return 10;
              };
              return getPriority(a) - getPriority(b);
            });
            cachedProviderModels.openai = gptModels;
            return gptModels;
          }
        }
        break;
      }

      case "openrouter": {
        const res = await fetch("https://openrouter.ai/api/v1/models", {
          headers: {
            Authorization: `Bearer ${cleanKey}`,
            "HTTP-Referer": "https://github.com/Abhishek-Singh-2008/legit-extension",
            "X-Title": "Legit - LeetCode Sync",
          },
        });
        if (!res.ok) throw new Error(`OpenRouter returned HTTP ${res.status}`);
        const data = (await res.json()) as { data?: Array<{ id: string }> };
        if (Array.isArray(data.data)) {
          const models = data.data
            .map((m) => m.id)
            .filter((id) => {
              const lower = id.toLowerCase();
              return (
                !lower.includes("whisper") &&
                !lower.includes("embed") &&
                !lower.includes("image") &&
                !lower.includes("tts")
              );
            });
          if (models.length > 0) {
            models.sort((a, b) => {
              if (a === "openrouter/auto") return -1;
              if (b === "openrouter/auto") return 1;
              const aFree = a.includes(":free") ? -1 : 1;
              const bFree = b.includes(":free") ? -1 : 1;
              return aFree - bFree;
            });
            const allModels = Array.from(new Set(["openrouter/auto", ...models]));
            cachedProviderModels.openrouter = allModels;
            return allModels.slice(0, 35);
          }
        }
        break;
      }

      case "anthropic": {
        return getDefaultModelsForProvider("anthropic");
      }

      case "custom": {
        if (customEndpoint) {
          try {
            const modelsUrl = customEndpoint
              .replace(/\/chat\/completions\/?$/, "/models")
              .replace(/\/generate\/?$/, "/models");
            const res = await fetch(modelsUrl, {
              headers: cleanKey ? { Authorization: `Bearer ${cleanKey}` } : {},
            });
            if (res.ok) {
              const data = await res.json();
              if (Array.isArray(data.data)) {
                return data.data.map((m: { id: string }) => m.id);
              } else if (Array.isArray(data.models)) {
                return data.models.map((m: { name?: string; model?: string }) => m.name || m.model || String(m));
              }
            }
          } catch {
            // fallback to default
          }
        }
        return ["default"];
      }
    }
  } catch (err) {
    logger.warn(`[AIClient] fetchAvailableModels failed for ${provider}:`, err);
  }

  return getDefaultModelsForProvider(provider);
}

/**
 * Perform AI Complexity & Approach Analysis for a LeetCode submission.
 * Enforces a 15-second timeout with resilient model auto-discovery.
 */
export async function analyzeComplexity(
  params: AnalyzeComplexityParams
): Promise<AIAnalysisResult> {
  const { provider, apiKey, title, language, code } = params;
  const rawModel = (params.model || "").trim();

  if (!apiKey || apiKey.trim().length === 0) {
    return {
      approach: "",
      timeComplexity: "",
      timeReason: "",
      spaceComplexity: "",
      spaceReason: "",
      error: "API key is missing",
    };
  }

  const userPrompt = `Problem: ${title}\nLanguage: ${language}\n\nSubmitted Solution Code:\n\`\`\`${language}\n${code}\n\`\`\``;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    let rawResponse: string;

    switch (provider) {
      case "gemini":
        rawResponse = await callGemini(apiKey, rawModel, userPrompt, controller.signal);
        break;
      case "groq":
        rawResponse = await callOpenAICompatibleWithFallback(
          "groq",
          "https://api.groq.com/openai/v1/chat/completions",
          apiKey,
          rawModel,
          userPrompt,
          controller.signal
        );
        break;
      case "openai":
        rawResponse = await callOpenAICompatibleWithFallback(
          "openai",
          "https://api.openai.com/v1/chat/completions",
          apiKey,
          rawModel,
          userPrompt,
          controller.signal
        );
        break;
      case "anthropic":
        rawResponse = await callAnthropicWithFallback(apiKey, rawModel, userPrompt, controller.signal);
        break;
      case "openrouter":
        rawResponse = await callOpenAICompatibleWithFallback(
          "openrouter",
          "https://openrouter.ai/api/v1/chat/completions",
          apiKey,
          rawModel,
          userPrompt,
          controller.signal
        );
        break;
      case "custom": {
        let endpoint = params.customEndpoint?.trim() || "http://localhost:11434/v1/chat/completions";
        if (!endpoint.endsWith("/chat/completions") && !endpoint.includes("generate")) {
          endpoint = endpoint.replace(/\/+$/, "") + "/chat/completions";
        }
        const modelToUse = rawModel || cachedWorkingModels.custom || "default";
        rawResponse = await callOpenAICompatible(
          endpoint,
          apiKey,
          modelToUse,
          userPrompt,
          controller.signal
        );
        break;
      }
      default:
        throw new Error(`Unsupported AI provider: ${provider}`);
    }

    clearTimeout(timeoutId);
    return parseAIResponse(rawResponse);
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const isTimeout = err instanceof DOMException && err.name === "AbortError";
    const errorMessage = isTimeout
      ? "Analysis timed out (connectivity / latency issue)"
      : err instanceof Error
        ? err.message
        : "Failed to connect to LLM provider";

    logger.warn(`[AIClient] Complexity analysis failed: ${errorMessage}`);
    return {
      approach: "",
      timeComplexity: "",
      timeReason: "",
      spaceComplexity: "",
      spaceReason: "",
      error: errorMessage,
    };
  }
}

/**
 * Test the user's AI API key and auto-detect a working model.
 */
export async function testAiConnection(
  params: TestAiConnectionParams
): Promise<{ ok: boolean; model?: string; error?: string }> {
  const { provider, apiKey, customEndpoint } = params;
  const rawModel = (params.model || "").trim();

  if (!apiKey || apiKey.trim().length === 0) {
    return { ok: false, error: "Please enter an API key to test." };
  }

  const cleanKey = apiKey.trim();
  const testPrompt = 'Respond with JSON: {"status":"ok"}';
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    switch (provider) {
      case "gemini": {
        // Direct key validation via Google Gemini models service
        const testUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(cleanKey)}`;
        let workingModel = cachedWorkingGeminiModel || rawModel || "gemini-2.0-flash";
        try {
          const res = await fetch(testUrl, {
            method: "GET",
            headers: {
              "x-goog-api-key": cleanKey,
            },
            signal: controller.signal,
          });
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            const errMsg =
              (errData as { error?: { message?: string } })?.error?.message ||
              `HTTP ${res.status} ${res.statusText}`;
            throw new Error(`Gemini API Error: ${errMsg}`);
          }
        } catch (fetchErr) {
          if (fetchErr instanceof DOMException && fetchErr.name === "AbortError") throw fetchErr;
          if (fetchErr instanceof Error && fetchErr.message.includes("Gemini API Error")) throw fetchErr;
          
          // Fallback test via generateContent call
          await callGemini(cleanKey, rawModel, testPrompt, controller.signal);
        }
        clearTimeout(timeoutId);
        return { ok: true, model: cachedWorkingGeminiModel || workingModel };
      }

      case "groq": {
        await callOpenAICompatibleWithFallback(
          "groq",
          "https://api.groq.com/openai/v1/chat/completions",
          cleanKey,
          rawModel,
          testPrompt,
          controller.signal
        );
        clearTimeout(timeoutId);
        return { ok: true, model: cachedWorkingModels.groq };
      }

      case "openai": {
        await callOpenAICompatibleWithFallback(
          "openai",
          "https://api.openai.com/v1/chat/completions",
          cleanKey,
          rawModel,
          testPrompt,
          controller.signal
        );
        clearTimeout(timeoutId);
        return { ok: true, model: cachedWorkingModels.openai };
      }

      case "anthropic": {
        await callAnthropicWithFallback(cleanKey, rawModel, testPrompt, controller.signal);
        clearTimeout(timeoutId);
        return { ok: true, model: cachedWorkingModels.anthropic };
      }

      case "openrouter": {
        await callOpenAICompatibleWithFallback(
          "openrouter",
          "https://openrouter.ai/api/v1/chat/completions",
          cleanKey,
          rawModel,
          testPrompt,
          controller.signal
        );
        clearTimeout(timeoutId);
        return { ok: true, model: cachedWorkingModels.openrouter };
      }

      case "custom": {
        let endpoint = customEndpoint?.trim() || "http://localhost:11434/v1/chat/completions";
        if (!endpoint.endsWith("/chat/completions") && !endpoint.includes("generate")) {
          endpoint = endpoint.replace(/\/+$/, "") + "/chat/completions";
        }
        const modelToUse = rawModel || cachedWorkingModels.custom || "default";
        await callOpenAICompatible(endpoint, cleanKey, modelToUse, testPrompt, controller.signal);
        clearTimeout(timeoutId);
        return { ok: true, model: modelToUse };
      }
    }
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const isTimeout = err instanceof DOMException && err.name === "AbortError";
    const msg = isTimeout
      ? "Connection timed out. Check your network connection."
      : err instanceof Error
        ? err.message
        : "Failed to connect to AI provider";
    return { ok: false, error: msg };
  }
}

// ── Provider Call Implementations ──────────────────────────────────────────

let cachedWorkingGeminiModel: string | null = null;

async function callGemini(
  apiKey: string,
  model: string,
  userPrompt: string,
  signal: AbortSignal
): Promise<string> {
  const cleanKey = apiKey.trim();
  let requestedModel = (model || "").trim().replace(/^models\//, "");
  if (
    !requestedModel ||
    /\s/.test(requestedModel) ||
    requestedModel.includes("tts") ||
    requestedModel.includes("audio")
  ) {
    requestedModel = cachedWorkingGeminiModel || "gemini-2.0-flash";
  }

  let candidateModels: string[] = [
    cachedWorkingGeminiModel,
    requestedModel,
    ...getDefaultModelsForProvider("gemini"),
  ].filter((x): x is string => Boolean(x));

  if (!cachedWorkingGeminiModel) {
    try {
      const fetched = await fetchAvailableModels("gemini", cleanKey);
      if (fetched.length > 0) {
        candidateModels = Array.from(new Set([requestedModel, ...fetched, ...candidateModels]));
      }
    } catch {
      // Continue with candidate models
    }
  }

  const uniqueModels = Array.from(new Set(candidateModels.filter(Boolean)));
  let lastError: Error | null = null;

  for (const m of uniqueModels) {
    if (signal.aborted) break;

    const apiVersions = ["v1beta", "v1"];
    for (const apiVer of apiVersions) {
      if (signal.aborted) break;

      const url = `https://generativelanguage.googleapis.com/${apiVer}/models/${encodeURIComponent(
        m
      )}:generateContent?key=${encodeURIComponent(cleanKey)}`;

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": cleanKey,
          },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [{ text: `${SYSTEM_PROMPT}\n\n${userPrompt}` }],
              },
            ],
            generationConfig: {
              temperature: 0.1,
            },
          }),
          signal,
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          const message =
            (errorData as { error?: { message?: string } })?.error?.message ||
            `HTTP ${res.status} ${res.statusText}`;

          lastError = new Error(`Gemini API (${m} on ${apiVer}): ${message}`);

          if (
            res.status === 404 ||
            res.status === 400 ||
            res.status === 429 ||
            message.includes("not found") ||
            message.includes("not supported") ||
            message.includes("quota") ||
            message.includes("Quota") ||
            message.includes("exceeded") ||
            message.includes("rate")
          ) {
            continue;
          }
          break;
        }

        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error("Empty response from Gemini API");
        cachedWorkingGeminiModel = m;
        cachedWorkingModels.gemini = m;
        return text;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") throw err;
        lastError = err instanceof Error ? err : new Error(String(err));
        continue;
      }
    }
  }

  throw lastError || new Error("Failed to execute Gemini API request across candidate models.");
}

async function callOpenAICompatibleWithFallback(
  provider: "groq" | "openai" | "openrouter",
  endpointUrl: string,
  apiKey: string,
  preferredModel: string,
  userPrompt: string,
  signal: AbortSignal
): Promise<string> {
  const cleanKey = apiKey.trim();
  const cached = cachedWorkingModels[provider];
  
  let candidates: string[] = [];
  if (preferredModel && preferredModel !== "__custom__") candidates.push(preferredModel);
  if (cached && !candidates.includes(cached)) candidates.push(cached);

  // If no working model cached or list is short, fetch live models from API
  if (candidates.length === 0 || !cached) {
    try {
      const liveModels = await fetchAvailableModels(provider, cleanKey);
      for (const m of liveModels) {
        if (!candidates.includes(m)) candidates.push(m);
      }
    } catch {
      // ignore
    }
  }

  // Append defaults as last resort
  for (const m of getDefaultModelsForProvider(provider)) {
    if (!candidates.includes(m)) candidates.push(m);
  }

  let lastError: Error | null = null;
  for (const model of candidates) {
    if (signal.aborted) break;

    try {
      const res = await callOpenAICompatible(endpointUrl, cleanKey, model, userPrompt, signal);
      cachedWorkingModels[provider] = model;
      return res;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      const errMsg = err instanceof Error ? err.message : String(err);
      lastError = err instanceof Error ? err : new Error(errMsg);

      // If model not found, does not exist, rate-limited, or provider error, try next candidate model
      if (
        errMsg.includes("does not exist") ||
        errMsg.includes("not found") ||
        errMsg.includes("not_found") ||
        errMsg.includes("permission") ||
        errMsg.includes("access") ||
        errMsg.includes("404") ||
        errMsg.includes("400") ||
        errMsg.includes("429") ||
        errMsg.includes("rate") ||
        errMsg.includes("Provider returned error") ||
        errMsg.includes("provider") ||
        errMsg.includes("format") ||
        errMsg.includes("unavailable") ||
        errMsg.includes("disabled")
      ) {
        continue;
      }
      throw lastError;
    }
  }

  throw lastError || new Error(`Failed to call ${provider} API across all available models.`);
}

async function callOpenAICompatible(
  endpointUrl: string,
  apiKey: string,
  model: string,
  userPrompt: string,
  signal: AbortSignal,
  includeJsonFormat = true
): Promise<string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey && apiKey.trim() !== "no-key") {
    headers["Authorization"] = `Bearer ${apiKey.trim()}`;
  }

  // OpenRouter requires specific headers for routing
  if (endpointUrl.includes("openrouter.ai")) {
    headers["HTTP-Referer"] = "https://github.com/Abhishek-Singh-2008/legit-extension";
    headers["X-Title"] = "Legit - LeetCode Sync";
  }

  const isOpenRouter = endpointUrl.includes("openrouter.ai");
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.1,
  };

  // Only pass response_format if not OpenRouter (OpenRouter free models frequently error on json_object)
  if (includeJsonFormat && !isOpenRouter) {
    body["response_format"] = { type: "json_object" };
  }

  const res = await fetch(endpointUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const message =
      (errorData as { error?: { message?: string } })?.error?.message ||
      `HTTP ${res.status} ${res.statusText}`;

    // If json_format caused failure, retry without response_format
    if (
      includeJsonFormat &&
      (message.includes("response_format") ||
        message.includes("json") ||
        message.includes("Provider returned error"))
    ) {
      return callOpenAICompatible(endpointUrl, apiKey, model, userPrompt, signal, false);
    }

    throw new Error(`AI API Error: ${message}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Empty response from AI API");
  return text;
}

async function callAnthropicWithFallback(
  apiKey: string,
  preferredModel: string,
  userPrompt: string,
  signal: AbortSignal
): Promise<string> {
  const cleanKey = apiKey.trim();
  const cached = cachedWorkingModels.anthropic;

  const candidates: string[] = [
    preferredModel,
    cached,
    ...getDefaultModelsForProvider("anthropic"),
  ].filter((x): x is string => Boolean(x));

  const unique = Array.from(new Set(candidates));
  let lastError: Error | null = null;

  for (const model of unique) {
    if (signal.aborted) break;

    try {
      const res = await callAnthropic(cleanKey, model, userPrompt, signal);
      cachedWorkingModels.anthropic = model;
      return res;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      const errMsg = err instanceof Error ? err.message : String(err);
      lastError = err instanceof Error ? err : new Error(errMsg);

      if (
        errMsg.includes("not_found") ||
        errMsg.includes("not found") ||
        errMsg.includes("invalid_request_error")
      ) {
        continue;
      }
      throw lastError;
    }
  }

  throw lastError || new Error("Failed to call Anthropic API across candidate models.");
}

async function callAnthropic(
  apiKey: string,
  model: string,
  userPrompt: string,
  signal: AbortSignal
): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey.trim(),
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      max_tokens: 500,
      temperature: 0.1,
    }),
    signal,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const message =
      (errorData as { error?: { message?: string } })?.error?.message ||
      `HTTP ${res.status} ${res.statusText}`;
    throw new Error(`Anthropic API Error: ${message}`);
  }

  const data = await res.json();
  const text = data?.content?.[0]?.text;
  if (!text) throw new Error("Empty response from Anthropic API");
  return text;
}

function parseAIResponse(rawText: string): AIAnalysisResult {
  try {
    let clean = rawText.trim();
    if (clean.startsWith("```")) {
      clean = clean.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    }
    const parsed = JSON.parse(clean);
    return {
      approach: parsed.approach || "",
      timeComplexity: parsed.timeComplexity || "O(N)",
      timeReason: parsed.timeReason || "",
      spaceComplexity: parsed.spaceComplexity || "O(1)",
      spaceReason: parsed.spaceReason || "",
    };
  } catch (_e) {
    logger.warn("[AIClient] Failed to parse JSON response:", rawText);
    return {
      approach: "",
      timeComplexity: "",
      timeReason: "",
      spaceComplexity: "",
      spaceReason: "",
      error: "Invalid JSON response received from LLM",
    };
  }
}
