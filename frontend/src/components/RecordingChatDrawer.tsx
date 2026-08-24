import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Send,
  Sparkles,
  User,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { useRecordingChat } from "@/hooks/queries";
import { normalizeMathMarkdown } from "@/lib/math";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import type { ChatMessage, Recording } from "@/types";

const SUGGESTED_PROMPTS = [
  "🎯 Resuma os 3 pontos mais importantes em bullet points diretos",
  "🎓 Crie 3 perguntas de simulado com gabarito para eu testar meus conhecimentos",
  "💡 Explique o conceito mais complexo usando uma analogia simples do dia a dia",
  "📋 Quais foram as decisões, tarefas e encaminhamentos práticos?",
  "🔍 O que foi falado no áudio que se relaciona com os documentos anexos?",
];

export function RecordingChatDrawer({
  recording,
  open,
  onClose,
}: {
  recording: Recording;
  open: boolean;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const chatMutation = useRecordingChat();

  // Scroll to bottom when messages change
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 150);
      scrollToBottom();
    }
  }, [open, messages, chatMutation.isPending]);

  const handleSendMessage = (textToSend?: string) => {
    const content = (textToSend || inputValue).trim();
    if (!content || chatMutation.isPending) return;

    const userMsg: ChatMessage = { role: "user", content };
    const updatedMessages = [...messages, userMsg];

    setMessages(updatedMessages);
    setInputValue("");

    chatMutation.mutate(
      {
        id: recording.id,
        messages: updatedMessages,
      },
      {
        onSuccess: (data) => {
          const assistantMsg: ChatMessage = { role: "assistant", content: data.reply };
          setMessages([...updatedMessages, assistantMsg]);
        },
        onError: (err) => {
          const errorMsg: ChatMessage = {
            role: "assistant",
            content: `⚠️ Desculpe, não consegui responder no momento (${err.message || "Erro desconhecido"}). Verifique sua chave da API ou tente novamente.`,
          };
          setMessages([...updatedMessages, errorMsg]);
        },
      },
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleClearChat = () => {
    setMessages([]);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-6 animate-fade-in">
      <div className="relative flex flex-col h-[88vh] max-h-[820px] w-full max-w-2xl rounded-3xl border border-line bg-paper shadow-2xl overflow-hidden animate-scale-up">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line bg-surface/80 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent text-white shadow-soft font-bold text-lg">
              {recording.icon || <Bot className="h-5 w-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-serif text-base sm:text-lg font-bold text-ink truncate">
                  Assistente da Gravação
                </h3>
                <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 font-mono text-[10.5px] font-semibold text-accent">
                  Contexto Ativo
                </span>
              </div>
              <p className="text-xs text-ink-faint truncate">{recording.title}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={handleClearChat}
                className="rounded-xl px-2.5 py-1 text-xs text-ink-soft hover:bg-subtle hover:text-ink transition-colors font-medium"
                title="Limpar conversa"
              >
                Limpar
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-1.5 text-ink-faint hover:bg-subtle hover:text-ink transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Message Feed */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* Welcome Screen & Suggested Prompts */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center min-h-[300px] text-center space-y-4 max-w-lg mx-auto py-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-accent/10 text-accent">
                <Sparkles className="h-7 w-7" />
              </div>
              <div className="space-y-1.5">
                <h4 className="font-serif text-lg font-bold text-ink">
                  Tire dúvidas e aprofunde o conteúdo
                </h4>
                <p className="text-xs sm:text-[13px] text-ink-soft leading-relaxed">
                  Eu li a transcrição completa, o resumo analítico e todos os documentos anexados. O que você gostaria de explorar?
                </p>
              </div>

              {/* Suggestions */}
              <div className="w-full space-y-2 pt-2 text-left">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint px-1">
                  Perguntas Sugeridas:
                </p>
                <div className="flex flex-col gap-1.5">
                  {SUGGESTED_PROMPTS.map((prompt, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSendMessage(prompt)}
                      className="rounded-xl border border-line bg-surface p-2.5 text-xs text-ink-soft text-left hover:border-accent hover:bg-accent-soft/30 hover:text-ink transition-all shadow-xs"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                "flex items-start gap-3 animate-fade-in",
                msg.role === "user" ? "justify-end" : "justify-start",
              )}
            >
              {msg.role === "assistant" && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent font-bold text-sm">
                  {recording.icon || "🤖"}
                </div>
              )}

              <div
                className={cn(
                  "max-w-[84%] sm:max-w-[78%] rounded-2xl px-4 py-3 text-xs sm:text-[13px] leading-relaxed shadow-soft",
                  msg.role === "user"
                    ? "bg-accent text-white rounded-tr-xs font-medium"
                    : "bg-surface border border-line text-ink rounded-tl-xs",
                )}
              >
                {msg.role === "user" ? (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                ) : (
                  <div className="prose prose-sm dark:prose-invert max-w-none leading-relaxed text-ink">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                    >
                      {normalizeMathMarkdown(msg.content)}
                    </ReactMarkdown>
                  </div>
                )}
              </div>

              {msg.role === "user" && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-subtle text-ink-soft">
                  <User className="h-4 w-4" />
                </div>
              )}
            </div>
          ))}

          {/* Typing Indicator */}
          {chatMutation.isPending && (
            <div className="flex items-start gap-3 animate-fade-in">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent font-bold text-sm">
                {recording.icon || "🤖"}
              </div>
              <div className="flex items-center gap-1.5 rounded-2xl border border-line bg-surface px-4 py-3 text-xs text-ink-soft rounded-tl-xs shadow-soft">
                <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
                <span className="h-2 w-2 rounded-full bg-accent animate-pulse [animation-delay:200ms]" />
                <span className="h-2 w-2 rounded-full bg-accent animate-pulse [animation-delay:400ms]" />
                <span className="ml-1 text-[11px] font-medium">Consultando resumo e transcrição…</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Form */}
        <div className="p-4 border-t border-line bg-surface/90 shrink-0">
          <div className="relative flex items-center rounded-2xl border border-line bg-paper shadow-soft focus-within:border-accent focus-within:ring-1 focus-within:ring-accent transition-all p-1.5">
            <textarea
              ref={inputRef}
              rows={2}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Faça uma pergunta sobre a aula, peça exemplos ou tire dúvidas…"
              className="w-full resize-none bg-transparent px-3 py-1.5 text-xs sm:text-[13px] text-ink placeholder:text-ink-faint focus:outline-none leading-relaxed"
            />
            <div className="flex flex-col items-end justify-between self-end p-1">
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleSendMessage()}
                disabled={!inputValue.trim() || chatMutation.isPending}
                className="h-8 w-8 p-0 rounded-xl shadow-soft"
                title="Enviar mensagem (Enter)"
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-between text-[10.5px] text-ink-faint px-2 pt-1.5">
            <span>Pressione <strong>Enter</strong> para enviar, <strong>Shift+Enter</strong> para nova linha.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
