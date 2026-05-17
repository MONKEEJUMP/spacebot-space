"use client";

interface TickerPauseButtonProps {
  isPlaying: boolean;
  onToggle: () => void;
}

export default function TickerPauseButton({ isPlaying, onToggle }: TickerPauseButtonProps) {
  return (
    <button
      onClick={onToggle}
      aria-label={isPlaying ? "Pause news ticker" : "Resume news ticker"}
      title={isPlaying ? "Pause" : "Play"}
      style={{
        position: "absolute",
        right: "8px",
        top: "50%",
        transform: "translateY(-50%)",
        width: "24px",
        height: "24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "var(--sb-bg-primary, #0C0C0C)",
        border: "1px solid var(--sb-border-primary, #333)",
        borderRadius: "2px",
        color: "var(--sb-text-secondary, #767676)",
        cursor: "pointer",
        padding: 0,
        fontSize: "12px",
        fontFamily: "monospace",
        lineHeight: 1,
        zIndex: 10,
        transition: "color 0.15s ease, border-color 0.15s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = "var(--sb-accent, #5200FF)";
        e.currentTarget.style.borderColor = "var(--sb-accent, #5200FF)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = "var(--sb-text-secondary, #767676)";
        e.currentTarget.style.borderColor = "var(--sb-border-primary, #333)";
      }}
    >
      {isPlaying ? "\u23F8" : "\u25B6"}
    </button>
  );
}
