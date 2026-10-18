import { VRM } from '@pixiv/three-vrm';

export type CantarellaExpressionName =
  | 'neutral'
  | 'happy'
  | 'sad'
  | 'angry'
  | 'playful'
  | 'shy';

export interface ExpressionOptions {
  /** Target weight / intensity between 0.0 and 1.0 (defaults to 1.0) */
  intensity?: number;
  /** Transition duration in seconds (defaults to 0.4s) */
  duration?: number;
  /** Optional auto-return to neutral after holding for N seconds */
  holdDuration?: number;
}

export interface ExpressionTransitionResult {
  success: boolean;
  expression: CantarellaExpressionName;
  vrmPreset: string | null;
  supported: boolean;
  message?: string;
}

export type CantarellaGestureName = 'wave' | 'nod';

export interface ExpressionStatus {
  currentExpression: CantarellaExpressionName;
  targetExpression: CantarellaExpressionName;
  activeWeight: number;
  isTransitioning: boolean;
  supported: boolean;
  activeGesture?: CantarellaGestureName | null;
}

export interface ExpressionDiagnostic {
  currentExpression: CantarellaExpressionName;
  targetExpression: CantarellaExpressionName;
  activeWeight: number;
  isTransitioning: boolean;
  supportedExpressions: CantarellaExpressionName[];
  unsupportedExpressions: { name: CantarellaExpressionName; reason: string }[];
  vrmExpressionWeights: Record<string, number>;
}

export type ExpressionChangeListener = (status: ExpressionStatus) => void;

/**
 * Mapping table from requested high-level semantic expression names to
 * actual blend shape presets exposed by `@pixiv/three-vrm` for VRM 0.0.
 *
 * In cantarella.vrm:
 * - Group 0: "Neutral" -> mapped to preset "neutral"
 * - Group 7: "Joy" (presetName: "joy") -> mapped to preset "happy"
 * - Group 9: "Sorrow" (presetName: "sorrow") -> mapped to preset "sad"
 * - Group 8: "Angry" (presetName: "angry") -> mapped to preset "angry"
 * - Group 10: "Fun" (presetName: "fun") -> mapped to preset "relaxed"
 * - Shy: NOT supported (model has 0 blush meshes, no blush morph targets, and no shy blendshape group)
 */
const EXPRESSION_VRM_MAP: Record<CantarellaExpressionName, string | null> = {
  neutral: 'neutral',
  happy: 'happy',
  sad: 'sad',
  angry: 'angry',
  playful: 'relaxed',
  shy: null,
};

const UNSUPPORTED_REASONS: Partial<Record<CantarellaExpressionName, string>> = {
  shy: 'cantarella.vrm does not contain a shy/blush blendshape group or morph target.',
};

/**
 * CantarellaExpressionController
 *
 * Reusable, framework-agnostic controller for requesting and smoothly transitioning
 * facial expressions on Cantarella's VRM model without conflicting blend shapes.
 */
export class CantarellaExpressionController {
  private vrm: VRM | null = null;
  private currentExpression: CantarellaExpressionName = 'neutral';
  private targetExpression: CantarellaExpressionName = 'neutral';
  private fromExpression: CantarellaExpressionName | null = null;

  private currentWeight: number = 0;
  private targetWeight: number = 0;
  private fromWeight: number = 0;

  private transitionDuration: number = 0.4;
  private transitionTimer: number = 0;
  private isTransitioningState: boolean = false;

  private holdDurationTimer: number | null = null;
  private listeners: Set<ExpressionChangeListener> = new Set();
  private gestureHandler: ((gesture: CantarellaGestureName) => boolean) | null = null;

  /**
   * Connect an active VRM instance to this expression controller.
   */
  public attachVRM(vrm: VRM): void {
    this.vrm = vrm;

    // Configure blink override behavior on expressions if supported by expressionManager
    if (vrm.expressionManager) {
      // For 'happy', eyes smile closed; configure overrideBlink to 'block' so natural blinking
      // does not conflict or double-close smiling eyes
      const happyExpr = vrm.expressionManager.getExpression('happy');
      if (happyExpr) {
        happyExpr.overrideBlink = 'block';
      }

      // Other expressions (sad, angry, relaxed) leave overrideBlink as 'none' so natural
      // blinking continues freely
      const sadExpr = vrm.expressionManager.getExpression('sad');
      if (sadExpr) sadExpr.overrideBlink = 'none';

      const angryExpr = vrm.expressionManager.getExpression('angry');
      if (angryExpr) angryExpr.overrideBlink = 'none';

      const relaxedExpr = vrm.expressionManager.getExpression('relaxed');
      if (relaxedExpr) relaxedExpr.overrideBlink = 'none';
    }

    // Apply current state to newly attached VRM
    this.applyDirectWeights();
    this.notifyListeners();
  }

