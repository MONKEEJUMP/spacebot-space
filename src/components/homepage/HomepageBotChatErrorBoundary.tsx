"use client";

import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class HomepageBotChatErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("[HomepageBotChat] Runtime error:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <section className="max-w-6xl mx-auto px-4 py-8">
          <div
            style={{
              border: "1px solid var(--sb-accent, #00DC00)",
              padding: "40px 20px",
              textAlign: "center",
              fontFamily: "'Glass TTY VT220', monospace",
              color: "var(--sb-text-primary, #cccccc)",
              fontSize: "12px",
              textTransform: "uppercase",
              letterSpacing: "2px",
            }}
          >
            SIGNAL INTERRUPTED — REFRESH TO RECONNECT
          </div>
        </section>
      );
    }
    return this.props.children;
  }
}
