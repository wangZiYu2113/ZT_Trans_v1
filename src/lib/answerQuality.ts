const LEADING_NOISE = [
  /^当然[，。\s]*/i,
  /^好的[，。\s]*/i,
  /^下面是.{0,16}?[：:]\s*/i,
  /^以下是.{0,16}?[：:]\s*/i,
  /^根据你提供的(?:内容|文字|文本)[，。\s]*/i,
  /^我来(?:简单)?解释一下[：，。\s]*/i
];

export function polishAnswer(text: string) {
  let next = text.replace(/\r\n/g, "\n").trim();
  for (const pattern of LEADING_NOISE) {
    next = next.replace(pattern, "");
  }
  next = next
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/【\s+/g, "【")
    .replace(/\s+】/g, "】")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  if (!next) return text.trim();
  return next;
}
