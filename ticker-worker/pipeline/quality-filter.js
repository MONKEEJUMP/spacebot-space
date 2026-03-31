const CLICKBAIT_PHRASES = [
  "you won't believe",
  "shocking",
  "mind-blowing",
  "this one trick",
  "doctors hate",
  "number \\d+ will",
  "gone wrong",
  "gone sexual",
  "not clickbait",
];

const CLICKBAIT_RE = new RegExp(CLICKBAIT_PHRASES.join("|"), "i");

/**
 * Filter out low-quality headlines based on title length,
 * formatting issues, and clickbait patterns.
 */
function qualityFilter(headlines) {
  const passed = [];
  let rejected = 0;

  for (const h of headlines) {
    const title = (h.title || "").trim();

    // Too short
    if (title.length < 15) {
      rejected++;
      continue;
    }

    // Too long
    if (title.length > 300) {
      rejected++;
      continue;
    }

    // All caps (more than 80% uppercase letters)
    const letters = title.replace(/[^a-zA-Z]/g, "");
    if (letters.length > 10 && letters === letters.toUpperCase()) {
      rejected++;
      continue;
    }

    // Excessive exclamation marks
    if ((title.match(/!/g) || []).length >= 3) {
      rejected++;
      continue;
    }

    // Clickbait phrases
    if (CLICKBAIT_RE.test(title)) {
      rejected++;
      continue;
    }

    passed.push(h);
  }

  if (rejected > 0) {
    console.log(`  [quality] ${rejected} headlines rejected, ${passed.length} passed`);
  }

  return passed;
}

module.exports = { qualityFilter };
