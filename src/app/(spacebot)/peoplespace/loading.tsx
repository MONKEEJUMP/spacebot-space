export default function PeopleSpaceLoading() {
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
        CONNECTING TO PEOPLESPACE...
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
