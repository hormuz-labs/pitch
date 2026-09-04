import {
  createVideoStoryboard,
  type StoryboardAnnotationStyle,
  type VideoStoryboard,
} from '@saas/shared'

export interface StoryboardPage {
  pageIndex: number
  imagePath: string
}

export interface StoryboardPageAnalysis {
  title: string
  summary: string
  confidence: number
  narrationPoints: Array<{
    narration: string
    visualQuery: string
    confidence: number
    rect: { leftPct: number; topPct: number; widthPct: number; heightPct: number }
  }>
}

export interface StoryboardPlannerDependencies {
  analyzePage: (page: StoryboardPage) => Promise<StoryboardPageAnalysis>
  uploadPreview: (page: StoryboardPage) => Promise<string>
}

export interface AnalyzeStoryboardPageOptions {
  apiKey: string
  model: string
  imageBase64: string
  instructions?: string
  fetchImpl?: typeof fetch
}

function box2dToRect(
  box: unknown,
): StoryboardPageAnalysis['narrationPoints'][number]['rect'] | null {
  if (!Array.isArray(box) || box.length !== 4) return null
  const [y0, x0, y1, x1] = box.map(Number)
  if (![y0, x0, y1, x1].every(Number.isFinite)) return null
  const left = Math.max(0, Math.min(1000, Math.min(x0, x1)))
  const top = Math.max(0, Math.min(1000, Math.min(y0, y1)))
  const right = Math.max(0, Math.min(1000, Math.max(x0, x1)))
  const bottom = Math.max(0, Math.min(1000, Math.max(y0, y1)))
  if (right <= left || bottom <= top) return null
  return {
    leftPct: left / 10,
    topPct: top / 10,
    widthPct: (right - left) / 10,
    heightPct: (bottom - top) / 10,
  }
}

function parseResponseJson(data: any): any {
  const parts = data?.candidates?.[0]?.content?.parts
  const raw = Array.isArray(parts)
    ? [...parts].reverse().find(part => typeof part?.text === 'string' && part.text.includes('{'))
        ?.text
    : undefined
  if (!raw) return null
  try {
    return JSON.parse(raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, ''))
  } catch {
    const object = raw.match(/\{[\s\S]*\}/)?.[0]
    return object ? JSON.parse(object) : null
  }
}

export async function analyzeStoryboardPage(
  options: AnalyzeStoryboardPageOptions,
): Promise<StoryboardPageAnalysis> {
  const guidance = options.instructions?.trim()
    ? `Creator guidance: ${options.instructions.trim()}`
    : 'Creator guidance: explain the most important visible information clearly.'
  const prompt =
    `Inspect this rendered PDF/image page for an explanatory video. ${guidance} ` +
    `Use only facts visibly supported by the pixels; do not depend on PDF text extraction or OCR. ` +
    `Return a concise summary and up to three natural narration points. Every narration point must ` +
    `include a tight box_2d [ymin, xmin, ymax, xmax] normalized 0-1000 around the complete visible ` +
    `content it describes. Return no narration point when its visual target is uncertain.`
  const response = await (options.fetchImpl ?? fetch)(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(options.model)}:generateContent?key=${encodeURIComponent(options.apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              { inlineData: { mimeType: 'image/png', data: options.imageBase64 } },
            ],
          },
        ],
        tools: [{ codeExecution: {} }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              title: { type: 'STRING' },
              summary: { type: 'STRING' },
              confidence: { type: 'NUMBER', minimum: 0, maximum: 1 },
              narration_points: {
                type: 'ARRAY',
                maxItems: 3,
                items: {
                  type: 'OBJECT',
                  properties: {
                    narration: { type: 'STRING' },
                    visual_query: { type: 'STRING' },
                    confidence: { type: 'NUMBER', minimum: 0, maximum: 1 },
                    box_2d: {
                      type: 'ARRAY',
                      items: { type: 'NUMBER' },
                      minItems: 4,
                      maxItems: 4,
                    },
                  },
                  required: ['narration', 'visual_query', 'confidence', 'box_2d'],
                },
              },
            },
            required: ['title', 'summary', 'confidence', 'narration_points'],
          },
        },
      }),
    },
  )
  if (!response.ok) {
    throw new Error(
      `Gemini storyboard analysis failed: ${response.status} ${await response.text()}`,
    )
  }
  const parsed = parseResponseJson(await response.json())
  const summary = String(parsed?.summary ?? '').trim()
  if (!summary) throw new Error('Gemini storyboard analysis returned no usable summary.')
  const narrationPoints = (
    Array.isArray(parsed?.narration_points) ? parsed.narration_points : []
  ).flatMap((point: any) => {
    const rect = box2dToRect(point?.box_2d)
    const narration = String(point?.narration ?? '').trim()
    const visualQuery = String(point?.visual_query ?? '').trim()
    const confidence = Math.max(0, Math.min(1, Number(point?.confidence) || 0))
    return rect && narration && visualQuery && confidence >= 0.6
      ? [{ narration, visualQuery, confidence, rect }]
      : []
  })
  return {
    title: String(parsed?.title ?? '').trim(),
    summary,
    confidence: Math.max(0, Math.min(1, Number(parsed?.confidence) || 0)),
    narrationPoints,
  }
}

