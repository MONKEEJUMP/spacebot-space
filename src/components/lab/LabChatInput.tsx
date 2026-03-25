import { useState } from 'react';

interface LabChatInputProps {
  onSend: (message: string) => Promise<void>;
  disabled?: boolean;
  placeholder?: string;
}

export default function LabChatInput({ onSend, disabled = false, placeholder = 'Text here' }: Readonly<LabChatInputProps>) {
  const [draft, setDraft] = useState('');

  const handleSend = async () => {
    const message = draft.trim();
    if (!message || disabled) {
      return;
    }

    setDraft('');
    await onSend(message);
  };

  return (
    <div className="border border-[#333333] border-t-0 px-3 py-2 flex items-center gap-2" style={{ backgroundColor: '#0C0C0C' }}>
      <span className="text-sm font-bold select-none" style={{ color: '#00DC00' }}>
        &gt;
      </span>
      <input
        type="text"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void handleSend();
          }
        }}
        disabled={disabled}
        placeholder={placeholder}
        className="flex-1 bg-transparent text-sm outline-none font-mono border-none p-0"
        style={{ color: '#CCCCCC', caretColor: '#00DC00' }}
      />
      <button
        onClick={() => void handleSend()}
        disabled={disabled || !draft.trim()}
        className="text-xs font-bold px-3 py-1 font-mono cursor-pointer bg-transparent disabled:opacity-40 transition-colors"
        style={{
          color: '#FFFFFF',
          border: '1px solid rgba(255,255,255,0.3)',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.6)')}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)')}
      >
        ENTER ↵
      </button>
    </div>
  );
}
