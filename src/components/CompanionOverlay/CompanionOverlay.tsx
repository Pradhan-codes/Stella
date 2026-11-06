import React, { useState, useEffect, useRef, useCallback } from 'react';
import { usePresentation } from '../../context/PresentationContext';
import { CantarellaAvatar } from '../CompanionPanel/CantarellaAvatar';
import {
  cantarellaExpressionController,
  CantarellaExpressionName,
  CantarellaGestureName,
  ExpressionStatus,
} from '../CompanionPanel/CantarellaExpressionController';
import {
  cantarellaAnimationManager,
  AnimationStatus,
} from '../CompanionPanel/CantarellaAnimationManager';
import { cantarellaActionRegistry } from '../CompanionPanel/CantarellaActionRegistry';
import { cantarellaPerformanceCoordinator } from '../CompanionPanel/CantarellaPerformanceCoordinator';
import {
  sendTurn,
  stopSpeechAudio,
} from '../../services/brainService';
import { CompanionDialogueTurn } from '../../types/desktop';
import './companionOverlay.css';

interface ExpressionOption {
  id: CantarellaExpressionName;
  label: string;
  emoji: string;
  hint: string;
}

const SUPPORTED_EXPRESSIONS: ExpressionOption[] = [
  { id: 'neutral', label: 'Neutral', emoji: '✧', hint: 'Baseline calm expression' },
  { id: 'happy', label: 'Happy', emoji: '😊', hint: 'Gentle warm smile' },
  { id: 'sad', label: 'Sad', emoji: '🥺', hint: 'Melancholic expression' },
  { id: 'angry', label: 'Angry', emoji: '😠', hint: 'Playful pout / stern expression' },
  { id: 'playful', label: 'Playful', emoji: '✨', hint: 'Serene relaxed expression' },
];