function emphasisStyle(
  rect: StoryboardPageAnalysis['narrationPoints'][number]['rect'],
): StoryboardAnnotationStyle {
  return rect.widthPct / rect.heightPct >= 3 ? 'highlighter' : 'pulse'
}

function triggerPhrase(narration: string, index: number, count: number): string {
  const words = narration.split(/\s+/).filter(Boolean)
  const start = Math.floor((index * words.length) / Math.max(1, count))
  return words.slice(start, Math.min(words.length, start + 8)).join(' ')
}

function exactScriptSegments(script: string, pageCount: number): string[] {
  const normalized = script.trim().replace(/\s+/g, ' ')
  if (!normalized || pageCount <= 0) return []
  const sentences = (normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [])
    .map(sentence => sentence.trim())
    .filter(Boolean)
  const units = sentences.length >= pageCount ? sentences : normalized.split(' ')
  if (units.length < pageCount) {
    throw new Error('The exact voiceover script needs at least one word for every PDF page.')
  }
  const segments: string[] = []
  let cursor = 0
  for (let index = 0; index < pageCount; index += 1) {
    const remainingPages = pageCount - index
    const take = Math.ceil((units.length - cursor) / remainingPages)
    segments.push(units.slice(cursor, cursor + take).join(' '))
    cursor += take
  }
  return segments
}

async function mapWithConcurrency<T, Result>(
  items: T[],
  concurrency: number,
  map: (item: T, index: number) => Promise<Result>,
): Promise<Result[]> {
  const results = new Array<Result>(items.length)
  let nextIndex = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await map(items[index]!, index)
    }
  })
  await Promise.all(workers)
  return results
}

export async function buildStoryboardDraft(
  pages: StoryboardPage[],
  dependencies: StoryboardPlannerDependencies,
  options: { script?: string } = {},
): Promise<VideoStoryboard> {
  const scriptedNarration = options.script?.trim()
    ? exactScriptSegments(options.script, pages.length)
    : null
  const planned = await mapWithConcurrency(pages, 3, async (page, index) => {
    const [analysis, previewUrl] = await Promise.all([
      dependencies.analyzePage(page),
      dependencies.uploadPreview(page),
    ])
    const generatedNarration =
      analysis.narrationPoints
        .map(point => point.narration.trim())
        .filter(Boolean)
        .join(' ') || analysis.summary.trim()
    const narration = scriptedNarration?.[index] ?? generatedNarration
    return {
      pageIndex: page.pageIndex,
      previewUrl,
      title: analysis.title,
      screenText: analysis.narrationPoints.map(point => point.narration.trim()).filter(Boolean),
      narration,
      emphasis: analysis.narrationPoints.map((point, pointIndex) => ({
        phrase: scriptedNarration
          ? triggerPhrase(narration, pointIndex, analysis.narrationPoints.length)
          : point.narration.trim(),
        rect: point.rect,
        coordinateSpace: 'page' as const,
        style: emphasisStyle(point.rect),
        zoom: 1.7,
      })),
    }
  })

  return createVideoStoryboard(planned)
}
