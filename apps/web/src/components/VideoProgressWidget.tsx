import React from 'react';
import type { Project, PhaseUpdate } from '../types';

// ── Phase definitions (order matters — displayed top-to-bottom) ────────────────
const PHASE_ORDER = [
  'workspace_init',
  'selector_collection',
  'intro_sequence',
  'flow_validation',
  'voiceover_generation',
  'video_recording',
  'ffmpeg_postprocessing',
] as const;

const PHASE_LABELS: Record<string, string> = {
  workspace_init:         'Workspace Initialization',
  selector_collection:    'Selector Collection',
  intro_sequence:         'Cinematic Intro',
  flow_validation:        'Flow Validation',
  voiceover_generation:   'Voiceover Generation',
  video_recording:        'Video Recording',
  ffmpeg_postprocessing:  'Encoding',
};

// ── Props ─────────────────────────────────────────────────────────────────────
interface VideoProgressWidgetProps {
  project: Project;
}

// ── Status icon ───────────────────────────────────────────────────────────────
const PhaseIcon = ({ status }: { status: PhaseUpdate['status'] | 'pending' }) => {
  if (status === 'completed') {
    return (
      <span style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 20, height: 20, borderRadius: '50%',
        background: '#16a34a', flexShrink: 0,
      }}>
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
          <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </span>
    );
  }
  if (status === 'running') {
    return (
      <span style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 20, height: 20, borderRadius: '50%',
        border: '2px solid #3b82f6', flexShrink: 0,
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: '#3b82f6',
          animation: 'vpw-pulse 1.2s ease-in-out infinite',
        }} />
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 20, height: 20, borderRadius: '50%',
        background: '#dc2626', flexShrink: 0,
      }}>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 2l6 6M8 2l-6 6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      </span>
    );
  }
  // pending
  return (
    <span style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      width: 20, height: 20, borderRadius: '50%',
      border: '2px solid #d1d5db', flexShrink: 0,
    }} />
  );
};

