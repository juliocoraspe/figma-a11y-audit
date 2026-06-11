/**
 * useUIBridge — hook to send messages to the sandbox and receive responses.
 *
 * Thin React wrapper over services/bridge. The UI iframe has no `figma`
 * global: outbound messages must go through parent.postMessage wrapped in
 * { pluginMessage }, and inbound messages arrive as event.data.pluginMessage.
 * Both directions are handled by bridge.ts; this hook only adds stable
 * callback identities for use in effect dependencies.
 */

import type { UIToSandbox, SandboxToUI } from "@shared/types/Message";
import { useCallback } from "react";
import { send, subscribe } from "../services/bridge";

interface MessageHandler {
  (msg: SandboxToUI): void;
}

export function useUIBridge() {
  const postMessage = useCallback((msg: UIToSandbox) => {
    send(msg);
  }, []);

  /** Subscribe to sandbox messages. Returns an unsubscribe function. */
  const onMessage = useCallback((handler: MessageHandler) => {
    return subscribe(handler);
  }, []);

  return { postMessage, onMessage };
}
