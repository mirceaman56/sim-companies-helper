// Extension markup in JS strings: field id/name, associated labels, button type,
// rel on target="_blank". createElement("button") callers must set .type themselves.
import {
  SRC,
  createReporter,
  extractLiterals,
  lineOf,
  listFiles,
  read,
  rel,
  stripComments,
} from "./lib/source-files.mjs";

const reporter = createReporter("markup");
const TAG_RE = /<(input|select|textarea|label|button|a)\b([^>]*)>/gi;

for (const abs of listFiles(SRC, [".js"])) {
  const file = rel(abs);
  if (file.startsWith("src/translations/") || file.startsWith("src/page/") || file.startsWith("src/data/"))
    continue;
  const code = stripComments(read(abs));

  for (const { index: base, text } of extractLiterals(code)) {
    if (!text.includes("<")) continue;
    const lineAt = (offset) => lineOf(code, base) + (text.slice(0, offset).match(/\n/g) || []).length;

    for (const m of text.matchAll(TAG_RE)) {
      const tag = m[1].toLowerCase();
      const attrs = m[2];
      const has = (name) => new RegExp(`(^|\\s)${name}\\s*=`, "i").test(attrs);
      const line = lineAt(m.index);

      if (["input", "select", "textarea"].includes(tag) && !has("id") && !has("name")) {
        reporter.report(file, line, `<${tag}> needs a stable id= or name= (prefer both).`);
      }
      if (tag === "label" && !has("for")) {
        const close = text.indexOf("</label>", m.index);
        const inner = close === -1 ? "" : text.slice(m.index, close);
        if (!/<(input|select|textarea)\b/i.test(inner)) {
          reporter.report(file, line, "<label> needs for= or must wrap its <input>/<select>/<textarea>.");
        }
      }
      if (tag === "button" && !has("type")) {
        reporter.report(
          file,
          line,
          '<button> needs type="button" (the default "submit" can submit game forms).',
        );
      }
      if (tag === "a" && /target\s*=\s*["']_blank/i.test(attrs) && !has("rel")) {
        reporter.report(file, line, '<a target="_blank"> needs rel="noopener noreferrer".');
      }
    }
  }
}

reporter.finish("form fields, labels, buttons and external links are well-formed");