// ── Main Widget ───────────────────────────────────────────────────────────────
export const VideoProgressWidget: React.FC<VideoProgressWidgetProps> = ({ project }) => {
  const phases = project.phases ?? [];
  const progress = project.progress ?? 0;

  // Build full phase list with status for every phase in canonical order
  const phaseList = PHASE_ORDER.map(key => {
    const found = phases.find(p => p.phase === key);
    return {
      key,
      label: PHASE_LABELS[key],
      status: (found?.status ?? 'pending') as PhaseUpdate['status'] | 'pending',
    };
  });

  const completedCount = phaseList.filter(p => p.status === 'completed').length;
  const totalCount = PHASE_ORDER.length;
  const runningPhase = phaseList.find(p => p.status === 'running');
  const statusLabel = runningPhase
    ? runningPhase.label
    : progress === 100
      ? 'Finishing up…'
      : 'Queued';

  return (
    <>
      {/* Keyframe animations injected once via a style tag */}
      <style>{`
        @keyframes vpw-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.7); }
        }
        @keyframes vpw-shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>

      <div className="w-full bg-white border-[1.5px] border-gray-200 rounded-2xl p-4 sm:p-5 shadow-[0_4px_24px_0_rgba(0,0,0,0.07)] select-none font-inherit">

        {/* ── Header row ──────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3 sm:gap-0">
          <div className="flex items-center gap-2.5">
            {/* Icon box */}
            <div className="w-10 h-10 rounded-xl border-[1.5px] border-gray-200 bg-gray-50 flex items-center justify-center shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
              </svg>
            </div>
            <span className="font-bold text-base text-gray-900">Video Generation</span>
          </div>

          {/* Progress pill - moved to bottom for mobile */}
          <div className="hidden sm:flex items-center gap-2 ml-0">
            {/* Mini bar */}
            <div className="w-20 h-2 rounded-full bg-gray-100 overflow-hidden relative">
              <div 
                className="h-full rounded-full relative overflow-hidden transition-all duration-600 ease-in-out"
                style={{
                  background: progress === 100 ? '#16a34a' : '#3b82f6',
                  width: `${progress}%`,
                }}
              >
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)',
                  animation: 'vpw-shimmer 1.6s linear infinite',
                }} />
              </div>
            </div>
            <span className="text-[13px] font-semibold text-gray-500 min-w-[32px] text-right">
              {progress}%
            </span>
          </div>
        </div>

        {/* ── Phase subtask list ────────────────────────────────────────────── */}
        <div className="relative ml-2.5 pl-6 mb-5">
          {/* Vertical connector line */}
          <div className="absolute left-0 top-1 bottom-5 w-[2px] bg-gray-200 rounded-sm overflow-hidden">
            <div 
              className="absolute top-0 left-0 w-full transition-all duration-500 bg-green-500"
              style={{ height: `${completedCount === 0 ? 0 : ((completedCount - 1) / (totalCount - 1)) * 100}%` }}
            />
          </div>

          {phaseList.map((p, idx) => (
            <div
              key={p.key}
              className={`flex flex-wrap items-center gap-2.5 relative ${idx < phaseList.length - 1 ? 'mb-3.5' : ''}`}
            >
              {/* L-shaped connector */}
              <div className={`absolute -left-6 -top-2 w-[18px] h-6 border-b-2 border-l-2 rounded-bl-md transition-colors duration-500 ${
                p.status === 'completed' 
                  ? 'border-green-500' 
                  : p.status === 'running' 
                    ? 'border-blue-500' 
                    : 'border-gray-200'
              }`} />

              <PhaseIcon status={p.status} />

              <span className={`text-sm font-medium transition-colors ${
                p.status === 'completed' ? 'text-gray-400' : p.status === 'running' ? 'text-blue-700' : 'text-gray-700'
              }`}>
                {p.label}
              </span>

              {p.status === 'running' && (
                <span className="text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-2 py-[1px] tracking-wide uppercase">
                  Running
                </span>
              )}
            </div>
          ))}
        </div>

        {/* ── Status + Priority badges ──────────────────────────────────────── */}
        <div className="flex gap-2.5 flex-wrap">
          <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-lg py-1 px-3">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            <span className="text-xs font-bold text-blue-800">{statusLabel}</span>
          </div>
        </div>

        {/* ── Progress counter + full bar ──────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 bg-gray-50 border-[1.5px] border-gray-200 rounded-xl sm:rounded-full py-1.5 px-3 mt-5 w-fit">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          <span className="text-[13px] font-semibold text-gray-400">
            <span className="text-gray-700">{completedCount}</span> of {totalCount} phases
          </span>
          <div className="w-20 h-1.5 rounded-full bg-gray-200 overflow-hidden relative shrink-0">
            <div 
              className="h-full rounded-full relative overflow-hidden transition-all duration-600 ease-in-out"
              style={{
                background: progress === 100 ? '#16a34a' : '#3b82f6',
                width: `${progress}%`,
              }}
            >
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)',
                animation: 'vpw-shimmer 1.6s linear infinite',
              }} />
            </div>
          </div>
          <span className="text-[13px] font-bold text-gray-700">{progress}%</span>
        </div>

        {/* ── Mobile Progress Pill (bottom) ─────────────────────────────────── */}
        <div className="sm:hidden flex items-center gap-2 mt-5">
          <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden relative">
            <div 
              className="h-full rounded-full relative overflow-hidden transition-all duration-600 ease-in-out"
              style={{
                background: progress === 100 ? '#16a34a' : '#3b82f6',
                width: `${progress}%`,
              }}
            >
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)',
                animation: 'vpw-shimmer 1.6s linear infinite',
              }} />
            </div>
          </div>
          <span className="text-[13px] font-semibold text-gray-500 min-w-[32px] text-right">
            {progress}%
          </span>
        </div>
      </div>
    </>
  );
};
