import type { AppSettings, ChatMessage } from "./types";

interface StreamOptions {
  signal: AbortSignal;
  onToken: (token: string) => void;
}

export async function streamOpenAiCompatible(
  settings: AppSettings,
  messages: ChatMessage[],
  options: StreamOptions
): Promise<string> {
  if (!settings.apiKey.trim()) {
    throw new Error("请先在设置中填写 API Key。");
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal.addEventListener("abort", abort, { once: true });
  const timeout = window.setTimeout(() => controller.abort(), settings.requestTimeoutMs);
  const endpoint = `${settings.apiBaseUrl.replace(/\/$/, "")}/chat/completions`;
  let fullText = "";

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: settings.model,
        messages,
        stream: true,
        temperature: 0.3
      })
    });

    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => "");
      throw new Error(normalizeApiError(response.status, detail));
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") return fullText;

        try {
          const parsed = JSON.parse(payload);
          const token = parsed.choices?.[0]?.delta?.content ?? "";
          if (token) {
            fullText += token;
            options.onToken(token);
          }
        } catch {
          continue;
        }
      }
    }

    return fullText;
  } finally {
    window.clearTimeout(timeout);
    options.signal.removeEventListener("abort", abort);
  }
}

function normalizeApiError(status: number, detail: string) {
  if (status === 401 || status === 403) return "API 鉴权失败，请检查 API Key。";
  if (status === 404) return "模型或接口地址不存在，请检查 Base URL 和模型名称。";
  if (status === 429) return "请求被限流，请稍后重试或更换模型。";
  if (status >= 500) return "模型服务暂时不可用，请稍后重试。";
  return detail || `请求失败，HTTP ${status}`;
}
