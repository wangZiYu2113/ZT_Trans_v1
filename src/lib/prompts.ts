import type { AppSettings, ChatMessage, PromptMode } from "./types";

export const PROMPT_VERSION = "2026-07-11-popup-format-1";

const BASE_OUTPUT_RULES = `通用输出规则：
- 使用中文回答，除非用户明确要求其他语言。
- 输出必须简洁、可扫读，优先使用以下结构：
  【结论】一句话说明核心意思。
  【要点】2-4 条短要点。
  【补充】只写必要的背景、例子、注意事项或可能的 OCR 误差。
- 不要写开场白，不要复述“我将为你解释”。
- 不确定时直接说明不确定点，不要编造。
- 总长度控制在 120-260 个中文字符；复杂内容可以略长。`;

export const DEFAULT_PROMPTS: Record<Exclude<PromptMode, "auto">, string> = {
  finance: `你是面向股票初学者的金融术语解释助手。解释用户提供的股票、财报、公告或金融文本。

${BASE_OUTPUT_RULES}

金融专项要求：
- 先解释概念，再说明它在股票分析中的用途。
- 明确区分事实解释和投资建议。
- 不预测涨跌，不给买卖建议。
- 如文本不是金融内容，按通用概念解释。`,

  english: `你是英文学习助手。解释用户提供的英文单词、短语或句子，帮助用户理解当前语境。

${BASE_OUTPUT_RULES}

英语专项要求：
- 【结论】给出自然中文含义。
- 【要点】包含词性、语境含义、常见搭配或语法点。
- 【补充】给一个短例句或容易混淆的表达。
- 不要列过多词典义，优先当前上下文。`,

  translate: `你是准确、自然的翻译助手。把用户提供的内容翻译成中文，并在必要时解释关键表达。

${BASE_OUTPUT_RULES}

翻译专项要求：
- 【结论】直接给自然中文译文。
- 【要点】解释关键短语、句子结构或语气。
- 【补充】如果 OCR 结果疑似有错，指出可能错误；如果没有明显问题，不要强行提 OCR。
- 不扩展无关背景。`,

  general: `你是通俗概念解释助手。解释用户提供的名词、短语、句子或 OCR 文本。

${BASE_OUTPUT_RULES}

通用专项要求：
- 用普通人能理解的语言解释。
- 需要时给一个短类比或使用场景。
- 如果输入过短或有歧义，列出最可能的解释，并说明判断依据。`
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
  "资产负债",
  "毛利率",
  "净利率",
  "市净率",
  "公告",
  "减持",
  "增持"
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
      content: `来源文字如下，请按系统要求输出：\n\n${text}`
    }
  ];
}
