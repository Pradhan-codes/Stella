import React, { useState, useEffect, useRef } from 'react';
import {
  sendTurn,
  applyExpressionHint,
  speakSpeechText,
  stopSpeechAudio,
  setConversationState,
  TurnResponsePayload,
  HealthResponsePayload,
  ActionProposalSummary,
  ConfirmationPromptSummary,
} from '../../services/brainService';
import { cantarellaActionRegistry } from '../CompanionPanel/CantarellaActionRegistry';

interface MessageItem {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  expressionHint?: string | null;
  proposedActions?: ActionProposalSummary[];
  confirmationPrompts?: ConfirmationPromptSummary[];
  durationMs?: number;
  isError?: boolean;
}

interface StellaDialogueModalProps {
  isOpen: boolean;
  onClose: () => void;
  health: HealthResponsePayload | null;
}

export const StellaDialogueModal: React.FC<StellaDialogueModalProps> = ({
  isOpen,
  onClose,
  health,
}) => {
  const [messages, setMessages] = useState<MessageItem[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: 'Greetings. My local cognitive pipeline is connected on loopback. How may I assist your exploration of the observatory?',
      expressionHint: 'neutral',
    },
  ]);
  const [inputValue, setInputValue] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState<boolean>(true);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setConversationState('listening');
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      stopSpeechAudio();
      setSpeakingMessageId(null);
      setConversationState('idle');
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      stopSpeechAudio();
      setConversationState('idle');
    };
  }, []);

  useEffect(() => {
    // Keep dialogue messages in sync if turn was initiated from the companion overlay
    const unbind = window.stellaDesktop?.onDialogueTurnChanged?.((turn) => {
      if (turn.assistantText && turn.status !== 'thinking') {
        setMessages((prev) => {
          if (prev.some((m) => m.id === turn.turnId)) return prev;
          const assistantMsg: MessageItem = {
            id: turn.turnId,
            sender: 'assistant',
            text: turn.assistantText,
            expressionHint: turn.expressionHint,
            isError: turn.status === 'error',
          };
          if (turn.userMessage && !prev.some((m) => m.text === turn.userMessage && m.sender === 'user')) {
            const userMsg: MessageItem = {
              id: `usr_${turn.turnId}`,
              sender: 'user',
              text: turn.userMessage,
            };
            return [...prev, userMsg, assistantMsg];
          }
          return [...prev, assistantMsg];
        });
      }
    });
    return () => unbind?.();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  if (!isOpen) return null;

  const handlePlayMessageAudio = async (msgId: string, text: string) => {
    if (!text) return;
    if (speakingMessageId === msgId) {
      stopSpeechAudio();
      setSpeakingMessageId(null);
      if (isOpen) setConversationState('listening');
      return;
    }
    setSpeakingMessageId(msgId);
    try {
      await speakSpeechText(text);
    } catch (err) {
      console.warn('Audio playback error:', err);
    } finally {
      setSpeakingMessageId((curr) => (curr === msgId ? null : curr));
      if (isOpen) {
        setConversationState('listening');
      }
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed || isSending) return;

    const userMsg: MessageItem = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      text: trimmed,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    setIsSending(true);
    setConversationState('thinking');

    // 1. Resolve natural-language action intent
    const actionIntent = cantarellaActionRegistry.resolveIntent(trimmed);
    let dispatchedActionId: string | null = null;
    let perceptualState: Record<string, unknown> = {};

    if (actionIntent.type === 'command' && actionIntent.actionId) {
      dispatchedActionId = actionIntent.actionId;
      cantarellaActionRegistry.executeAction(actionIntent.actionId).catch((err) => {
        console.warn('[DialogueModal Action] Execution error:', err);
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

    // Notify desktop IPC of thinking turn
    const activeTurnId = `turn_${Date.now()}`;
    window.stellaDesktop?.sendDialogueTurn?.({
      turnId: activeTurnId,
      userMessage: trimmed,
      assistantText: '',
      actionId: dispatchedActionId,
      actionStatus: dispatchedActionId ? 'dispatched' : 'none',
      status: 'thinking',
      timestamp: Date.now(),
    });

    try {
      const response: TurnResponsePayload = await sendTurn({
        user_message: trimmed,
        perceptual_state: perceptualState,
      });

      // Apply emotional expression hint to Cantarella avatar
      if (response.expression_hint) {
        applyExpressionHint(response.expression_hint);
      }

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

      const turnId = response.turn_id || activeTurnId;
      const assistantMsg: MessageItem = {
        id: turnId,
        sender: 'assistant',
        text: response.user_facing_text || '(Empty response from reasoning engine)',
        expressionHint: response.expression_hint,
        proposedActions: response.proposed_actions,
        confirmationPrompts: response.confirmation_prompts,
        durationMs: response.duration_ms,
        isError: response.status === 'failed',
      };

      // 1. Text response is displayed immediately
      setMessages((prev) => [...prev, assistantMsg]);

      // Check whether desktop companion overlay is the active presentation output
      const isOverlayActive =
        window.stellaDesktop?.windowType === 'companion' ||
        (typeof document !== 'undefined' &&
          document.body.classList.contains('companion-overlay-active'));

      // 2. Dispatch turn to desktop IPC for presentation in the Companion Overlay
      window.stellaDesktop?.sendDialogueTurn?.({
        turnId,
        userMessage: trimmed,
        assistantText: response.user_facing_text || '',
        expressionHint: response.expression_hint,
        actionId: finalActionId,
        actionStatus: dispatchedActionId ? 'dispatched' : finalActionId ? 'dispatched' : 'none',
        status: isVoiceEnabled && response.user_facing_text ? 'speaking' : 'completed',
        timestamp: Date.now(),
      });

      // 3. Play speech audio asynchronously if voice is enabled and companion is NOT active
      // When companion overlay is active, the overlay owns conversational audio output
      if (isVoiceEnabled && response.user_facing_text && !assistantMsg.isError) {
        if (!isOverlayActive) {
          setSpeakingMessageId(assistantMsg.id);
          speakSpeechText(response.user_facing_text)
            .catch((speechErr) => {
              console.warn('Stella local voice playback failed gracefully:', speechErr);
            })
            .finally(() => {
              setSpeakingMessageId((curr) => (curr === assistantMsg.id ? null : curr));
              if (isOpen) {
                setConversationState('listening');
              }
            });
        }
      } else {
        if (isOpen) {
          setConversationState('listening');
        }
      }
    } catch (err: unknown) {
      const errorText = err instanceof Error ? err.message : String(err);
      const errorMsg: MessageItem = {
        id: `err_${Date.now()}`,
        sender: 'assistant',
        text: `Error communicating with local brain: ${errorText}`,
        isError: true,
      };
      setMessages((prev) => [...prev, errorMsg]);
      if (isOpen) {
        setConversationState('listening');
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleModalClose = () => {
    stopSpeechAudio();
    setSpeakingMessageId(null);
    setConversationState('idle');
    onClose();
  };

  return (
    <div
      className="stella-dialogue-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleModalClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Stella Dialogue Interface"
    >
      <div className="stella-dialogue-card">
        {/* Header */}
        <div className="stella-dialogue-header">
          <div className="stella-dialogue-title">
            <h3>Stella • Cognitive Link</h3>
            <span className="stella-dialogue-badge">
              {health?.model ? `${health.model} • 127.0.0.1:8000` : '127.0.0.1:8000 Active'}
            </span>
          </div>
          <div className="stella-dialogue-actions-group">
            <button
              type="button"
              className={`stella-dialogue-voice-btn ${isVoiceEnabled ? 'active' : ''}`}
              onClick={() => {
                if (isVoiceEnabled) {
                  stopSpeechAudio();
                  setSpeakingMessageId(null);
                }
                setIsVoiceEnabled(!isVoiceEnabled);
              }}
              title={isVoiceEnabled ? 'Mute Stella voice' : 'Enable Stella voice (Piper TTS)'}
              aria-label={isVoiceEnabled ? 'Mute Stella voice' : 'Enable Stella voice'}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                {isVoiceEnabled ? 'volume_up' : 'volume_off'}
              </span>
            </button>
            <button
              type="button"
              className="stella-dialogue-close"
              onClick={handleModalClose}
              aria-label="Close dialogue"
            >
              ×
            </button>
          </div>
        </div>

        {/* Message Thread */}
        <div className="stella-dialogue-messages">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`stella-msg ${msg.sender} ${msg.isError ? 'error' : ''}`}
            >
              <div className="stella-msg-bubble">{msg.text}</div>

              {/* Action Proposal Banner (Untrusted/Informational Display) */}
              {msg.proposedActions && msg.proposedActions.length > 0 && (
                <div className="stella-action-banner" role="status">
                  <strong>Proposed Actions ({msg.proposedActions.length}):</strong>
                  {msg.proposedActions.map((pa) => (
                    <div key={pa.proposal_id} style={{ marginTop: '4px' }}>
                      • <code>{pa.action_name}</code> (Risk: {pa.risk_level}) — {pa.intent_summary}
                    </div>
                  ))}
                  <div style={{ marginTop: '6px', fontSize: '11px', opacity: 0.85 }}>
                    <em>Security notice: Tool execution is disabled in Step 3.7. Actions remain unexecuted.</em>
                  </div>
                </div>
              )}

              {/* Confirmation Prompts */}
              {msg.confirmationPrompts && msg.confirmationPrompts.length > 0 && (
                <div className="stella-action-banner" style={{ borderColor: 'rgba(239, 83, 80, 0.4)', color: '#ef9a9a' }}>
                  <strong>Awaiting Confirmation:</strong>
                  {msg.confirmationPrompts.map((cp) => (
                    <div key={cp.prompt_id} style={{ marginTop: '4px' }}>
                      • <code>{cp.action_name}</code>: {cp.summary} (Risk: {cp.risk_level})
                    </div>
                  ))}
                </div>
              )}

              {/* Metadata */}
              <div className="stella-msg-meta">
                {msg.sender === 'assistant' && (
                  <>
                    <span>Stella</span>
                    {msg.expressionHint && <span>• Expression: {msg.expressionHint}</span>}
                    {msg.durationMs ? <span>• {Math.round(msg.durationMs)}ms</span> : null}
                    {!msg.isError && (
                      <button
                        type="button"
                        className={`stella-msg-voice-replay ${speakingMessageId === msg.id ? 'speaking' : ''}`}
                        onClick={() => handlePlayMessageAudio(msg.id, msg.text)}
                        title={speakingMessageId === msg.id ? 'Stop speech' : 'Listen with Piper TTS'}
                        aria-label="Listen with Piper TTS"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>
                          {speakingMessageId === msg.id ? 'stop_circle' : 'volume_up'}
                        </span>
                      </button>
                    )}
                  </>
                )}
                {msg.sender === 'user' && <span>You</span>}
              </div>
            </div>
          ))}

          {isSending && (
            <div className="stella-msg assistant">
              <div className="stella-msg-bubble" style={{ opacity: 0.8 }}>
                Thinking...
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Footer */}
        <form onSubmit={handleSendMessage} className="stella-dialogue-input-area">
          <input
            ref={inputRef}
            type="text"
            className="stella-dialogue-input"
            placeholder="Ask or converse with Stella..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            disabled={isSending}
            maxLength={4096}
          />
          <button
            type="submit"
            className="stella-dialogue-send-btn"
            disabled={isSending || !inputValue.trim()}
          >
            {isSending ? 'Sending...' : 'Send'}
          </button>
        </form>
      </div>
    </div>
  );
};
