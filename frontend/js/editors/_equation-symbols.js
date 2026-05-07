// frontend/js/editors/_equation-symbols.js
// Curated math symbol + template catalogue used by the Equation Picker.
//
// Pure data — no DOM, no side effects. Loads onto window.EquationSymbols so
// the picker module (and tests) can read it without a build step.
//
// Authoring rules:
//   - `latex`     : the string inserted into the editor verbatim. The picker
//                   wraps it in $...$ before insertion so existing KaTeX
//                   auto-render (frontend/js/katex-render.js) picks it up at
//                   runtime. Authors keep typing raw LaTeX between sessions.
//   - `unicode`   : optional fast-path glyph for inline use. Picked when the
//                   user holds Shift while clicking, OR for trivial single-
//                   character entries where a glyph is more readable than
//                   "$\alpha$".
//   - `display`   : the visible label rendered inside the tile. May contain
//                   raw LaTeX — the picker calls KaTeX in render-time on
//                   tiles. For Unicode-only entries, just the glyph.
//   - `name`      : human-readable name used by search (matched against
//                   English, Latin transliteration, and a few common Uzbek
//                   math vocabulary words — the platform's primary audience).
//   - `aliases`   : optional extra search terms (e.g. "alpha" matches "alfa"
//                   for Uzbek users).
//   - `cursor`    : optional 0-based caret offset *inside* the inserted
//                   LaTeX. Used by templates so the cursor lands inside the
//                   first {} pair — e.g. \frac{|}{} after insertion.
//
// Categories are ordered the way Microsoft Word + Google Docs Equation order
// them, with school-math frequency on top.
//
// To add a symbol: append to the appropriate category array. The catalogue
// is read once at picker-open time and cached.
(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Symbol entries
  // ---------------------------------------------------------------------------

  const COMMON = [
    { latex: "\\pm",      unicode: "±",  display: "\\pm",      name: "plus or minus",     aliases: ["pm", "plyus minus"] },
    { latex: "\\mp",      unicode: "∓",  display: "\\mp",      name: "minus or plus",     aliases: ["mp"] },
    { latex: "\\times",   unicode: "×",  display: "\\times",   name: "times",             aliases: ["multiply", "kopaytirish"] },
    { latex: "\\div",     unicode: "÷",  display: "\\div",     name: "divide",            aliases: ["bolish"] },
    { latex: "\\cdot",    unicode: "⋅",  display: "\\cdot",    name: "dot product",       aliases: ["multiplication dot"] },
    { latex: "\\infty",   unicode: "∞",  display: "\\infty",   name: "infinity",          aliases: ["cheksizlik"] },
    { latex: "\\sqrt{}",  unicode: null, display: "\\sqrt{x}", name: "square root",       aliases: ["root", "ildiz"], cursor: 6 },
    { latex: "\\frac{}{}",unicode: null, display: "\\frac{a}{b}", name: "fraction",       aliases: ["kasr"], cursor: 6 },
    { latex: "\\sum",     unicode: "∑",  display: "\\sum",     name: "summation",         aliases: ["sigma", "yigindi"] },
    { latex: "\\int",     unicode: "∫",  display: "\\int",     name: "integral",          aliases: ["integral"] },
    { latex: "\\approx",  unicode: "≈",  display: "\\approx",  name: "approximately",     aliases: ["taqriban"] },
    { latex: "\\neq",     unicode: "≠",  display: "\\neq",     name: "not equal",         aliases: ["teng emas"] },
    { latex: "\\leq",     unicode: "≤",  display: "\\leq",     name: "less or equal",     aliases: ["kichik teng"] },
    { latex: "\\geq",     unicode: "≥",  display: "\\geq",     name: "greater or equal",  aliases: ["katta teng"] },
    { latex: "\\equiv",   unicode: "≡",  display: "\\equiv",   name: "identical",         aliases: ["aynan teng"] },
    { latex: "^{}",       unicode: null, display: "x^{n}",     name: "superscript power", aliases: ["power", "daraja"], cursor: 2 },
    { latex: "_{}",       unicode: null, display: "x_{n}",     name: "subscript",         aliases: ["index"], cursor: 2 },
  ];

  const GREEK_LOWER = [
    { latex: "\\alpha",   unicode: "α", display: "\\alpha",   name: "alpha",   aliases: ["alfa"] },
    { latex: "\\beta",    unicode: "β", display: "\\beta",    name: "beta",    aliases: ["beta"] },
    { latex: "\\gamma",   unicode: "γ", display: "\\gamma",   name: "gamma",   aliases: ["gamma"] },
    { latex: "\\delta",   unicode: "δ", display: "\\delta",   name: "delta",   aliases: ["delta"] },
    { latex: "\\epsilon", unicode: "ε", display: "\\epsilon", name: "epsilon", aliases: ["epsilon"] },
    { latex: "\\zeta",    unicode: "ζ", display: "\\zeta",    name: "zeta",    aliases: ["zeta"] },
    { latex: "\\eta",     unicode: "η", display: "\\eta",     name: "eta",     aliases: ["eta"] },
    { latex: "\\theta",   unicode: "θ", display: "\\theta",   name: "theta",   aliases: ["teta"] },
    { latex: "\\iota",    unicode: "ι", display: "\\iota",    name: "iota",    aliases: ["yota"] },
    { latex: "\\kappa",   unicode: "κ", display: "\\kappa",   name: "kappa",   aliases: ["kappa"] },
    { latex: "\\lambda",  unicode: "λ", display: "\\lambda",  name: "lambda",  aliases: ["lambda"] },
    { latex: "\\mu",      unicode: "μ", display: "\\mu",      name: "mu",      aliases: ["myu"] },
    { latex: "\\nu",      unicode: "ν", display: "\\nu",      name: "nu",      aliases: ["nyu"] },
    { latex: "\\xi",      unicode: "ξ", display: "\\xi",      name: "xi",      aliases: ["ksi"] },
    { latex: "\\pi",      unicode: "π", display: "\\pi",      name: "pi",      aliases: ["pi"] },
    { latex: "\\rho",     unicode: "ρ", display: "\\rho",     name: "rho",     aliases: ["ro"] },
    { latex: "\\sigma",   unicode: "σ", display: "\\sigma",   name: "sigma",   aliases: ["sigma"] },
    { latex: "\\tau",     unicode: "τ", display: "\\tau",     name: "tau",     aliases: ["tau"] },
    { latex: "\\phi",     unicode: "φ", display: "\\phi",     name: "phi",     aliases: ["fi"] },
    { latex: "\\chi",     unicode: "χ", display: "\\chi",     name: "chi",     aliases: ["xi greek"] },
    { latex: "\\psi",     unicode: "ψ", display: "\\psi",     name: "psi",     aliases: ["psi"] },
    { latex: "\\omega",   unicode: "ω", display: "\\omega",   name: "omega",   aliases: ["omega"] },
  ];

  const GREEK_UPPER = [
    { latex: "\\Gamma",   unicode: "Γ", display: "\\Gamma",   name: "Gamma capital",  aliases: ["gamma"] },
    { latex: "\\Delta",   unicode: "Δ", display: "\\Delta",   name: "Delta capital",  aliases: ["delta"] },
    { latex: "\\Theta",   unicode: "Θ", display: "\\Theta",   name: "Theta capital",  aliases: ["teta"] },
    { latex: "\\Lambda",  unicode: "Λ", display: "\\Lambda",  name: "Lambda capital", aliases: ["lambda"] },
    { latex: "\\Xi",      unicode: "Ξ", display: "\\Xi",      name: "Xi capital",     aliases: ["ksi"] },
    { latex: "\\Pi",      unicode: "Π", display: "\\Pi",      name: "Pi capital",     aliases: ["pi"] },
    { latex: "\\Sigma",   unicode: "Σ", display: "\\Sigma",   name: "Sigma capital",  aliases: ["sigma"] },
    { latex: "\\Phi",     unicode: "Φ", display: "\\Phi",     name: "Phi capital",    aliases: ["fi"] },
    { latex: "\\Psi",     unicode: "Ψ", display: "\\Psi",     name: "Psi capital",    aliases: ["psi"] },
    { latex: "\\Omega",   unicode: "Ω", display: "\\Omega",   name: "Omega capital",  aliases: ["omega"] },
  ];

  const OPERATORS = [
    { latex: "+",          unicode: "+",  display: "+",          name: "plus" },
    { latex: "-",          unicode: "−",  display: "-",          name: "minus" },
    { latex: "\\times",    unicode: "×",  display: "\\times",    name: "times" },
    { latex: "\\div",      unicode: "÷",  display: "\\div",      name: "divide" },
    { latex: "\\cdot",     unicode: "⋅",  display: "\\cdot",     name: "dot" },
    { latex: "\\ast",      unicode: "∗",  display: "\\ast",      name: "asterisk" },
    { latex: "\\circ",     unicode: "∘",  display: "\\circ",     name: "ring composition" },
    { latex: "\\bullet",   unicode: "∙",  display: "\\bullet",   name: "bullet" },
    { latex: "\\oplus",    unicode: "⊕",  display: "\\oplus",    name: "circled plus" },
    { latex: "\\ominus",   unicode: "⊖",  display: "\\ominus",   name: "circled minus" },
    { latex: "\\otimes",   unicode: "⊗",  display: "\\otimes",   name: "circled times" },
    { latex: "\\oslash",   unicode: "⊘",  display: "\\oslash",   name: "circled slash" },
    { latex: "\\nabla",    unicode: "∇",  display: "\\nabla",    name: "nabla del" },
    { latex: "\\partial",  unicode: "∂",  display: "\\partial",  name: "partial derivative" },
    { latex: "\\propto",   unicode: "∝",  display: "\\propto",   name: "proportional" },
  ];

  const RELATIONS = [
    { latex: "=",         unicode: "=",  display: "=",         name: "equal",          aliases: ["teng"] },
    { latex: "\\neq",     unicode: "≠",  display: "\\neq",     name: "not equal",      aliases: ["teng emas"] },
    { latex: "<",         unicode: "<",  display: "<",         name: "less than",      aliases: ["kichik"] },
    { latex: ">",         unicode: ">",  display: ">",         name: "greater than",   aliases: ["katta"] },
    { latex: "\\leq",     unicode: "≤",  display: "\\leq",     name: "less or equal",  aliases: ["kichik teng"] },
    { latex: "\\geq",     unicode: "≥",  display: "\\geq",     name: "greater or equal", aliases: ["katta teng"] },
    { latex: "\\ll",      unicode: "≪",  display: "\\ll",      name: "much less" },
    { latex: "\\gg",      unicode: "≫",  display: "\\gg",      name: "much greater" },
    { latex: "\\approx",  unicode: "≈",  display: "\\approx",  name: "approximately",  aliases: ["taqriban"] },
    { latex: "\\equiv",   unicode: "≡",  display: "\\equiv",   name: "identical",      aliases: ["aynan teng"] },
    { latex: "\\sim",     unicode: "∼",  display: "\\sim",     name: "similar" },
    { latex: "\\cong",    unicode: "≅",  display: "\\cong",    name: "congruent" },
    { latex: "\\propto",  unicode: "∝",  display: "\\propto",  name: "proportional" },
    { latex: "\\parallel",unicode: "∥",  display: "\\parallel",name: "parallel",       aliases: ["parallel"] },
    { latex: "\\perp",    unicode: "⊥",  display: "\\perp",    name: "perpendicular",  aliases: ["perpendikulyar"] },
  ];

  // Templates carry their own cursor position so the caret lands inside the
  // first empty group after insertion.
  const FRACTIONS_ROOTS = [
    { latex: "\\frac{}{}",      display: "\\frac{a}{b}",      name: "fraction",        aliases: ["kasr"], cursor: 6 },
    { latex: "\\dfrac{}{}",     display: "\\dfrac{a}{b}",     name: "display fraction",aliases: ["display kasr"], cursor: 7 },
    { latex: "\\tfrac{}{}",     display: "\\tfrac{a}{b}",     name: "text fraction" },
    { latex: "\\sqrt{}",        display: "\\sqrt{x}",         name: "square root",     aliases: ["ildiz"], cursor: 6 },
    { latex: "\\sqrt[]{}",      display: "\\sqrt[n]{x}",      name: "nth root",        aliases: ["n ildiz"], cursor: 6 },
    { latex: "\\sqrt[3]{}",     display: "\\sqrt[3]{x}",      name: "cube root",       aliases: ["kub ildiz"], cursor: 8 },
  ];

  const SUPER_SUB = [
    { latex: "^{}",      display: "x^{n}",         name: "superscript",       aliases: ["power", "daraja"], cursor: 2 },
    { latex: "_{}",      display: "x_{n}",         name: "subscript",         aliases: ["index"], cursor: 2 },
    { latex: "^{2}",     display: "x^{2}",         name: "squared",           aliases: ["kvadrat"] },
    { latex: "^{3}",     display: "x^{3}",         name: "cubed",             aliases: ["kub"] },
    { latex: "^{-1}",    display: "x^{-1}",        name: "inverse" },
    { latex: "_{}^{}",   display: "x_{i}^{n}",     name: "sub and super",     cursor: 2 },
    { latex: "\\overline{}", display: "\\overline{x}", name: "overline bar",  cursor: 10 },
    { latex: "\\underline{}",display: "\\underline{x}",name: "underline",     cursor: 11 },
    { latex: "\\hat{}",      display: "\\hat{x}",      name: "hat",           cursor: 5 },
    { latex: "\\vec{}",      display: "\\vec{x}",      name: "vector",        aliases: ["vektor"], cursor: 5 },
    { latex: "\\dot{}",      display: "\\dot{x}",      name: "dot accent",    cursor: 5 },
    { latex: "\\ddot{}",     display: "\\ddot{x}",     name: "double dot",    cursor: 6 },
  ];

  const CALCULUS = [
    { latex: "\\int_{}^{}",         display: "\\int_{a}^{b}",        name: "integral with limits",  aliases: ["integral"], cursor: 5 },
    { latex: "\\iint",              display: "\\iint",               name: "double integral" },
    { latex: "\\iiint",             display: "\\iiint",              name: "triple integral" },
    { latex: "\\oint",              display: "\\oint",               name: "contour integral" },
    { latex: "\\sum_{}^{}",         display: "\\sum_{i=1}^{n}",      name: "summation with limits",aliases: ["yigindi"], cursor: 5 },
    { latex: "\\prod_{}^{}",        display: "\\prod_{i=1}^{n}",     name: "product with limits",  aliases: ["kopaytma"], cursor: 6 },
    { latex: "\\lim_{x \\to 0}",    display: "\\lim_{x \\to 0}",     name: "limit",                aliases: ["limit"] },
    { latex: "\\lim_{x \\to \\infty}", display: "\\lim_{x \\to \\infty}", name: "limit at infinity" },
    { latex: "\\frac{d}{dx}",       display: "\\frac{d}{dx}",        name: "derivative",          aliases: ["hosila"] },
    { latex: "\\frac{\\partial}{\\partial x}", display: "\\frac{\\partial}{\\partial x}", name: "partial derivative" },
    { latex: "\\nabla",             display: "\\nabla",              name: "nabla gradient" },
    { latex: "\\partial",           display: "\\partial",            name: "partial" },
  ];

  const BRACKETS = [
    { latex: "()",          display: "(\\,)",          name: "parentheses",      aliases: ["qavs"] },
    { latex: "[]",          display: "[\\,]",          name: "square brackets" },
    { latex: "\\{\\}",      display: "\\{\\,\\}",      name: "curly braces" },
    { latex: "\\langle \\rangle", display: "\\langle\\,\\rangle", name: "angle brackets" },
    { latex: "\\lfloor \\rfloor", display: "\\lfloor\\,\\rfloor", name: "floor brackets" },
    { latex: "\\lceil \\rceil",   display: "\\lceil\\,\\rceil",   name: "ceiling brackets" },
    { latex: "\\left( \\right)",  display: "\\left(\\,\\right)",  name: "auto-sized parens" },
    { latex: "\\left[ \\right]",  display: "\\left[\\,\\right]",  name: "auto-sized brackets" },
    { latex: "\\left\\{ \\right\\}", display: "\\left\\{\\,\\right\\}", name: "auto-sized braces" },
    { latex: "|x|",         display: "|x|",            name: "absolute value",  aliases: ["modul"] },
    { latex: "\\|x\\|",     display: "\\|x\\|",        name: "norm" },
  ];

  const ARROWS = [
    { latex: "\\leftarrow",      unicode: "←", display: "\\leftarrow",      name: "left arrow" },
    { latex: "\\rightarrow",     unicode: "→", display: "\\rightarrow",     name: "right arrow",       aliases: ["to", "implies single"] },
    { latex: "\\leftrightarrow", unicode: "↔", display: "\\leftrightarrow", name: "left-right arrow" },
    { latex: "\\Leftarrow",      unicode: "⇐", display: "\\Leftarrow",      name: "double left arrow" },
    { latex: "\\Rightarrow",     unicode: "⇒", display: "\\Rightarrow",     name: "implies",            aliases: ["implication"] },
    { latex: "\\Leftrightarrow", unicode: "⇔", display: "\\Leftrightarrow", name: "iff",                aliases: ["if and only if", "agar"] },
    { latex: "\\mapsto",         unicode: "↦", display: "\\mapsto",         name: "maps to" },
    { latex: "\\to",             unicode: "→", display: "\\to",             name: "to" },
    { latex: "\\uparrow",        unicode: "↑", display: "\\uparrow",        name: "up arrow" },
    { latex: "\\downarrow",      unicode: "↓", display: "\\downarrow",      name: "down arrow" },
  ];

  const LOGIC_SETS = [
    { latex: "\\forall",   unicode: "∀", display: "\\forall",   name: "for all",           aliases: ["barcha"] },
    { latex: "\\exists",   unicode: "∃", display: "\\exists",   name: "there exists",      aliases: ["mavjud"] },
    { latex: "\\nexists",  unicode: "∄", display: "\\nexists",  name: "does not exist" },
    { latex: "\\in",       unicode: "∈", display: "\\in",       name: "element of",        aliases: ["tegishli"] },
    { latex: "\\notin",    unicode: "∉", display: "\\notin",    name: "not element of" },
    { latex: "\\subset",   unicode: "⊂", display: "\\subset",   name: "subset",            aliases: ["qism"] },
    { latex: "\\subseteq", unicode: "⊆", display: "\\subseteq", name: "subset or equal" },
    { latex: "\\supset",   unicode: "⊃", display: "\\supset",   name: "superset" },
    { latex: "\\supseteq", unicode: "⊇", display: "\\supseteq", name: "superset or equal" },
    { latex: "\\cup",      unicode: "∪", display: "\\cup",      name: "union",             aliases: ["birlashma"] },
    { latex: "\\cap",      unicode: "∩", display: "\\cap",      name: "intersection",      aliases: ["kesishma"] },
    { latex: "\\setminus", unicode: "∖", display: "\\setminus", name: "set minus" },
    { latex: "\\emptyset", unicode: "∅", display: "\\emptyset", name: "empty set",         aliases: ["bo'sh to'plam"] },
    { latex: "\\land",     unicode: "∧", display: "\\land",     name: "logical and" },
    { latex: "\\lor",      unicode: "∨", display: "\\lor",      name: "logical or" },
    { latex: "\\lnot",     unicode: "¬", display: "\\lnot",     name: "logical not" },
    { latex: "\\therefore",unicode: "∴", display: "\\therefore",name: "therefore" },
    { latex: "\\because", unicode: "∵",  display: "\\because",  name: "because" },
  ];

  const MATRICES = [
    {
      latex: "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}",
      display: "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}",
      name: "2x2 matrix parens",
      aliases: ["matrix 2x2"],
    },
    {
      latex: "\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}",
      display: "\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}",
      name: "2x2 matrix brackets",
    },
    {
      latex: "\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}",
      display: "\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}",
      name: "2x2 determinant",
      aliases: ["determinant"],
    },
    {
      latex: "\\begin{pmatrix} a & b & c \\\\ d & e & f \\\\ g & h & i \\end{pmatrix}",
      display: "\\begin{pmatrix} a & b & c \\\\ d & e & f \\\\ g & h & i \\end{pmatrix}",
      name: "3x3 matrix parens",
      aliases: ["matrix 3x3"],
    },
    {
      latex: "\\begin{cases} a, & x > 0 \\\\ b, & x \\le 0 \\end{cases}",
      display: "\\begin{cases} a, & x > 0 \\\\ b, & x \\le 0 \\end{cases}",
      name: "piecewise cases",
      aliases: ["piecewise"],
    },
    {
      latex: "\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}",
      display: "\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}",
      name: "aligned equations",
    },
  ];

  const CATEGORIES = [
    { id: "common",     label: "Common",     entries: COMMON },
    { id: "greek",      label: "Greek",      entries: GREEK_LOWER.concat(GREEK_UPPER) },
    { id: "operators",  label: "Operators",  entries: OPERATORS },
    { id: "relations",  label: "Relations",  entries: RELATIONS },
    { id: "fractions",  label: "Fractions",  entries: FRACTIONS_ROOTS },
    { id: "scripts",    label: "Scripts",    entries: SUPER_SUB },
    { id: "calculus",   label: "Calculus",   entries: CALCULUS },
    { id: "brackets",   label: "Brackets",   entries: BRACKETS },
    { id: "arrows",     label: "Arrows",     entries: ARROWS },
    { id: "logic",      label: "Logic / Sets", entries: LOGIC_SETS },
    { id: "matrices",   label: "Matrices",   entries: MATRICES },
  ];

  // Flat lookup for search and reverse-lookup of recently-used keys.
  const ALL_BY_KEY = (function () {
    const out = Object.create(null);
    for (const cat of CATEGORIES) {
      for (const entry of cat.entries) {
        // Key = latex (unique within the catalogue per design — duplicates
        // cause one entry to win the recently-used slot, which is fine).
        out[entry.latex] = { ...entry, _categoryId: cat.id };
      }
    }
    return out;
  })();

  // Lower-cased haystack per entry, joined for fast indexOf search.
  function searchableText(entry) {
    return [
      entry.name || "",
      entry.latex || "",
      entry.unicode || "",
      ...(entry.aliases || []),
    ]
      .join(" ")
      .toLowerCase();
  }

  // Filter the whole catalogue by a query string (case-insensitive substring
  // across name + latex + unicode + aliases). Returns a flat array preserving
  // category order.
  function search(query) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return [];
    const hits = [];
    for (const cat of CATEGORIES) {
      for (const entry of cat.entries) {
        if (searchableText(entry).indexOf(q) !== -1) {
          hits.push({ ...entry, _categoryId: cat.id });
        }
      }
    }
    return hits;
  }

  function lookup(latex) {
    return ALL_BY_KEY[latex] || null;
  }

  window.EquationSymbols = {
    CATEGORIES,
    search,
    lookup,
    // Flat list — used by tests and for "all" virtual category.
    all() {
      const out = [];
      for (const cat of CATEGORIES) {
        for (const e of cat.entries) out.push({ ...e, _categoryId: cat.id });
      }
      return out;
    },
  };
})();