  /**
   * Detach the current VRM instance (e.g. on unmount or window switch).
   */
  public detachVRM(): void {
    this.vrm = null;
  }

  /**
   * Get the attached VRM instance for animation and diagnostic inspection.
   */
  public getVRM(): VRM | null {
    return this.vrm;
  }

  /**
   * Request a facial expression transition.
   */
  public setExpression(
    name: CantarellaExpressionName,
    options: ExpressionOptions = {}
  ): ExpressionTransitionResult {
    const vrmPreset = EXPRESSION_VRM_MAP[name];

    if (vrmPreset === null) {
      const reason = UNSUPPORTED_REASONS[name] || `Expression '${name}' is not supported by this model.`;
      console.warn(`[Cantarella Expression] ${reason}`);
      return {
        success: false,
        expression: name,
        vrmPreset: null,
        supported: false,
        message: reason,
      };
    }

    const intensity = Math.max(0, Math.min(1, options.intensity ?? 1.0));
    const duration = Math.max(0.01, options.duration ?? 0.4);

    // If already at target with identical weight, no-op
    if (this.targetExpression === name && Math.abs(this.targetWeight - intensity) < 0.001) {
      return {
        success: true,
        expression: name,
        vrmPreset,
        supported: true,
      };
    }

    // Retarget smoothly from current state
    this.fromExpression = this.currentExpression !== name ? this.currentExpression : null;
    this.fromWeight = this.currentWeight;

    this.targetExpression = name;
    this.targetWeight = intensity;
    this.transitionDuration = duration;
    this.transitionTimer = 0;
    this.isTransitioningState = true;

    // Optional hold duration: auto-return to neutral after N seconds
    if (options.holdDuration && options.holdDuration > 0 && name !== 'neutral') {
      this.holdDurationTimer = duration + options.holdDuration;
    } else {
      this.holdDurationTimer = null;
    }

    this.notifyListeners();

    return {
      success: true,
      expression: name,
      vrmPreset,
      supported: true,
    };
  }

  /**
   * Smoothly return to the neutral baseline expression.
   */
  public resetToNeutral(duration: number = 0.4): void {
    this.setExpression('neutral', { duration, intensity: 0.0 });
  }

  /**
   * Register a safe gesture handler (e.g. from CantarellaIdleController).
   */
  public setGestureHandler(handler: ((gesture: CantarellaGestureName) => boolean) | null): void {
    this.gestureHandler = handler;
  }

  /**
   * Request a non-destructive gesture (wave or nod) that coexists with idle physics
   * and smoothly returns to the resting pose.
   */
  public playGesture(gesture: CantarellaGestureName): boolean {
    if (this.gestureHandler) {
      return this.gestureHandler(gesture);
    }
    return false;
  }

  /**
   * Update expression transitions each animation frame.
   * Call this from the avatar's main render loop.
   */
  public update(delta: number): void {
    if (this.holdDurationTimer !== null) {
      this.holdDurationTimer -= delta;
      if (this.holdDurationTimer <= 0) {
        this.holdDurationTimer = null;
        this.resetToNeutral(this.transitionDuration);
      }
    }

    if (!this.isTransitioningState) return;

    this.transitionTimer += delta;
    const progress = Math.min(1.0, this.transitionTimer / this.transitionDuration);

    // Smooth cubic ease-in-out curve: 3p^2 - 2p^3
    const eased = progress * progress * (3 - 2 * progress);

    if (progress >= 1.0) {
      this.isTransitioningState = false;
      this.currentExpression = this.targetExpression;
      this.currentWeight = this.targetWeight;
      this.fromExpression = null;
      this.fromWeight = 0;
    } else {
      this.currentWeight = this.fromWeight + (this.targetWeight - this.fromWeight) * eased;
    }

    this.applyTransitionWeights(eased);
    this.notifyListeners();
  }