export const CompanionOverlay: React.FC = () => {
  const { returnToWorkspace, minimizeWindow } = usePresentation();
  const [isTrayOpen, setIsTrayOpen] = useState<boolean>(false);
  const [expressionStatus, setExpressionStatus] = useState<ExpressionStatus>(() =>
    cantarellaExpressionController.getStatus()
  );
  const [activeGesture, setActiveGesture] = useState<CantarellaGestureName | null>(null);
  const [animationStatus, setAnimationStatus] = useState<AnimationStatus>(() =>
    cantarellaAnimationManager.getStatus()
  );
  const [discoveredMotions, setDiscoveredMotions] = useState<import('../../types/animation').DiscoveredAnimationItem[]>(() =>
    cantarellaAnimationManager.getCompatibleMotions()
  );

  // Conversational output and dialogue state
  const [activeTurn, setActiveTurn] = useState<CompanionDialogueTurn | null>(null);
  const [isDialogueVisible, setIsDialogueVisible] = useState<boolean>(false);
  const [inputText, setInputText] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState<boolean>(false);

  const trayRef = useRef<HTMLDivElement>(null);
  const toggleBtnRef = useRef<HTMLButtonElement>(null);
  const chatToggleBtnRef = useRef<HTMLButtonElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const lastPlayedTurnIdRef = useRef<string | null>(null);
  const dialogueEndRef = useRef<HTMLDivElement>(null);

  // Subscribe to live expression status
  useEffect(() => {
    return cantarellaExpressionController.subscribe(setExpressionStatus);
  }, []);

  // Subscribe to live imported VRMA animation status & discovery
  useEffect(() => {
    return cantarellaAnimationManager.subscribe((status) => {
      setAnimationStatus(status);
      setDiscoveredMotions(cantarellaAnimationManager.getCompatibleMotions());
    });
  }, []);

  // Autofocus input when dialogue opens
  useEffect(() => {
    if (isDialogueVisible) {
      const timer = window.setTimeout(() => {
        chatInputRef.current?.focus();
      }, 80);
      return () => window.clearTimeout(timer);
    }
  }, [isDialogueVisible]);

  // Initial dialogue turn retrieval and real-time cross-window synchronization
  useEffect(() => {
    // 1. Fetch cached dialogue turn snapshot upon mount / reload
    window.stellaDesktop?.getDialogueTurn?.()
      .then((snapshot) => {
        if (snapshot) {
          setActiveTurn(snapshot);
          if (snapshot.status === 'thinking' || snapshot.status === 'speaking' || snapshot.assistantText) {
            setIsDialogueVisible(true);
          }
        }
      })
      .catch(() => {});

    // 2. Real-time dialogue event listener from workspace or other windows
    const unbindDialogue = window.stellaDesktop?.onDialogueTurnChanged?.((turn) => {
      if (!turn) return;
      setActiveTurn(turn);
      setIsDialogueVisible(true);

      if (turn.status === 'thinking') {
        cantarellaPerformanceCoordinator.onThinking(turn.turnId);
      } else if (
        (turn.status === 'speaking' || turn.status === 'completed') &&
        turn.assistantText &&
        lastPlayedTurnIdRef.current !== turn.turnId
      ) {
        lastPlayedTurnIdRef.current = turn.turnId;
        setIsAudioPlaying(true);
        cantarellaPerformanceCoordinator
          .performResponse(turn, () => {
            setIsAudioPlaying(false);
          })
          .catch((err) => {
            console.warn('[Overlay Audio] Playback error:', err);
            setIsAudioPlaying(false);
          });
      }
    });

    return () => {
      unbindDialogue?.();
    };
  }, []);


  // Scroll dialogue into view on new text
  useEffect(() => {
    if (isDialogueVisible) {
      dialogueEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeTurn, isDialogueVisible]);

  // Keyboard accessibility: Escape key closes the reaction drawer or dialogue
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isTrayOpen) {
          setIsTrayOpen(false);
          toggleBtnRef.current?.focus();
        } else if (isDialogueVisible) {
          setIsDialogueVisible(false);
          chatToggleBtnRef.current?.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isTrayOpen, isDialogueVisible]);

  // Pause speech & close menus when window rendering is paused
  useEffect(() => {
    const unbind = window.stellaDesktop?.onPauseRendering?.(() => {
      setIsTrayOpen(false);
      stopSpeechAudio();
      setIsAudioPlaying(false);
    });
    return () => unbind?.();
  }, []);

  const handleToggleTray = useCallback(() => {
    setIsTrayOpen((prev) => !prev);
  }, []);

  const handleToggleDialogue = useCallback(() => {
    setIsDialogueVisible((prev) => !prev);
  }, []);

  const handleSelectExpression = useCallback((name: CantarellaExpressionName) => {
    if (name === 'neutral') {
      cantarellaExpressionController.resetToNeutral(0.35);
    } else {
      cantarellaExpressionController.setExpression(name, { duration: 0.35 });
    }
  }, []);

  const handleTriggerGesture = useCallback((gesture: CantarellaGestureName) => {
    setActiveGesture(gesture);
    cantarellaExpressionController.playGesture(gesture);

    // Reset gesture active indicator after animation completes
    window.setTimeout(() => {
      setActiveGesture(null);
    }, gesture === 'wave' ? 2300 : 1200);
  }, []);

  // Submit a conversational message directly from the companion overlay
  const handleSendFromOverlay = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed || isSending) return;

    setInputText('');
    setIsSending(true);

    const turnId = `turn_${Date.now()}`;

    // 1. Resolve natural-language action intent
    const actionIntent = cantarellaActionRegistry.resolveIntent(trimmed);
    let dispatchedActionId: string | null = null;
    let perceptualState: Record<string, unknown> = {};

    if (actionIntent.type === 'command' && actionIntent.actionId) {
      dispatchedActionId = actionIntent.actionId;
      // Dispatch immediately so avatar begins movement in real-time
      cantarellaActionRegistry.executeAction(actionIntent.actionId).catch((err) => {
        console.warn('[Overlay Action] Execution error:', err);
      });
      perceptualState = {
        action_requested: actionIntent.actionId,
        action_name: actionIntent.actionName,
        action_dispatched: true,
      };
    } else if (actionIntent.type === 'unknown_command') {
      perceptualState = {
        action_requested: actionIntent.requestedTerm,
        action_supported: false,
      };
    } else if (actionIntent.type === 'query') {
      perceptualState = {
        action_query: true,
      };
    }

    const initialTurn: CompanionDialogueTurn = {
      turnId,
      userMessage: trimmed,
      assistantText: '',
      actionId: dispatchedActionId,
      actionStatus: dispatchedActionId ? 'dispatched' : 'none',
      status: 'thinking',
      timestamp: Date.now(),
    };

    setActiveTurn(initialTurn);
    setIsDialogueVisible(true);
    cantarellaPerformanceCoordinator.onThinking(turnId);
    window.stellaDesktop?.sendDialogueTurn?.(initialTurn);

    try {
      const response = await sendTurn({
        user_message: trimmed,
        perceptual_state: perceptualState,
      });

      // Check if brain proposed an avatar animation if not already dispatched
      let finalActionId = dispatchedActionId;
      if (!finalActionId && response.proposed_actions?.length) {
        const animProposal = response.proposed_actions.find(
          (p) => p.action_name === 'avatar_animation' && typeof p.parameters?.animation_id === 'string'
        );
        if (animProposal && cantarellaActionRegistry.isRegistered(animProposal.parameters.animation_id as string)) {
          finalActionId = animProposal.parameters.animation_id as string;
        }
      }

      const completedTurn: CompanionDialogueTurn = {
        turnId: response.turn_id || turnId,
        userMessage: trimmed,
        assistantText: response.user_facing_text || '(Empty response from reasoning engine)',
        expressionHint: response.expression_hint,
        actionId: finalActionId,
        actionStatus: dispatchedActionId ? 'dispatched' : finalActionId ? 'dispatched' : 'none',
        status: response.user_facing_text ? 'speaking' : 'completed',
        timestamp: Date.now(),
      };

      setActiveTurn(completedTurn);
      window.stellaDesktop?.sendDialogueTurn?.(completedTurn);

      if (response.user_facing_text) {
        lastPlayedTurnIdRef.current = completedTurn.turnId;
        setIsAudioPlaying(true);
        await cantarellaPerformanceCoordinator.performResponse(completedTurn, () => {
          setIsAudioPlaying(false);
        });
      }
    } catch (err: unknown) {
      const errorText = err instanceof Error ? err.message : String(err);
      const errorTurn: CompanionDialogueTurn = {
        turnId,
        userMessage: trimmed,
        assistantText: `Error communicating with local brain: ${errorText}`,
        status: 'error',
        timestamp: Date.now(),
      };
      setActiveTurn(errorTurn);
      window.stellaDesktop?.sendDialogueTurn?.(errorTurn);
      cantarellaPerformanceCoordinator.cancelCurrentPerformance();
    } finally {
      setIsSending(false);
      setIsAudioPlaying(false);
      window.setTimeout(() => {
        chatInputRef.current?.focus();
      }, 50);
    }
  };

  // Replay speech audio for current assistant message
  const handleReplayAudio = () => {
    if (!activeTurn?.assistantText || isAudioPlaying) return;
    setIsAudioPlaying(true);
    cantarellaPerformanceCoordinator
      .performResponse(activeTurn, () => {
        setIsAudioPlaying(false);
      })
      .catch((err) => {
        console.warn('[Overlay Audio] Replay error:', err);
        setIsAudioPlaying(false);
      });
  };

  return (
    <main
      className="companion-overlay-root"
      id="stella-companion-overlay"
      aria-label="Stella Desktop Companion"
    >
      {/* 1. Standalone 3D Cantarella Avatar Stage (Background) */}
      <div
        className="companion-avatar-stage"
        aria-label="Cantarella 3D Model"
        onClick={() => {
          if (isTrayOpen) setIsTrayOpen(false);
        }}
      >
        <CantarellaAvatar framing="full" />
      </div>

      {/* 1. Sleek Floating Mini Capsule for Dragging & Quick Actions */}
      <nav className="companion-capsule" aria-label="Companion Controls">
        <div className="companion-drag-grip" title="Click and drag to reposition Cantarella">
          <span className="drag-icon" aria-hidden="true">⠿</span>
          <span className="brand-dot" aria-hidden="true" />
          <span className="companion-name">Cantarella</span>
        </div>

        <div className="companion-controls-group">
          {/* Dialogue / Chat Toggle Button */}
          <button
            ref={chatToggleBtnRef}
            type="button"
            id="btn-companion-chat-toggle"
            className={`companion-btn chat-btn ${isDialogueVisible ? 'active' : ''}`}
            onClick={handleToggleDialogue}
            title={isDialogueVisible ? 'Hide dialogue' : 'Chat & dialogue'}
            aria-label={isDialogueVisible ? 'Hide dialogue' : 'Show chat and dialogue'}
            aria-expanded={isDialogueVisible}
          >
            <span className="material-symbols-outlined">chat_bubble</span>
          </button>

          {/* Reaction Palette Toggle Button */}
          <button
            ref={toggleBtnRef}
            type="button"
            id="btn-companion-reactions-toggle"
            className={`companion-btn reaction-btn ${isTrayOpen ? 'active' : ''}`}
            onClick={handleToggleTray}
            title={isTrayOpen ? 'Close reactions (Esc)' : 'Expressions & reactions'}
            aria-label={isTrayOpen ? 'Close reactions menu' : 'Open expressions and reactions menu'}
            aria-expanded={isTrayOpen}
            aria-controls="companion-reactions-tray"
          >
            <span className="material-symbols-outlined">sentiment_satisfied</span>
          </button>

          {/* Hide / Minimize companion button */}
          <button
            type="button"
            id="btn-companion-minimize"
            className="companion-btn"
            onClick={minimizeWindow}
            title="Hide companion"
            aria-label="Hide companion"
          >
            <span className="material-symbols-outlined">remove</span>
          </button>

          {/* Return to Stella button */}
          <button
            type="button"
            id="btn-companion-return"
            className="companion-btn return-btn"
            onClick={returnToWorkspace}
            title="Return to Stella"
            aria-label="Return to Stella"
          >
            <span className="material-symbols-outlined">open_in_full</span>
          </button>
        </div>
      </nav>

      {/* 2. Compact Floating Reaction Tray (Collapsible & Keyboard-Accessible) */}
      {isTrayOpen && (
        <div
          ref={trayRef}
          className="companion-reactions-tray"
          id="companion-reactions-tray"
          role="toolbar"
          aria-label="Facial expressions and reactions"
        >
          {/* Facial Expressions Group */}
          <div className="reactions-subgroup">
            <span className="reactions-section-label">Expressions</span>
            <div className="reactions-btn-row" role="group" aria-label="Supported facial expressions">
              {SUPPORTED_EXPRESSIONS.map((expr) => {
                const isActive = expressionStatus.targetExpression === expr.id;
                return (
                  <button
                    key={expr.id}
                    type="button"
                    id={`reaction-btn-${expr.id}`}
                    className={`reaction-pill-btn ${isActive ? 'active' : ''}`}
                    onClick={() => handleSelectExpression(expr.id)}
                    title={`${expr.label}: ${expr.hint}`}
                    aria-label={`${expr.label} expression: ${expr.hint}`}
                    aria-pressed={isActive}
                  >
                    <span className="pill-emoji" aria-hidden="true">{expr.emoji}</span>
                    <span className="pill-label">{expr.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="reactions-separator" aria-hidden="true" />

          {/* Safe Fallback Gestures Group */}
          <div className="reactions-subgroup">
            <span className="reactions-section-label">Gestures (Fallback)</span>
            <div className="reactions-btn-row" role="group" aria-label="Fallback gestures">
              <button
                type="button"
                id="reaction-btn-nod"
                className={`reaction-pill-btn gesture-pill ${activeGesture === 'nod' ? 'active' : ''}`}
                onClick={() => handleTriggerGesture('nod')}
                title="Gentle affirmation nod (hand-coded fallback)"
                aria-label="Affirmation nod gesture"
                aria-pressed={activeGesture === 'nod'}
              >
                <span className="pill-emoji" aria-hidden="true">🙏</span>
                <span className="pill-label">Nod</span>
              </button>
            </div>
          </div>

          <div className="reactions-separator" aria-hidden="true" />

          {/* Imported VRMA Motion Pack Test Controls */}
          <div className="reactions-subgroup">
            <div className="reactions-section-header">
              <span className="reactions-section-label">Dynamic Animations</span>
              {animationStatus.isPlaying && (
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    type="button"
                    id="btn-vrma-pause"
                    className="reaction-stop-btn"
                    onClick={() => {
                      if (animationStatus.isPaused) {
                        cantarellaAnimationManager.resumeMotion();
                      } else {
                        cantarellaAnimationManager.pauseMotion();
                      }
                    }}
                    title={animationStatus.isPaused ? 'Resume playback' : 'Pause playback'}
                    aria-label={animationStatus.isPaused ? 'Resume animation' : 'Pause animation'}
                  >
                    {animationStatus.isPaused ? 'Resume' : 'Pause'}
                  </button>
                  <button
                    type="button"
                    id="btn-vrma-stop"
                    className="reaction-stop-btn"
                    onClick={() => cantarellaAnimationManager.stopMotion(0.35)}
                    title="Stop active motion and return smoothly to rest pose"
                    aria-label="Stop active animation"
                  >
                    Stop
                  </button>
                </div>
              )}
            </div>
            <div className="reactions-btn-row" role="group" aria-label="Dynamic Animations">
              {discoveredMotions.map((motion) => {
                const isActive = animationStatus.activeMotionId === motion.id && animationStatus.isPlaying;
                const isLoading = animationStatus.activeMotionId === motion.id && animationStatus.isLoading;
                return (
                  <button
                    key={motion.id}
                    type="button"
                    id={`reaction-btn-${motion.id.toLowerCase()}`}
                    className={`reaction-pill-btn vrma-pill ${isActive ? 'active' : ''} ${isLoading ? 'loading' : ''}`}
                    onClick={() => {
                      if (isActive) {
                        cantarellaAnimationManager.stopMotion(0.35);
                      } else {
                        cantarellaAnimationManager.playMotion(motion.id, { loop: motion.isLoop });
                      }
                    }}
                    title={`${motion.displayName} (${motion.fileName}): ${motion.description || ''}`}
                    aria-label={`Animation: ${motion.displayName}`}
                    aria-pressed={isActive}
                  >
                    <span className="pill-label">{motion.displayName}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 3. Primary Output Companion Dialogue Presentation Area */}
      {isDialogueVisible && (
        <section
          className="companion-dialogue-card"
          id="companion-dialogue-card"
          aria-label="Stella Dialogue"
        >
          {/* Dialogue Header Status Bar */}
          <div className="dialogue-card-header">
            <div className="dialogue-status-indicator">
              {isSending || activeTurn?.status === 'thinking' ? (
                <>
                  <span className="status-dot thinking" aria-hidden="true" />
                  <span className="status-text">Thinking...</span>
                </>
              ) : isAudioPlaying || activeTurn?.status === 'speaking' ? (
                <>
                  <span className="status-dot speaking" aria-hidden="true" />
                  <span className="status-text">Speaking...</span>
                </>
              ) : (
                <>
                  <span className="status-dot online" aria-hidden="true" />
                  <span className="status-text">
                    Stella {activeTurn?.expressionHint ? `• ${activeTurn.expressionHint}` : ''}
                  </span>
                </>
              )}
            </div>

            <div className="dialogue-header-actions">
              {activeTurn?.assistantText && (
                <button
                  type="button"
                  id="btn-dialogue-replay-voice"
                  className={`dialogue-action-btn ${isAudioPlaying ? 'active' : ''}`}
                  onClick={handleReplayAudio}
                  title="Replay voice response"
                  aria-label="Replay voice response"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>
                    {isAudioPlaying ? 'volume_up' : 'volume_down'}
                  </span>
                </button>
              )}

              <button
                type="button"
                id="btn-dialogue-close"
                className="dialogue-action-btn close-btn"
                onClick={() => setIsDialogueVisible(false)}
                title="Dismiss dialogue"
                aria-label="Dismiss dialogue"
              >
                <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>
                  close
                </span>
              </button>
            </div>
          </div>

          {/* Dialogue Message Content */}
          <div
            className="dialogue-card-body"
            id="dialogue-card-body"
            tabIndex={0}
            role="region"
            aria-label="Conversation message"
          >
            {isSending || (activeTurn?.status === 'thinking' && !activeTurn?.assistantText) ? (
              <div className="dialogue-thinking-indicator">
                <span className="pulsing-orbit-core" aria-hidden="true">✦</span>
                <span>Connecting to local reasoning engine...</span>
              </div>
            ) : activeTurn ? (
              <div className="dialogue-text-content">
                {activeTurn.userMessage && (
                  <div className="dialogue-user-pill">
                    <span className="user-label">You:</span> {activeTurn.userMessage}
                  </div>
                )}
                <div
                  className={`dialogue-assistant-reply ${activeTurn.status === 'error' ? 'error' : ''}`}
                  id="companion-assistant-reply-text"
                >
                  {activeTurn.assistantText || '...'}
                </div>
              </div>
            ) : (
              <div className="dialogue-empty-state">
                How may I assist your exploration? Message me below.
              </div>
            )}
            <div ref={dialogueEndRef} />
          </div>

          {/* Compact Quick-Chat Input Pill */}
          <form
            className="dialogue-input-bar"
            onSubmit={handleSendFromOverlay}
            onClick={() => chatInputRef.current?.focus()}
          >
            <input
              ref={chatInputRef}
              type="text"
              id="companion-chat-input"
              className="dialogue-text-input"
              placeholder="Message Stella..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onFocus={() => cantarellaPerformanceCoordinator.onListening()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendFromOverlay();
                }
              }}
              disabled={isSending}
              autoComplete="off"
              spellCheck={false}
              aria-label="Message Stella"
            />
            <button
              type="submit"
              id="btn-companion-send"
              className="dialogue-send-btn"
              disabled={isSending || !inputText.trim()}
              title="Send message"
              aria-label="Send message"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>
                arrow_upward
              </span>
            </button>
          </form>
        </section>
      )}
    </main>
  );
};


export default CompanionOverlay;
