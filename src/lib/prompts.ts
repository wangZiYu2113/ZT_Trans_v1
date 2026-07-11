import type { AppSettings, ChatMessage, PromptMode } from "./types";

export const PROMPT_VERSION = "2026-07-10-mvp-1";

export const DEFAULT_PROMPTS: Record<Exclude<PromptMode, "auto">, string> = {
  finance: `你是一个面向股票初学者的金融术语解释助手。
请用中文解释用户提供的股票、财报或金融内容。

输出要求：
1. 一句话解释这个概念
2. 它在股票分析中的用途
3. 给一个简单例子
4. 常见误区或风险
5. 如果它不是金融术语，请直接说明并按通用概念解释

保持简洁，不提供投资建议，不预测涨跌。`,
  english: `你是一个英语学习助手。
请解释用户提供的英文单词、短语或句子。

输出要求：
1. 中文含义
2. 当前语境下的自然理解
3. 词性、语法或搭配说明
4. 一个简单例句
5. 易混淆表达或使用注意

保持简洁，优先帮助用户读懂当前内容。`,
  translate: `你是一个准确、自然的翻译助手。
请把用户提供的内容翻译成中文。

输出要求：
1. 先给自然中文翻译
2. 必要时解释关键词或句子结构
3. 如果 OCR 结果疑似有错，请指出可能错误

不要扩展无关背景。`,
  general: `你是一个通俗概念解释助手。
请用中文解释用户提供的名词、短语或句子。

输出要求：
1. 一句话解释
2. 通俗类比或例子
3. 使用场景
4. 容易误解的点

保持简洁清楚。`
};

const financeKeywords = [
  "市盈率",
  "ttm",
  "扣非",
  "净利润",
  "roe",
  "pe",
  "pb",
  "eps",
  "现金流",
  "营收",
  "财报",
  "估值",
  "分红",
  "股息",
  "资产负债"
];

export function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

export function detectMode(text: string, requestedMode: PromptMode): Exclude<PromptMode, "auto"> {
  if (requestedMode !== "auto") return requestedMode;

  const normalized = normalizeText(text);
  if (financeKeywords.some((keyword) => normalized.includes(keyword))) return "finance";

  const asciiLetters = (text.match(/[A-Za-z]/g) ?? []).length;
  const cjk = (text.match(/[\u4e00-\u9fa5]/g) ?? []).length;
  const englishRatio = asciiLetters / Math.max(text.replace(/\s/g, "").length, 1);

  if (englishRatio > 0.65 && normalized.length <= 120) return "english";
  if (englishRatio > 0.55 || (asciiLetters > 0 && cjk === 0 && text.length > 120)) return "translate";
  return "general";
}

export function buildMessages(
  text: string,
  mode: Exclude<PromptMode, "auto">,
  settings: AppSettings
): ChatMessage[] {
  const prompt = settings.customPrompts[mode]?.trim() || DEFAULT_PROMPTS[mode];
  return [
    { role: "system", content: prompt },
    {
      role: "user",
      content: `来源文字如下，请按要求输出，尽量控制在 100-200 字：\n\n${text}`
    }
  ];
}
