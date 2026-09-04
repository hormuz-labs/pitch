export interface ViewportRect {
  leftPct: number
  topPct: number
  widthPct: number
  heightPct: number
}

export interface GroundingResult {
  found: boolean
  label: string
  confidence: number
  rect: ViewportRect | null
}

export interface GroundVisualRegionOptions {
  apiKey: string
  model: string
  imageBase64: string
  query: string
  mimeType?: string
  fetchImpl?: typeof fetch
}

export interface SlideNarrationPoint {
  narration: string
  visualQuery: string
  confidence: number
  rect: ViewportRect
}

export interface SlideAnalysis {
  title: string
  summary: string
  confidence: number
  narrationPoints: SlideNarrationPoint[]
}

export interface AnalyzeVisualSlideOptions {
  apiKey: string
  model: string
  imageBase64: string
  mimeType?: string
  minPointConfidence?: number
  fetchImpl?: typeof fetch
}

const clamp1000 = (value: number): number => Math.max(0, Math.min(1000, value))

function parseGeminiJson(data: any): any {
  const parts = data?.candidates?.[0]?.content?.parts
  const texts = Array.isArray(parts)
    ? parts.filter((part: any) => typeof part?.text === 'string').map((part: any) => part.text)
    : []
  const raw = [...texts].reverse().find(text => text.includes('{')) ?? ''
  try {
    return JSON.parse(raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, ''))
  } catch {
    const objectText = raw.match(/\{[\s\S]*\}/)?.[0]
    if (!objectText) return null
    try {
      return JSON.parse(objectText)
    } catch {
      return null
    }
  }
}

async function requestGeminiVisionJson(
  options: {
    apiKey: string
    model: string
    imageBase64: string
    mimeType?: string
    fetchImpl?: typeof fetch
  },
  prompt: string,
  responseSchema: unknown,
  failureLabel: string,
): Promise<any> {
  const fetchImpl = options.fetchImpl ?? fetch
  const response = await fetchImpl(
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
              {
                inlineData: {
                  mimeType: options.mimeType ?? 'image/png',
                  data: options.imageBase64,
                },
              },
            ],
          },
        ],
        tools: [{ codeExecution: {} }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema,
        },
      }),
    },
  )
  if (!response.ok) {
    throw new Error(`${failureLabel}: ${response.status} ${await response.text()}`)
  }
  return parseGeminiJson(await response.json())
}

/** Convert Gemini's [ymin, xmin, ymax, xmax] box into viewport percentages. */
export function box2dToViewportRect(box: unknown): ViewportRect | null {
  if (!Array.isArray(box) || box.length < 4) return null
  const [rawY0, rawX0, rawY1, rawX1] = box.slice(0, 4).map(Number)
  if (![rawY0, rawX0, rawY1, rawX1].every(Number.isFinite)) return null

  const left = clamp1000(Math.min(rawX0, rawX1))
  const top = clamp1000(Math.min(rawY0, rawY1))
  const right = clamp1000(Math.max(rawX0, rawX1))
  const bottom = clamp1000(Math.max(rawY0, rawY1))
  if (right <= left || bottom <= top) return null

  return {
    leftPct: left / 10,
    topPct: top / 10,
    widthPct: (right - left) / 10,
    heightPct: (bottom - top) / 10,
  }
}

export function parseGroundingResponse(data: any): GroundingResult {
  const parsed = parseGeminiJson(data)

  const rect = box2dToViewportRect(parsed?.box_2d)
  const found = parsed?.found === true && rect !== null
  return {
    found,
    label: String(parsed?.label ?? '').slice(0, 160),
    confidence: Math.max(0, Math.min(1, Number(parsed?.confidence) || 0)),
    rect: found ? rect : null,
  }
}

