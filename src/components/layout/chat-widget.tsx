import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import {
  Bot,
  ChevronRight,
  ExternalLink,
  RotateCcw,
  Send,
  Sparkles,
  User,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  text: string;
  suggestions?: string[];
};

const INITIAL_SUGGESTIONS = [
  "🎓 Find top Math tutors",
  "💰 Affordable tutors (< ৳1000/hr)",
  "📅 How do booking offers work?",
  "⭐ Show highest rated tutors",
];

const INITIAL_MESSAGE: ChatMessage = {
  id: 0,
  role: "assistant",
  text: "Hello! 👋 I'm your **EduBridge AI Assistant**, powered by Google Gemini.\n\nI can help you find verified tutors, compare subjects and rates, or explain how booking and offers work.\n\nWhat are you looking for today?",
  suggestions: INITIAL_SUGGESTIONS,
};

function cleanUrlAndLabel(rawLabel: string, rawUrl: string) {
  let url = rawUrl.trim();
  let label = rawLabel.trim();

  // If url contains nested markdown e.g. [View Tutor Profile](/student/tutor/...)
  const innerUrlMatch = url.match(/\(([^)]+)\)/);
  if (innerUrlMatch && innerUrlMatch[1]) {
    url = innerUrlMatch[1].trim();
  }

  // Strip any wrapping brackets or parentheses from label and url
  label = label.replace(/^[\(\[]+|[\)\]]+$/g, "").trim();
  url = url.replace(/^[<(\[]+|[>)\]]+$/g, "").trim();

  // Decode URI component if percent-encoded paths exist
  try {
    url = decodeURIComponent(url);
  } catch {
    // Keep raw url
  }

  // Extract student paths if wrapped with domains
  const studentPathMatch = url.match(/(\/student\/[a-zA-Z0-9_\-\/]+)/);
  if (studentPathMatch && studentPathMatch[1]) {
    url = studentPathMatch[1];
  }

  // Preserve external URLs (e.g. https://aistudio.google.com)
  if (/^https?:\/\/(?!localhost|127\.0\.0\.1)/i.test(url) && !url.includes("edubridge") && !url.includes("pages.dev")) {
    return { label, url };
  }

  // Strip domain/localhost for internal app routes (e.g., https://...pages.dev/student/... -> /student/...)
  url = url.replace(/^https?:\/\/[^/]+/i, "");
  if (!url.startsWith("/")) {
    url = "/" + url;
  }

  // Sanitize awkward raw technical paths displayed as label
  if (label.startsWith("/") || label.startsWith("http") || label.includes("localhost") || label.includes("pages.dev")) {
    if (url.includes("/student/search")) {
      label = "Browse All Tutors";
    } else if (url.includes("/student/tutor/")) {
      label = "View Tutor Profile & Book";
    } else if (url.includes("/student/offers")) {
      label = "View My Offers";
    } else if (url.includes("/student/complaints")) {
      label = "Complaints & Support";
    }
  }

  return { label, url };
}

