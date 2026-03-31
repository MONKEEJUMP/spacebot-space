/**
 * Circuit Breaker — prevents hammering failing sources.
 *
 * States:
 *   CLOSED    → normal, requests flow through
 *   OPEN      → tripped, all requests blocked
 *   HALF_OPEN → testing, one request allowed through
 *
 * Thresholds:
 *   3 consecutive failures → OPEN
 *   60 seconds in OPEN    → HALF_OPEN
 *   1 success in HALF_OPEN → CLOSED
 */

class CircuitBreaker {
  constructor(sourceId, options = {}) {
    this.sourceId = sourceId;
    this.state = "CLOSED";
    this.failures = 0;
    this.lastFailureAt = null;
    this.threshold = options.threshold || 3;
    this.resetTimeout = options.resetTimeout || 60000;
  }

  canRequest() {
    if (this.state === "CLOSED") return true;

    if (this.state === "OPEN") {
      if (Date.now() - this.lastFailureAt >= this.resetTimeout) {
        this.state = "HALF_OPEN";
        return true;
      }
      return false;
    }

    // HALF_OPEN — allow one test request
    if (this.state === "HALF_OPEN") return true;

    return false;
  }

  recordSuccess() {
    if (this.state === "HALF_OPEN") {
      console.log(
        `[CIRCUIT] ${this.sourceId} → CLOSED (recovered from HALF_OPEN)`
      );
    }
    this.failures = 0;
    this.state = "CLOSED";
  }

  recordFailure() {
    this.failures++;
    this.lastFailureAt = Date.now();

    if (this.state === "HALF_OPEN") {
      this.state = "OPEN";
      console.log(
        `[CIRCUIT] ${this.sourceId} → OPEN (failed in HALF_OPEN, resetting timer)`
      );
      return;
    }

    if (this.failures >= this.threshold) {
      this.state = "OPEN";
      console.log(
        `[CIRCUIT] ${this.sourceId} → OPEN (${this.failures} consecutive failures)`
      );
    }
  }

  getStatus() {
    return {
      sourceId: this.sourceId,
      state: this.state,
      failures: this.failures,
      lastFailureAt: this.lastFailureAt,
    };
  }
}

// ── Registry — one breaker per source ───────────────────────────────
const breakers = {};

function getBreaker(sourceId) {
  if (!breakers[sourceId]) {
    breakers[sourceId] = new CircuitBreaker(sourceId);
  }
  return breakers[sourceId];
}

function getAllStatus() {
  return Object.values(breakers).map((b) => b.getStatus());
}

module.exports = { CircuitBreaker, getBreaker, getAllStatus };
