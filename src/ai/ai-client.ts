// ─── AI Client Layer for LeetCode Complexity & Approach Analysis ───────────
// Multi-provider client supporting Gemini, Groq, OpenAI, Anthropic, OpenRouter, and Custom endpoints.
// All requests are direct client-side HTTPS calls with strict timeout and JSON parsing.

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
  anthropic: "claude-3-5-haiku-20241022",
  openrouter: "meta-llama/llama-3.3-70b-instruct",
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

/**
 * Perform AI Complexity & Approach Analysis for a LeetCode submission.
 * Enforces a strict 6-second timeout to prevent slowing down GitHub sync.
 */
export async function analyzeComplexity(
  params: AnalyzeComplexityParams
): Promise<AIAnalysisResult> {
  const { provider, apiKey, title, language, code } = params;
  const model = (params.model && params.model.trim()) || DEFAULT_AI_MODELS[provider];

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
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    let rawResponse: string;

    switch (provider) {
      case "gemini":
        rawResponse = await callGemini(apiKey, model, userPrompt, controller.signal);
        break;
      case "groq":
        rawResponse = await callOpenAICompatible(
          "https://api.groq.com/openai/v1/chat/completions",
          apiKey,
          model,
          userPrompt,
          controller.signal
        );
        break;
      case "openai":
        rawResponse = await callOpenAICompatible(
          "https://api.openai.com/v1/chat/completions",
          apiKey,
          model,
          userPrompt,
          controller.signal
        );
        break;
      case "anthropic":
        rawResponse = await callAnthropic(apiKey, model, userPrompt, controller.signal);
        break;
      case "openrouter":
        rawResponse = await callOpenAICompatible(
          "https://openrouter.ai/api/v1/chat/completions",
          apiKey,
          model,
          userPrompt,
          controller.signal
        );
        break;
      case "custom": {
        let endpoint = params.customEndpoint?.trim() || "http://localhost:11434/v1/chat/completions";
        if (!endpoint.endsWith("/chat/completions") && !endpoint.includes("generate")) {
          endpoint = endpoint.replace(/\/+$/, "") + "/chat/completions";
        }
        rawResponse = await callOpenAICompatible(
          endpoint,
          apiKey,
          model,
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
 * Test the user's AI API key with a tiny request.
 */
export async function testAiConnection(
  params: TestAiConnectionParams
): Promise<{ ok: boolean; error?: string }> {
  const { provider, apiKey } = params;
  const model = (params.model && params.model.trim()) || DEFAULT_AI_MODELS[provider];

  if (!apiKey || apiKey.trim().length === 0) {
    return { ok: false, error: "Please enter an API key to test." };
  }

  const testPrompt = "Respond with JSON: {\"status\":\"ok\"}";
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 7000);

  try {
    switch (provider) {
      case "gemini":
        await callGemini(apiKey, model, testPrompt, controller.signal);
        break;
      case "groq":
        await callOpenAICompatible(
          "https://api.groq.com/openai/v1/chat/completions",
          apiKey,
          model,
          testPrompt,
          controller.signal
        );
        break;
      case "openai":
        await callOpenAICompatible(
          "https://api.openai.com/v1/chat/completions",
          apiKey,
          model,
          testPrompt,
          controller.signal
        );
        break;
      case "anthropic":
        await callAnthropic(apiKey, model, testPrompt, controller.signal);
        break;
      case "openrouter":
        await callOpenAICompatible(
          "https://openrouter.ai/api/v1/chat/completions",
          apiKey,
          model,
          testPrompt,
          controller.signal
        );
        break;
      case "custom": {
        let endpoint = params.customEndpoint?.trim() || "http://localhost:11434/v1/chat/completions";
        if (!endpoint.endsWith("/chat/completions") && !endpoint.includes("generate")) {
          endpoint = endpoint.replace(/\/+$/, "") + "/chat/completions";
        }
        await callOpenAICompatible(endpoint, apiKey, model, testPrompt, controller.signal);
        break;
      }
    }
    clearTimeout(timeoutId);
    return { ok: true };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const isTimeout = err instanceof DOMException && err.name === "AbortError";
    const msg = isTimeout
      ? "Connection timed out after 7s. Check endpoint or network."
      : err instanceof Error
        ? err.message
        : "Failed to connect to AI provider";
    return { ok: false, error: msg };
  }
}

// ── Provider Call Implementations ──────────────────────────────────────────

async function callGemini(
  apiKey: string,
  model: string,
  userPrompt: string,
  signal: AbortSignal
): Promise<string> {
  const candidateModels = [
    model,
    "gemini-2.0-flash",
    "gemini-1.5-flash-latest",
    "gemini-2.5-flash",
    "gemini-1.5-flash",
  ];
  const uniqueModels = Array.from(new Set(candidateModels.filter(Boolean)));

  let lastError: Error | null = null;

  for (const m of uniqueModels) {
    if (signal.aborted) break;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      m
    )}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: SYSTEM_PROMPT }],
          },
          contents: [
            {
              role: "user",
              parts: [{ text: userPrompt }],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
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

        // If it's a 404 / model not found, try the next candidate model
        if (res.status === 404 || message.includes("not found") || message.includes("not supported")) {
          lastError = new Error(`Gemini API Error (${m}): ${message}`);
          continue;
        }

        throw new Error(`Gemini API Error: ${message}`);
      }

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("Empty response from Gemini API");
      return text;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      lastError = err instanceof Error ? err : new Error(String(err));
      // If error indicates not found, continue to next model candidate
      if (lastError.message.includes("not found") || lastError.message.includes("404")) {
        continue;
      }
      throw lastError;
    }
  }

  throw lastError || new Error("Failed to execute Gemini API request across candidate models.");
}

async function callOpenAICompatible(
  endpointUrl: string,
  apiKey: string,
  model: string,
  userPrompt: string,
  signal: AbortSignal
): Promise<string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey && apiKey.trim() !== "no-key") {
    headers["Authorization"] = `Bearer ${apiKey.trim()}`;
  }

  const res = await fetch(endpointUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
    }),
    signal,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const message = (errorData as { error?: { message?: string } })?.error?.message || `HTTP ${res.status} ${res.statusText}`;
    throw new Error(`AI API Error: ${message}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Empty response from AI API");
  return text;
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
    const message = (errorData as { error?: { message?: string } })?.error?.message || `HTTP ${res.status} ${res.statusText}`;
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
    // Strip markdown code fences if present
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
