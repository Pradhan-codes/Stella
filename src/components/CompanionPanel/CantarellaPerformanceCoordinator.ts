/**
 * CantarellaPerformanceCoordinator (Phase 7.6)
 *
 * Single, lightweight coordinated performance controller for Stella's companion avatar.
 *
 * Coordinates:
 * 1. Conversational turn lifecycle: listening -> thinking -> speaking -> settling -> idle
 * 2. Synchronized facial emotions matching conversational intent
 * 3. Piper speech audio synthesis & Web Audio lip-sync analysis
 * 4. Contextual gestures (VRMA motions & procedural nods)
 * 5. Monotonic turn supersession & interruption safety (zero stale callbacks)
 */

import {
  cantarellaExpressionController,
  CantarellaExpressionName,
} from './CantarellaExpressionController';

import { cantarellaAnimationManager } from './CantarellaAnimationManager';
import { cantarellaActionRegistry } from './CantarellaActionRegistry';
import { cantarellaLipSyncController } from './CantarellaLipSync';
import { speakSpeechText, stopSpeechAudio } from '../../services/brainService';
import { CompanionDialogueTurn } from '../../types/desktop';

export type PerformanceState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'settling'
  | 'interrupted';

export interface PerformanceIntent {
  expression: CantarellaExpressionName;
  intensity: number;
  gesture: string | null; // e.g. 'VRMA_02', 'nod', or null
  reason: string;
}

export type PerformanceStateListener = (state: PerformanceState, currentTurnId: string | null) => void;

export class CantarellaPerformanceCoordinator {
  private currentState: PerformanceState = 'idle';
  private activeTurnId: string | null = null;
  private turnCounter: number = 0;
  private listeners: Set<PerformanceStateListener> = new Set();

  /**
   * Determine the emotional expression and optional gesture from text and brain hints.
   */
  public analyzeIntent(text: string, expressionHint?: string | null): PerformanceIntent {
    const lower = (text || '').toLowerCase().trim();

    // 1. Explicit valid hint from the brain takes precedence
    if (expressionHint) {
      const hint = expressionHint.toLowerCase().trim();
      if (['happy', 'joy', 'pleased', 'glad'].includes(hint)) {
        return { expression: 'happy', intensity: 0.85, gesture: 'VRMA_02', reason: 'brain:happy' };
      }
      if (['playful', 'fun', 'amused', 'cheerful'].includes(hint)) {
        return { expression: 'playful', intensity: 0.85, gesture: 'VRMA_04', reason: 'brain:playful' };
      }
      if (['sad', 'sorrow', 'grief', 'melancholic'].includes(hint)) {
        return { expression: 'sad', intensity: 0.80, gesture: null, reason: 'brain:sad' };
      }
      if (['angry', 'annoyed', 'pout'].includes(hint)) {
        return { expression: 'angry', intensity: 0.75, gesture: null, reason: 'brain:angry' };
      }
      if (['curious', 'thinking', 'inquisitive'].includes(hint)) {
        return { expression: 'curious', intensity: 0.75, gesture: 'nod', reason: 'brain:curious' };
      }
      if (['shy', 'bashful', 'affectionate'].includes(hint)) {
        return { expression: 'shy', intensity: 0.65, gesture: null, reason: 'brain:shy' };
      }
    }

    // 2. Deterministic conversational intent matching
    // Greetings / welcoming
    if (/\b(hello|greetings|welcome|good (morning|afternoon|evening)|hi\b)/.test(lower)) {
      return { expression: 'happy', intensity: 0.85, gesture: 'VRMA_02', reason: 'text:greeting' };
    }

    // Readiness / confirmation / affirmation
    if (/\b(primed|ready|certainly|of course|understood|acknowledged|primed and ready)\b/.test(lower)) {
      return { expression: 'happy', intensity: 0.80, gesture: 'nod', reason: 'text:affirmation' };
    }

    // Gratitude / polite appreciation
    if (/\b(thank you|thanks|my pleasure|delighted|honored)\b/.test(lower)) {
      return { expression: 'happy', intensity: 0.85, gesture: 'VRMA_02', reason: 'text:gratitude' };
    }

    // Celestial / astronomical wonder
    if (/\b(celestial|observatory|stars|constellation|astrolabe|galaxy|cosmos|telescope)\b/.test(lower)) {
      return { expression: 'playful', intensity: 0.80, gesture: 'VRMA_01', reason: 'text:celestial' };
    }

    // Inquiry / question
    if (/\?/.test(lower) || /\b(would you like|shall we|wondering|curious)\b/.test(lower)) {
      return { expression: 'curious', intensity: 0.75, gesture: 'nod', reason: 'text:question' };
    }

    // Apology / regret
    if (/\b(sorry|apologies|unfortunately|unable|error|cannot)\b/.test(lower)) {
      return { expression: 'sad', intensity: 0.75, gesture: null, reason: 'text:apology' };
    }

    // Cheerful / enthusiastic
    if (/!/.test(lower) || /\b(wonderful|marvelous|splendid|delightful|excellent)\b/.test(lower)) {
      return { expression: 'playful', intensity: 0.85, gesture: 'VRMA_04', reason: 'text:cheerful' };
    }

    // Default resting baseline
    return { expression: 'happy', intensity: 0.60, gesture: null, reason: 'text:default' };
  }

