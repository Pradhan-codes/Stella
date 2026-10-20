import React, { useState, useEffect, useRef } from 'react';
import {
  sendTurn,
  applyExpressionHint,
  TurnResponsePayload,
  HealthResponsePayload,
  ActionProposalSummary,
  ConfirmationPromptSummary,
} from '../../services/brainService';

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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  if (!isOpen) return null;

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

    try {
      const response: TurnResponsePayload = await sendTurn({
        user_message: trimmed,
      });

      // Apply emotional expression hint to Cantarella avatar
      if (response.expression_hint) {
        applyExpressionHint(response.expression_hint);
      }

      const assistantMsg: MessageItem = {
        id: response.turn_id || `turn_${Date.now()}`,
        sender: 'assistant',
        text: response.user_facing_text || '(Empty response from reasoning engine)',
        expressionHint: response.expression_hint,
        proposedActions: response.proposed_actions,
        confirmationPrompts: response.confirmation_prompts,
        durationMs: response.duration_ms,
        isError: response.status === 'failed',
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: unknown) {
      const errorText = err instanceof Error ? err.message : String(err);
      const errorMsg: MessageItem = {
        id: `err_${Date.now()}`,
        sender: 'assistant',
        text: `Error communicating with local brain: ${errorText}`,
        isError: true,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div
      className="stella-dialogue-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
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
          <button
            type="button"
            className="stella-dialogue-close"
            onClick={onClose}
            aria-label="Close dialogue"
          >
            ×
          </button>
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