function renderInline(text: string) {
  // 1. Remove any unparsed SUGGESTIONS tag that may have been cut off or unparsed
  let processedText = text.replace(/SUGGESTIONS:[\s\S]*$/i, "").trim();

  // 2. Fix accidental nested markdown links:
  // e.g. [Farhana Yeasmin]([View Tutor Profile](/student/tutor/123)) -> [Farhana Yeasmin](/student/tutor/123)
  processedText = processedText.replace(
    /\[([^\]]+)\]\(\[[^\]]*\]\(([^)]+)\)\)/g,
    "[$1]($2)",
  );

  // 3. Fix pages.dev domain prefixed markdown links
  processedText = processedText.replace(
    /\[([^\]]+)\]\(https?:\/\/[^/]*pages\.dev(\/student\/[^)]+)\)/gi,
    "[$1]($2)",
  );

  const regex = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*\n]+)\*\*/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(processedText)) !== null) {
    if (match.index > lastIndex) {
      parts.push(processedText.slice(lastIndex, match.index));
    }

    if (match[1] && match[2]) {
      const clean = cleanUrlAndLabel(match[1], match[2]);
      const isInternal = clean.url.startsWith("/");

      if (clean.url.startsWith("/student/tutor/")) {
        // Render as a highlighted, friendly Tutor action chip
        parts.push(
          <Link
            key={match.index}
            to={clean.url as any}
            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary hover:text-primary-foreground transition-all duration-150 my-1 shadow-2xs group"
          >
            <User className="h-3.5 w-3.5 shrink-0 group-hover:scale-110 transition-transform" />
            <span>{clean.label}</span>
            <ExternalLink className="h-3 w-3 opacity-60 group-hover:opacity-100" />
          </Link>,
        );
      } else if (clean.url.startsWith("/student/search")) {
        // Render as a neat Search page chip
        parts.push(
          <Link
            key={match.index}
            to={clean.url as any}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-semibold text-foreground hover:border-primary/40 hover:bg-accent transition-all duration-150 my-1 shadow-2xs group"
          >
            <span>🔍 {clean.label}</span>
            <ChevronRight className="h-3 w-3 opacity-60 group-hover:translate-x-0.5 transition-transform" />
          </Link>,
        );
      } else if (isInternal) {
        parts.push(
          <Link
            key={match.index}
            to={clean.url as any}
            className="inline-flex items-center font-medium text-primary underline underline-offset-2 hover:opacity-80 transition-opacity"
          >
            {clean.label}
            <ExternalLink className="inline h-3 w-3 ml-0.5" />
          </Link>,
        );
      } else {
        parts.push(
          <a
            key={match.index}
            href={clean.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center font-medium text-primary underline underline-offset-2 hover:opacity-80 transition-opacity"
          >
            {clean.label}
            <ExternalLink className="inline h-3 w-3 ml-0.5" />
          </a>,
        );
      }
    } else if (match[3]) {
      parts.push(
        <strong key={match.index} className="font-semibold text-foreground">
          {match[3]}
        </strong>,
      );
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

function cleanChatbotMarkdown(text: string): string {
  if (!text) return "";

  let cleaned = text;

  // 1. Remove SUGGESTIONS section if present
  cleaned = cleaned.replace(/SUGGESTIONS:[\s\S]*$/i, "").trim();

  // 2. Fix garbled tutor links with duplicated IDs/brackets:
  // e.g. [View Nusrat Jahan's Profile](http://localhost:8080/student/tutor/UUID)2-47c8-8c97-7d0da922b48d))
  cleaned = cleaned.replace(
    /\[([^\]]+)\]\((?:https?:\/\/[^\/]+)?(\/student\/tutor\/[0-9a-fA-F-]+)\)[a-zA-Z0-9_\-\)\(\]\[\/]*/g,
    "[$1]($2)",
  );

  // 3. Fix garbled search links with duplicated suffixes:
  // e.g. [🔍 Browse All Tutors](http://localhost:8080/student/search)rs](/student/search))-এ
  cleaned = cleaned.replace(
    /\[([^\]]+)\]\((?:https?:\/\/[^\/]+)?(\/student\/search)\)[a-zA-Z0-9_\-\)\(\]\[\/]*/g,
    "[$1]($2)",
  );

  // 4. Fix any other nested links: [Label]([Inner](url)) -> [Label](url)
  cleaned = cleaned.replace(
    /\[([^\]]+)\]\(\[?[^\]\)]*?(\/student\/[^)\s]+)\)?\)/g,
    "[$1]($2)",
  );

  // 5. Strip domain/localhost from any remaining internal links
  cleaned = cleaned.replace(
    /\[([^\]]+)\]\(https?:\/\/[^\/]+(\/student\/[^)]+)\)/g,
    "[$1]($2)",
  );

  // 6. Clean outer/stray parentheses: ([Label](url)) -> [Label](url)
  cleaned = cleaned.replace(/\(\s*(\[[^\]]+\]\([^)]+\))\s*\)/g, "$1");
  cleaned = cleaned.replace(/(\[[^\]]+\]\([^)]+\))\s*\)+/g, "$1");

  // 7. Fix unbracketed standalone tutor / search URLs (only when NOT already in markdown link)
  cleaned = cleaned.replace(
    /(^|[\s,。])(?:https?:\/\/[^\s/]+)?(\/student\/tutor\/[0-9a-fA-F-]+)(?=[^\w\/-]|$)/g,
    "$1[View Tutor Profile]($2)",
  );
  cleaned = cleaned.replace(
    /(^|[\s,。])(?:https?:\/\/[^\s/]+)?(\/student\/search)(?=[^\w\/-]|$)/g,
    "$1[Browse All Tutors]($2)",
  );

  return cleaned;
}

function FormattedContent({ text }: { text: string }) {
  const sanitized = cleanChatbotMarkdown(text);
  const lines = sanitized.split("\n");

  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={idx} className="h-1.5" />;
        }

        const isBullet =
          trimmed.startsWith("• ") || trimmed.startsWith("- ") || trimmed.startsWith("* ");
        const content = isBullet ? trimmed.slice(2) : line;

        return (
          <div key={idx} className={cn(isBullet && "flex items-start gap-1.5 pl-1")}>
            {isBullet && (
              <span className="font-bold text-primary select-none leading-none mt-1">•</span>
            )}
            <div className="flex-1">{renderInline(content)}</div>
          </div>
        );
      })}
    </div>
  );
}

