"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Markdown from "./Markdown";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const THREAD_KEY = "st_thread";

const SUGGESTIONS = [
  "What should I train today?",
  "Plan my next 7 days",
  "I only have 30 minutes — what's best?",
  "Am I overreaching? Look at my HRV and load.",
  "Give me a strength session for runners",
  "How did my training go this week?",
];

function newThreadId() {
  return crypto.randomUUID();
}

function readThread(): string {
  try {
    const t = localStorage.getItem(THREAD_KEY);
    if (t) return t;
    const fresh = newThreadId();
    localStorage.setItem(THREAD_KEY, fresh);
    return fresh;
  } catch {
    return newThreadId();
  }
}

export default function Chat() {
  const [thread, setThread] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const searchParams = useSearchParams();
  const router = useRouter();
  const sentInitial = useRef(false);

  useEffect(() => {
    const t = readThread();
    setThread(t);
    fetch(`/api/chat?thread=${t}`)
      .then((r) => r.json())
      .then((b) => setMessages(b.messages ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || !thread || streaming) return;
      setInput("");
      setStreaming(true);
      setMessages((m) => [...m, { role: "user", content }, { role: "assistant", content: "" }]);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ thread, message: content }),
        });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          setMessages((m) => {
            const copy = [...m];
            const last = copy[copy.length - 1];
            copy[copy.length - 1] = { ...last, content: last.content + chunk };
            return copy;
          });
        }
      } catch (err) {
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", content: `_Couldn't reach the coach (${String(err)})._` };
          return copy;
        });
      } finally {
        setStreaming(false);
      }
    },
    [thread, streaming],
  );

  // Support deep links like /chat?q=... from the Today page.
  useEffect(() => {
    const q = searchParams.get("q");
    if (q && thread && !sentInitial.current) {
      sentInitial.current = true;
      router.replace("/chat");
      send(q);
    }
  }, [searchParams, thread, send, router]);

  function newChat() {
    const t = newThreadId();
    try {
      localStorage.setItem(THREAD_KEY, t);
    } catch {}
    setThread(t);
    setMessages([]);
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia("(pointer: fine)").matches) {
      e.preventDefault();
      send(input);
    }
  }

  function autoGrow(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  return (
    <div className="chat">
      <header className="chat-header">
        <strong>Coach</strong>
        <button className="btn" onClick={newChat} disabled={streaming} style={{ minHeight: 36, padding: "6px 12px" }}>
          New chat
        </button>
      </header>

      <div className="chat-scroll" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="empty">
            <span className="coach-avatar" style={{ width: 40, height: 40, fontSize: 20 }}>✦</span>
            <h1>How can I help you train?</h1>
            <p className="muted">I can see your Strava sessions and WHOOP recovery, sleep and strain.</p>
            <div className="chips" style={{ justifyContent: "center" }}>
              {SUGGESTIONS.map((s) => (
                <button key={s} className="chip" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="msg user">
              <div className="bubble">{m.content}</div>
            </div>
          ) : (
            <div key={i} className="msg assistant">
              <div className="coach-tag">
                <span className="coach-avatar">✦</span> Coach
              </div>
              <div className={`content ${streaming && i === messages.length - 1 ? "typing" : ""}`}>
                {m.content ? <Markdown text={m.content} /> : <span className="muted">Looking at your data…</span>}
              </div>
            </div>
          ),
        )}
      </div>

      <div className="composer-wrap">
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <textarea
            ref={inputRef}
            rows={1}
            placeholder="Ask your coach…"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              autoGrow(e.target);
            }}
            onKeyDown={onKeyDown}
          />
          <button className="send" type="submit" disabled={!input.trim() || streaming} aria-label="Send">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
