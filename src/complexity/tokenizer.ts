// ─── Code Tokenizer ────────────────────────────────────────────────────────────
// Safely tokenizes source code while ignoring strings and comments.

export type TokenType = "IDENTIFIER" | "NUMBER" | "OPERATOR" | "PUNCTUATION";

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  indent: number;
}

export interface CleanedCodeInfo {
  tokens: Token[];
  lines: { text: string; indent: number; lineNum: number }[];
  rawCleanCode: string;
}

/**
 * Strips comments and string literals from source code cleanly.
 */
export function stripCommentsAndStrings(code: string, language: string): string {
  const isPython = language.toLowerCase().includes("python");
  let src = code;

  if (isPython) {
    // Remove docstrings
    src = src.replace(/"""[\s\S]*?"""/g, "");
    src = src.replace(/'''[\s\S]*?'''/g, "");
    // Remove inline comments
    src = src.replace(/#.*/g, "");
  } else {
    // Remove multi-line comments
    src = src.replace(/\/\*[\s\S]*?\*\//g, "");
    // Remove single line comments
    src = src.replace(/\/\/.*/g, "");
  }

  // Remove string literals safely
  src = src.replace(/"([^"\\]|\\.)*"/g, '""');
  src = src.replace(/'([^'\\]|\\.)*'/g, "''");
  src = src.replace(/`([^`\\]|\\.)*`/g, "``");

  return src;
}

/**
 * Tokenizes the source code into a structured token stream.
 */
export function tokenizeCode(code: string, language: string): CleanedCodeInfo {
  const cleanSrc = stripCommentsAndStrings(code, language);
  const rawLines = cleanSrc.split("\n");
  const tokens: Token[] = [];
  const linesInfo: { text: string; indent: number; lineNum: number }[] = [];

  for (let lineIdx = 0; lineIdx < rawLines.length; lineIdx++) {
    const rawLine = rawLines[lineIdx] ?? "";
    const lineNum = lineIdx + 1;

    if (!rawLine.trim()) continue;

    // Calculate indentation space count
    const indentMatch = rawLine.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1].replace(/\t/g, "    ").length : 0;
    const trimmedLine = rawLine.trim();

    linesInfo.push({ text: trimmedLine, indent, lineNum });

    // Lexical scanning of line
    let pos = 0;
    while (pos < rawLine.length) {
      const ch = rawLine[pos];

      // Skip whitespace
      if (/\s/.test(ch)) {
        pos++;
        continue;
      }

      // Identifiers / Keywords
      if (/[a-zA-Z_$]/.test(ch)) {
        let start = pos;
        while (pos < rawLine.length && /[a-zA-Z0-9_$]/.test(rawLine[pos])) {
          pos++;
        }
        tokens.push({
          type: "IDENTIFIER",
          value: rawLine.slice(start, pos),
          line: lineNum,
          indent,
        });
        continue;
      }

      // Numbers
      if (/[0-9]/.test(ch)) {
        let start = pos;
        while (pos < rawLine.length && /[0-9.]/.test(rawLine[pos])) {
          pos++;
        }
        tokens.push({
          type: "NUMBER",
          value: rawLine.slice(start, pos),
          line: lineNum,
          indent,
        });
        continue;
      }

      // Multi-char operators like //=, //, >>=, <<=, ==, !=, <=, >=, +=, -=, *=, /=, ->
      const multiOps = ["//=", "//", ">>=", "<<=", "==", "!=", "<=", ">=", "+=", "-=", "*=", "/=", "->"];
      let matchedMulti = false;
      for (const op of multiOps) {
        if (rawLine.startsWith(op, pos)) {
          tokens.push({
            type: "OPERATOR",
            value: op,
            line: lineNum,
            indent,
          });
          pos += op.length;
          matchedMulti = true;
          break;
        }
      }
      if (matchedMulti) continue;

      // Single-char operators
      if (/[+\-*/%=<>!&|^~.]/.test(ch)) {
        tokens.push({
          type: "OPERATOR",
          value: ch,
          line: lineNum,
          indent,
        });
        pos++;
        continue;
      }

      // Punctuation braces/parens/colons
      if (/[{}()\[\]:;,]/.test(ch)) {
        tokens.push({
          type: "PUNCTUATION",
          value: ch,
          line: lineNum,
          indent,
        });
        pos++;
        continue;
      }

      pos++;
    }
  }

  return { tokens, lines: linesInfo, rawCleanCode: cleanSrc };
}
