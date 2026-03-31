/**
 * MarkdownContent — lightweight markdown renderer
 * Supports: **bold**, *italic*, bullet lists (- and *), numbered lists,
 * headings (#, ##, ###), line breaks.
 * No external dependencies needed.
 */
export default function MarkdownContent({ content = "", className = "" }) {
  if (!content) return null;

  const lines = content.split("\n");
  const elements = [];
  let listBuffer = [];
  let listType = null; // "ul" | "ol"

  function flushList() {
    if (!listBuffer.length) return;
    const Tag = listType;
    elements.push(
      <Tag key={elements.length} style={{ paddingLeft: 18, marginBottom: 10 }}>
        {listBuffer.map((item, i) => (
          <li key={i} style={{ marginBottom: 4 }}
            dangerouslySetInnerHTML={{ __html: inlineFormat(item) }}
          />
        ))}
      </Tag>
    );
    listBuffer = [];
    listType = null;
  }

  lines.forEach((line, i) => {
    const trimmed = line.trim();

    // Headings
    if (/^###\s/.test(trimmed)) {
      flushList();
      elements.push(
        <h3 key={i} style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: "12px 0 4px" }}>
          {trimmed.slice(4)}
        </h3>
      );
      return;
    }
    if (/^##\s/.test(trimmed)) {
      flushList();
      elements.push(
        <h2 key={i} style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: "14px 0 5px" }}>
          {trimmed.slice(3)}
        </h2>
      );
      return;
    }
    if (/^#\s/.test(trimmed)) {
      flushList();
      elements.push(
        <h1 key={i} style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: "16px 0 6px" }}>
          {trimmed.slice(2)}
        </h1>
      );
      return;
    }

    // Unordered list items
    if (/^[-•*]\s/.test(trimmed)) {
      if (listType !== "ul") { flushList(); listType = "ul"; }
      listBuffer.push(trimmed.slice(2));
      return;
    }

    // Ordered list items
    if (/^\d+\.\s/.test(trimmed)) {
      if (listType !== "ol") { flushList(); listType = "ol"; }
      listBuffer.push(trimmed.replace(/^\d+\.\s/, ""));
      return;
    }

    // Empty line = paragraph break
    if (trimmed === "") {
      flushList();
      elements.push(<br key={i} />);
      return;
    }

    // Regular paragraph line
    flushList();
    elements.push(
      <p key={i} style={{ marginBottom: 6 }}
        dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed) }}
      />
    );
  });

  flushList();

  return (
    <div className={`md-content ${className}`}>
      {elements}
    </div>
  );
}

function inlineFormat(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g,     "<em>$1</em>")
    .replace(/_(.+?)_/g,       "<em>$1</em>")
    .replace(/`(.+?)`/g,       '<code style="font-family:var(--font-mono);font-size:12px;background:var(--gray-100);padding:1px 5px;border-radius:4px">$1</code>');
}
