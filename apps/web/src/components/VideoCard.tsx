import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { Project } from '../types';
import { TimedUndoAction } from './TimedUndoAction';
import { ShareSheet } from './ShareSheet';

const IconVideoPlaceholder = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-300">
    <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
    <line x1="7" y1="2" x2="7" y2="22" /><line x1="17" y1="2" x2="17" y2="22" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <line x1="2" y1="7" x2="7" y2="7" /><line x1="2" y1="17" x2="7" y2="17" />
    <line x1="17" y1="17" x2="22" y2="17" /><line x1="17" y1="7" x2="22" y2="7" />
  </svg>
);

const IconTrashSm = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6" /><path d="M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
);

const StatusBadge = ({ status }: { status: Project['status'] }) => {
  const map: Record<string, { label: string; className: string }> = {
    COMPLETED: { label: 'Ready', className: 'bg-green-50 text-green-700 border border-green-200' },
    FAILED: { label: 'Failed', className: 'bg-red-50 text-red-600 border border-red-200' },
    PROCESSING: { label: 'Rendering…', className: 'bg-amber-50 text-amber-600 border border-amber-200' },
    PENDING: { label: 'Draft', className: 'bg-gray-100 text-gray-500 border border-gray-200' },
  };
  const cfg = map[status] ?? { label: status, className: 'bg-gray-100 text-gray-500 border border-gray-200' };
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${cfg.className}`}>
      {status === 'PROCESSING' && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse inline-block" />}
      {cfg.label}
    </span>
  );
};

export interface VideoCardProps {
  project: Project;
  onClick: () => void;
  onConfirmDelete: () => void;
  onRetry: () => void;
}

import { FaWhatsapp, FaXTwitter, FaInstagram } from 'react-icons/fa6';
import { FiLink } from 'react-icons/fi';

const shareOptions = [
  { 
    id: 'copy', 
    name: 'Copy URL', 
    icon: <FiLink size={13} className="text-indigo-600 transition-transform duration-300 group-hover:scale-110" />,
    bgClass: 'bg-indigo-50 border border-indigo-100/50 text-indigo-600',
    immediate: true,
  },
  { 
    id: 'whatsapp', 
    name: 'WhatsApp', 
    icon: <FaWhatsapp size={14} className="text-emerald-600 transition-transform duration-300 group-hover:scale-110" />,
    bgClass: 'bg-emerald-50 border border-emerald-100/50 text-emerald-600'
  },
  { 
    id: 'twitter', 
    name: 'Twitter / X', 
    icon: <FaXTwitter size={13} className="text-zinc-900 transition-transform duration-300 group-hover:scale-110" />,
    bgClass: 'bg-zinc-100 border border-zinc-200/50 text-zinc-900'
  },
  { 
    id: 'instagram', 
    name: 'Instagram', 
    icon: <FaInstagram size={14} className="text-rose-600 transition-transform duration-300 group-hover:scale-110" />,
    bgClass: 'bg-rose-50 border border-rose-100/50 text-rose-600'
  },
];

export const VideoCard = ({ project, onClick, onConfirmDelete, onRetry }: VideoCardProps) => {
  const [isPendingDelete, setIsPendingDelete] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);

  const dateStr = new Date(project.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const title = project.parameters?.url
    ? project.parameters.url.replace(/^https?:\/\//, '').split('/')[0]
    : 'Untitled Job';

  const handleShareComplete = (option: { id: string; name: string }, videoUrl: string) => {
    const text = encodeURIComponent("Just generated a cinematic product demo using Pitch. Create your own at https://trypitch.co 🚀");
    const twitterText = encodeURIComponent("Just generated a cinematic product demo using @trypitchdotco. Create your own at https://trypitch.co 🚀");
    const url = encodeURIComponent(videoUrl);

    if (option.id === 'copy') {
      navigator.clipboard.writeText(videoUrl);
    } else if (option.id === 'whatsapp') {
      window.open(`https://wa.me/?text=${text}%20${url}`, '_blank');
    } else if (option.id === 'twitter') {
      window.open(`https://twitter.com/intent/tweet?text=${twitterText}&url=${url}`, '_blank');
    } else if (option.id === 'instagram') {
      navigator.clipboard.writeText(videoUrl);
      alert('Video URL copied! Open Instagram to share.');
    }
  };

  return (
    <div
      onClick={!isPendingDelete ? onClick : undefined}
      className="bg-white rounded-xl cursor-pointer hover:shadow-md transition-all duration-200 group relative flex flex-col"
      id={`video-card-${project.id}`}
      style={{ cursor: isPendingDelete ? 'default' : 'pointer' }}
    >
      {/* Overlay Border to ensure perfectly smooth rounded corners without clipping dropdowns */}
      <div className="absolute inset-0 rounded-xl border border-gray-200 group-hover:border-gray-300 pointer-events-none z-10 transition-colors duration-200" />

      {/* Thumbnail */}
      <div className="relative aspect-video w-full bg-gray-100 overflow-hidden group/thumb rounded-t-xl">
        {project.thumbnailUrl ? (
          <>
            <img
              src={project.thumbnailUrl}
              alt="thumbnail"
              className="w-full h-full object-cover"
            />
            {project.status === 'COMPLETED' && project.videoUrl && (
              <video
                src={project.videoUrl}
                preload="metadata"
                className="absolute w-0 h-0 opacity-0 pointer-events-none"
                onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
              />
            )}
          </>
        ) : project.status === 'COMPLETED' && project.videoUrl ? (
          <video
            src={project.videoUrl}
            className="w-full h-full object-cover"
            muted
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <IconVideoPlaceholder />
          </div>
        )}

        {project.status === 'FAILED' && (
          <div className="absolute inset-0 bg-red-500/10 flex items-center justify-center">
            <span className="text-red-500 text-xs font-semibold bg-white px-2 py-1 rounded-md">Failed</span>
          </div>
        )}

        {project.status === 'COMPLETED' && (
          <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded font-mono">
            {duration ? `${Math.floor(duration / 60)}:${Math.floor(duration % 60).toString().padStart(2, '0')}` : '—:——'}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-3">
        <p className="text-sm font-semibold text-gray-900 truncate mb-1">{title}</p>
        <p className="text-xs text-gray-400 mb-3">{dateStr}</p>

        <div className="flex items-center justify-between h-8">
          <StatusBadge status={project.status} />

          <div className="flex justify-end relative h-full items-center gap-1.5">
            {project.status === 'FAILED' && !isPendingDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); onRetry(); }}
                className="p-1.5 rounded-md text-amber-600 bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors flex items-center justify-center cursor-pointer"
                title="Retry"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                  <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                  <path d="M16 16h5v5" />
                </svg>
              </button>
            )}

            {isPendingDelete ? (
              <div onClick={(e) => e.stopPropagation()} className="absolute right-0 top-1/2 -translate-y-1/2 origin-right whitespace-nowrap z-10">
                <TimedUndoAction
                  initialSeconds={5}
                  deleteLabel="Deleting..."
                  undoLabel="Cancel"
                  icon={
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                      <path d="M3 7v6h6" />
                      <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
                    </svg>
                  }
                  onConfirm={onConfirmDelete}
                  onUndo={() => setIsPendingDelete(false)}
                  onDismiss={() => setIsPendingDelete(false)}
                />
              </div>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (project.status === 'FAILED') setIsPendingDelete(true);
                  else setShowModal(true);
                }}
                className="p-1.5 rounded-md text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 transition-colors flex items-center justify-center cursor-pointer"
                id={`delete-btn-${project.id}`}
                title="Delete"
              >
                <IconTrashSm />
              </button>
            )}
          </div>
        </div>
      </div>

      {project.status === 'COMPLETED' && project.videoUrl && (
        <div className="absolute top-3 right-3 z-20">
          <ShareSheet
            users={shareOptions}
            onShareComplete={(option) => handleShareComplete(option, project.videoUrl!)}
          />
        </div>
      )}

      {showModal && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={(e) => { e.stopPropagation(); setShowModal(false); }}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 text-center animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
              <IconTrashSm />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Video</h3>
            <p className="text-sm text-gray-500 mb-6 text-balance leading-relaxed">
              Are you sure you want to delete this video? Please note that the credits used for this generation are{' '}
              <span className="font-semibold text-gray-700">non-refundable</span> because the video has already started rendering or is completed.
            </p>
            <div className="flex gap-3 w-full">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold text-sm rounded-xl transition-colors cursor-pointer border border-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowModal(false); setIsPendingDelete(true); }}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold text-sm rounded-xl transition-colors cursor-pointer border border-red-700"
              >
                Proceed
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};
