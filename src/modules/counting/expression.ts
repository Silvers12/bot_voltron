/**
 * Évaluateur d'expressions arithmétiques simples pour le salon de comptage :
 * entiers, + - * / ^, parenthèses. Aucun `eval`. Retourne null si le texte n'est pas une expression.
 */
export type Evaluation = { kind: 'integer'; value: number } | { kind: 'not_integer' } | null;

const MAX_LENGTH = 60;

export function evaluateExpression(text: string): Evaluation {
  const src = text.trim().replace(/\s+/g, '').replace(/[×x]/gi, '*').replace(/[÷:]/g, '/').replace(/−/g, '-');
  if (!src || src.length > MAX_LENGTH || !/^[\d+\-*/^()]+$/.test(src) || !/\d/.test(src)) return null;

  let pos = 0;
  const peek = () => src[pos];
  const next = () => src[pos++];

  function parseExpr(): number {
    let value = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = next();
      const rhs = parseTerm();
      value = op === '+' ? value + rhs : value - rhs;
    }
    return value;
  }
  function parseTerm(): number {
    let value = parsePower();
    while (peek() === '*' || peek() === '/') {
      const op = next();
      const rhs = parsePower();
      if (op === '/') {
        if (rhs === 0) throw new SyntaxError('division par zéro');
        value = value / rhs;
      } else value = value * rhs;
    }
    return value;
  }
  function parsePower(): number {
    const base = parseUnary();
    if (peek() === '^') {
      next();
      const exp = parsePower();
      if (exp < 0 || exp > 20) throw new SyntaxError('exposant');
      return base ** exp;
    }
    return base;
  }
  function parseUnary(): number {
    if (peek() === '-') { next(); return -parseUnary(); }
    if (peek() === '+') { next(); return parseUnary(); }
    return parseAtom();
  }
  function parseAtom(): number {
    if (peek() === '(') {
      next();
      const v = parseExpr();
      if (next() !== ')') throw new SyntaxError('parenthèse');
      return v;
    }
    const start = pos;
    while (pos < src.length && /\d/.test(src[pos]!)) pos++;
    if (start === pos) throw new SyntaxError('nombre attendu');
    return Number(src.slice(start, pos));
  }

  try {
    const value = parseExpr();
    if (pos !== src.length) return null;
    if (!Number.isFinite(value) || Math.abs(value) > 1e12) return { kind: 'not_integer' };
    return Number.isInteger(value) ? { kind: 'integer', value } : { kind: 'not_integer' };
  } catch {
    return null;
  }
}
