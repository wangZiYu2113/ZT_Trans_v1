import type { PromptMode } from "../lib/types";

const modes: Array<{ id: PromptMode; label: string }> = [
  { id: "auto", label: "自动" },
  { id: "finance", label: "股票" },
  { id: "english", label: "英语" },
  { id: "translate", label: "翻译" },
  { id: "general", label: "通用" }
];

interface ModeTabsProps {
  value: PromptMode;
  onChange: (value: PromptMode) => void;
}

export function ModeTabs({ value, onChange }: ModeTabsProps) {
  return (
    <div className="segmented" role="tablist" aria-label="解释模式">
      {modes.map((mode) => (
        <button
          key={mode.id}
          type="button"
          role="tab"
          aria-selected={value === mode.id}
          className={value === mode.id ? "active" : ""}
          onClick={() => onChange(mode.id)}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}
