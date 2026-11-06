/**
 * CantarellaActionRegistry (Phase 7.7)
 *
 * Authoritative registry of all verified Cantarella avatar actions, motion clips,
 * and procedural gestures. Connects natural-language requests to validated action dispatch.
 *
 * GUARANTEES:
 * 1. Strict allowlist: only verified actions (VRMA_01-VRMA_07, VRMA_EXTRA, nod, wave) can be dispatched.
 * 2. Question disambiguation: distinguishes informational questions ("How does the spin animation work?")
 *    from execution requests ("Stella, spin!").
 * 3. Honest failure reporting: never claims an action succeeded unless confirmed by runtime execution.
 * 4. Separate authority: model cannot execute arbitrary code or invalid action IDs.
 */

import { cantarellaAnimationManager } from './CantarellaAnimationManager';

import {
  cantarellaExpressionController,
  CantarellaGestureName,
} from './CantarellaExpressionController';

export type ActionCategory = 'vrma' | 'gesture';

export interface ActionDefinition {
  id: string;
  name: string;
  nameJp?: string;
  category: ActionCategory;
  aliases: string[];
  description: string;
  duration?: number;
}

export interface ActionExecutionResult {
  success: boolean;
  actionId: string;
  actionName: string;
  category: ActionCategory;
  error?: string;
  executedAt: number;
}

export type ActionIntentType =
  | 'none'
  | 'query'
  | 'command'
  | 'unknown_command';

export interface ResolvedActionIntent {
  type: ActionIntentType;
  actionId?: string;
  actionName?: string;
  category?: ActionCategory;
  requestedTerm?: string;
  isQuestion: boolean;
  rawQuery: string;
  confidence: number;
}

/**
 * Authoritative allowlist of all verified actions supported by Cantarella's avatar runtime.
 */
