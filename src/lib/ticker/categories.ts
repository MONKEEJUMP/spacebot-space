import { TickerCategory } from "./types";

interface CategoryConfig {
  label: string;
  labelShort: string;
  color: string;
  textColor: string;
}

export const TICKER_CATEGORIES: Record<TickerCategory, CategoryConfig> = {
  breaking:      { label: "BREAKING",    labelShort: "!",  color: "#ff3b3b", textColor: "#ffffff" },
  model_release: { label: "MODEL",       labelShort: "M",  color: "#00d4aa", textColor: "#000000" },
  funding:       { label: "FUNDING",     labelShort: "F",  color: "#ffd700", textColor: "#000000" },
  research:      { label: "PAPER",       labelShort: "R",  color: "#7b68ee", textColor: "#ffffff" },
  policy:        { label: "POLICY",      labelShort: "P",  color: "#ff6b35", textColor: "#000000" },
  product:       { label: "LAUNCH",      labelShort: "L",  color: "#00bfff", textColor: "#000000" },
  open_source:   { label: "OPEN SOURCE", labelShort: "OS", color: "#32cd32", textColor: "#000000" },
  tutorial:      { label: "TUTORIAL",    labelShort: "T",  color: "#dda0dd", textColor: "#000000" },
  industry:      { label: "",            labelShort: "",   color: "",        textColor: "" },
};
