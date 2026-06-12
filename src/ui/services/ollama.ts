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
   * Shared streaming call to /api/generate. Returns the full text and
   * forwards each token to onChunk for live display.
   */
  private async streamGenerate(
    body: Record<string, unknown>,
    onChunk?: (chunk: string) => void,
  ): Promise<string> {
    const res = await fetch(`${this.endpoint}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.model, stream: true, ...body }),
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
  }

  /**
   * Stage 1 of alt text: a rich visual read of the image, streamed so the
   * UI can show the analysis happening before any suggestion appears.
   */
  async analyzeImage(
    imageBase64: string,
    onChunk?: (chunk: string) => void,
  ): Promise<string> {
    try {
      return await this.streamGenerate(
        {
          prompt:
            "Describe this image in rich visual detail for someone who cannot see it: " +
            "the main subject, what it is doing, the setting, dominant colors, " +
            "composition, and any visible text (quote it exactly). " +
            "3 to 5 short sentences. Do not classify elements by UI type; describe what is visually there.",
          images: [imageBase64],
        },
        onChunk,
      );
    } catch (err) {
      throw wrapOllamaError(err, "Failed to analyze image");
    }
  }

  /**
   * Stage 2 of alt text: distill the visual analysis into one
   * screen-reader-ready sentence. Text-only call — the grounding already
   * happened in stage 1 — so it's fast.
   *
   * The target register is "purpose in context": these images are UI
   * elements whose inner content may be swapped later, so the alt text
   * must name what the element IS FOR (inferred from the analysis plus the
   * layer path), keeping at most one distinguishing visual detail — neither
   * a generic label nor a literal scene transcription.
   */
  async generateAltTextFromAnalysis(
    analysis: string,
    context?: string,
    onChunk?: (chunk: string) => void,
  ): Promise<string> {
    try {
      const raw = await this.streamGenerate(
        {
          prompt: [
            "You are writing alt text for an element inside a product's user interface (a design that will become HTML).",
            context ? `Element location in the design: ${context}` : "",
            "",
            "Visual analysis of the element's current appearance:",
            analysis,
            "",
            "Write ONE alt-text sentence that:",
            "- Names what this element IS and its purpose in the interface (e.g. profile photo, hero illustration, product thumbnail, map preview, brand logo), inferred from the analysis and the location.",
            "- Adds at most ONE distinguishing visual detail about the main subject, and only if it helps the user understand the element's meaning. Never describe the background or composition.",
            "- Stays valid if the inner content is swapped later: do NOT inventory colors, composition or transcribe the scene.",
            "- Is never just a generic label: avoid bare words like image, picture, graphic, icon, button, container, element, screenshot, UI, component.",
            "",
            "Right level (examples): 'User avatar photo next to the contact's name' · 'Hand-drawn paper plane illustration in the app header' · 'Thumbnail preview of the shared memory photo'.",
            "Wrong: 'Decorative container' (too generic). Wrong: 'A black puppy with large eyes gazes at the camera on rustic wooden planks' (literal content that may change).",
            "",
            "Under 125 characters. No quotes. No preamble like 'Alt text:'. Output the sentence only.",
          ]
            .filter((line) => line !== null)
            .join("\n"),
        },
        onChunk,
      );
      return cleanAltText(raw);
    } catch (err) {
      throw wrapOllamaError(err, "Failed to generate alt text");
    }
  }

  /**
   * Single-shot alt text (legacy path; the UI now prefers the two-stage
   * analyzeImage + generateAltTextFromAnalysis flow).
   */
  async generateAltText(
    imageBase64: string,
    onChunk?: (chunk: string) => void,
  ): Promise<string> {
    try {
      const raw = await this.streamGenerate(
        {
          prompt:
            "Write one vivid alt-text sentence (max 125 chars) describing what is visually in this image. " +
            "Lead with the subject. Never use generic words like image, button, container, icon. " +
            "No preamble — output the sentence only.",
          images: [imageBase64],
        },
        onChunk,
      );
      return cleanAltText(raw);
    } catch (err) {
      throw wrapOllamaError(err, "Failed to generate alt text");
    }
  }
}

/**
 * Models love preambles ("The image shows…", "Alt text: …") and generic
 * openers; strip them, normalize whitespace/quotes, and keep it under 125
 * chars cutting at a word boundary.
 */
export function cleanAltText(raw: string): string {
  let text = raw.trim();
  text = text.replace(/^(here( is|'s)[^:]*:|alt[- ]?text:?|description:?)\s*/i, "");
  text = text.replace(/^["'“”]+|["'“”]+$/g, "");
  text = text.replace(
    /^(the |an? )?(image|picture|photo(graph)?|graphic|illustration|screenshot)\s+(shows?|depicts?|features?|displays?|contains?|of)\s*/i,
    "",
  );
  text = text.replace(/\s+/g, " ").trim();
  if (text) text = text[0]!.toUpperCase() + text.slice(1);
  if (text.length > 125) {
    const cut = text.slice(0, 125);
    const lastSpace = cut.lastIndexOf(" ");
    text = (lastSpace > 60 ? cut.slice(0, lastSpace) : cut).replace(/[,;:\s]+$/, "");
  }
  return text;
}

function wrapOllamaError(err: unknown, prefix: string): Error {
  const raw = err instanceof Error ? err.message : String(err);
  // "Failed to fetch" from the plugin iframe is almost always CORS:
  // the iframe origin is "null", which Ollama rejects by default.
  const hint = /failed to fetch/i.test(raw)
    ? ` — start Ollama with OLLAMA_ORIGINS="*" ollama serve`
    : "";
  return new Error(`${prefix}: ${raw}${hint}`);
}

export const ollamaClient = new OllamaClient();
