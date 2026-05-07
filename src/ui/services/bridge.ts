/**
 * Typed wrapper around postMessage for the UI side.
 * Discriminated unions on both ends; UI never speaks raw figma.*.
 */

import type { SandboxToUI, UIToSandbox } from "@shared/types/Message";

export function send(msg: UIToSandbox): void {
  parent.postMessage({ pluginMessage: msg }, "*");
}

export type SandboxListener = (msg: SandboxToUI) => void;

export function subscribe(listener: SandboxListener): () => void {
  const onMessage = (e: MessageEvent): void => {
    const data = e.data?.pluginMessage as SandboxToUI | undefined;
    if (!data || typeof data !== "object" || !("type" in data)) return;
    listener(data);
  };
  window.addEventListener("message", onMessage);
  return () => window.removeEventListener("message", onMessage);
}
