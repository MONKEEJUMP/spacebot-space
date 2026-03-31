const CATEGORY_RULES = [
  {
    category: "model_release",
    pattern:
      /\b(GPT[-\s]?\d|Claude\s?\d|Gemini|Llama\s?\d|Mistral|launch|releas|announc|unveil|introduce|new model|foundation model)\b/i,
  },
  {
    category: "research",
    pattern:
      /\b(study|research|paper|arxiv|findings|scientists|breakthrough|discover|neural|transformer|benchmark|dataset)\b/i,
  },
  {
    category: "funding",
    pattern:
      /\b(rais|fund|Series [A-Z]|valuation|invest|IPO|acqui|merger|billion|million.*round|venture capital|VC)\b/i,
  },
  {
    category: "policy",
    pattern:
      /\b(regulat|congress|senate|EU|legislation|ban|law|govern|policy|compliance|safety|ethics|bias|alignment)\b/i,
  },
  {
    category: "product",
    pattern:
      /\b(app|feature|update|integrat|plugin|API|platform|tool|service|beta|preview|general availability)\b/i,
  },
  {
    category: "open_source",
    pattern:
      /\b(open[\s-]?source|GitHub|Apache|MIT license|Hugging\s?Face|weights|fine[\s-]?tun|LoRA|GGUF)\b/i,
  },
  {
    category: "tutorial",
    pattern:
      /\b(how to|tutorial|guide|learn|beginner|step[\s-]by[\s-]step|walkthrough|course|bootcamp)\b/i,
  },
];

/**
 * Assign a category to each headline based on title keyword matching.
 * Falls back to "industry" if no rules match.
 */
function categorize(headlines) {
  return headlines.map((h) => {
    // Skip if already categorized by the source adapter
    if (h.category && h.category !== "industry") {
      return h;
    }

    const title = h.title || "";
    for (const rule of CATEGORY_RULES) {
      if (rule.pattern.test(title)) {
        return { ...h, category: rule.category };
      }
    }

    return { ...h, category: "industry" };
  });
}

module.exports = { categorize };
