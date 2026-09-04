import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { LandingFooter } from '../components/LandingFooter'
import { LandingNav } from '../components/LandingNav'
import { PitchWordmark } from '../components/PitchWordmark'
import { FLOWS, getPublic, type PublicProject } from '../lib/studio-api'

interface PublicDemoViewProps {
  slug: string
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

const KICKER: Record<string, string> = {
  'launch-video': 'Pitch launch video',
  'demo-video': 'Pitch demo',
  deck: 'Pitch deck',
  'recording-edit': 'Pitch edit',
}

export const PublicDemoView = ({ slug }: PublicDemoViewProps) => {
  const [project, setProject] = useState<PublicProject | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'not-found'>('loading')

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setProject(null)

    getPublic(slug)
      .then(data => {
        if (cancelled) return
        if (!data) {
          setStatus('not-found')
          return
        }
        setProject(data)
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('not-found')
      })

    return () => {
      cancelled = true
    }
  }, [slug])

  return (
    <div
      className="min-h-screen text-gray-900 font-sans selection:bg-gray-900 selection:text-white flex flex-col overflow-x-hidden overflow-y-auto"
      style={{
        background: 'radial-gradient(120% 70% at 50% -10%, #F3EFE7 0%, #FAF9F6 45%, #F5F4F1 100%)',
      }}
    >
      <LandingNav />
      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 py-10 sm:py-20">
        {status === 'loading' && (
          <div className="w-full max-w-4xl">
            <div className="w-full aspect-video rounded-2xl sm:rounded-[28px] bg-gray-200/70 animate-pulse" />
            <div className="mt-5 sm:mt-7 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="h-8 w-full max-w-56 bg-gray-200/70 rounded-lg animate-pulse" />
              <div className="h-11 w-full sm:w-44 bg-gray-200/70 rounded-full animate-pulse" />
            </div>
          </div>
        )}

        {status === 'not-found' && (
          <div className="text-center max-w-sm py-14 sm:py-20 animate-in fade-in duration-500">
            <PitchWordmark className="h-5 sm:h-6 w-auto mx-auto mb-6 sm:mb-8 text-gray-300" />
            <h1 className="font-serif text-2xl sm:text-3xl text-gray-900 mb-3">
              This project isn't available
            </h1>
            <p className="text-gray-500 text-sm sm:text-[15px] mb-8 sm:mb-9 leading-relaxed">
              It may have been unshared by its owner, or the link is incorrect.
            </p>
            <Link
              to="/"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gray-900 text-white text-sm font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.1)] hover:bg-black hover:shadow-[0_4px_16px_rgba(0,0,0,0.18)] hover:-translate-y-px active:translate-y-0 transition-all duration-200"
            >
              Go to trypitch.co
            </Link>
          </div>
        )}

        {status === 'ready' && project && (
          <div className="w-full max-w-4xl animate-in fade-in slide-in-from-bottom-3 duration-700">
            <div className="relative">
              {/* Ambient glow behind the frame — echoes the warm tone of the rendered video itself */}
              <div
                className="absolute -inset-3 sm:-inset-6 rounded-[28px] sm:rounded-[36px] opacity-60 blur-2xl -z-10"
                style={{
                  background:
                    'radial-gradient(60% 60% at 50% 40%, rgba(17,24,39,0.08), transparent 70%)',
                }}
              />
              <div className="w-full aspect-video rounded-2xl sm:rounded-[28px] overflow-hidden bg-gray-950 shadow-[0_1px_1px_rgba(0,0,0,0.05),0_20px_48px_-16px_rgba(0,0,0,0.22)] ring-1 ring-black/[0.06]">
                {project.videoUrl ? (
                  <video
                    controls
                    poster={project.thumbnailUrl ?? undefined}
                    src={project.videoUrl}
                    className="w-full h-full object-contain"
                  />
                ) : project.pdfUrl ? (
                  <iframe
                    src={project.pdfUrl}
                    title={project.title}
                    className="w-full h-full bg-white"
                  />
                ) : project.thumbnailUrl ? (
                  <img
                    src={project.thumbnailUrl}
                    alt={project.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">
                    Nothing published yet
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5 sm:mt-7 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 sm:gap-6">
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400 mb-1.5">
                  {KICKER[project.flow] ?? `Pitch ${FLOWS[project.flow]?.title ?? ''}`.trim()}
                </div>
                <h1 className="font-serif text-2xl sm:text-[32px] leading-tight text-gray-900 break-words sm:truncate">
                  {project.title}
                </h1>
                <div className="mt-2 text-[13px] text-gray-400">
                  {formatDate(project.createdAt)}
                </div>
              </div>

              <div className="flex flex-col items-center sm:items-end gap-2.5 shrink-0">
                {project.pdfUrl && (
                  <a
                    href={project.pdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-full sm:w-auto items-center justify-center gap-2 px-6 py-3 rounded-full border border-gray-300 bg-white text-gray-900 text-sm font-semibold whitespace-nowrap hover:border-gray-900 transition-all duration-200"
                  >
                    Download PDF
                  </a>
                )}
                <Link
                  to="/"
                  className="inline-flex w-full sm:w-auto items-center justify-center gap-2 px-6 py-3 rounded-full bg-gray-900 text-white text-sm font-semibold whitespace-nowrap shadow-[0_1px_2px_rgba(0,0,0,0.1)] hover:bg-black hover:shadow-[0_4px_16px_rgba(0,0,0,0.18)] hover:-translate-y-px active:translate-y-0 transition-all duration-200"
                >
                  Create your own
                </Link>
                <Link
                  to="/"
                  className="inline-flex items-center gap-1.5 text-gray-400 hover:text-gray-600 transition-colors text-xs"
                >
                  Powered by
                  <PitchWordmark className="h-3 w-auto" />
                </Link>
              </div>
            </div>
          </div>
        )}
      </main>
      <LandingFooter />
    </div>
  )
}
