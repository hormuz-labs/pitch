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
  ffmpeg_postprocessing:  'FFmpeg Post-Processing',
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

      <div style={{
        background: '#fff',
        border: '1.5px solid #e5e7eb',
        borderRadius: 20,
        padding: '20px 22px',
        width: '100%',
        boxShadow: '0 4px 24px 0 rgba(0,0,0,0.07)',
        fontFamily: 'inherit',
        userSelect: 'none',
      }}>

        {/* ── Header row ──────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Icon box */}
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              border: '1.5px solid #e5e7eb', background: '#f9fafb',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
              </svg>
            </div>
            <span style={{ fontWeight: 700, fontSize: 16, color: '#111827' }}>Video Generation</span>
          </div>

          {/* Progress pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Mini bar */}
            <div style={{
              width: 80, height: 7, borderRadius: 99,
              background: '#f3f4f6', overflow: 'hidden', position: 'relative',
            }}>
              <div style={{
                height: '100%', borderRadius: 99,
                background: progress === 100 ? '#16a34a' : '#3b82f6',
                width: `${progress}%`,
                transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
                position: 'relative', overflow: 'hidden',
              }}>
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)',
                  animation: 'vpw-shimmer 1.6s linear infinite',
                }} />
              </div>
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#6b7280', minWidth: 32, textAlign: 'right' }}>
              {progress}%
            </span>
          </div>
        </div>

        {/* ── Progress counter + full bar ──────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: '#f9fafb', border: '1.5px solid #e5e7eb',
          borderRadius: 99, padding: '5px 12px',
          marginBottom: 20, width: 'fit-content',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#9ca3af' }}>
            <span style={{ color: '#374151' }}>{completedCount}</span> of {totalCount} phases
          </span>
          <div style={{
            width: 80, height: 6, borderRadius: 99,
            background: '#e5e7eb', overflow: 'hidden', position: 'relative',
          }}>
            <div style={{
              height: '100%', borderRadius: 99,
              background: progress === 100 ? '#16a34a' : '#3b82f6',
              width: `${progress}%`,
              transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
              position: 'relative', overflow: 'hidden',
            }}>
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)',
                animation: 'vpw-shimmer 1.6s linear infinite',
              }} />
            </div>
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>{progress}%</span>
        </div>

        {/* ── Phase subtask list ────────────────────────────────────────────── */}
        <div style={{ position: 'relative', marginLeft: 10, paddingLeft: 24, marginBottom: 20 }}>
          {/* Vertical connector line */}
          <div style={{
            position: 'absolute', left: 0, top: 4, bottom: 20,
            width: 2, background: '#e5e7eb', borderRadius: 1,
          }} />

          {phaseList.map((p, idx) => (
            <div
              key={p.key}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                marginBottom: idx < phaseList.length - 1 ? 14 : 0,
                position: 'relative',
              }}
            >
              {/* L-shaped connector */}
              <div style={{
                position: 'absolute', left: -24, top: -8,
                width: 18, height: 24,
                borderBottom: '2px solid #e5e7eb',
                borderLeft: '2px solid #e5e7eb',
                borderBottomLeftRadius: 6,
              }} />

              <PhaseIcon status={p.status} />

              <span style={{
                fontSize: 14, fontWeight: 500,
                color: p.status === 'completed'
                  ? '#9ca3af'
                  : p.status === 'running'
                    ? '#1d4ed8'
                    : '#374151',
                transition: 'color 0.3s',
              }}>
                {p.label}
              </span>

              {p.status === 'running' && (
                <span style={{
                  fontSize: 10, fontWeight: 700, color: '#2563eb',
                  background: '#eff6ff', borderRadius: 99, padding: '1px 8px',
                  border: '1px solid #bfdbfe', letterSpacing: 0.5,
                  textTransform: 'uppercase',
                }}>
                  Running
                </span>
              )}
            </div>
          ))}
        </div>

        {/* ── Status + Priority badges ──────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: '#fef3c7', border: '1px solid #fde68a',
            borderRadius: 8, padding: '5px 12px',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#d97706" stroke="none">
              <path d="M3 3h2v13H3V3zm4 0l10 6.5L7 16V3z"/>
            </svg>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#92400e' }}>High Priority</span>
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: '#eff6ff', border: '1px solid #bfdbfe',
            borderRadius: 8, padding: '5px 12px',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#1e40af' }}>{statusLabel}</span>
          </div>
        </div>
      </div>
    </>
  );
};