function TypewriterMessage({
  text,
  isStreaming,
  onComplete,
}: {
  text: string;
  isStreaming: boolean;
  onComplete?: () => void;
}) {
  const [revealedLength, setRevealedLength] = useState(isStreaming ? 0 : text.length);

  useEffect(() => {
    if (!isStreaming) {
      setRevealedLength(text.length);
      return;
    }

    setRevealedLength(0);
    const total = text.length;
    // Fast typewriter: dynamically completes in ~400-600ms so it feels lively, not slow
    const chunkSize = Math.max(4, Math.ceil(total / 28));

    const interval = setInterval(() => {
      setRevealedLength((prev) => {
        const next = prev + chunkSize;
        if (next >= total) {
          clearInterval(interval);
          onComplete?.();
          return total;
        }
        return next;
      });
    }, 16);

    return () => clearInterval(interval);
  }, [text, isStreaming, onComplete]);

  const visibleText = text.slice(0, revealedLength);
  const isTyping = revealedLength < text.length;

  return (
    <div>
      <FormattedContent text={visibleText} />
      {isTyping && (
        <span className="inline-block h-3.5 w-1.5 ml-0.5 rounded-xs bg-primary animate-pulse align-middle" />
      )}
    </div>
  );
}

export function ChatWidget() {
  const location = useLocation();
  const hasStickyBottomBar = location.pathname.includes("/student/tutor/");
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [activeSuggestions, setActiveSuggestions] = useState<string[]>(INITIAL_SUGGESTIONS);
  const [streamingMsgId, setStreamingMsgId] = useState<number | null>(null);
  const nextId = useRef(1);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);

  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [open, messages, sending, streamingMsgId]);

  useEffect(() => {
    const handleOpenChat = (e: Event) => {
      const customEvent = e as CustomEvent<{ prompt?: string }>;
      setOpen(true);
      if (customEvent.detail?.prompt) {
        setTimeout(() => {
          void sendMessage(customEvent.detail.prompt);
        }, 100);
      }
    };

    window.addEventListener("edubridge:open-chat", handleOpenChat);
    return () => window.removeEventListener("edubridge:open-chat", handleOpenChat);
  }, [messages, sending]);

  async function sendMessage(textToSend?: string) {
    const text = (textToSend ?? input).trim();
    if (!text || sending) return;

    const userMsgId = nextId.current++;
    const updatedMessages: ChatMessage[] = [
      ...messages,
      { id: userMsgId, role: "user", text },
    ];

    setMessages(updatedMessages);
    setInput("");
    setSending(true);

    const abortController = new AbortController();
    const clientTimeoutId = setTimeout(() => abortController.abort(), 25000);

    try {
      const historyPayload = updatedMessages.map((m) => ({
        role: m.role,
        text: m.text,
      }));

      const res = await fetch("/api/chatbot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify({
          message: text,
          history: historyPayload,
        }),
      });
      clearTimeout(clientTimeoutId);

      let data: { reply?: string; suggestions?: string[] } = {};
      try {
        data = (await res.json()) as { reply?: string; suggestions?: string[] };
      } catch {
        console.warn("[ChatWidget] Non-JSON response received from /api/chatbot");
      }

      const replyText =
        data.reply ||
        "I'm here to help! Feel free to ask about available tutors, pricing, or session booking.";

      const newSuggestions =
        data.suggestions && data.suggestions.length > 0
          ? data.suggestions
          : INITIAL_SUGGESTIONS;

      setActiveSuggestions(newSuggestions);

      const assistantMsgId = nextId.current++;
      setStreamingMsgId(assistantMsgId);

      setMessages((prev) => [
        ...prev,
        {
          id: assistantMsgId,
          role: "assistant",
          text: replyText,
          suggestions: newSuggestions,
        },
      ]);
    } catch (err: any) {
      clearTimeout(clientTimeoutId);
      console.error("[ChatWidget] Send error:", err);
      const isAbort = err?.name === "AbortError";
      const errorText = isAbort
        ? "The request took longer than expected to reach our AI service. Please try asking again."
        : "I encountered an issue connecting to the AI service. Please try again in a moment.";

      setMessages((prev) => [
        ...prev,
        {
          id: nextId.current++,
          role: "assistant",
          text: errorText,
          suggestions: INITIAL_SUGGESTIONS,
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  function handleReset() {
    setMessages([INITIAL_MESSAGE]);
    setActiveSuggestions(INITIAL_SUGGESTIONS);
    setStreamingMsgId(null);
  }

  return (
    <>
      {open && (
        <div
          className={cn(
            "fixed right-3 left-3 sm:left-auto sm:right-6 z-[100] flex h-[min(560px,calc(100dvh-5.5rem))] sm:h-[540px] w-auto sm:w-[25rem] flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden transition-all duration-200 animate-in fade-in slide-in-from-bottom-4",
            hasStickyBottomBar ? "bottom-24 sm:bottom-24" : "bottom-18 sm:bottom-24"
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-semibold text-foreground">EduBridge AI</p>
                  <span className="flex h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20" />
                </div>
                <p className="text-xs text-muted-foreground">Powered by Google Gemini</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={handleReset}
                title="Restart conversation"
                aria-label="Restart conversation"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={() => setOpen(false)}
                title="Close chat"
                aria-label="Close chat"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Messages Feed */}
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3.5 scroll-smooth">
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "flex gap-2.5",
                  m.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                {m.role === "assistant" && (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs mt-0.5">
                    <Bot className="h-4 w-4" />
                  </div>
                )}
                <div className={cn("max-w-[85%]", m.role === "user" && "ml-auto")}>
                  <div
                    className={cn(
                      "rounded-2xl px-3.5 py-2.5 text-sm shadow-xs",
                      m.role === "user"
                        ? "bg-primary text-primary-foreground rounded-tr-xs"
                        : "bg-muted/80 text-foreground border border-border/50 rounded-tl-xs",
                    )}
                  >
                    {m.role === "user" ? (
                      <p className="whitespace-pre-wrap">{m.text}</p>
                    ) : (
                      <TypewriterMessage
                        text={m.text}
                        isStreaming={streamingMsgId === m.id}
                        onComplete={() => setStreamingMsgId(null)}
                      />
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Thinking Effect (Google 3-dot circular rotating animation) */}
            {sending && (
              <div className="flex items-start gap-2.5 animate-in fade-in duration-200">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs mt-0.5">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="flex items-center gap-2.5 rounded-2xl border border-primary/20 bg-primary/5 px-3.5 py-2 text-xs font-medium text-primary shadow-xs rounded-tl-xs backdrop-blur-xs">
                  <div className="google-thinking-spinner" aria-label="Thinking indicator">
                    <span className="google-dot google-dot-1" />
                    <span className="google-dot google-dot-2" />
                    <span className="google-dot google-dot-3" />
                  </div>
                  <span className="text-xs text-primary font-medium animate-pulse">
                    Thinking...
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Real-time Suggestion Chips */}
          {activeSuggestions.length > 0 && !sending && !streamingMsgId && (
            <div className="border-t border-border/40 bg-muted/20 px-3 py-2">
              <p className="text-[11px] font-medium text-muted-foreground mb-1.5 px-1">
                Suggested questions:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {activeSuggestions.slice(0, 3).map((suggestion, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => void sendMessage(suggestion)}
                    className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-foreground/90 transition-colors hover:bg-accent hover:text-accent-foreground hover:border-primary/40 text-left"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input Form */}
          <form
            className="flex items-center gap-2 border-t border-border bg-card p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void sendMessage();
            }}
          >
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about tutors, subjects, booking…"
              aria-label="Message EduBridge AI"
              disabled={sending}
              className="h-10 text-sm rounded-xl"
            />
            <Button
              type="submit"
              size="icon"
              disabled={sending || !input.trim()}
              aria-label="Send message"
              className="h-10 w-10 shrink-0 rounded-xl"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      )}

      {/* Floating Trigger Button - Single clean AI Chat icon */}
      <Button
        onClick={() => setOpen((prev) => !prev)}
        size="icon"
        className={cn(
          "fixed right-3 sm:right-6 z-[100] h-12 w-12 sm:h-14 sm:w-14 rounded-full shadow-lg hover:shadow-primary/25 transition-all hover:scale-105 duration-200 [&_svg]:!size-6 sm:[&_svg]:!size-7.5",
          hasStickyBottomBar ? "bottom-20 sm:bottom-6" : "bottom-4 sm:bottom-6"
        )}
        aria-label="Open AI assistant"
      >
        {open ? (
          <X className="!size-5 sm:!size-6" />
        ) : (
          <Bot className="!size-6 sm:!size-7.5" />
        )}
      </Button>
    </>
  );
}
