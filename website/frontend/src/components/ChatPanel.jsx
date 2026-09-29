import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AnimatePresence, motion } from "framer-motion";
import { LuArrowUp, LuArrowUpRight, LuHistory, LuPaperclip, LuRotateCcw, LuSquarePen, LuTrash2, LuX } from "react-icons/lu";
import { LogoMark } from "./Logo";
import { cx, useToast } from "./ui";
import { api, ml } from "../lib/api";
import { timeAgo } from "../lib/format";

/** Downscale an attached image to a small JPEG data URL for the saved chat history. */
function makeThumb(file, max = 320) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

const DEFAULT_SUGGESTIONS = [
  "What MRI changes are typical of early Alzheimer's disease?",
  "How does hippocampal atrophy help differentiate Alzheimer's from normal ageing?",
  "हिप्पोकैम्पस शोष का क्या मतलब है?",
  "मेंदूच्या MRI मध्ये CSF वाढणे म्हणजे काय?",
];

/**
 * GPT-4o assistant with conversation memory, image attachments and PubMed citations.
 * Conversations are saved to the API (per patient, or "general" when patientId is null),
 * so the latest one resumes when the assistant is reopened.
 * `context` (optional) is a plain-text patient/findings summary sent with each turn.
 */
export default function ChatPanel({ patientId = null, context, suggestions = DEFAULT_SUGGESTIONS, title, subtitle, className }) {
  const toast = useToast();
  const [messages, setMessages] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const activeRef = useRef(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loadingConvo, setLoadingConvo] = useState(false);
  const [thumb, setThumb] = useState(null);
  const [input, setInput] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [fileError, setFileError] = useState(null);
  const fileRef = useRef(null);
  const endRef = useRef(null);
  const taRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  const selectConversation = useCallback(async (id) => {
    setHistoryOpen(false);
    if (!id) {
      activeRef.current = null;
      setActiveId(null);
      setMessages([]);
      return;
    }
    setLoadingConvo(true);
    try {
      const { conversation } = await api(`/api/conversations/${id}`);
      activeRef.current = conversation.id;
      setActiveId(conversation.id);
      setMessages(conversation.messages.map((m) => ({ role: m.role, content: m.content, image: m.image, sources: m.sources })));
    } catch {
      setMessages([]);
    } finally {
      setLoadingConvo(false);
    }
  }, []);

  // Load this scope's saved conversations and resume the most recent one.
  useEffect(() => {
    let alive = true;
    api(`/api/conversations?patient=${patientId || "general"}`)
      .then(({ conversations: list }) => {
        if (!alive) return;
        setConversations(list);
        if (list[0]) selectConversation(list[0].id);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [patientId, selectConversation]);

  const persist = async (userMsg, assistantMsg) => {
    const payload = [
      { role: "user", content: userMsg.content, image: userMsg.thumb || undefined },
      { role: "assistant", content: assistantMsg.content, sources: assistantMsg.sources },
    ];
    try {
      if (!activeRef.current) {
        const title = (userMsg.content || "Image question").replace(/\s+/g, " ").slice(0, 70);
        const { conversation } = await api("/api/conversations", { method: "POST", body: { patient: patientId, title, messages: payload } });
        activeRef.current = conversation.id;
        setActiveId(conversation.id);
        setConversations((cs) => [{ id: conversation.id, title: conversation.title, updatedAt: conversation.updatedAt, messageCount: 2 }, ...cs]);
      } else {
        const id = activeRef.current;
        await api(`/api/conversations/${id}/messages`, { method: "POST", body: { messages: payload } });
        setConversations((cs) => {
          const cur = cs.find((c) => c.id === id);
          return cur ? [{ ...cur, updatedAt: new Date().toISOString(), messageCount: (cur.messageCount || 0) + 2 }, ...cs.filter((c) => c.id !== id)] : cs;
        });
      }
    } catch (e) {
      console.warn("Could not save the conversation:", e.message);
    }
  };

  const removeConversation = async (id) => {
    try {
      await api(`/api/conversations/${id}`, { method: "DELETE" });
      setConversations((cs) => cs.filter((c) => c.id !== id));
      if (activeRef.current === id) selectConversation(null);
      toast("Conversation deleted");
    } catch (e) {
      toast(e.message, "error");
    }
  };

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`;
  }, [input]);

  const attach = (f) => {
    setFileError(null);
    if (!f) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(f.type)) {
      setFileError("Attach a PNG, JPG or WebP image.");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setFileError("Images must be under 10 MB.");
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setThumb(null);
    makeThumb(f).then(setThumb);
  };
  const detach = () => {
    setFile(null);
    setPreview(null);
    setThumb(null);
  };

  const send = async (textArg, retryOf) => {
    const text = (textArg ?? input).trim();
    const img = retryOf ? retryOf.file : file;
    if ((!text && !img) || busy) return;

    const history = messages
      .filter((m) => !m.error && m.content && m !== retryOf?.orig)
      .map((m) => ({ role: m.role, content: m.content }));
    const userMsg = retryOf || { role: "user", content: text, image: thumb || preview, thumb, file: img };
    setMessages((ms) => [...ms.filter((m) => m !== retryOf?.errorMsg), ...(retryOf ? [] : [userMsg])]);
    if (!retryOf) {
      setInput("");
      detach();
    }
    setBusy(true);
    try {
      const res = await ml("/chat", { text, file: img || undefined, history, context: context || undefined });
      const assistantMsg = { role: "assistant", content: res.message, sources: res.sources || [], citationCheck: res.citation_check };
      setMessages((ms) => [...ms, assistantMsg]);
      persist(userMsg, assistantMsg);
    } catch (e) {
      const errorMsg = { role: "assistant", error: e.message };
      errorMsg.retry = { ...userMsg, errorMsg, orig: retryOf?.orig || userMsg };
      setMessages((ms) => [...ms, errorMsg]);
    } finally {
      setBusy(false);
    }
  };

  const active = conversations.find((c) => c.id === activeId);

  return (
    <div className={cx("flex min-h-[560px] flex-col", className)}>
      {/* Conversation bar: history + new chat */}
      <div className="relative flex items-center gap-2 border-b border-ink-100 px-3 py-2 sm:px-4">
        <button
          onClick={() => setHistoryOpen((v) => !v)}
          className={cx(
            "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-medium transition",
            historyOpen ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-100 hover:text-ink-900"
          )}
        >
          <LuHistory className="h-4 w-4" />
          History
          {conversations.length > 0 && (
            <span className={cx("rounded-full px-1.5 font-mono text-[11px]", historyOpen ? "bg-white/20" : "bg-ink-100 text-ink-600")}>
              {conversations.length}
            </span>
          )}
        </button>
        <p className="min-w-0 flex-1 truncate text-[13px] text-ink-500">{active ? active.title : messages.length ? "New conversation" : ""}</p>
        <button
          onClick={() => selectConversation(null)}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium text-ink-600 transition hover:bg-ink-100 hover:text-ink-900"
        >
          <LuSquarePen className="h-4 w-4" /> New chat
        </button>

        <AnimatePresence>
          {historyOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="absolute top-full left-3 z-20 mt-2 w-[min(92vw,360px)] overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-[var(--shadow-lift)]"
            >
              <p className="border-b border-ink-100 px-4 py-2.5 font-mono text-[10.5px] tracking-[0.14em] text-ink-400 uppercase">Saved conversations</p>
              {conversations.length === 0 ? (
                <p className="px-4 py-6 text-center text-[13px] text-ink-500">No saved conversations yet.</p>
              ) : (
                <ul className="max-h-80 divide-y divide-ink-100 overflow-y-auto">
                  {conversations.map((c) => (
                    <li key={c.id} className={cx("group flex items-center gap-2 pr-2", c.id === activeId && "bg-brand-50/60")}>
                      <button onClick={() => selectConversation(c.id)} className="min-w-0 flex-1 px-4 py-2.5 text-left">
                        <span className="block truncate text-[13.5px] font-medium text-ink-900">{c.title}</span>
                        <span className="block text-[11.5px] text-ink-500">
                          {c.messageCount || 0} messages · {timeAgo(c.updatedAt)}
                        </span>
                      </button>
                      <button
                        aria-label="Delete conversation"
                        onClick={() => removeConversation(c.id)}
                        className="rounded-lg p-1.5 text-ink-300 opacity-0 transition group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-600 focus:opacity-100"
                      >
                        <LuTrash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6" onClick={() => historyOpen && setHistoryOpen(false)}>
        {loadingConvo ? (
          <div className="mx-auto max-w-3xl space-y-4">
            <div className="skeleton ml-auto h-10 w-1/2 rounded-3xl" />
            <div className="skeleton h-24 w-3/4 rounded-2xl" />
          </div>
        ) : messages.length === 0 ? (
          <div className="mx-auto flex max-w-xl flex-col items-center pt-6 text-center">
            <LogoMark className="h-14 w-14" />
            <h3 className="mt-5 font-display text-[32px] leading-tight text-ink-900">{title || "Ask the literature, not the vibes"}</h3>
            <p className="mt-2 text-[14px] text-ink-500">
              {subtitle ||
                "Questions about MRI findings, biomarkers or a scan. Answers cite PubMed abstracts when they're relevant — in English, Hindi, Marathi or your language."}
            </p>
            <div className="mt-7 grid w-full gap-2 sm:grid-cols-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-2xl border border-ink-200 bg-white px-4 py-3 text-left text-[13px] leading-snug text-ink-700 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-sm"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-6">
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[85%] space-y-2">
                    {m.image && <img src={m.image} alt="Attached" className="ml-auto max-h-48 rounded-2xl border border-ink-200 bg-black object-contain" />}
                    {m.content && (
                      <p className="rounded-3xl rounded-br-lg bg-ink-900 px-4 py-2.5 text-[14.5px] leading-relaxed whitespace-pre-wrap text-white">{m.content}</p>
                    )}
                  </div>
                </div>
              ) : (
                <div key={i} className="flex gap-3">
                  <LogoMark className="mt-0.5 h-8 w-8" />
                  <div className="min-w-0 flex-1">
                    {m.error ? (
                      <div className="inline-flex flex-wrap items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-[13.5px] text-rose-800">
                        {m.error}
                        <button onClick={() => send(m.retry.content, m.retry)} className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline">
                          <LuRotateCcw className="h-3.5 w-3.5" /> Retry
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="prose-chat">
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: (p) => <a {...p} target="_blank" rel="noopener noreferrer" /> }}>
                            {m.content}
                          </ReactMarkdown>
                        </div>
                        {m.sources?.length > 0 && (
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            {m.citationCheck?.checked > 0 && (
                              <span className="text-[11.5px] font-medium text-brand-700">✓ citations verified</span>
                            )}
                            {m.sources.map((s) => (
                              <a
                                key={s.n}
                                href={s.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={s.title}
                                className="group inline-flex max-w-[280px] items-center gap-2 rounded-full border border-ink-200 bg-white py-1 pr-3 pl-1 text-[12px] text-ink-600 transition hover:border-brand-300 hover:text-ink-900"
                              >
                                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-50 px-1 font-mono text-[10.5px] font-semibold text-brand-800">{s.n}</span>
                                <span className="truncate">{s.title}</span>
                                <span className="shrink-0 text-ink-400">{s.year}</span>
                                <LuArrowUpRight className="h-3 w-3 shrink-0 text-ink-400 group-hover:text-brand-600" />
                              </a>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )
            )}
            {busy && (
              <div className="flex gap-3">
                <LogoMark className="h-8 w-8" />
                <div className="flex items-center gap-1.5 rounded-full bg-ink-100 px-4 py-3">
                  {[0, 1, 2].map((d) => (
                    <motion.span
                      key={d}
                      className="h-1.5 w-1.5 rounded-full bg-ink-500"
                      animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
                      transition={{ duration: 1, repeat: Infinity, delay: d * 0.15 }}
                    />
                  ))}
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <div className="border-t border-ink-100 bg-white/80 px-4 py-4 backdrop-blur sm:px-6">
        <div className="mx-auto max-w-3xl">
          <AnimatePresence>
            {preview && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} className="mb-2 inline-flex items-center gap-2 rounded-2xl border border-ink-200 bg-white p-1.5 pr-2">
                <img src={preview} alt="" className="h-10 w-10 rounded-xl bg-black object-cover" />
                <span className="max-w-[200px] truncate text-[12.5px] text-ink-600">{file?.name}</span>
                <button aria-label="Remove attachment" onClick={detach} className="rounded-full p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-900">
                  <LuX className="h-3.5 w-3.5" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          {fileError && <p className="mb-2 text-[12.5px] text-rose-600">{fileError}</p>}
          <div
            className="flex items-end gap-2 rounded-3xl border border-ink-200 bg-white p-2 shadow-[var(--shadow-card)] transition focus-within:border-brand-400 focus-within:ring-4 focus-within:ring-brand-100"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              attach(e.dataTransfer.files?.[0]);
            }}
          >
            <button
              type="button"
              aria-label="Attach an MRI image"
              title="Attach an MRI image"
              onClick={() => fileRef.current?.click()}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-500 transition hover:bg-ink-100 hover:text-ink-900"
            >
              <LuPaperclip className="h-[18px] w-[18px]" />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(e) => {
                attach(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <textarea
              ref={taRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPaste={(e) => {
                const f = [...(e.clipboardData?.files || [])][0];
                if (f) attach(f);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={file ? "Ask about this image…" : "Ask a question, or attach an MRI slice…"}
              className="max-h-[180px] min-h-10 flex-1 resize-none bg-transparent px-1 py-2.5 text-[14.5px] text-ink-900 placeholder:text-ink-400 focus:outline-none"
            />
            <button
              type="button"
              aria-label="Send"
              onClick={() => send()}
              disabled={busy || (!input.trim() && !file)}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink-900 text-white transition hover:bg-ink-800 disabled:bg-ink-200"
            >
              <LuArrowUp className="h-[18px] w-[18px]" />
            </button>
          </div>
          <p className="mt-2 text-center text-[11.5px] text-ink-400">
            Enter to send · Shift + Enter for a new line · AI can be wrong — verify clinically.
          </p>
        </div>
      </div>
    </div>
  );
}
