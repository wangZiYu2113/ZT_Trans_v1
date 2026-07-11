import { RotateCcw, Save } from "lucide-react";
import { DEFAULT_PROMPTS } from "../lib/prompts";
import type { AppSettings, PromptMode } from "../lib/types";

interface SettingsPanelProps {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
  onSave: () => void;
}

const promptModes: Array<Exclude<PromptMode, "auto">> = ["finance", "english", "translate", "general"];

export function SettingsPanel({ settings, onChange, onSave }: SettingsPanelProps) {
  const patch = (next: Partial<AppSettings>) => onChange({ ...settings, ...next });

  return (
    <section className="panel settings-panel">
      <div className="panel-title">
        <h2>设置</h2>
        <button type="button" className="primary-button compact" onClick={onSave}>
          <Save size={16} />
          保存
        </button>
      </div>

      <div className="form-grid">
        <label>
          API Base URL
          <input value={settings.apiBaseUrl} onChange={(event) => patch({ apiBaseUrl: event.target.value })} />
        </label>
        <label>
          API Key
          <input
            value={settings.apiKey}
            type="password"
            onChange={(event) => patch({ apiKey: event.target.value })}
            placeholder="sk-..."
          />
        </label>
        <label>
          模型
          <input value={settings.model} onChange={(event) => patch({ model: event.target.value })} />
        </label>
        <label>
          默认模式
          <select
            value={settings.defaultMode}
            onChange={(event) => patch({ defaultMode: event.target.value as PromptMode })}
          >
            <option value="auto">自动</option>
            <option value="finance">股票</option>
            <option value="english">英语</option>
            <option value="translate">翻译</option>
            <option value="general">通用</option>
          </select>
        </label>
        <label>
          划词快捷键
          <input value={settings.hotkeySelection} onChange={(event) => patch({ hotkeySelection: event.target.value })} />
        </label>
        <label>
          框选快捷键
          <input value={settings.hotkeyCapture} onChange={(event) => patch({ hotkeyCapture: event.target.value })} />
        </label>
      </div>

      <div className="prompt-editor">
        {promptModes.map((mode) => (
          <label key={mode}>
            <span>
              {modeName(mode)} Prompt
              <button
                type="button"
                className="ghost-button tiny"
                onClick={() =>
                  patch({
                    customPrompts: {
                      ...settings.customPrompts,
                      [mode]: DEFAULT_PROMPTS[mode]
                    }
                  })
                }
              >
                <RotateCcw size={14} />
                恢复
              </button>
            </span>
            <textarea
              value={settings.customPrompts[mode] ?? DEFAULT_PROMPTS[mode]}
              onChange={(event) =>
                patch({
                  customPrompts: {
                    ...settings.customPrompts,
                    [mode]: event.target.value
                  }
                })
              }
            />
          </label>
        ))}
      </div>
    </section>
  );
}

function modeName(mode: Exclude<PromptMode, "auto">) {
  return {
    finance: "股票",
    english: "英语",
    translate: "翻译",
    general: "通用"
  }[mode];
}
