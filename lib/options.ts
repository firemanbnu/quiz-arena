/**
 * Remove prefixos de letra ("A)", "b.", "(c)") das alternativas na hora de exibir.
 * Só remove quando TODAS as alternativas têm prefixo e as letras formam a sequência a, b, c…
 * (assim "A. Silva" sozinho, por exemplo, não é alterado).
 */
export function cleanOptionTexts(texts: string[]): string[] {
  if (texts.length < 2) return texts
  const re = /^\s*\(?([A-Za-z])[).:\-–]\s+/
  const letters = texts.map((t) => t.match(re)?.[1]?.toLowerCase())
  if (letters.some((l) => !l)) return texts
  const sorted = [...(letters as string[])].sort()
  const expected = texts.map((_, i) => String.fromCharCode(97 + i))
  if (sorted.join('') !== expected.join('')) return texts
  return texts.map((t) => t.replace(re, '').trim())
}
