"use client";
import { useEffect } from "react";
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Global]", error);
  }, [error]);
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: 0,
          backgroundColor: "var(--sb-bg-primary, #0C0C0C)",
          color: "var(--sb-text-primary, #E0E0E0)",
          fontFamily: "var(--sb-font-ui, monospace)",
        }}
      >
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
              border: "1px solid var(--sb-accent, #00DC00)",
              color: "var(--sb-accent, #00DC00)",
              fontFamily: "var(--sb-font-ui, monospace)",
              fontSize: "12px",
              textTransform: "uppercase",
              letterSpacing: "2px",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--sb-accent, #00DC00)";
              e.currentTarget.style.color = "var(--sb-bg-primary, #0C0C0C)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "var(--sb-accent, #00DC00)";
            }}
          >
            RECONNECT
          </button>
        </div>
      </body>
    </html>
  );
}
