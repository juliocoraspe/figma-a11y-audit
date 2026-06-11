/**
 * Ollama client for local LLM integration.
 * Handles health checks, model availability, and alt text generation.
 */

export interface OllamaHealthResponse {
  running: boolean;
  version?: string;
}

export interface OllamaModel {
  name: string;
  size: number;
  digest: string;
}

export interface OllamaTagsResponse {
  models: OllamaModel[];
}

export type OllamaStatus = "checking" | "connected" | "pulling" | "error" | "not-running";

/** Short timeout for liveness probes; generation/pull get no deadline. */
const PROBE_TIMEOUT_MS = 4000;

function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = PROBE_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  );
}

export class OllamaClient {
  private endpoint: string;
  private model: string = "llama3.2-vision";
  private statusCallbacks: Set<(status: OllamaStatus) => void> = new Set();

  constructor(endpoint: string = "http://localhost:11434") {
    this.endpoint = endpoint;
  }

  setEndpoint(endpoint: string): void {
    this.endpoint = endpoint.replace(/\/+$/, "");
  }

  /** Override the vision model (must support images, e.g. llama3.2-vision). */
  setModel(model: string): void {
    this.model = model;
  }

  getModel(): string {
    return this.model;
  }

  /**
   * Subscribe to status changes (connecting, connected, error, etc.)
   */
  onStatusChange(callback: (status: OllamaStatus) => void): () => void {
    this.statusCallbacks.add(callback);
    return () => this.statusCallbacks.delete(callback);
  }

  private emitStatus(status: OllamaStatus): void {
    this.statusCallbacks.forEach((cb) => cb(status));
  }

  /**
   * Check if Ollama is running at the configured endpoint.
   */
  async checkHealth(): Promise<boolean> {
    try {
      this.emitStatus("checking");
      const res = await fetchWithTimeout(`${this.endpoint}/api/tags`, {
        method: "GET",
      });
      const ok = res.ok;
      if (ok) {
        this.emitStatus("connected");
      } else {
        this.emitStatus("error");
      }
      return ok;
    } catch (err) {
      this.emitStatus("not-running");
      return false;
    }
  }

  /**
   * Fetch available models from Ollama.
   */
  async getAvailableModels(): Promise<OllamaModel[]> {
    try {
      const res = await fetchWithTimeout(`${this.endpoint}/api/tags`);
      if (!res.ok) return [];
      const data = (await res.json()) as OllamaTagsResponse;
      return data.models || [];
    } catch {
      return [];
    }
  }

  /**
   * Check if the configured vision model is installed (tag-insensitive:
   * "llama3.2-vision" matches "llama3.2-vision:latest").
   */
  async hasVisionModel(): Promise<boolean> {
    const models = await this.getAvailableModels();
    const want = this.model;
    return models.some(
      (m) => m.name === want || m.name.startsWith(`${want}:`),
    );
  }

  /**
   * Pull the vision model if not present. Shows progress via callback.
   */
  async pullVisionModel(
    onProgress?: (status: string) => void,
  ): Promise<boolean> {
    try {
      this.emitStatus("pulling");
      onProgress?.(`Downloading ${this.model} (~8GB, can take a while)...`);

      const res = await fetch(`${this.endpoint}/api/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: this.model }),
      });

      if (!res.ok) {
        this.emitStatus("error");
        return false;
      }

      // Stream the response to show progress
      const reader = res.body?.getReader();
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = new TextDecoder().decode(value);
          const lines = text.split("\n");
          for (const line of lines) {
            if (line.trim()) {
              try {
                const obj = JSON.parse(line);
                if (obj.status) {
                  onProgress?.(obj.status);
                }
              } catch {
                // Ignore parse errors
              }
            }
          }
        }
      }

      this.emitStatus("connected");
      return true;
    } catch (err) {
      this.emitStatus("error");
      return false;
    }
  }

  /**
   * Generate alt text for an image using llama3.2-vision.
   * imageBase64: base64-encoded image (without data: prefix)
   * onChunk: callback for streaming response
   */
  async generateAltText(
    imageBase64: string,
    onChunk?: (chunk: string) => void,
  ): Promise<string> {
    try {
      const res = await fetch(`${this.endpoint}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          prompt:
            "Generate a concise, descriptive alt text (max 125 chars) for this image. Be specific about what's shown, not generic.",
          images: [imageBase64],
          stream: true,
        }),
      });

      if (!res.ok) {
        throw new Error(`Ollama error: ${res.statusText}`);
      }

      let fullText = "";
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const obj = JSON.parse(line);
            if (obj.response) {
              fullText += obj.response;
              onChunk?.(obj.response);
            }
          } catch {
            // Ignore parse errors in streaming
          }
        }
      }

      return fullText.trim();
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      // "Failed to fetch" from the plugin iframe is almost always CORS:
      // the iframe origin is "null", which Ollama rejects by default.
      const hint = /failed to fetch/i.test(raw)
        ? ` — start Ollama with OLLAMA_ORIGINS="*" ollama serve`
        : "";
      throw new Error(`Failed to generate alt text: ${raw}${hint}`);
    }
  }
}

export const ollamaClient = new OllamaClient();