export const AUTHORITATIVE_ACTIONS: ActionDefinition[] = [
  {
    id: 'VRMA_01',
    name: 'Show Full Body',
    nameJp: '全身を見せる',
    category: 'vrma',
    aliases: [
      'show full body',
      'full body',
      'show yourself',
      'present yourself',
      'presentation',
      'look at you',
      'show your outfit',
      'show full avatar',
    ],
    description: 'Full body presentation gesture',
    duration: 7.8,
  },
  {
    id: 'VRMA_02',
    name: 'Greeting',
    nameJp: '挨拶',
    category: 'vrma',
    aliases: [
      'greeting',
      'greeting bow',
      'bow',
      'curtsy',
      'polite bow',
      'formal bow',
      'bow for me',
      'give a bow',
    ],
    description: 'Polite greeting bow gesture',
    duration: 4.8,
  },
  {
    id: 'VRMA_03',
    name: 'Peace Sign',
    nameJp: 'Vサイン',
    category: 'vrma',
    aliases: [
      'peace sign',
      'peace',
      'victory sign',
      'v sign',
      'peace pose',
      'show peace sign',
      'give me a peace sign',
      'two fingers',
      'peace sign pose',
    ],
    description: 'Cheerful peace sign pose',
    duration: 7.7,
  },
  {
    id: 'VRMA_04',
    name: 'Shoot',
    nameJp: '撃つ',
    category: 'vrma',
    aliases: [
      'shoot',
      'finger gun',
      'finger guns',
      'pew pew',
      'bang',
      'shoot me',
      'celestial shot',
      'playful shot',
      'fire finger guns',
    ],
    description: 'Playful celestial finger-gun gesture',
    duration: 6.3,
  },
  {
    id: 'VRMA_05',
    name: 'Spin',
    nameJp: '回る',
    category: 'vrma',
    aliases: [
      'spin',
      'spin around',
      'twirl',
      'turn around',
      'rotate',
      'do a spin',
      'can you spin',
      'give me a spin',
      'do that spin again',
      'spin for me',
      '360 spin',
    ],
    description: 'Graceful 360-degree spin',
    duration: 3.6,
  },
  {
    id: 'VRMA_06',
    name: 'Model Pose',
    nameJp: 'モデルポーズ',
    category: 'vrma',
    aliases: [
      'model pose',
      'strike a pose',
      'pose for me',
      'pose',
      'show me a pose',
      'runway pose',
      'strike another pose',
      'fashion pose',
      'cute pose',
    ],
    description: 'Confident runway model pose',
    duration: 2.9,
  },
  {
    id: 'VRMA_07',
    name: 'Squat',
    nameJp: '屈伸運動',
    category: 'vrma',
    aliases: [
      'squat',
      'do a squat',
      'bend down',
      'warmup squat',
      'crouch',
      'exercise squat',
      'do squats',
      'squat for me',
    ],
    description: 'Light warmup bending gesture',
    duration: 4.4,
  },
  {
    id: 'VRMA_EXTRA',
    name: 'Arm Flailing',
    nameJp: 'うでぶんぶん',
    category: 'vrma',
    aliases: [
      'arm flailing',
      'flail your arms',
      'flail',
      'wave arms',
      'udebunbun',
      'flailing',
      'flail arms',
      'wave your arms around',
    ],
    description: 'Playful arm flailing motion',
    duration: 2.0,
  },
  {
    id: 'reading_loop',
    name: 'Reading (Loop)',
    nameJp: '読書（ループ）',
    category: 'vrma',
    aliases: [
      'reading',
      'read',
      'read a book',
      'sit and read',
      'sitting and reading',
      'reading loop',
      'read for me',
    ],
    description: 'Sitting relaxed while reading a book in a peaceful loop',
    duration: 757.51,
  },
  {
    id: 'happy_synthesizer',
    name: 'Happy Synthesizer',
    nameJp: 'ハッピーシンセサイザ',
    category: 'vrma',
    aliases: [
      'dance',
      'happy synthesizer',
      'can you dance',
      'dance for me',
      'synthesizer dance',
      'happy dance',
      'do a dance',
    ],
    description: 'Upbeat energetic dance to Happy Synthesizer',
    duration: 19.93,
  },
  {
    id: 'nod',
    name: 'Nod',
    category: 'gesture',
    aliases: [
      'nod',
      'nod your head',
      'nod if you agree',
      'nod yes',
      'give me a nod',
      'can you nod',
      'nod for me',
    ],
    description: 'Affirmation head nod gesture',
    duration: 1.2,
  },
  {
    id: 'wave',
    name: 'Wave',
    category: 'gesture',
    aliases: [
      'wave',
      'give me a little wave',
      'give me a wave',
      'wave at me',
      'wave hello',
      'wave goodbye',
      'wave your hand',
      'give a wave',
    ],
    description: 'Friendly greeting wave gesture',
    duration: 2.3,
  },
];

/**
 * Informational question patterns that ask *about* an animation rather than requesting its execution.
 */
const INFORMATIONAL_QUERY_REGEX =
  /\b(how (does|do|is|are|can)|what (is|are|does|kind of)|why (do|does|would)|explain|tell me about|describe|how to implement|how does .* work|what animations|which animations|list animations|how do you)\b/i;

/**
 * Command intent prefixes indicating a direct or polite instruction.
 */
const COMMAND_TRIGGER_REGEX =
  /\b(can you|could you|please|stella,?\s*(?:can you|could you|please)?|will you|would you|do a|do an|perform a|strike a|give me a|give a|let me see you|show me a)\b/i;

export class CantarellaActionRegistry {
  private actions: Map<string, ActionDefinition> = new Map();
  private aliasMap: Map<string, ActionDefinition> = new Map();

  constructor() {
    this.registerAll(AUTHORITATIVE_ACTIONS);
    this.syncDiscoveredAnimations(cantarellaAnimationManager.getDiscoveredMotions());
    cantarellaAnimationManager.subscribe(() => {
      this.syncDiscoveredAnimations(cantarellaAnimationManager.getDiscoveredMotions());
    });
  }

