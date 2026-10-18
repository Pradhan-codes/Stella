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
  VRMA_MOTIONS,
  AnimationStatus,
} from '../CompanionPanel/CantarellaAnimationManager';
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
  const trayRef = useRef<HTMLDivElement>(null);
  const toggleBtnRef = useRef<HTMLButtonElement>(null);

  // Subscribe to live expression status
  useEffect(() => {
    return cantarellaExpressionController.subscribe(setExpressionStatus);
  }, []);

  // Subscribe to live imported VRMA animation status
  useEffect(() => {
    return cantarellaAnimationManager.subscribe(setAnimationStatus);
  }, []);

  // Keyboard accessibility: Escape key closes the reaction drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isTrayOpen) {
        setIsTrayOpen(false);
        toggleBtnRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isTrayOpen]);

  // Close reaction drawer when desktop IPC notifies that rendering is paused (window hidden)
  useEffect(() => {
    const unbind = window.stellaDesktop?.onPauseRendering?.(() => {
      setIsTrayOpen(false);
    });
    return () => unbind?.();
  }, []);

  const handleToggleTray = useCallback(() => {
    setIsTrayOpen((prev) => !prev);
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

  return (
    <main
      className="companion-overlay-root"
      id="stella-companion-overlay"
      aria-label="Stella Desktop Companion"
    >
      {/* 1. Sleek Floating Mini Capsule for Dragging & Quick Actions */}
      <nav className="companion-capsule" aria-label="Companion Controls">
        <div className="companion-drag-grip" title="Click and drag to reposition Cantarella">
          <span className="drag-icon" aria-hidden="true">⠿</span>
          <span className="brand-dot" aria-hidden="true" />
          <span className="companion-name">Cantarella</span>
        </div>

        <div className="companion-controls-group">
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
                id="reaction-btn-wave"
                className={`reaction-pill-btn gesture-pill ${activeGesture === 'wave' ? 'active' : ''}`}
                onClick={() => handleTriggerGesture('wave')}
                title="Gentle greeting wave (hand-coded fallback)"
                aria-label="Wave greeting gesture"
                aria-pressed={activeGesture === 'wave'}
              >
                <span className="pill-emoji" aria-hidden="true">👋</span>
                <span className="pill-label">Wave</span>
              </button>

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
              <span className="reactions-section-label">Animation-Test Controls</span>
              {animationStatus.isPlaying && (
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
              )}
            </div>
            <div className="reactions-btn-row" role="group" aria-label="VRMA Animation Test Controls">
              {VRMA_MOTIONS.map((motion) => {
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
                        cantarellaAnimationManager.playMotion(motion.id);
                      }
                    }}
                    title={`${motion.name} (${motion.file}): ${motion.hint}`}
                    aria-label={`Animation test: ${motion.name}`}
                    aria-pressed={isActive}
                  >
                    <span className="pill-label">{motion.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 3. Standalone 3D Cantarella Avatar Stage (Draggable directly) */}
      <div
        className="companion-avatar-stage"
        aria-label="Cantarella 3D Model"
        onClick={() => {
          if (isTrayOpen) setIsTrayOpen(false);
        }}
      >
        <CantarellaAvatar framing="full" />
      </div>
    </main>
  );
};

export default CompanionOverlay;
