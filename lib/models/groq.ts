// Groq chat completions over its OpenAI-compatible HTTP API (architecture.md, Model adapters). Plain
// fetch: no SDK. Every call has a timeout; the caller falls back when it expires.

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatTool {
  name: string;
  description: string;
  parameters: unknown;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ChatTool[];
  temperature?: number;
  max_tokens?: number;
  /** For reasoning models (GPT-OSS on Groq): `low`, `medium`, or `high`. */
  reasoning_effort?: string;
}

export interface ChatResponse {
  content: string | null;
  tool_calls: { name: string; arguments: string }[];
  /** The raw response body, for the input log. */
  raw: unknown;
}

export class ModelError extends Error {
  constructor(
    readonly kind: "timeout" | "unavailable" | "malformed",
    message: string,
    /** The HTTP status when Groq answered with an error. */
    readonly status?: number,
  ) {
    super(message);
  }
}

export interface Chat {
  (request: ChatRequest, timeoutMs: number): Promise<ChatResponse>;
}

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const MODELS = "https://api.groq.com/openai/v1/models";

/** The ids of the models the key may use, sorted. */
export async function groqModels(apiKey: string, fetcher: typeof fetch = fetch): Promise<string[]> {
  const response = await fetcher(MODELS, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!response.ok) throw new ModelError("unavailable", `Groq answered HTTP ${response.status}`, response.status);
  const body = (await response.json()) as { data?: { id?: string }[] };
  return (body.data ?? []).flatMap((m) => (typeof m.id === "string" ? [m.id] : [])).sort();
}

export function groqChat(apiKey: string, fetcher: typeof fetch = fetch): Chat {
  return async (request, timeoutMs) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetcher(ENDPOINT, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          temperature: request.temperature ?? 0,
          ...(request.max_tokens ? { max_tokens: request.max_tokens } : {}),
          ...(request.reasoning_effort ? { reasoning_effort: request.reasoning_effort } : {}),
          ...(request.tools ? { tools: request.tools.map((t) => ({ type: "function", function: t })), tool_choice: "required" } : {}),
        }),
      });
    } catch (e) {
      throw new ModelError(controller.signal.aborted ? "timeout" : "unavailable", (e as Error).message);
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      // Groq's error body names the cause, such as an unknown model or a rate limit; it holds no secrets.
      const detail = await response.text().then((t) => t.slice(0, 300), () => "");
      throw new ModelError("unavailable", `Groq answered HTTP ${response.status}${detail ? `: ${detail}` : ""}`, response.status);
    }
    const body = (await response.json()) as { choices?: { message?: { content?: string | null; tool_calls?: { function?: { name?: string; arguments?: string } }[] } }[] };
    const message = body.choices?.[0]?.message;
    if (!message) throw new ModelError("malformed", "the response has no message");
    return {
      content: message.content ?? null,
      tool_calls: (message.tool_calls ?? []).map((c) => ({ name: c.function?.name ?? "", arguments: c.function?.arguments ?? "{}" })),
      raw: body,
    };
  };
}
