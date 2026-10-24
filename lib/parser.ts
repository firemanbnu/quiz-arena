/**
 * Parser de texto longo → perguntas.
 *
 * Formatos aceitos (pode misturar no mesmo texto):
 *
 *   1. Qual a capital da França?
 *   a) Londres
 *   b) Paris *            <- correta marcada com * / (correta) / [x] / ✓ / ✅
 *   c) Roma
 *   Resposta: b           <- ou "Gabarito: b" / "Correta: b"
 *
 *   Pergunta 2) Texto...  <- também funciona; perguntas podem ser separadas só por linha em branco
 *   A. ...
 */

export type ParsedOption = { text: string; correct: boolean }
export type ParsedQuestion = { text: string; options: ParsedOption[] }
export type ParseResult = {
  questions: ParsedQuestion[]
  errors: { index: number; question: string; message: string }[]
}

type Draft = {
  text: string
  options: { letter: string; text: string; correct: boolean }[]
  answerLetter?: string
}

const Q_START = /^\s*(?:pergunta\s*)?(\d{1,3})\s*[.)\-:–]\s+(.+)$/i
const OPT = /^\s*\(?([a-h])[).:\-–]\s+(.+)$/i
const ANSWER = /^\s*(?:resposta(?:\s+correta)?|gabarito|correta|answer)\s*[:\-=]\s*\(?([a-h])\)?(?:\W|$)/i
const MARK_END = /\s*(?:\*|\(correta\)|\[x\]|✓|✔|✅)\s*$/i
const MARK_START = /^\s*(?:\*|\[x\]|✅)\s*/i

export function parseQuestions(raw: string): ParseResult {
  const lines = raw.replace(/\r/g, '').split('\n')
  const drafts: Draft[] = []
  let cur = null as Draft | null
  let blankBefore = true

  for (const line of lines) {
    if (!line.trim()) {
      blankBefore = true
      continue
    }

    const ans = line.match(ANSWER)
    if (ans && cur) {
      cur.answerLetter = ans[1].toLowerCase()
      blankBefore = false
      continue
    }

    const opt = line.match(OPT)
    if (opt && cur) {
      let text = opt[2].trim()
      const correct = MARK_END.test(text) || MARK_START.test(text)
      text = text.replace(MARK_END, '').replace(MARK_START, '').trim()
      cur.options.push({ letter: opt[1].toLowerCase(), text, correct })
      blankBefore = false
      continue
    }

    const q = line.match(Q_START)
    if (q) {
      if (cur) drafts.push(cur)
      cur = { text: q[2].trim(), options: [] }
      blankBefore = false
      continue
    }

    // linha "solta": continuação ou início de pergunta sem numeração
    if (!cur) {
      cur = { text: line.trim(), options: [] }
    } else if (cur.options.length > 0 && blankBefore) {
      drafts.push(cur)
      cur = { text: line.trim(), options: [] }
    } else if (cur.options.length === 0) {
      cur.text += ' ' + line.trim()
    } else {
      cur.options[cur.options.length - 1].text += ' ' + line.trim()
    }
    blankBefore = false
  }
  if (cur) drafts.push(cur)

  const questions: ParsedQuestion[] = []
  const errors: ParseResult['errors'] = []

  drafts.forEach((d, index) => {
    if (d.answerLetter) {
      d.options.forEach((o) => {
        if (o.letter === d.answerLetter) o.correct = true
      })
    }
    const correctCount = d.options.filter((o) => o.correct).length
    if (d.options.length < 2) {
      errors.push({ index, question: d.text, message: 'Menos de 2 alternativas.' })
    } else if (correctCount === 0) {
      errors.push({ index, question: d.text, message: 'Nenhuma resposta correta indicada.' })
    } else if (correctCount > 1) {
      errors.push({ index, question: d.text, message: 'Mais de uma resposta correta indicada.' })
    } else {
      questions.push({
        text: d.text,
        options: d.options.map(({ text, correct }) => ({ text, correct })),
      })
    }
  })

  return { questions, errors }
}
