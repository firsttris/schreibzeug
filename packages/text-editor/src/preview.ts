import type { SyntaxNode } from "@lezer/common";
import { parser as baseParser, GFM } from "@lezer/markdown";

/**
 * Markdown as HTML for the split view's preview, from the same parser the editor uses
 * (@lezer/markdown with GitHub's extensions), so both sides agree on what the text is. Everything
 * the text says is escaped; raw HTML in the Markdown is shown as text, and links and images only
 * go to http(s), mailto or a relative address.
 */

const parser = baseParser.configure(GFM);

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);

/** An address a link may go to; anything else (javascript:, data:) is dropped. */
export const safeUrl = (url: string): string | null => {
  const trimmed = url.trim();
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed)?.[1]?.toLowerCase();
  return scheme === undefined || scheme === "http" || scheme === "https" || scheme === "mailto"
    ? trimmed
    : null;
};

const BLOCK_TAG: Record<string, string> = {
  Paragraph: "p",
  Blockquote: "blockquote",
  BulletList: "ul",
  OrderedList: "ol",
  ListItem: "li",
  ATXHeading1: "h1",
  ATXHeading2: "h2",
  ATXHeading3: "h3",
  ATXHeading4: "h4",
  ATXHeading5: "h5",
  ATXHeading6: "h6",
  SetextHeading1: "h1",
  SetextHeading2: "h2",
  Emphasis: "em",
  StrongEmphasis: "strong",
  Strikethrough: "del",
};

/** Marks that are syntax, not text. */
const MARKS = new Set([
  "HeaderMark",
  "EmphasisMark",
  "CodeMark",
  "StrikethroughMark",
  "QuoteMark",
  "ListMark",
  "LinkMark",
  "URL",
  "LinkTitle",
  "LinkLabel",
  "TableDelimiter",
  "CodeInfo",
  "TaskMarker",
]);

const LINKS = new Set(["Link", "Image", "Autolink"]);

const children = (node: SyntaxNode): SyntaxNode[] => {
  const list: SyntaxNode[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) list.push(child);
  return list;
};

export const markdownHtml = (text: string): string => {
  const slice = (from: number, to: number) => text.slice(from, to);

  /** The node's text with its children rendered and the syntax between them left out. */
  const inline = (node: SyntaxNode, from = node.from, to = node.to): string => {
    let html = "";
    let at = from;
    for (const child of children(node)) {
      if (child.to <= from || child.from >= to) continue;
      html += escapeHtml(slice(at, child.from));
      // A bare address is text GFM made a link of; inside a link it is the link's target.
      const bareUrl = child.name === "URL" && !LINKS.has(node.name);
      html += MARKS.has(child.name) && !bareUrl ? "" : render(child);
      at = child.to;
    }
    return html + escapeHtml(slice(at, to));
  };

  const codeText = (node: SyntaxNode) =>
    children(node)
      .filter((child) => child.name === "CodeText")
      .map((child) => escapeHtml(slice(child.from, child.to)))
      .join("");

  const blocks = (node: SyntaxNode) =>
    children(node)
      .filter((child) => !MARKS.has(child.name))
      .map(render)
      .join("");

  const tableRow = (row: SyntaxNode, cell: "th" | "td") =>
    `<tr>${children(row)
      .filter((child) => child.name === "TableCell")
      .map((child) => `<${cell}>${inline(child)}</${cell}>`)
      .join("")}</tr>`;

  const render = (node: SyntaxNode): string => {
    const tag = BLOCK_TAG[node.name];
    switch (node.name) {
      case "Document":
        return children(node).map(render).join("\n");
      case "Paragraph":
      case "ATXHeading1":
      case "ATXHeading2":
      case "ATXHeading3":
      case "ATXHeading4":
      case "ATXHeading5":
      case "ATXHeading6":
      case "SetextHeading1":
      case "SetextHeading2":
      case "Emphasis":
      case "StrongEmphasis":
      case "Strikethrough":
        return `<${tag}>${inline(node).trim()}</${tag}>`;
      case "Blockquote":
      case "BulletList":
      case "OrderedList":
        return `<${tag}>${blocks(node)}</${tag}>`;
      case "ListItem": {
        const task = children(node).find((child) => child.name === "Task");
        if (!task) return `<li>${blocks(node)}</li>`;
        const done = /\[[xX]\]/.test(slice(task.from, task.from + 3));
        const rest = children(node)
          .filter((child) => child.from > task.to && !MARKS.has(child.name))
          .map(render)
          .join("");
        return `<li class="task"><input type="checkbox" disabled${done ? " checked" : ""}> ${inline(task).trim()}${rest}</li>`;
      }
      case "Task":
        return inline(node);
      case "InlineCode":
        return `<code>${inline(node)}</code>`;
      case "FencedCode":
      case "CodeBlock": {
        const fenced = node.name === "FencedCode";
        const code = fenced ? codeText(node) : escapeHtml(slice(node.from, node.to).replace(/^ {4}/gm, ""));
        return `<pre><code>${code.replace(/\n$/, "")}</code></pre>`;
      }
      case "HorizontalRule":
        return "<hr>";
      case "Link":
      case "Image": {
        const url = children(node).find((child) => child.name === "URL");
        const href = url ? safeUrl(slice(url.from, url.to).replace(/^<|>$/g, "")) : null;
        const firstMark = children(node).find((child) => child.name === "LinkMark");
        const close = children(node).filter((child) => child.name === "LinkMark")[1];
        const label = firstMark && close ? inline(node, firstMark.to, close.from) : inline(node);
        if (node.name === "Image") return href ? `<img src="${escapeHtml(href)}" alt="${label}">` : label;
        return href
          ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`
          : label;
      }
      case "Autolink": {
        const url = children(node).find((child) => child.name === "URL");
        const address = url ? slice(url.from, url.to) : "";
        const href = safeUrl(address);
        return href
          ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(address)}</a>`
          : escapeHtml(address);
      }
      case "URL": {
        // A bare address GFM links on its own (www.…, https://…).
        const address = slice(node.from, node.to);
        const href = safeUrl(/^www\./i.test(address) ? `https://${address}` : address);
        return href
          ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(address)}</a>`
          : escapeHtml(address);
      }
      case "Table": {
        const rows = children(node);
        const header = rows.find((row) => row.name === "TableHeader");
        const body = rows.filter((row) => row.name === "TableRow");
        return `<table>${header ? `<thead>${tableRow(header, "th")}</thead>` : ""}<tbody>${body.map((row) => tableRow(row, "td")).join("")}</tbody></table>`;
      }
      case "HardBreak":
        return "<br>";
      case "Escape":
        return escapeHtml(slice(node.from + 1, node.to));
      case "Entity": {
        const entity = slice(node.from, node.to);
        return /^&(#\d{1,7}|#x[0-9a-f]{1,6}|[a-z][a-z0-9]{1,31});$/i.test(entity)
          ? entity
          : escapeHtml(entity);
      }
      case "HTMLBlock":
      case "HTMLTag":
      case "Comment":
      case "CommentBlock":
      case "ProcessingInstructionBlock":
        return escapeHtml(slice(node.from, node.to));
      case "LinkReference":
        return "";
      default:
        return inline(node);
    }
  };

  return render(parser.parse(text).topNode);
};
