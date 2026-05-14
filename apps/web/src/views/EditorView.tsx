import { useNavigate, useParams } from 'react-router-dom';
import type { Project, LogEntry } from '../types';
import { LiquidChrome } from '../components/LiquidChrome';
import { VideoProgressWidget } from '../components/VideoProgressWidget';

// ── Icons ──────────────────────────────────────────────────────────────────────
const IconCheck = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
    <polyline points="22 4 12 14.01 9 11.01"/>
  </svg>
);
const IconXCircle = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
  </svg>
);
const IconVideo = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
  </svg>
);
const IconAudio = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 18v-6a9 9 0 0 1 18 0v6"/>
    <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
  </svg>
);

// ── Editor View ────────────────────────────────────────────────────────────────
interface EditorViewProps {
  projects: Project[];
  jobLogs: Record<string, LogEntry[]>;
  isMobile: boolean;
}

export const EditorView = ({ projects, jobLogs, isMobile }: EditorViewProps) => {
  const navigate = useNavigate();
  const { id } = useParams();

  const selectedProject = projects.find(p => p.id === id);
  const logs = jobLogs[id || ''] || [];
  const latestScreenshot = [...logs].reverse().find(l => l.screenshot)?.screenshot;
  const displayLogs = logs.filter(l => l.type === 'text' || l.type === 'call').slice(-5);

  if (!selectedProject) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-12">
        <p className="text-gray-500 mb-4">Project not found or loading…</p>
        <button
          onClick={() => navigate('/dashboard')}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors border-none cursor-pointer"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  const isProcessing = selectedProject.status === 'PROCESSING' || selectedProject.status === 'PENDING';
  const isCompleted  = selectedProject.status === 'COMPLETED';
  const isFailed     = selectedProject.status === 'FAILED';

  return (
    <div className="flex flex-col h-full">
      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-6 md:p-8">
        <div className="max-w-5xl mx-auto w-full">

          {/* Processing state */}
          {isProcessing && (
            <div className="bg-white border border-gray-200 rounded-xl p-8">
              <div className="flex flex-col items-center text-center mb-8">
                <div className="w-full aspect-video max-w-[1920px] max-h-[1080px] relative rounded-xl overflow-hidden mb-6 border border-gray-200/50 shadow-2xl bg-black">
                  <LiquidChrome
                    baseColor={[0.031, 0.490, 0.820]}
                    speed={0.3}
                    amplitude={0.5}
                    interactive={true}
                  />
                  
                  {/* Logs Overlay */}
                  <div className="absolute inset-0 flex flex-col justify-end p-4 sm:p-6 md:p-10 bg-gradient-to-t from-black/90 via-black/30 to-transparent pointer-events-none text-left">
                    <div className="max-w-3xl w-full">
                      <p className="text-[10px] sm:text-xs font-bold text-white/70 uppercase tracking-widest mb-2 sm:mb-3 drop-shadow-md">Current Status</p>
                      <div className="space-y-1.5 sm:space-y-2 max-h-[40%] overflow-hidden">
                        {(displayLogs.length > 0 ? displayLogs : [{ message: 'Initializing agent…', timestamp: '', type: 'info' } as LogEntry]).map((item, i) => (
                          <div key={i} className="flex items-start gap-2 sm:gap-3 text-xs sm:text-sm md:text-base">
                            <span className="text-white/60 font-mono text-[10px] sm:text-xs md:text-sm mt-0.5 shrink-0 drop-shadow-md">{item.timestamp}</span>
                            <span className="text-white font-medium leading-snug drop-shadow-lg line-clamp-2">{item.message}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <h2 className="text-lg font-bold text-gray-900">Generating your video…</h2>
                <p className="text-sm text-gray-500 mt-1">This typically takes 1–2 minutes. Hang tight!</p>

                {/* Real-time phase progress widget — always visible during processing */}
                <div className="mt-5 w-full max-w-md mx-auto">
                  <VideoProgressWidget project={selectedProject} />
                </div>
              </div>

              {latestScreenshot && (
                <div className="flex justify-center">
                  <div className={isMobile ? 'w-full' : 'w-72 shrink-0'}>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3 text-center">Live Preview</p>
                    <div className="rounded-lg overflow-hidden border border-gray-200 shadow-sm">
                      <img src={latestScreenshot} alt="Live screenshot" className="w-full block" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Completed state */}
          {isCompleted && (
            <div className="space-y-6">
              {/* Success banner */}
              <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-5 py-4">
                <span className="text-green-500"><IconCheck /></span>
                <div>
                  <p className="text-sm font-semibold text-green-800">Video is Ready!</p>
                  <p className="text-xs text-green-600 mt-0.5">Successfully generated and ready for download.</p>
                </div>
              </div>

              <div className={`flex gap-6 ${isMobile ? 'flex-col' : 'flex-row items-start'}`}>
                {/* Video player */}
                <div className="flex-[2] min-w-0">
                  <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm bg-black">
                    <video
                      src={selectedProject.videoUrl}
                      controls
                      autoPlay
                      className="w-full block"
                    />
                  </div>
                </div>

                {/* Download + details */}
                <div className="flex-1 min-w-0 space-y-3">
                  <p className="text-sm font-semibold text-gray-800">Download Assets</p>

                  <button
                    onClick={() => window.open(selectedProject.videoUrl)}
                    className="w-full flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-xl hover:border-gray-300 hover:shadow-sm transition-all text-left cursor-pointer"
                    id="download-video-asset-btn"
                  >
                    <div className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center text-gray-600 shrink-0">
                      <IconVideo />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Download Video</p>
                      <p className="text-xs text-gray-400">MP4 format · High Quality</p>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      const audioUrl = selectedProject.audioUrl || selectedProject.videoUrl?.replace('.mp4', '.wav');
                      if (audioUrl) window.open(audioUrl);
                    }}
                    disabled={!selectedProject.audioUrl && !selectedProject.videoUrl}
                    className="w-full flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-xl hover:border-gray-300 hover:shadow-sm transition-all text-left cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    id="download-audio-btn"
                  >
                    <div className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center text-gray-600 shrink-0">
                      <IconAudio />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Download Voiceover</p>
                      <p className="text-xs text-gray-400">WAV format · AI Narration</p>
                    </div>
                  </button>

                  {/* Project details */}
                  <div className="bg-white border border-gray-200 rounded-xl p-4 text-xs space-y-2">
                    <p className="font-semibold text-gray-700 mb-2">Project Details</p>
                    <div>
                      <span className="text-gray-400">Target URL</span>
                      <p className="text-gray-700 font-medium mt-0.5 break-all">{selectedProject.parameters.url}</p>
                    </div>
                    <div>
                      <span className="text-gray-400">Generated</span>
                      <p className="text-gray-700 font-medium mt-0.5">{new Date(selectedProject.updatedAt).toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Failed state */}
          {isFailed && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mb-4 text-red-400">
                <IconXCircle />
              </div>
              <h3 className="text-base font-bold text-gray-900 mb-1">Generation Failed</h3>
              <p className="text-sm text-gray-500 mb-6 max-w-xs">Something went wrong during the video generation process.</p>
              <button
                onClick={() => navigate('/dashboard')}
                className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors border-none cursor-pointer"
                id="failed-back-btn"
              >
                Back to Dashboard
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
