import { useState, useRef } from 'react';
import demoVideo from '../../assets/demo.mp4';
import thumbnail from '../../assets/demo-thumbnail.jpg';

export const VideoPlayerMockup = () => {
  const [hasStarted, setHasStarted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handlePlay = () => {
    setHasStarted(true);
    videoRef.current?.play();
  };

  return (
    <div className="w-full flex flex-col items-center">
      <div className="w-full flex justify-center" style={{ width: '80vw', maxWidth: 'none' }}>
        <div 
          className="rounded-lg sm:rounded-[14px] border border-[#3D3D3D] bg-white overflow-hidden flex flex-col w-full relative z-10" 
          style={{ 
            boxShadow: '0 20px 40px rgba(0,0,0,0.15), 0 8px 16px rgba(0,0,0,0.1)'
          }}
        >
          {/* Top Bar */}
          <div className="h-8 sm:h-10 md:h-12 bg-black border-b border-[#3D3D3D] flex items-center px-3 sm:px-4 justify-between shrink-0">
            <div className="flex gap-1.5 sm:gap-2">
              <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 md:w-3 md:h-3 rounded-full bg-[#FF5F56]" />
              <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 md:w-3 md:h-3 rounded-full bg-[#FFBD2E]" />
              <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 md:w-3 md:h-3 rounded-full bg-[#27C93F]" />
            </div>
            <div className="w-8 sm:w-12" />
          </div>

          {/* Body */}
          <div className="relative group bg-white">
            <video 
              ref={videoRef}
              src={demoVideo} 
              controls 
              className="w-full h-auto block bg-black"
              onPlay={() => setHasStarted(true)}
            />
            {!hasStarted && (
              <div 
                className="absolute inset-0 bg-black flex items-center justify-center cursor-pointer"
                onClick={handlePlay}
              >
                <img src={thumbnail} alt="Pitch Demo" className="w-full h-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                  <div className="w-12 h-12 sm:w-16 sm:h-16 bg-black/80 rounded-full flex items-center justify-center text-white shadow-lg">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="ml-1 sm:w-6 sm:h-6">
                      <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2.5 mt-3 self-end mr-4 sm:mr-10 xl:mr-[10vw] text-gray-500 w-full max-w-[80vw]">
        <svg width="28" height="28" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="transform -translate-y-1">
          <path d="M18 22 C 22 40 35 55 52 55" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
          <path d="M18 22 L 12 32 M 18 22 L 28 26" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
        </svg>
        <span className="font-sans text-sm font-medium">this video was made using <span className="font-bold text-gray-900 bg-gray-100 px-1.5 py-0.5 rounded ml-0.5">PITCH</span></span>
      </div>
    </div>
  );
};
