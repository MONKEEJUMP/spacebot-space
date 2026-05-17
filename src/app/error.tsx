"use client";
import { useEffect } from "react";
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Root]", error);
  }, [error]);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        gap: "20px",
        fontFamily: "var(--sb-font-ui, monospace)",
        textTransform: "uppercase",
      }}
    >
      <div
        style={{
          color: "var(--sb-status-error, #E20000)",
          fontSize: "14px",
          letterSpacing: "2px",
        }}
      >
        SIGNAL INTERRUPTED
      </div>
      <button
        onClick={reset}
        style={{
          padding: "8px 20px",
          backgroundColor: "transparent",
          border: "1px solid var(--sb-accent, #5200FF)",
          color: "var(--sb-accent, #5200FF)",
          fontFamily: "var(--sb-font-ui, monospace)",
          fontSize: "12px",
          textTransform: "uppercase",
          letterSpacing: "2px",
          cursor: "pointer",
          transition: "all 0.15s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "var(--sb-accent, #5200FF)";
          e.currentTarget.style.color = "var(--sb-bg-primary, #0C0C0C)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
          e.currentTarget.style.color = "var(--sb-accent, #5200FF)";
        }}
      >
        RECONNECT
      </button>
    </div>
  );
}
