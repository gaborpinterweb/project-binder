/** Note body → download / clipboard formats (HTML, Markdown, plain). */
import { downloadBlob, noteListTitle, slugifyClient } from "./utils.js";

export function noteExportFilename(body, ext) {
  const title = noteListTitle(body);
  const base = slugifyClient(title === "New note..." ? "note" : title);
  return `${base}.${ext}`;
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function noteStandaloneHtml(body) {
  const title = noteListTitle(body);
  const inner = String(body || "").trim() || "<p></p>";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(title)}</title>
<style>
  body{font:16px/1.5 system-ui,sans-serif;max-width:42rem;margin:2rem auto;padding:0 1rem;color:#111}
  h1,h2,h3{line-height:1.25}
  pre{overflow:auto;padding:12px;background:#f4f4f5;border-radius:8px}
  code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9em}
  table{border-collapse:collapse;width:100%}
  th,td{border:1px solid #ccc;padding:6px 10px;text-align:left}
  ul[data-type="taskList"]{list-style:none;padding-left:0}
  ul[data-type="taskList"] li{display:flex;gap:.5em}
  mark{background:#ffe566;padding:0 .15em}
  a{color:#2563eb}
</style>
</head>
<body>
${inner}
</body>
</html>
`;
}

function walkPlain(node, out) {
  if (!node) return;
  if (node.nodeType === Node.TEXT_NODE) {
    out.push(node.textContent || "");
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const tag = node.tagName.toLowerCase();
  if (tag === "br") {
    out.push("\n");
    return;
  }
  if (tag === "hr") {
    out.push("\n---\n");
    return;
  }
  const block =
    /^(p|h[1-6]|li|tr|blockquote|pre|div|table)$/.test(tag) ||
    (tag === "ul" || tag === "ol");
  if (tag === "li") {
    const parent = node.parentElement;
    const task =
      parent?.getAttribute("data-type") === "taskList" ||
      node.getAttribute("data-type") === "taskItem";
    if (task) {
      const checked =
        node.getAttribute("data-checked") === "true" ||
        node.querySelector('input[type="checkbox"]')?.checked;
      out.push(checked ? "[x] " : "[ ] ");
    } else if (parent?.tagName === "OL") {
      const idx = [...parent.children].indexOf(node) + 1;
      out.push(`${idx}. `);
    } else {
      out.push("• ");
    }
  }
  if (tag === "td" || tag === "th") {
    if (node.previousElementSibling) out.push("\t");
  }
  for (const child of node.childNodes) walkPlain(child, out);
  if (tag === "tr" || (block && tag !== "ul" && tag !== "ol" && tag !== "table")) {
    out.push("\n");
  } else if (tag === "ul" || tag === "ol" || tag === "table") {
    out.push("\n");
  }
}

/** Plain text with rough block structure (newlines, list markers). */
export function notePlainText(body) {
  const html = String(body || "").trim();
  if (!html) return "";
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const out = [];
    walkPlain(doc.body, out);
    return out
      .join("")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  } catch {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
}

function mdEscape(text) {
  return String(text || "").replace(/([\\`*_[\]])/g, "\\$1");
}

function inlineMd(node) {
  if (!node) return "";
  if (node.nodeType === Node.TEXT_NODE) return mdEscape(node.textContent || "");
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const tag = node.tagName.toLowerCase();
  const inner = [...node.childNodes].map(inlineMd).join("");
  if (tag === "br") return "  \n";
  if (tag === "strong" || tag === "b") return `**${inner}**`;
  if (tag === "em" || tag === "i") return `*${inner}*`;
  if (tag === "s" || tag === "del" || tag === "strike") return `~~${inner}~~`;
  if (tag === "code") return `\`${(node.textContent || "").replace(/`/g, "\\`")}\``;
  if (tag === "mark") return inner;
  if (tag === "a") {
    const href = node.getAttribute("href") || "";
    return href ? `[${inner}](${href})` : inner;
  }
  return inner;
}

function isTaskList(el) {
  return el?.getAttribute?.("data-type") === "taskList";
}

