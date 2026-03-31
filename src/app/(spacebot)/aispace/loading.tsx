export default function AiSpaceLoading() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        fontFamily: "var(--sb-font-ui, monospace)",
        color: "var(--sb-text-secondary, #767676)",
        fontSize: "13px",
        textTransform: "uppercase",
        letterSpacing: "3px",
      }}
    >
      <span style={{ animation: "tickerPulse 1.5s ease-in-out infinite" }}>
        Loading A<span style={{ textTransform: "none", fontSize: "0.85em", verticalAlign: "baseline" }}>i</span>SPACE...
      </span>
      <style>{`
        @keyframes tickerPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
