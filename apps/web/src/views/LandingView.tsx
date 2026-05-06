import { useClerk } from '@clerk/clerk-react';
import { useEffect, useState } from 'react';
import { PitchLogoAnimation } from '../components/PitchLogoAnimation';
import { DoubleStairPreloader } from '../components/DoubleStairPreloader';
import { Footer } from '../components/Footer';
import { PublicNavbar } from '../components/PublicNavbar';

export const LandingView = () => {
  const clerk = useClerk();
  const [preloaderDone, setPreloaderDone] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'g' || e.key === 'G') {
        clerk.openSignIn();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clerk]);

  return (
    <>
      <DoubleStairPreloader onComplete={() => setPreloaderDone(true)} />
      <div className="min-h-screen bg-[#FDFDFD] text-gray-900 font-sans selection:bg-gray-200 flex flex-col overflow-x-hidden overflow-y-auto">
        <PublicNavbar />

        {/* Hero */}
        <main className="flex-1 flex flex-col items-center pt-8 pb-16 px-6">
          {/* PITCH Blocky Logo Representation */}
          <div className="flex justify-center mb-10 select-none" aria-label="PITCH">
            <div className="w-[280px] md:w-[400px]">
              <PitchLogoAnimation startAnimation={preloaderDone} />
            </div>
          </div>

          <h1 className="text-[20px] leading-[28px] font-bold tracking-tight text-gray-900 mb-6 max-w-2xl font-mono text-center">
            Automated cinematic product pitches
          </h1>

          <p className="text-[14px] leading-[20px] font-normal text-gray-500 mb-10 max-w-2xl mx-auto font-mono text-center">
            What if your website could <span className="text-gray-900 font-medium">pitch itself</span>? Just <span className="text-gray-900 font-medium">drop your URL</span>, describe what you want, and our <span className="text-gray-900 font-medium">AI agent</span> does the rest — visiting your site, crafting the script, and delivering a professional, <span className="text-gray-900 font-medium">narrated pitch video</span> in minutes.
          </p>
        </main>

        {/* Mockup Image / App Window */}
        <div className="max-w-6xl mx-auto w-full px-6 pb-24">
          <div className="rounded-xl border border-gray-200 bg-[#1E1E1E] shadow-2xl overflow-hidden flex flex-col font-mono text-sm h-[600px]">
            {/* Mockup Top Bar */}
            <div className="h-12 bg-[#2D2D2D] border-b border-[#3D3D3D] flex items-center px-4 justify-between shrink-0">
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-[#FF5F56]"></div>
                <div className="w-3 h-3 rounded-full bg-[#FFBD2E]"></div>
                <div className="w-3 h-3 rounded-full bg-[#27C93F]"></div>
              </div>
              <div className="flex items-center gap-2 px-3 py-1 bg-[#1A1A1A] rounded text-[#A0A0A0] text-xs">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                pitch-workspace-v3
              </div>
              <div className="w-12"></div>
            </div>
            {/* Mockup Body */}
            <div className="flex-1 flex overflow-hidden">
              {/* Mockup Sidebar */}
              <div className="w-64 bg-[#252525] border-r border-[#3D3D3D] flex flex-col p-3 gap-4 text-[#CCCCCC]">
                <div className="flex items-center gap-2 text-white font-bold px-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
                  Home
                </div>
                <div>
                  <div className="text-[#808080] text-xs font-bold px-2 mb-2 uppercase tracking-wider">conductor</div>
                  <div className="flex items-center gap-2 px-2 py-1.5 hover:bg-[#333333] rounded cursor-pointer">
                    + New workspace
                  </div>
                  <div className="mt-2">
                    <div className="flex items-center justify-between px-2 py-1.5 bg-[#333333] rounded text-white">
                      <div className="flex items-center gap-2 truncate">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><line x1="3" y1="12" x2="9" y2="12" /><line x1="15" y1="12" x2="21" y2="12" /></svg>
                        <span className="truncate">pitch-workspace-v3</span>
                      </div>
                      <div className="flex items-center gap-1 text-[10px]">
                        <span className="text-green-400 bg-green-400/10 px-1 rounded">+312</span>
                        <span className="text-red-400 bg-red-400/10 px-1 rounded">-332</span>
                      </div>
                    </div>
                    <div className="pl-8 text-xs text-green-400 mt-1">Ready to merge</div>
                  </div>
                </div>
              </div>
              {/* Mockup Main Content */}
              <div className="flex-1 flex flex-col bg-[#1E1E1E]">
                <div className="h-12 border-b border-[#3D3D3D] flex items-center px-4 gap-4 text-[#A0A0A0]">
                  <div className="flex items-center gap-2 border-b-2 border-white text-white pb-3 pt-3">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
                    All changes
                  </div>
                  <div className="flex items-center gap-2 pb-3 pt-3 hover:text-white cursor-pointer">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
                    Debugging VideoRenderError
                  </div>
                </div>
                <div className="p-6 flex-1 overflow-y-auto">
                  <div className="bg-[#2D2D2D] border border-[#3D3D3D] rounded-lg p-4 mb-4 text-[#E0E0E0]">
                    <span className="text-red-400">VideoRenderError:</span> Can't find codec: libx264 in @VideoRenderer.ts
                  </div>
                  <div className="text-[#A0A0A0] text-xs mb-2">
                    13 tool calls, 7 messages
                  </div>
                  <div className="text-[#E0E0E0]">
                    Perfect! I've added the missing ffmpeg configuration. Now let me run the rendering pipeline to make sure everything compiles correctly:
                  </div>
                  <div className="mt-4 bg-black/30 p-4 rounded border border-[#3D3D3D] font-mono text-xs text-green-400">
                    $ bun run build:video<br />
                    [1/3] Compiling video assets... DONE<br />
                    [2/3] Encoding with libx264... DONE<br />
                    [3/3] Finalizing MP4 output... DONE<br />
                    <br />
                    ✨  Done in 12.4s.
                  </div>
                </div>
              </div>
              {/* Mockup Right Sidebar (Changes) */}
              <div className="w-80 bg-[#1A1A1A] border-l border-[#3D3D3D] flex flex-col">
                <div className="p-3 border-b border-[#3D3D3D] bg-[#162B1D] text-green-400 flex items-center justify-between rounded-tr-lg">
                  <div className="font-bold flex items-center gap-2">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                    Ready to export
                  </div>
                  <button className="bg-green-500 text-white px-3 py-1 rounded text-xs font-bold">
                    Export Video
                  </button>
                </div>
                <div className="p-3 text-[#E0E0E0] text-xs">
                  <div className="flex items-center justify-between text-[#808080] mb-3">
                    <span>Changes 10</span>
                    <div className="flex gap-3">
                      <span className="hover:text-white cursor-pointer">All files</span>
                      <span className="hover:text-white cursor-pointer">Review</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between py-1 hover:bg-[#2A2A2A] px-2 rounded cursor-pointer">
                      <span className="truncate pr-4">src/App.tsx</span>
                      <span className="text-green-400 shrink-0">+2</span>
                    </div>
                    <div className="flex items-center justify-between py-1 hover:bg-[#2A2A2A] px-2 rounded cursor-pointer">
                      <span className="truncate pr-4">src/core/video/VideoAPI.ts</span>
                      <span className="text-green-400 shrink-0">+53</span>
                    </div>
                    <div className="flex items-center justify-between py-1 hover:bg-[#2A2A2A] px-2 rounded cursor-pointer">
                      <span className="truncate pr-4">src/ui/components/Timeline.tsx</span>
                      <span className="text-red-400 shrink-0">-3</span>
                    </div>
                    <div className="flex items-center justify-between py-1 hover:bg-[#2A2A2A] px-2 rounded cursor-pointer bg-[#2A2A2A]">
                      <span className="truncate pr-4">src/ui/components/VideoRenderer.ts</span>
                      <div className="flex gap-2 shrink-0">
                        <span className="text-green-400">+225</span>
                        <span className="text-red-400">-117</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <Footer />
      </div>
    </>
  );
};