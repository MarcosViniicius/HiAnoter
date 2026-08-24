/**
 * Math and LaTeX normalizer for markdown rendering and export.
 * Handles inline ($...$, \(...\)), display ($$...$$, \[...\]),
 * matrices/environments (\begin{bmatrix}...\end{bmatrix}),
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

  // 3. Fix common LLM malformed matrix/environment delimiters:
  // e.g. "$$A = \begin{bmatrix}$$ a_{11} ... \end{bmatrix}" -> "$$\nA = \begin{bmatrix}\na_{11} ... \end{bmatrix}\n$$"
  text = text.replace(/(\\begin\{[a-zA-Z0-9*]+\})\s*\$\$+/g, "$1\n");
  text = text.replace(/(\\begin\{[a-zA-Z0-9*]+\})\s*\$/g, "$1\n");
  text = text.replace(/\$\$+\s*(\\end\{[a-zA-Z0-9*]+\})/g, "\n$1");
  text = text.replace(/\$\s*(\\end\{[a-zA-Z0-9*]+\})/g, "\n$1");

  // Replace \begin{align} or \begin{align*} with \begin{aligned} for KaTeX compatibility
  text = text.replace(/\\begin\{align\*?\}/g, "\\begin{aligned}");
  text = text.replace(/\\end\{align\*?\}/g, "\\end{aligned}");

  // Ensure matrix & multiline environments are properly wrapped in $$ ... $$
  const envPattern = /((?:(?:\$\$\s*)?[^\n$]*?\\begin\{(?:bmatrix|pmatrix|matrix|vmatrix|Vmatrix|aligned|cases|array|split|gather)\}[\s\S]*?\\end\{(?:bmatrix|pmatrix|matrix|vmatrix|Vmatrix|aligned|cases|array|split|gather)\}[^\n$]*?(?:\s*\$\$)?)|\b\\begin\{(?:bmatrix|pmatrix|matrix|vmatrix|Vmatrix|aligned|cases|array|split|gather)\}[\s\S]*?\\end\{(?:bmatrix|pmatrix|matrix|vmatrix|Vmatrix|aligned|cases|array|split|gather)\})/g;

  text = text.replace(envPattern, (match) => {
    let clean = match.trim();
    if (clean.startsWith("$$")) clean = clean.slice(2).trim();
    if (clean.endsWith("$$")) clean = clean.slice(0, -2).trim();
    clean = clean.replace(/(\\begin\{[a-zA-Z0-9*]+\})\s*\$\$+/g, "$1\n");
    clean = clean.replace(/\$\$+\s*(\\end\{[a-zA-Z0-9*]+\})/g, "\n$1");
    return `\n\n$$\n${clean}\n$$\n\n`;
  });

  // 4. Clean up any consecutive display math tags like "$$$$" or "$$\n$$"
  text = text.replace(/\$\$\s*\$\$/g, "$$");

  // 5. Line by line pass for bare formulas
  const lines = text.split("\n");
  let inCodeBlock = false;
  let inMathBlock = false;
  const processedLines: string[] = [];

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

    // Track $$ math blocks
    if (trimmed === "$$") {
      inMathBlock = !inMathBlock;
      processedLines.push(line);
      continue;
    }

    if (trimmed.startsWith("$$") && trimmed.endsWith("$$") && trimmed.length > 2) {
      processedLines.push(line);
      continue;
    }

    if (inMathBlock) {
      processedLines.push(line);
      continue;
    }

    // Check if line contains bare math keywords without dollar signs
    const containsMath = mathKeywords.some((kw) => trimmed.includes(kw));

    if (containsMath) {
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
        if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
          const prefix = trimmed.slice(0, 2);
          const formula = trimmed.slice(2).trim();
          processedLines.push(`${prefix}$${formula}$`);
          continue;
        }

        processedLines.push(`$$${trimmed}$$`);
        continue;
      }

      if (!trimmed.includes("$")) {
        line = line.replace(/`(\\[a-zA-Z]+[^`]+)`/g, (_, f) => `$${f.trim()}$`);
      }
    }

    processedLines.push(line);
  }

  return processedLines.join("\n");
}
