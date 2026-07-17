import type { ReactNode } from 'react'

export type CreationMode = 'website' | 'document' | 'launch'

const modes = [
  {
    id: 'website' as const,
    title: 'Website demo',
    description: 'Record a guided product walkthrough from a live URL.',
    meta: 'URL · Browser recording',
    icon: (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18" />
        <path d="M7 6.5h.01M10 6.5h.01" />
      </svg>
    ),
  },
  {
    id: 'document' as const,
    title: 'Demo from PDFs',
    description: 'Turn documents, decks, or images into a narrated explanatory video.',
    meta: 'PDF · Images · Storyboard review',
    icon: (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="M6 2h8l4 4v16H6z" />
        <path d="M14 2v5h5M9 12h6M9 16h6" />
      </svg>
    ),
  },
  {
    id: 'launch' as const,
    title: 'Launch video',
    description: 'Build a cinematic announcement for your next product or feature release.',
    meta: 'Product footage · Brand assets',
    comingSoon: true,
    icon: (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="M14.5 5.5c2.2-2.2 4.8-2.5 6-2.5 0 1.2-.3 3.8-2.5 6l-5.5 5.5-4-4z" />
        <path d="m8.5 10.5-3 .5-2 2 5 1.5M12.5 14.5l-.5 3-2 2-1.5-5" />
        <path d="M5.5 17.5c-1.5.5-2.5 1.5-3 3 1.5-.5 2.5-1.5 3-3Z" />
      </svg>
    ),
  },
]

const ModeTabs = ({
  mode,
  onSelect,
}: {
  mode: CreationMode
  onSelect: (mode: CreationMode) => void
}) => (
  <div className="inline-flex max-w-full gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-gray-100 p-1">
    {modes.map(item => (
      <button
        key={item.id}
        type="button"
        onClick={() => onSelect(item.id)}
        className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-all ${
          mode === item.id
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-500 hover:text-gray-800'
        }`}
      >
        {item.title}
        {item.comingSoon && (
          <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-gray-500">
            Soon
          </span>
        )}
      </button>
    ))}
  </div>
)

const LaunchComingSoon = () => (
  <div className="grid min-h-[440px] place-items-center rounded-2xl border border-gray-200 bg-white px-6 py-12 text-center shadow-sm">
    <div className="max-w-md">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gray-900 text-white shadow-lg shadow-gray-900/15">
        {modes[2].icon}
      </span>
      <span className="mt-5 inline-flex rounded-full bg-amber-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-amber-700 ring-1 ring-amber-200">
        Coming soon
      </span>
      <h2 className="mt-4 text-xl font-bold text-gray-900">Launch videos are on the way</h2>
      <p className="mt-2 text-sm leading-relaxed text-gray-500">
        Soon you’ll be able to combine product footage, feature callouts, brand assets, and
        narration into a polished release video.
      </p>
    </div>
  </div>
)

export const CreateModeSelector = ({
  mode,
  onSelect,
  children,
}: {
  mode: CreationMode | null
  onSelect: (mode: CreationMode) => void
  children: ReactNode
}) => {
  if (!mode) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {modes.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-lg"
          >
            {item.comingSoon && (
              <span className="absolute right-4 top-4 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700 ring-1 ring-amber-200">
                Coming soon
              </span>
            )}
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-gray-100 text-gray-700 transition-colors group-hover:bg-gray-900 group-hover:text-white">
              {item.icon}
            </span>
            <span className="mt-6 block text-lg font-bold text-gray-900">{item.title}</span>
            <span className="mt-2 block flex-1 text-sm leading-relaxed text-gray-500">
              {item.description}
            </span>
            <span className="mt-5 block text-xs font-medium text-gray-400">{item.meta}</span>
            <span className="mt-4 block w-full whitespace-nowrap rounded-xl bg-gray-100 px-4 py-2.5 text-center text-sm font-semibold text-gray-700 transition-colors group-hover:bg-gray-900 group-hover:text-white">
              Get started
            </span>
          </button>
        ))}
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4">
        <ModeTabs mode={mode} onSelect={onSelect} />
      </div>
      {mode === 'launch' ? <LaunchComingSoon /> : children}
    </div>
  )
}