export async function groundVisualRegion(
  options: GroundVisualRegionOptions,
): Promise<GroundingResult> {
  const prompt =
    `Use Agentic Vision to inspect the actual rendered pixels in this 1920x1080 ` +
    `explanatory-video frame. Do not assume the PDF has machine-readable text or an OCR ` +
    `layer. Locate exactly one visible region: "${options.query}". Use code execution to ` +
    `crop or zoom into the image when the content is small or stylized. Return a tight ` +
    `bounding box around the complete visible content itself, including every requested ` +
    `glyph or symbol, with a small safety margin; do not return the whole slide, surrounding ` +
    `card, or nearby unrelated values. box_2d must be [ymin, xmin, ymax, xmax], normalized ` +
    `0-1000. If the requested content is not clearly visible, return found=false.`
  const responseSchema = {
    type: 'OBJECT',
    properties: {
      found: { type: 'BOOLEAN' },
      label: { type: 'STRING' },
      confidence: { type: 'NUMBER', minimum: 0, maximum: 1 },
      box_2d: {
        type: 'ARRAY',
        items: { type: 'NUMBER' },
        minItems: 4,
        maxItems: 4,
      },
    },
    required: ['found', 'label', 'confidence', 'box_2d'],
  }
  const parsed = await requestGeminiVisionJson(
    options,
    prompt,
    responseSchema,
    'Gemini visual grounding failed',
  )
  const rect = box2dToViewportRect(parsed?.box_2d)
  const found = parsed?.found === true && rect !== null
  return {
    found,
    label: String(parsed?.label ?? '').slice(0, 160),
    confidence: Math.max(0, Math.min(1, Number(parsed?.confidence) || 0)),
    rect: found ? rect : null,
  }
}

/** Understand one rendered slide and return factual narration with grounded visual beats. */
export async function analyzeVisualSlide(
  options: AnalyzeVisualSlideOptions,
): Promise<SlideAnalysis> {
  const prompt =
    `Inspect the actual rendered pixels in this 1920x1080 explanatory-video slide. ` +
    `The source may be a scanned PDF, chart, diagram, or image with no machine-readable ` +
    `text. Explain only content that is clearly visible; do not infer hidden context or ` +
    `invent facts. Return a concise page title and summary, then up to three narration ` +
    `points. Each narration point must state one useful visible fact, include a precise ` +
    `visual_query describing the complete content to emphasize, and include a tight ` +
    `box_2d [ymin, xmin, ymax, xmax] normalized to 0-1000 around that content. Use code ` +
    `execution to crop or zoom when content is small. If no specific fact is reliable, ` +
    `return an empty narration_points array and a cautious page-level summary.`
  const responseSchema = {
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
  }
  const parsed = await requestGeminiVisionJson(
    options,
    prompt,
    responseSchema,
    'Gemini slide analysis failed',
  )

  const narrationPoints = (
    Array.isArray(parsed?.narration_points) ? parsed.narration_points : []
  ).flatMap((point: any): SlideNarrationPoint[] => {
    const rect = box2dToViewportRect(point?.box_2d)
    const narration = String(point?.narration ?? '')
      .trim()
      .slice(0, 500)
    const visualQuery = String(point?.visual_query ?? '')
      .trim()
      .slice(0, 240)
    const confidence = Math.max(0, Math.min(1, Number(point?.confidence) || 0))
    if (!rect || !narration || !visualQuery || confidence < (options.minPointConfidence ?? 0.6)) {
      return []
    }
    return [
      {
        narration,
        visualQuery,
        confidence,
        rect,
      },
    ]
  })
  const title = String(parsed?.title ?? '')
    .trim()
    .slice(0, 200)
  const summary = String(parsed?.summary ?? '')
    .trim()
    .slice(0, 1000)
  if (!summary) {
    throw new Error('Gemini slide analysis returned no usable summary.')
  }

  return {
    title,
    summary,
    confidence: Math.max(0, Math.min(1, Number(parsed?.confidence) || 0)),
    narrationPoints,
  }
}