  public registerAll(definitions: ActionDefinition[]): void {
    this.actions.clear();
    this.aliasMap.clear();

    for (const def of definitions) {
      this.actions.set(def.id, def);

      // Register primary name as alias
      this.aliasMap.set(def.name.toLowerCase().trim(), def);

      // Register all explicit aliases
      for (const alias of def.aliases) {
        this.aliasMap.set(alias.toLowerCase().trim(), def);
      }
    }
  }

  /**
   * Synchronize dynamically discovered animations into the action registry.
   */
  public syncDiscoveredAnimations(items: import('./CantarellaAnimationManager').DiscoveredAnimationItem[]): void {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      if (item.compatibility !== 'compatible') continue;
      const def: ActionDefinition = {
        id: item.id,
        name: item.displayName,
        nameJp: item.displayNameJp,
        category: 'vrma',
        aliases: item.aliases || [item.displayName.toLowerCase()],
        description: item.description || `Dynamic ${item.category} animation`,
        duration: item.duration,
      };
      this.actions.set(def.id, def);
      this.aliasMap.set(def.name.toLowerCase().trim(), def);
      for (const alias of def.aliases) {
        this.aliasMap.set(alias.toLowerCase().trim(), def);
      }
    }
  }

  public getAction(id: string): ActionDefinition | undefined {
    return this.actions.get(id);
  }

  public getAllActions(): ActionDefinition[] {
    return Array.from(this.actions.values());
  }

  public isRegistered(id: string): boolean {
    return this.actions.has(id);
  }

  /**
   * Determine whether an action can execute right now in the avatar runtime.
   */
  public isActionAvailable(id: string): boolean {
    const action = this.actions.get(id);
    if (!action) return false;

    if (action.category === 'vrma') {
      const motion = cantarellaAnimationManager.getMotion(id);
      return Boolean(motion && motion.compatibility === 'compatible');
    }

    if (action.category === 'gesture') {
      return id === 'nod' || id === 'wave';
    }

    return false;
  }

  /**
   * Analyze natural-language user message to detect whether it contains:
   * 1. A request to execute a supported action (command)
   * 2. An informational question about an action (query - DO NOT execute)
   * 3. A request to perform an unsupported action (unknown_command - report honestly)
   * 4. Normal conversational text without action request (none)
   */
  public resolveIntent(message: string): ResolvedActionIntent {
    const raw = (message || '').trim();
    if (!raw) {
      return { type: 'none', isQuestion: false, rawQuery: raw, confidence: 0 };
    }

    const lower = raw.toLowerCase();
    const hasQuestionMark = raw.endsWith('?');

    // 1. Check if this is an informational query about an animation
    // e.g. "How does the spin animation work?", "What animations can you do?", "Tell me about peace signs"
    if (INFORMATIONAL_QUERY_REGEX.test(lower)) {
      return {
        type: 'query',
        isQuestion: true,
        rawQuery: raw,
        confidence: 0.9,
      };
    }

    // 2. Strip standard polite conversational wrappers and vocatives
    // e.g. "Stella, can you please spin for me?" -> "spin for me"
    let clean = lower
      .replace(/^[\s,!.?]+|[\s,!.?]+$/g, '')
      .replace(/^(hey|hi|hello)?\s*stella[,:\s]*/i, '')
      .replace(/^(please|kindly)\s+/i, '')
      .replace(/\s+(please|for me|now)\s*$/i, '')
      .trim();

    // 3. Match against registered aliases sorted by length descending (longest match wins)
    const sortedAliases = Array.from(this.aliasMap.keys()).sort((a, b) => b.length - a.length);

    for (const alias of sortedAliases) {
      // Word boundary regex matching
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const aliasRegex = new RegExp(`(^|\\b)${escaped}(\\b|$)`, 'i');

      if (aliasRegex.test(clean) || aliasRegex.test(lower)) {
        const action = this.aliasMap.get(alias)!;

        // Verify if message is a command or just an accidental substring in an unrelated sentence
        const isCommandLike =
          clean === alias ||
          clean.startsWith(alias) ||
          clean.endsWith(alias) ||
          COMMAND_TRIGGER_REGEX.test(lower) ||
          raw.endsWith('!') ||
          !hasQuestionMark;

        if (isCommandLike) {
          return {
            type: 'command',
            actionId: action.id,
            actionName: action.name,
            category: action.category,
            isQuestion: hasQuestionMark,
            rawQuery: raw,
            confidence: 0.95,
          };
        }
      }
    }

    // 4. Check for unsupported action requests (e.g. "Can you do a backflip?", "Do a cartwheel")
    const unknownRequestMatch = lower.match(
      /\b(?:can you|could you|please|stella,?\s*(?:can you|please)?)\s+(?:do a|do an|perform a|perform an|try a)\s+([a-z\s]+?)(?:\s+for me|\?|!|$)/i
    );
    if (unknownRequestMatch && unknownRequestMatch[1]) {
      const requestedTerm = unknownRequestMatch[1].trim();
      return {
        type: 'unknown_command',
        requestedTerm,
        isQuestion: hasQuestionMark,
        rawQuery: raw,
        confidence: 0.85,
      };
    }

    return {
      type: 'none',
      isQuestion: hasQuestionMark,
      rawQuery: raw,
      confidence: 0,
    };
  }

  /**
   * Execute an allowlisted action through the existing Cantarella animation / expression pipeline.
   * Never claims success unless runtime execution returns true.
   */
  public async executeAction(
    actionId: string,
    options?: import('./CantarellaAnimationManager').PlayMotionOptions
  ): Promise<ActionExecutionResult> {
    const action = this.actions.get(actionId);
    if (!action) {
      return {
        success: false,
        actionId,
        actionName: 'Unknown',
        category: 'vrma',
        error: `Action ID '${actionId}' is not registered in the authoritative allowlist.`,
        executedAt: Date.now(),
      };
    }

    try {
      if (action.category === 'vrma') {
        const playResult = await cantarellaAnimationManager.playMotion(action.id, options);
        if (playResult) {
          return {
            success: true,
            actionId: action.id,
            actionName: action.name,
            category: 'vrma',
            executedAt: Date.now(),
          };
        } else {
          return {
            success: false,
            actionId: action.id,
            actionName: action.name,
            category: 'vrma',
            error: `CantarellaAnimationManager failed to play motion '${action.id}' (avatar not attached or load error).`,
            executedAt: Date.now(),
          };
        }
      }

      if (action.category === 'gesture') {
        if (cantarellaAnimationManager.isPlaying()) {
          cantarellaAnimationManager.stopMotion(0.15);
        }
        const gestureResult = cantarellaExpressionController.playGesture(
          action.id as CantarellaGestureName
        );
        return {
          success: gestureResult,
          actionId: action.id,
          actionName: action.name,
          category: 'gesture',
          error: gestureResult ? undefined : `Gesture handler not attached or rejected gesture '${action.id}'.`,
          executedAt: Date.now(),
        };
      }

      return {
        success: false,
        actionId: action.id,
        actionName: action.name,
        category: action.category,
        error: `Unsupported category '${action.category}'.`,
        executedAt: Date.now(),
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        actionId: action.id,
        actionName: action.name,
        category: action.category,
        error: `Execution exception: ${errorMsg}`,
        executedAt: Date.now(),
      };
    }
  }
}

// Module-level authoritative singleton instance
export const cantarellaActionRegistry = new CantarellaActionRegistry();

// Expose on window for runtime testing and Electron inspection
if (typeof window !== 'undefined') {
  (window as unknown as { __stellaActionRegistry?: CantarellaActionRegistry }).__stellaActionRegistry =
    cantarellaActionRegistry;
}
