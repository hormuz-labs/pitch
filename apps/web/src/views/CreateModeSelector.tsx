import type { ReactNode } from 'react'

export type CreationMode = 'website' | 'document'

const modes = [
  {
    id: 'website' as const,
    title: 'Demo Video',
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
    title: 'Document to Demo',
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
      </button>
    ))}
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
      <div className="grid gap-4 md:grid-cols-2">
        {modes.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-lg"
          >
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
      {children}
    </div>
  )
}