  /**
   * Directly sets blendshape weights into the attached VRM expression manager.
   */
  private applyTransitionWeights(eased: number): void {
    if (!this.vrm?.expressionManager) return;

    const mgr = this.vrm.expressionManager;

    // List of emotional presets that we manage
    const emotionalPresets = ['happy', 'sad', 'angry', 'relaxed'];

    if (this.targetExpression === 'neutral') {
      // Smoothly fade out the previous expression to 0
      if (this.fromExpression && this.fromExpression !== 'neutral') {
        const fromPreset = EXPRESSION_VRM_MAP[this.fromExpression];
        if (fromPreset) {
          const fadingWeight = this.fromWeight * (1 - eased);
          mgr.setValue(fromPreset, Math.max(0, fadingWeight));
        }
      }
      // Zero-out other presets
      for (const p of emotionalPresets) {
        if (!this.fromExpression || p !== EXPRESSION_VRM_MAP[this.fromExpression]) {
          mgr.setValue(p, 0);
        }
      }
    } else {
      const targetPreset = EXPRESSION_VRM_MAP[this.targetExpression];

      // Smoothly cross-fade from previous expression to target expression
      for (const p of emotionalPresets) {
        if (p === targetPreset) {
          mgr.setValue(p, Math.max(0, Math.min(1, this.currentWeight)));
        } else if (this.fromExpression && p === EXPRESSION_VRM_MAP[this.fromExpression]) {
          const fadingWeight = this.fromWeight * (1 - eased);
          mgr.setValue(p, Math.max(0, Math.min(1, fadingWeight)));
        } else {
          mgr.setValue(p, 0);
        }
      }
    }
  }

  /**
   * Applies target weights directly without easing (e.g. on attach).
   */
  private applyDirectWeights(): void {
    if (!this.vrm?.expressionManager) return;
    const mgr = this.vrm.expressionManager;

    const emotionalPresets = ['happy', 'sad', 'angry', 'relaxed'];
    const targetPreset = EXPRESSION_VRM_MAP[this.targetExpression];

    for (const p of emotionalPresets) {
      if (p === targetPreset && this.targetExpression !== 'neutral') {
        mgr.setValue(p, this.targetWeight);
      } else {
        mgr.setValue(p, 0);
      }
    }
  }

  public getCurrentExpression(): CantarellaExpressionName {
    return this.currentExpression;
  }

  public getTargetExpression(): CantarellaExpressionName {
    return this.targetExpression;
  }

  public getActiveWeight(): number {
    return this.currentWeight;
  }

  public isTransitioning(): boolean {
    return this.isTransitioningState;
  }

  public isExpressionSupported(name: CantarellaExpressionName): boolean {
    return EXPRESSION_VRM_MAP[name] !== null;
  }

  public getSupportedExpressions(): CantarellaExpressionName[] {
    return (Object.keys(EXPRESSION_VRM_MAP) as CantarellaExpressionName[]).filter(
      (name) => EXPRESSION_VRM_MAP[name] !== null
    );
  }

  public getDiagnostics(): ExpressionDiagnostic {
    const vrmWeights: Record<string, number> = {};
    if (this.vrm?.expressionManager) {
      const mgr = this.vrm.expressionManager;
      ['blink', 'happy', 'sad', 'angry', 'relaxed', 'neutral'].forEach((preset) => {
        vrmWeights[preset] = mgr.getValue(preset) ?? 0;
      });
    }

    return {
      currentExpression: this.currentExpression,
      targetExpression: this.targetExpression,
      activeWeight: this.currentWeight,
      isTransitioning: this.isTransitioningState,
      supportedExpressions: this.getSupportedExpressions(),
      unsupportedExpressions: [
        {
          name: 'shy',
          reason: UNSUPPORTED_REASONS.shy || 'Model lacks blush/shy blendshapes',
        },
      ],
      vrmExpressionWeights: vrmWeights,
    };
  }

  public subscribe(listener: ExpressionChangeListener): () => void {
    this.listeners.add(listener);
    // Initial call
    listener(this.getStatus());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    const status = this.getStatus();
    this.listeners.forEach((fn) => fn(status));
  }

  public getStatus(): ExpressionStatus {
    return {
      currentExpression: this.currentExpression,
      targetExpression: this.targetExpression,
      activeWeight: this.currentWeight,
      isTransitioning: this.isTransitioningState,
      supported: this.isExpressionSupported(this.currentExpression),
    };
  }
}

// Module-level singleton instance for seamless cross-component communication & Phase 3 integration
export const cantarellaExpressionController = new CantarellaExpressionController();

// Expose on window in browser / Electron environment for inspection and automated tests
if (typeof window !== 'undefined') {
  (window as unknown as { __stellaAvatarController?: CantarellaExpressionController }).__stellaAvatarController =
    cantarellaExpressionController;
}
