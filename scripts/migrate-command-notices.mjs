import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

// node scripts/migrate-command-notices.mjs [--check]
const root = path.resolve("apps/bot/src/discord");
const view = path.join(root, "views/notice.ts");
const check = process.argv.includes("--check");
let pending = 0;
for (const entry of fs.readdirSync(root, {
  recursive: true,
  withFileTypes: true,
})) {
  if (
    !entry.isFile() ||
    !entry.name.endsWith(".ts") ||
    entry.name.endsWith(".test.ts")
  )
    continue;
  const file = path.join(entry.parentPath, entry.name);
  const source = fs.readFileSync(file, "utf8");
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const edits = [];
  let needsFlags = false;
  function walk(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ["reply", "editReply", "followUp", "update"].includes(
        node.expression.name.text,
      )
    ) {
      const arg = node.arguments[0];
      if (arg && ts.isObjectLiteralExpression(arg)) {
        const property = (name) =>
          arg.properties.find((p) => p.name?.getText(tree) === name);
        const content = property("content");
        if (content && !property("components") && !property("embeds")) {
          const expression = ts.isShorthandPropertyAssignment(content)
            ? "content"
            : content.initializer.getText(tree);
          edits.push({
            start: content.getStart(tree),
            end: content.end,
            text: `components: [notice(${expression})]`,
          });
          const flags = property("flags");
          const ephemeral = property("ephemeral");
          if (flags) {
            if (!flags.getText(tree).includes("IsComponentsV2")) {
              const old = flags.initializer;
              if (!ts.isArrayLiteralExpression(old))
                throw new Error(`Review flags in ${file}`);
              edits.push({
                start: old.getStart(tree),
                end: old.end,
                text: `[MessageFlags.IsComponentsV2, ${old.elements.map((e) => e.getText(tree)).join(", ")}]`,
              });
            }
          } else {
            edits.push({
              start: arg.getStart(tree) + 1,
              end: arg.getStart(tree) + 1,
              text: `flags: [MessageFlags.IsComponentsV2${ephemeral ? ", MessageFlags.Ephemeral" : ""}], `,
            });
          }
          if (ephemeral) {
            if (ephemeral.initializer.kind !== ts.SyntaxKind.TrueKeyword)
              throw new Error(`Review ephemeral in ${file}`);
            const after = source.slice(ephemeral.end).match(/^\s*,/);
            edits.push({
              start: ephemeral.getStart(tree),
              end: ephemeral.end + (after?.[0].length ?? 0),
              text: "",
            });
          }
          needsFlags = true;
        }
      }
    }
    ts.forEachChild(node, walk);
  }
  walk(tree);
  if (!edits.length) continue;
  pending++;
  console.log(path.relative(process.cwd(), file));
  if (check) continue;
  let result = source;
  for (const edit of edits.sort((a, b) => b.start - a.start))
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  const imports = tree.statements
    .filter(ts.isImportDeclaration)
    .map((s) => s.getText(tree))
    .join("\n");
  if (!/\bnotice\b/.test(imports)) {
    let relative = path
      .relative(path.dirname(file), view)
      .replaceAll(path.sep, "/");
    if (!relative.startsWith(".")) relative = `./${relative}`;
    result = `import { notice } from '${relative}';\n${result}`;
  }
  if (needsFlags && !/\bMessageFlags\b/.test(imports))
    result = `import { MessageFlags } from 'discord.js';\n${result}`;
  fs.writeFileSync(file, result);
}
if (check && pending) process.exitCode = 1;
