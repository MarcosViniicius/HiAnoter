/**
 * Math and LaTeX normalizer for markdown rendering and export.
 * Handles inline ($...$, \(...\)), display ($$...$$, \[...\]),
 * and bare LaTeX commands (e.g. \vec{u}, \alpha, \sqrt{...}).
 */

export function normalizeMathMarkdown(content: string | null | undefined): string {
  if (!content) return "";

  let text = content;

  // 1. Normalize LaTeX block delimiters: \[ ... \] -> $$ ... $$
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => {
    return `\n\n$$\n${math.trim()}\n$$\n\n`;
  });

  // 2. Normalize LaTeX inline delimiters: \( ... \) -> $ ... $
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => {
    return `$${math.trim()}$`;
  });

  // 3. Process lines to catch bare LaTeX expressions that are not inside code blocks or dollar signs
  const lines = text.split("\n");
  let inCodeBlock = false;
  const processedLines: string[] = [];

  // Patterns that indicate a line is primarily a mathematical formula
  const mathKeywords = [
    "\\vec",
    "\\alpha",
    "\\beta",
    "\\gamma",
    "\\delta",
    "\\theta",
    "\\lambda",
    "\\sigma",
    "\\omega",
    "\\frac",
    "\\sqrt",
    "\\sum",
    "\\int",
    "\\prod",
    "\\partial",
    "\\nabla",
    "\\mathbb",
    "\\mathbf",
    "\\mathcal",
    "\\pm",
    "\\times",
    "\\div",
    "\\cdot",
    "\\neq",
    "\\leq",
    "\\geq",
    "\\approx",
    "\\infty",
    "\\in",
    "\\notin",
    "\\subset",
    "\\cup",
    "\\cap",
    "\\forall",
    "\\exists",
    "\\begin{",
    "\\left(",
    "\\right)",
    "\\left[",
    "\\right]",
    "\\left|",
    "\\right|",
  ];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    if (line.trim().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      processedLines.push(line);
      continue;
    }

    if (inCodeBlock) {
      processedLines.push(line);
      continue;
    }

    const trimmed = line.trim();

    // If the line already has $$ or is empty or is a heading/table row/bullet without bare math
    if (!trimmed || trimmed.startsWith("$$") || trimmed.endsWith("$$")) {
      processedLines.push(line);
      continue;
    }

    // Check if line contains bare math keywords without dollar signs
    const containsMath = mathKeywords.some((kw) => trimmed.includes(kw));

    if (containsMath) {
      // Check if it's a pure standalone formula line (e.g. \vec{u} = (u_1, u_2) or |\vec{u}| = \sqrt{u_1^2 + u_2^2})
      const isStandaloneFormula =
        !trimmed.startsWith("#") &&
        !trimmed.startsWith("|") &&
        !trimmed.includes("$") &&
        (trimmed.startsWith("\\") ||
          trimmed.startsWith("|\\") ||
          trimmed.startsWith("||") ||
          trimmed.includes(" = ") ||
          trimmed.includes(" \\in "));

      if (isStandaloneFormula) {
        // If line is a bullet item like "- \vec{u} = (u_1, u_2)"
        if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
          const prefix = trimmed.slice(0, 2);
          const formula = trimmed.slice(2).trim();
          processedLines.push(`${prefix}$${formula}$`);
          continue;
        }

        // Entire line is a block formula
        processedLines.push(`$$${trimmed}$$`);
        continue;
      }

      // If line has inline bare LaTeX (like "a norma é |\vec{u}| = \sqrt{...} dada por")
      // Safely wrap inline formulas: e.g. `\vec{...}` or `\alpha`
      if (!trimmed.includes("$")) {
        // Wrap inline backtick LaTeX if any: `\vec{u}` -> $\vec{u}$
        line = line.replace(/`(\\[a-zA-Z]+[^`]+)`/g, (_, f) => `$${f.trim()}$`);
      }
    }

    processedLines.push(line);
  }

  return processedLines.join("\n");
}
