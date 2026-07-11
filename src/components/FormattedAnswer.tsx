interface FormattedAnswerProps {
  text: string;
}

type Block =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] };

export function FormattedAnswer({ text }: FormattedAnswerProps) {
  const blocks = parseAnswer(text);
  if (!blocks.length) return null;

  return (
    <div className="formatted-answer">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          return <h3 key={`${block.type}-${index}`}>{block.text}</h3>;
        }
        if (block.type === "list") {
          return (
            <ul key={`${block.type}-${index}`}>
              {block.items.map((item, itemIndex) => (
                <li key={`${item}-${itemIndex}`}>{item}</li>
              ))}
            </ul>
          );
        }
        return <p key={`${block.type}-${index}`}>{block.text}</p>;
      })}
    </div>
  );
}

function parseAnswer(text: string): Block[] {
  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const blocks: Block[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length) {
      blocks.push({ type: "list", items: listItems });
      listItems = [];
    }
  };

  for (const line of lines) {
    const heading = parseHeading(line);
    if (heading) {
      flushList();
      blocks.push({ type: "heading", text: heading });
      continue;
    }

    const listItem = parseListItem(line);
    if (listItem) {
      listItems.push(listItem);
      continue;
    }

    flushList();
    blocks.push({ type: "paragraph", text: stripMarkdownMarks(line) });
  }

  flushList();
  return blocks;
}

function parseHeading(line: string) {
  const bracketHeading = line.match(/^【(.+?)】[:：]?\s*(.*)$/);
  if (bracketHeading) {
    const [, title, rest] = bracketHeading;
    return rest ? `${title}: ${stripMarkdownMarks(rest)}` : title;
  }

  const markdownHeading = line.match(/^#{1,3}\s+(.+)$/);
  if (markdownHeading) return stripMarkdownMarks(markdownHeading[1]);

  return "";
}

function parseListItem(line: string) {
  const match = line.match(/^[-*]\s+(.+)$|^\d+[.)、]\s+(.+)$/);
  if (!match) return "";
  return stripMarkdownMarks(match[1] || match[2] || "");
}

function stripMarkdownMarks(text: string) {
  return text.replace(/\*\*(.*?)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1").trim();
}
