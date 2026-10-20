/**
 * Stella Local Brain API Client Service (Step 3.7)
 *
 * Provides a minimal, secure, typed HTTP interface to Stella's local Python brain.
 *
 * SECURITY INVARIANTS:
 * 1. Targets strictly loopback (http://127.0.0.1:8000). Never connects to external or cloud APIs.
 * 2. Session IDs are validated client-side and scoped to the browser tab session (sessionStorage).
 * 3. Model output is treated as strictly UNTRUSTED.
 * 4. Action proposals are informational only; the UI never executes proposed actions directly
 *    and never attempts to bypass the Permission Gateway.
 * 5. Handles timeouts, network disconnections, and safe error reporting.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  cantarellaExpressionController,
  CantarellaExpressionName,
} from '../components/CompanionPanel/CantarellaExpressionController';

export const BRAIN_API_BASE_URL = 'http://127.0.0.1:8000';
export const HEALTH_TIMEOUT_MS = 2500;
export const TURN_TIMEOUT_MS = 90000;

/**
 * Normalizes loopback URLs to IPv4 http://127.0.0.1.
 * Prevents browser ERR_CONNECTION_REFUSED caused by Windows dual-stack IPv6 [::1]
 * resolution when the Python server is bound to IPv4 127.0.0.1.
 */
export function normalizeLoopbackBaseUrl(url: string = BRAIN_API_BASE_URL): string {
  if (!url || !url.trim()) return BRAIN_API_BASE_URL;
  return url
    .trim()
    .replace(/^http:\/\/localhost(?=[:/]|$)/i, 'http://127.0.0.1')
    .replace(/^http:\/\/\[::1\](?=[:/]|$)/i, 'http://127.0.0.1')
    .replace(/\/+$/, ''); // Strip trailing slashes
}

export interface ActionProposalSummary {
  proposal_id: string;
  action_name: string;
  parameters: Record<string, unknown>;
  intent_summary: string;
  risk_level: string;
}

export interface ConfirmationPromptSummary {
  prompt_id: string;
  proposal_id: string;
  action_name: string;
  summary: string;
  affected_targets: string[];
  risk_level: string;
}

export interface TurnResponsePayload {
  turn_id: string;
  session_id: string;
  status: 'completed' | 'awaiting_confirmation' | 'plan_generated' | 'failed';
  user_facing_text: string;
  expression_hint?: string | null;
  proposed_actions: ActionProposalSummary[];
  confirmation_prompts: ConfirmationPromptSummary[];
  duration_ms: number;
  error_message?: string | null;
}

export interface HealthResponsePayload {
  status: 'ok' | 'degraded';
  fsm_state: string;
  model: string;
  ollama_connected?: boolean;
  ollama_reachable?: boolean;
  version: string;
  port?: number;
}

export interface TurnRequestPayload {
  user_message: string;
  session_id?: string;
  perceptual_state?: Record<string, unknown>;
}

/**
 * Returns a stable session identifier scoped to this browser session.
 */
export function getOrCreateSessionId(): string {
  const SESSION_STORAGE_KEY = 'stella_local_session_id';
  try {
    const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing && /^[a-zA-Z0-9_\-]+$/.test(existing)) {
      return existing;
    }
    const freshId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, freshId);
    return freshId;
  } catch {
    return `session_${Date.now()}_fallback`;
  }
}

/**
 * Probe the health of the local Stella brain HTTP service.
 */
export async function checkBrainHealth(baseUrl: string = BRAIN_API_BASE_URL): Promise<HealthResponsePayload | null> {
  const normalizedUrl = normalizeLoopbackBaseUrl(baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  try {
    const response = await fetch(`${normalizedUrl}/api/health`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as HealthResponsePayload;
    return {
      ...data,
      ollama_reachable: data.ollama_connected ?? data.ollama_reachable ?? false,
    };
  } catch {
    // Network error, connection refused, or timeout: brain service is offline
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Dispatch a conversational turn to Stella's local brain orchestrator.
 */
export async function sendTurn(
  payload: TurnRequestPayload,
  baseUrl: string = BRAIN_API_BASE_URL
): Promise<TurnResponsePayload> {
  const normalizedUrl = normalizeLoopbackBaseUrl(baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TURN_TIMEOUT_MS);

  const sessionId = payload.session_id || getOrCreateSessionId();

  try {
    const response = await fetch(`${normalizedUrl}/api/turn`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        user_message: payload.user_message,
        session_id: sessionId,
        perceptual_state: payload.perceptual_state || {},
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      let errorDetail = `HTTP ${response.status} ${response.statusText}`;
      try {
        const errJson = await response.json();
        if (errJson && errJson.message) {
          errorDetail = errJson.message;
        }
      } catch {
        // Fall back to HTTP status
      }
      throw new Error(`Brain request failed: ${errorDetail}`);
    }

    const data = (await response.json()) as TurnResponsePayload;
    return data;
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`Brain turn timed out after ${TURN_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Maps model expression hint string to Cantarella blend shape expression name.
 */
export function mapExpressionHintToCantarella(hint?: string | null): CantarellaExpressionName {
  if (!hint) return 'neutral';
  const clean = hint.toLowerCase().trim();
  switch (clean) {
    case 'happy':
    case 'joy':
    case 'pleased':
    case 'glad':
      return 'happy';
    case 'sad':
    case 'sorrow':
    case 'grief':
      return 'sad';
    case 'angry':
    case 'annoyed':
      return 'angry';
    case 'playful':
    case 'fun':
    case 'cheerful':
    case 'amused':
      return 'playful';
    case 'shy':
    case 'bashful':
      return 'shy';
    case 'thinking':
    case 'attentive':
    case 'neutral':
    default:
      return 'neutral';
  }
}

/**
 * Apply model expression hint to the avatar expression controller if supported.
 */
export function applyExpressionHint(hint?: string | null): void {
  try {
    const targetExpr = mapExpressionHintToCantarella(hint);
    cantarellaExpressionController.setExpression(targetExpr, {
      intensity: 0.85,
      duration: 0.35,
      holdDuration: 4.0, // Return to neutral after 4 seconds
    });
  } catch (err) {
    console.warn('Failed to apply expression hint to avatar:', err);
  }
}

/**
 * React hook to observe local brain engine connectivity and telemetry.
 */
export function useBrainStatus(pollIntervalMs: number = 5000) {
  const [health, setHealth] = useState<HealthResponsePayload | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(false);
  const isMountedRef = useRef<boolean>(true);

  const checkStatus = useCallback(async () => {
    const res = await checkBrainHealth();
    if (!isMountedRef.current) return;
    setHealth(res);
    setIsOnline(res !== null && (res.status === 'ok' || res.status === 'degraded'));
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    checkStatus();

    const interval = setInterval(() => {
      checkStatus();
    }, pollIntervalMs);

    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
    };
  }, [checkStatus, pollIntervalMs]);

  return { health, isOnline, checkNow: checkStatus };
}
