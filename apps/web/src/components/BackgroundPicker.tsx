import { DEMO_BACKGROUNDS, bgThumbUrl, bgVideoUrl } from '../lib/backgrounds'

const SHAPES: { id: string; label: string; previewRadius: number }[] = [
  { id: 'square', label: 'Square', previewRadius: 0 },
  { id: 'rounded', label: 'Rounded', previewRadius: 10 },
  { id: 'soft', label: 'Soft', previewRadius: 22 },
]

/**
 * Background picker for the New Video flow. Lets the user frame their demo on a
 * decorative background (or keep it full-screen), choose the corner shape and
 * size, with a live preview of the resulting framing.
 */
export function BackgroundPicker({
  value,
  onChange,
  shape,
  onShapeChange,
  inset,
  onInsetChange,
}: {
  value: string
  onChange: (id: string) => void
  shape: string
  onShapeChange: (shape: string) => void
  inset: string
  onInsetChange: (inset: string) => void
}) {
  const selected = value || 'none'
  const isNone = selected === 'none'
  const selectedBg = DEMO_BACKGROUNDS.find(b => b.id === selected)
  const isAnimated = selectedBg?.type === 'animated'
  const activeShape = shape || 'rounded'
  const previewRadius = SHAPES.find(s => s.id === activeShape)?.previewRadius ?? 10
  const activeInset = Math.max(0.7, Math.min(0.97, Number.parseFloat(inset || '0.87') || 0.87))
  const marginPct = ((1 - activeInset) / 2) * 100

  // A faux "your demo here" card used in the preview to show the framing.
  const DemoCard = (
    <div className="w-full h-full bg-white overflow-hidden flex flex-col text-left">
      <div className="h-5 bg-gray-100 flex items-center gap-1 px-2 shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
        <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
        <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
      </div>
      <div className="flex-1 p-3 space-y-2">
        <div className="h-2.5 w-1/3 bg-gray-200 rounded" />
        <div className="grid grid-cols-3 gap-2">
          <div className="h-8 bg-gray-100 rounded" />
          <div className="h-8 bg-gray-100 rounded" />
          <div className="h-8 bg-gray-100 rounded" />
        </div>
        <div className="h-12 bg-gray-100 rounded" />
      </div>
    </div>
  )

  return (
    <div className="flex flex-col md:flex-row gap-4">
      {/* Left: options + controls */}
      <div className="md:w-1/2 space-y-3">
        <div className="grid grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => onChange('none')}
            title="No background (full screen)"
            className={`relative aspect-video rounded-lg border-2 overflow-hidden flex items-center justify-center bg-gray-50 text-[10px] font-semibold text-gray-500 transition ${
              isNone ? 'border-gray-900' : 'border-transparent hover:border-gray-300'
            }`}
          >
            None
          </button>
          {DEMO_BACKGROUNDS.map(b => (
            <button
              type="button"
              key={b.id}
              onClick={() => onChange(b.id)}
              title={b.name}
              className={`relative aspect-video rounded-lg border-2 overflow-hidden transition ${
                selected === b.id ? 'border-gray-900' : 'border-transparent hover:border-gray-300'
              }`}
              style={{
                backgroundImage: `url(${bgThumbUrl(b.id)})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            >
              {b.type === 'animated' && (
                <span className="absolute bottom-0.5 right-0.5 text-[8px] leading-none px-1 py-0.5 rounded bg-black/55 text-white">
                  ● anim
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Shape + Size — only relevant when framed on a background */}
        {!isNone && (
          <div className="space-y-3 pt-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-gray-500 w-10">Shape</span>
              {SHAPES.map(s => (
                <button
                  type="button"
                  key={s.id}
                  onClick={() => onShapeChange(s.id)}
                  title={s.label}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition ${
                    activeShape === s.id
                      ? 'border-gray-900 text-gray-900'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  <span
                    className="w-3.5 h-3.5 border-2 border-current"
                    style={{ borderRadius: s.previewRadius / 2 }}
                  />
                  {s.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-500 w-10">Size</span>
              <input
                type="range"
                min={0.7}
                max={0.97}
                step={0.01}
                value={activeInset}
                onChange={e => onInsetChange(e.target.value)}
                className="flex-1 accent-gray-900"
              />
              <span className="text-xs text-gray-400 w-9 text-right">
                {Math.round(activeInset * 100)}%
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Right: live preview */}
      <div className="md:w-1/2">
        <div
          className="relative w-full aspect-video rounded-xl overflow-hidden border border-gray-200 bg-gray-900"
          style={
            isNone || isAnimated
              ? undefined
              : {
                  backgroundImage: `url(${bgThumbUrl(selected)})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }
          }
        >
          {isAnimated && (
            <video
              key={selected}
              src={bgVideoUrl(selected)}
              autoPlay
              loop
              muted
              playsInline
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}
          {isNone ? (
            <div className="absolute inset-0">{DemoCard}</div>
          ) : (
            <div
              className="absolute overflow-hidden shadow-2xl shadow-black/40"
              style={{ inset: `${marginPct}%`, borderRadius: previewRadius }}
            >
              {DemoCard}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
