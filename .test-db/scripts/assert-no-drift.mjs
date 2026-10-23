import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Accept only whitespace and SQL comments. Any other content needs review;
// never execute a generated diff or silently allowlist schema statements.
export function assertNoDrift(sql) {
  let i = sql.charCodeAt(0) === 0xfeff ? 1 : 0;
  while (i < sql.length) {
    if (/\s/.test(sql[i])) {
      i++;
      continue;
    }
    if (sql.startsWith("--", i)) {
      const end = sql.indexOf("\n", i + 2);
      i = end < 0 ? sql.length : end + 1;
      continue;
    }
    if (sql.startsWith("/*", i)) {
      let depth = 1;
      i += 2;
      while (i < sql.length && depth) {
        if (sql.startsWith("/*", i)) {
          depth++;
          i += 2;
        } else if (sql.startsWith("*/", i)) {
          depth--;
          i += 2;
        } else i++;
      }
      if (depth)
        throw new Error("Unterminated SQL comment in migration drift report");
      continue;
    }
    throw new Error(
      "Unexplained schema drift: review the generated report and add a forward migration before release",
    );
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const path = process.argv[2];
  if (!path)
    throw new Error("Supply the generated migration drift report path");
  assertNoDrift(await readFile(path, "utf8"));
  console.log("PASS migration drift report contains no schema statements");
}
