import { useEffect, useRef, useState } from 'react';
import { Send, Trash2, Bot, User2 } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Markdown } from '@/components/Markdown';
import { ThinkingDots } from '@/components/LoadingOverlay';
import { Logo } from '@/components/Logo';
import * as api from '@/api/client';

const SUGGESTIONS = [
  'Build me a plan for next week',
  "How's my training load looking?",
  'Best warm-up before a sprint session?',
  'I feel flat and heavy — what should I adjust?',
  'How do I improve my repeated-sprint ability?',
];

export function Coach() {
  const { pushError, apiKeyPresent, health } = useApp();
  const [messages, setMessages] = useState<api.ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [backend, setBackend] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getChat().then(setMessages).catch(() => {});
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || sending) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', content }]);
    setSending(true);
    try {
      const res = await api.sendChat(content);
      setBackend(res.backend);
      setMessages((m) => [...m, { role: 'assistant', content: res.reply }]);
    } catch (e) {
      pushError(e instanceof Error ? e.message : 'Coach unavailable');
      setMessages((m) => m.slice(0, -1)); // roll back the optimistic user msg
      setInput(content);
    } finally {
      setSending(false);
    }
  };

  const clear = async () => {
    try {
      await api.clearChat();
      setMessages([]);
    } catch {
      pushError('Could not clear chat');
    }
  };

  const aiSource = apiKeyPresent
    ? 'Claude'
    : health?.ollama_available
      ? 'Local Ollama'
      : 'offline';

  return (
    <div className="flex h-[calc(100vh-9rem)] flex-col">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Badge variant={aiSource === 'offline' ? 'warning' : 'success'}>
            {backend === 'claude'
              ? 'Powered by Claude'
              : backend === 'ollama'
                ? 'Local Ollama'
                : `AI: ${aiSource}`}
          </Badge>
          <span>Knows your profile, load & recent sessions</span>
        </div>
        {messages.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clear}>
            <Trash2 className="h-3.5 w-3.5" /> Clear
          </Button>
        )}
      </div>

      {/* Conversation */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-4 overflow-y-auto rounded-2xl border border-zinc-800/70 bg-zinc-950/30 p-4"
      >
        {messages.length === 0 && !sending && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Logo className="h-14 w-14" />
            <h3 className="mt-4 text-lg font-medium text-zinc-100">
              Your AI coach is ready
            </h3>
            <p className="mt-1 max-w-sm text-sm text-zinc-500">
              Ask about training, recovery, technique or game prep. It already
              knows your logged sessions and current load.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-brand-600/40 hover:text-brand-200"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <Message key={m.id ?? i} role={m.role} content={m.content} />
        ))}

        {sending && (
          <div className="flex items-start gap-3">
            <Avatar role="assistant" />
            <div className="mt-2">
              <ThinkingDots />
            </div>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="mt-3 flex items-end gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Ask your coach anything…  (Enter to send, Shift+Enter for newline)"
          rows={1}
          className="max-h-32 min-h-[44px] flex-1 resize-none"
        />
        <Button
          onClick={() => send()}
          disabled={sending || !input.trim()}
          className="h-11"
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function Message({ role, content }: { role: string; content: string }) {
  const isUser = role === 'user';
  return (
    <div className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <Avatar role={role} />
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
          isUser
            ? 'bg-brand-600/20 text-zinc-100 ring-1 ring-brand-600/25'
            : 'bg-zinc-900/70 text-zinc-200 ring-1 ring-zinc-800/70'
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap leading-relaxed">{content}</p>
        ) : (
          <Markdown text={content} />
        )}
      </div>
    </div>
  );
}

function Avatar({ role }: { role: string }) {
  const isUser = role === 'user';
  return (
    <div
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
        isUser
          ? 'bg-zinc-800 text-zinc-300'
          : 'bg-brand-600/20 text-brand-300 ring-1 ring-brand-600/30'
      }`}
    >
      {isUser ? <User2 className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
    </div>
  );
}