  /**
   * User is actively interacting / typing.
   */
  public onListening(): void {
    if (this.currentState === 'speaking') {
      this.cancelCurrentPerformance();
    }
    this.setState('listening');
    cantarellaExpressionController.setConversationState('listening');
  }

  /**
   * Waiting for brain inference.
   */
  public onThinking(turnId: string): void {
    if (this.currentState === 'speaking') {
      this.cancelCurrentPerformance();
    }
    this.activeTurnId = turnId;
    this.setState('thinking');
    cantarellaExpressionController.setConversationState('thinking');
  }

  /**
   * Perform an assistant response with synchronized emotion, gesture, audio, and lip-sync.
   */
  public async performResponse(
    turn: CompanionDialogueTurn,
    onSpeechComplete?: () => void
  ): Promise<void> {
    const thisTurnNumber = ++this.turnCounter;
    this.activeTurnId = turn.turnId;

    // 1. Cancel any prior speech audio and ongoing performance
    stopSpeechAudio();

    // 2. Analyze conversational intent
    const intent = this.analyzeIntent(turn.assistantText, turn.expressionHint);

    // 3. Apply emotion expression to avatar (smooth transition without auto-reset)
    cantarellaExpressionController.setExpression(intent.expression, {
      intensity: intent.intensity,
      duration: 0.35,
    });

    // 4. Play requested or contextual action
    if (turn.actionId) {
      if (turn.actionStatus !== 'dispatched') {
        cantarellaActionRegistry.executeAction(turn.actionId).catch((err) => {
          console.warn('[PerformanceCoordinator] Action dispatch failed:', err);
        });
      }
    } else if (intent.gesture && !cantarellaAnimationManager.getStatus().isPlaying) {
      if (intent.gesture === 'nod') {
        cantarellaExpressionController.playGesture('nod');
      } else if (VRMA_CAN_PLAY(intent.gesture)) {
        cantarellaAnimationManager.playMotion(intent.gesture);
      }
    }

    // 5. If response has speech text, execute audio playback with lip-sync
    if (turn.assistantText && turn.assistantText.trim()) {
      this.setState('speaking');
      cantarellaExpressionController.setConversationState('speaking');

      try {
        await speakSpeechText(turn.assistantText);
      } catch (err) {
        console.warn('[PerformanceCoordinator] Speech playback error:', err);
      } finally {
        // Guard against stale turn callbacks: only finish if this is still the active turn
        if (this.turnCounter === thisTurnNumber) {
          this.finishSpeaking();
          onSpeechComplete?.();
        }
      }
    } else {
      this.finishSpeaking();
      onSpeechComplete?.();
    }
  }

  /**
   * Smoothly settle mouth to rest while preserving facial emotion.
   */
  public finishSpeaking(): void {
    this.setState('settling');
    cantarellaLipSyncController.stopSpeech();
    cantarellaExpressionController.setConversationState('idle');

    // Settle to idle after mouth decay finishes (approx 200ms)
    window.setTimeout(() => {
      if (this.currentState === 'settling') {
        this.setState('idle');
      }
    }, 220);
  }

  /**
   * Cancel ongoing performance cleanly on interruption or rapid successive turn.
   */
  public cancelCurrentPerformance(): void {
    this.setState('interrupted');
    stopSpeechAudio();
    cantarellaLipSyncController.stopSpeech();
    cantarellaAnimationManager.stopMotion(0.25);
    cantarellaExpressionController.setConversationState('idle');
    this.activeTurnId = null;
    this.setState('idle');
  }

  public getState(): PerformanceState {
    return this.currentState;
  }

  public getActiveTurnId(): string | null {
    return this.activeTurnId;
  }

  public subscribe(listener: PerformanceStateListener): () => void {
    this.listeners.add(listener);
    listener(this.currentState, this.activeTurnId);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setState(state: PerformanceState): void {
    this.currentState = state;
    for (const listener of this.listeners) {
      try {
        listener(state, this.activeTurnId);
      } catch (err) {
        console.error('[PerformanceCoordinator] Listener error:', err);
      }
    }
  }
}

function VRMA_CAN_PLAY(id: string): boolean {
  return ['VRMA_01', 'VRMA_02', 'VRMA_03', 'VRMA_04', 'VRMA_05', 'VRMA_06', 'VRMA_07', 'VRMA_EXTRA'].includes(id);
}

// Module-level singleton
export const cantarellaPerformanceCoordinator = new CantarellaPerformanceCoordinator();