function listMd(el, ordered, indent = "") {
  const lines = [];
  let i = 1;
  for (const li of el.children) {
    if (li.tagName?.toLowerCase() !== "li") continue;
    const checked = li.getAttribute("data-checked");
    const task =
      isTaskList(el) ||
      li.getAttribute("data-type") === "taskItem" ||
      checked != null;
    const marker = task
      ? checked === "true"
        ? "- [x] "
        : "- [ ] "
      : ordered
        ? `${i}. `
        : "- ";
    i += 1;
    const parts = [];
    const nested = [];
    for (const child of li.childNodes) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const t = child.tagName.toLowerCase();
        if (t === "ul" || t === "ol") {
          nested.push(listMd(child, t === "ol", indent + "  "));
          continue;
        }
        if (t === "p" || t === "div") {
          parts.push(inlineMd(child));
          continue;
        }
        if (t === "label" || t === "input") continue;
      }
      parts.push(inlineMd(child));
    }
    const text = parts.join("").replace(/\s+/g, " ").trim();
    lines.push(`${indent}${marker}${text}`);
    for (const n of nested) lines.push(n);
  }
  return lines.join("\n");
}

function tableMd(table) {
  const rows = [...table.querySelectorAll("tr")].map((tr) =>
    [...tr.children]
      .filter((c) => /^(td|th)$/i.test(c.tagName))
      .map((c) => inlineMd(c).replace(/\|/g, "\\|").trim())
  );
  if (!rows.length) return "";
  const width = Math.max(...rows.map((r) => r.length));
  const norm = rows.map((r) => {
    const cells = [...r];
    while (cells.length < width) cells.push("");
    return cells;
  });
  const head = norm[0];
  const sep = head.map(() => "---");
  const body = norm.slice(1);
  const line = (cells) => `| ${cells.join(" | ")} |`;
  return [line(head), line(sep), ...body.map(line)].join("\n");
}

function blockMd(node) {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) return "";
  const tag = node.tagName.toLowerCase();
  if (tag === "h1") return `# ${inlineMd(node)}\n\n`;
  if (tag === "h2") return `## ${inlineMd(node)}\n\n`;
  if (tag === "h3") return `### ${inlineMd(node)}\n\n`;
  if (tag === "h4") return `#### ${inlineMd(node)}\n\n`;
  if (tag === "p") {
    const t = inlineMd(node).trim();
    return t ? `${t}\n\n` : "";
  }
  if (tag === "blockquote") {
    const inner = [...node.childNodes].map(blockMd).join("").trim();
    return (
      inner
        .split("\n")
        .map((l) => (l ? `> ${l}` : ">"))
        .join("\n") + "\n\n"
    );
  }
  if (tag === "pre") {
    const code = node.textContent || "";
    return "```\n" + code.replace(/\n$/, "") + "\n```\n\n";
  }
  if (tag === "hr") return "---\n\n";
  if (tag === "ul") return `${listMd(node, false)}\n\n`;
  if (tag === "ol") return `${listMd(node, true)}\n\n`;
  if (tag === "table") return `${tableMd(node)}\n\n`;
  if (tag === "div" || tag === "section") {
    return [...node.childNodes].map(blockMd).join("");
  }
  return inlineMd(node) ? `${inlineMd(node)}\n\n` : "";
}

export function noteMarkdown(body) {
  const html = String(body || "").trim();
  if (!html) return "";
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return [...doc.body.childNodes]
      .map(blockMd)
      .join("")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  } catch {
    return notePlainText(body);
  }
}

export async function copyPlainText(text) {
  await navigator.clipboard.writeText(String(text || ""));
}

/** Prefer HTML+plain clipboard; fall back to plain. */
export async function copyRichText(html, plain) {
  const htmlStr = String(html || "");
  const plainStr = String(plain || "");
  if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([htmlStr], { type: "text/html" }),
          "text/plain": new Blob([plainStr], { type: "text/plain" }),
        }),
      ]);
      return;
    } catch {
      /* fall through */
    }
  }
  await copyPlainText(plainStr);
}

export function exportNoteAs(body, format) {
  if (format === "md") {
    downloadBlob(
      noteExportFilename(body, "md"),
      new Blob([noteMarkdown(body) + "\n"], { type: "text/markdown;charset=utf-8" })
    );
    return;
  }
  if (format === "html") {
    downloadBlob(
      noteExportFilename(body, "html"),
      new Blob([noteStandaloneHtml(body)], { type: "text/html;charset=utf-8" })
    );
    return;
  }
  downloadBlob(
    noteExportFilename(body, "txt"),
    new Blob([notePlainText(body) + "\n"], { type: "text/plain;charset=utf-8" })
  );
}

export async function copyNoteAs(body, format) {
  if (format === "md") {
    await copyPlainText(noteMarkdown(body));
    return "Markdown";
  }
  if (format === "html") {
    await copyPlainText(String(body || ""));
    return "HTML";
  }
  if (format === "rich") {
    await copyRichText(String(body || ""), notePlainText(body));
    return "rich text";
  }
  await copyPlainText(notePlainText(body));
  return "plain text";
}
