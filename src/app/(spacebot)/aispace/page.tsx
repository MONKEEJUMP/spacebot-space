export const revalidate = 300;

export default function AiSpacePage() {
  return (
    <div style={{ minHeight: "calc(100vh - 60px)" }}>
      <section
        style={{
          maxWidth: "960px",
          margin: "0 auto",
          padding: "80px 16px 40px",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontFamily: "'Glass TTY VT220', 'VT323', monospace",
            color: "var(--sb-accent, #5200FF)",
            fontSize: "clamp(32px, 6vw, 56px)",
            textTransform: "uppercase",
            textShadow:
              "0 0 20px color-mix(in srgb, var(--sb-accent, #5200FF) 20%, transparent), 0 0 40px color-mix(in srgb, var(--sb-accent, #5200FF) 10%, transparent)",
            marginBottom: "12px",
            letterSpacing: "4px",
            lineHeight: 1.1,
          }}
        >
          A
          <span
            style={{
              textTransform: "none",
              fontSize: "0.85em",
              verticalAlign: "baseline",
            }}
          >
            i
          </span>
          SPACE
        </h1>
        <p
          style={{
            fontFamily: "var(--sb-font-ui, monospace)",
            color: "var(--sb-text-secondary, #767676)",
            fontSize: "clamp(11px, 1.4vw, 14px)",
            textTransform: "uppercase",
            letterSpacing: "4px",
            marginBottom: "60px",
          }}
        >
          AI NEWS AND DISCOVERY DISTRICT
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "16px",
            maxWidth: "800px",
            margin: "0 auto",
          }}
        >
          <StatusCard
            label="SOURCE FRESHNESS"
            value="UNKNOWN"
            detail="NO TIMESTAMPED HEALTH RECEIPT"
          />
          <StatusCard
            label="INGESTION STATUS"
            value="UNKNOWN"
            detail="NO RUNTIME RECEIPT ON THIS PAGE"
          />
          <StatusCard
            label="PUBLIC PRESENCE"
            value="NOT VERIFIED"
            detail="DIRECTORY PRESENCE IS NOT HEALTH"
          />
          <StatusCard
            label="AUTONOMOUS PUBLIC ACTIONS"
            value="NOT ENABLED"
            detail="CURRENT PUBLIC-TRUTH BOUNDARY"
          />
        </div>

        <div
          style={{
            marginTop: "80px",
            padding: "24px",
            border: "1px solid var(--sb-border-primary, #333)",
            backgroundColor: "var(--sb-bg-secondary, #141414)",
            maxWidth: "600px",
            margin: "80px auto 0",
          }}
        >
          <p
            style={{
              fontFamily: "var(--sb-font-ui, monospace)",
              color: "var(--sb-text-secondary, #767676)",
              fontSize: "12px",
              textTransform: "uppercase",
              letterSpacing: "1px",
              lineHeight: 1.8,
            }}
          >
            <span style={{ color: "var(--sb-accent, #5200FF)" }}>&gt;</span> A
            <span
              style={{
                textTransform: "none",
                fontSize: "0.85em",
                verticalAlign: "baseline",
              }}
            >
              i
            </span>
            SPACE IS THE SANCTUARY&apos;S AI NEWS AND DISCOVERY DISTRICT.
            <br />
            <span style={{ color: "var(--sb-accent, #5200FF)" }}>
              &gt;
            </span>{" "}
            SOURCE HEALTH AND INGESTION FRESHNESS ARE NOT VERIFIED ON THIS PAGE.
            <br />
            <span style={{ color: "var(--sb-accent, #5200FF)" }}>
              &gt;
            </span>{" "}
            VISIT NEWSSPACE FOR TIMESTAMPED PUBLICATION RECORDS.
            <br />
            <span style={{ color: "var(--sb-accent, #5200FF)" }}>
              &gt;
            </span>{" "}
            POWERED BY QWEN... &quot;BUILD THE IMPOSSIBLE!&quot;
          </p>
        </div>
      </section>
    </div>
  );
}

function StatusCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div
      style={{
        padding: "20px",
        border: "1px solid var(--sb-border-primary, #333)",
        backgroundColor: "var(--sb-bg-secondary, #141414)",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: "var(--sb-font-ui, monospace)",
          color: "var(--sb-text-secondary, #767676)",
          fontSize: "10px",
          textTransform: "uppercase",
          letterSpacing: "2px",
          marginBottom: "8px",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "'Glass TTY VT220', 'VT323', monospace",
          color: "var(--sb-accent, #5200FF)",
          fontSize: "28px",
          fontWeight: 700,
          lineHeight: 1.2,
          textShadow:
            "0 0 10px color-mix(in srgb, var(--sb-accent, #5200FF) 30%, transparent)",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontFamily: "var(--sb-font-ui, monospace)",
          color: "var(--sb-text-tertiary, #4A4A4A)",
          fontSize: "10px",
          textTransform: "uppercase",
          letterSpacing: "1px",
          marginTop: "4px",
        }}
      >
        {detail}
      </div>
    </div>
  );
}
