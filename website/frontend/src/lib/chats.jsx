import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { useAuth } from "./auth";

// The doctor's saved assistant conversations (general + per patient), shared by the sidebar
// list and the chat panel so a new or deleted chat shows up everywhere at once.
const ChatsContext = createContext(null);

export function ChatsProvider({ children }) {
  const { token } = useAuth();
  const [chats, setChats] = useState([]);

  const refresh = useCallback(async () => {
    try {
      const { conversations } = await api("/api/conversations");
      setChats(conversations);
    } catch {
      /* the sidebar just stays as it was */
    }
  }, []);

  useEffect(() => {
    if (token) refresh();
    else setChats([]);
  }, [token, refresh]);

  const upsert = useCallback((chat) => setChats((cs) => [chat, ...cs.filter((c) => c.id !== chat.id)]), []);
  const touch = useCallback(
    (id) =>
      setChats((cs) => {
        const cur = cs.find((c) => c.id === id);
        return cur ? [{ ...cur, updatedAt: new Date().toISOString() }, ...cs.filter((c) => c.id !== id)] : cs;
      }),
    []
  );
  const forget = useCallback((id) => setChats((cs) => cs.filter((c) => c.id !== id)), []);
  const remove = useCallback(
    async (id) => {
      await api(`/api/conversations/${id}`, { method: "DELETE" });
      forget(id);
    },
    [forget]
  );

  const value = useMemo(() => ({ chats, refresh, upsert, touch, forget, remove }), [chats, refresh, upsert, touch, forget, remove]);
  return <ChatsContext.Provider value={value}>{children}</ChatsContext.Provider>;
}

export const useChats = () => useContext(ChatsContext);

/** Where a saved chat lives: the general assistant, or the patient's Assistant tab. */
export const chatPath = (c) => (c.patient ? `/patients/${c.patient}/assistant?c=${c.id}` : `/assistant?c=${c.id}`);

/** ChatGPT-style date groups, newest first. */
export function groupChats(chats) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const day = 24 * 60 * 60 * 1000;
  const buckets = [
    ["Today", startOfToday.getTime()],
    ["Yesterday", startOfToday.getTime() - day],
    ["Previous 7 days", startOfToday.getTime() - 7 * day],
    ["Previous 30 days", startOfToday.getTime() - 30 * day],
    ["Older", -Infinity],
  ];
  const groups = new Map();
  for (const c of chats) {
    const t = new Date(c.updatedAt).getTime();
    const [label] = buckets.find(([, from]) => t >= from);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(c);
  }
  return [...groups.entries()];
}
