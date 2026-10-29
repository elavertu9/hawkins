// Ingredient quantities, shared by the meal plan (plan.js) and the servings
// control on recipe pages (recipe.js): reading "1½ cups" or "2–3" as numbers,
// writing numbers back as kitchen fractions, and scaling a quantity as written.
(() => {
  // Batch sizes you can pick, as multiples of the recipe.
  const SCALES = [0.5, 1, 2, 3, 4];

  // Quantities: "2 cups", "1½ tablespoons", "2–3", "1 to 2 drops", "1 can (15 ounces)".
  const FRACTION_CHARS = { "½": 1 / 2, "¼": 1 / 4, "¾": 3 / 4, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 1 / 8, "⅜": 3 / 8, "⅝": 5 / 8, "⅞": 7 / 8 };
  const NUM = "(?:\\d+(?:\\.\\d+)?\\s*[½¼¾⅓⅔⅛⅜⅝⅞]?(?:\\s+\\d+/\\d+)?|\\d+/\\d+|[½¼¾⅓⅔⅛⅜⅝⅞])";
  const QTY_RE = new RegExp(`^(${NUM})(?:\\s*(–|-|to)\\s*(${NUM}))?\\s*(.*)$`, "i");

  const toNumber = (text) => {
    let s = text.trim();
    let n = 0;
    const glyph = s.match(/[½¼¾⅓⅔⅛⅜⅝⅞]$/);
    if (glyph) { n += FRACTION_CHARS[glyph[0]]; s = s.slice(0, -1).trim(); }
    const slash = s.match(/(\d+)\/(\d+)$/);
    if (slash) { n += Number(slash[1]) / Number(slash[2]); s = s.slice(0, slash.index).trim(); }
    if (s) n += parseFloat(s);
    return n;
  };
  // "2–3 cups" -> { lo: 2, hi: 3, joiner: "–", rest: "cups" }, or null if it doesn't start with a number.
  const split = (qty) => {
    const match = qty.trim().match(QTY_RE);
    if (!match) return null;
    const lo = toNumber(match[1]);
    return { lo, hi: match[3] ? toNumber(match[3]) : lo, joiner: match[2] || "", rest: match[4] };
  };

  const singular = (word) => {
    if (/(ch|sh|x)es$/i.test(word)) return word.slice(0, -2);
    if (/(loa|lea|hal)ves$/i.test(word)) return word.replace(/ves$/i, "f");
    if (/[^s]s$/i.test(word) && word.length > 3) return word.slice(0, -1);
    return word;
  };
  const plural = (word) => {
    if (/(ch|sh|x)$/i.test(word)) return `${word}es`;
    if (/loaf$/i.test(word)) return word.replace(/f$/i, "ves");
    if (/s$/i.test(word)) return word;
    return `${word}s`;
  };

  const FRACTIONS = [[0, ""], [1 / 8, "⅛"], [1 / 4, "¼"], [1 / 3, "⅓"], [3 / 8, "⅜"], [1 / 2, "½"],
    [5 / 8, "⅝"], [2 / 3, "⅔"], [3 / 4, "¾"], [7 / 8, "⅞"], [1, ""]];
  const nearest = (n) => {
    const whole = Math.floor(n);
    const [value, glyph] = FRACTIONS.reduce((best, f) =>
      (Math.abs(n - whole - f[0]) < Math.abs(n - whole - best[0]) ? f : best));
    return value === 1 ? { whole: whole + 1, value: 0, glyph: "" } : { whole, value, glyph };
  };
  const formatNumber = (n) => {
    const { whole, glyph } = nearest(n);
    if (!whole && !glyph) return "⅛";
    return `${whole || ""}${glyph}`;
  };
  const formatRange = (lo, hi) => (formatNumber(lo) === formatNumber(hi) ? formatNumber(lo) : `${formatNumber(lo)}–${formatNumber(hi)}`);

  // Scale a quantity as written: "1 cup (250 mL)" x2 -> "2 cups (500 mL)".
  // A container's size stays put ("1 can (15 ounces)" x2 -> "2 cans (15 ounces)"),
  // and anything that isn't a plain amount ("a pinch", "½ can per can of
  // consommé") comes back as it was.
  const CONTAINERS = /^(cans?|packages?|packets?|box(es)?|bags?|jars?|tubs?|rolls?|blocks?|containers?|sleeves?)$/i;
  const SIZE_WORDS = /^(large|medium|small|whole|regular)$/i;
  const scale = (qty, factor) => {
    const parts = factor === 1 ? null : split(qty);
    if (!parts || /\bper\b/i.test(parts.rest)) return qty;
    const lo = parts.lo * factor;
    const hi = parts.hi * factor;
    const amount = parts.joiner === "to" && formatNumber(lo) !== formatNumber(hi)
      ? `${formatNumber(lo)} to ${formatNumber(hi)}` : formatRange(lo, hi);
    // The unit's last word (cup, can, round loaf) agrees with the new amount;
    // a size ("2 large") stays as it is.
    const [, head, note = ""] = parts.rest.match(/^([^(]*?)\s*(\(.*)?$/);
    const last = head.match(/([A-Za-z]+)$/);
    let unit = head;
    if (last && !SIZE_WORDS.test(last[1])) {
      const word = hi > 1 ? plural(singular(last[1])) : singular(last[1]);
      unit = head.slice(0, last.index) + word;
    }
    // Notes in parentheses scale too ("(250 mL)", "(or ½ regular)"), except a container's size.
    let notes = note;
    if (!(last && CONTAINERS.test(last[1]))) {
      notes = note.replace(/\(([^)]*)\)/g, (_, inside) => {
        const metric = /\d\s*(m?l|g|kg)\b/i.test(inside); // metric reads as decimals, not fractions
        return `(${inside.replace(new RegExp(NUM, "g"), (n) => {
          const scaled = toNumber(n) * factor;
          const space = n.match(/\s*$/)[0];
          if (metric) return String(Number(scaled.toFixed(scaled < 10 ? 1 : 0))) + space;
          return (scaled < 10 ? formatNumber(scaled) : String(Math.round(scaled))) + space;
        })})`;
      });
    }
    const rest = [unit, notes].filter(Boolean).join(" ");
    return `${amount}${rest ? " " : ""}${rest}`;
  };

  window.HawkinsQty = { SCALES, NUM, QTY_RE, FRACTIONS, nearest, toNumber, split, singular, plural, formatNumber, formatRange, scale };
})();
