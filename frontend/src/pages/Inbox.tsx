export default function Inbox() {
  return (
    <div className="flex h-full flex-1 flex-col items-center justify-center bg-whispr-snow px-10 text-center">
      <ChatBubbles className="h-40 w-40 text-whispr-rose" />
      <h1 className="mt-6 font-display text-3xl font-semibold text-whispr-noir">
        Speak softly. Connect deeply.
      </h1>
      <p className="mt-2 max-w-xs font-body text-sm text-whispr-mauve">
        Select a conversation from the left, or start a new one, to begin chatting.
      </p>
    </div>
  );
}

function ChatBubbles({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect x="20" y="20" width="120" height="60" rx="18" stroke="currentColor" strokeWidth="2.5" />
      <path d="M60 80 Q50 96 34 100 Q46 88 46 80Z" fill="currentColor" opacity="0.5" />
      <rect x="60" y="90" width="120" height="52" rx="16" stroke="currentColor" strokeWidth="2.2" opacity="0.8" />
      <path d="M150 142 Q160 156 176 158 Q164 148 164 142Z" fill="currentColor" opacity="0.4" />
      <circle cx="45" cy="45" r="3" fill="currentColor" opacity="0.6" />
      <circle cx="60" cy="45" r="3" fill="currentColor" opacity="0.6" />
      <circle cx="75" cy="45" r="3" fill="currentColor" opacity="0.6" />
    </svg>
  );
}
