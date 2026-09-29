import ChatPanel from "../components/ChatPanel";

export default function Assistant() {
  return (
    <div className="animate-fade-up">
      <p className="label-eyebrow">GPT-4o · PubMed-grounded</p>
      <h1 className="mt-2 font-display text-[44px] leading-none text-ink-900 sm:text-[52px]">AI Assistant</h1>
      <p className="mt-3 max-w-2xl text-[15px] text-ink-500">
        A general clinical-imaging assistant. For questions about a specific patient, open their workspace — the assistant there
        sees that patient's findings.
      </p>
      <div className="card mt-8 overflow-hidden">
        <ChatPanel className="h-[calc(100vh-280px)]" />
      </div>
    </div>
  );
}
