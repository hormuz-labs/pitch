import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { Project } from '../types';
import { TimedUndoAction } from './TimedUndoAction';

const IconPdfPlaceholder = () => (
  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
    <polyline points="10 9 9 9 8 9"/>
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

const IconDownload = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const StatusBadge = ({ status }: { status: Project['status'] }) => {
  const map: Record<string, { label: string; className: string }> = {
    COMPLETED: { label: 'Ready', className: 'bg-green-50 text-green-700 border border-green-200' },
    FAILED: { label: 'Failed', className: 'bg-red-50 text-red-600 border border-red-200' },
    PROCESSING: { label: 'Generating…', className: 'bg-amber-50 text-amber-600 border border-amber-200' },
    PENDING: { label: 'Queued', className: 'bg-gray-100 text-gray-500 border border-gray-200' },
  };
  const cfg = map[status] ?? { label: status, className: 'bg-gray-100 text-gray-500 border border-gray-200' };
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${cfg.className}`}>
      {(status === 'PROCESSING' || status === 'PENDING') && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse inline-block" />}
      {cfg.label}
    </span>
  );
};

export interface PdfCardProps {
  project: Project;
  onClick: () => void;
  onConfirmDelete: () => void;
}

export const PdfCard = ({ project, onClick, onConfirmDelete }: PdfCardProps) => {
  const [isPendingDelete, setIsPendingDelete] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const dateStr = new Date(project.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const title = project.parameters?.topic || 'Untitled Presentation';
  const slideCount = project.parameters?.slideCount || 0;

  return (
    <div
      onClick={!isPendingDelete ? onClick : undefined}
      className="bg-white rounded-xl cursor-pointer hover:shadow-md transition-all duration-200 group relative flex flex-col h-full"
      id={`pdf-card-${project.id}`}
      style={{ cursor: isPendingDelete ? 'default' : 'pointer' }}
    >
      {/* Overlay Border */}
      <div className="absolute inset-0 rounded-xl border border-gray-200 group-hover:border-gray-300 pointer-events-none z-10 transition-colors duration-200" />

      {/* Thumbnail / PDF Icon Header */}
      <div className="relative aspect-video w-full bg-gray-50 flex flex-col items-center justify-center border-b border-gray-200 rounded-t-xl overflow-hidden">
        {project.status === 'COMPLETED' ? (
          <div className="absolute inset-0 bg-indigo-50/10 flex flex-col items-center justify-center gap-2">
            <div className="p-3 bg-red-50 text-red-600 rounded-xl shadow-sm border border-red-100 transition-transform duration-300 group-hover:scale-110">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
            </div>
            <span className="text-xs font-semibold text-gray-500">{slideCount} Slides PDF</span>
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2">
            <IconPdfPlaceholder />
            {project.status === 'PROCESSING' && (
              <span className="text-[10px] font-semibold text-amber-600 animate-pulse">Building PDF Presentation...</span>
            )}
          </div>
        )}

        {project.status === 'FAILED' && (
          <div className="absolute inset-0 bg-red-500/10 flex items-center justify-center">
            <span className="text-red-500 text-xs font-semibold bg-white px-2 py-1 rounded-md shadow-sm border border-red-200">Failed</span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-3 flex-1 flex flex-col justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900 truncate mb-1" title={title}>{title}</p>
          <p className="text-xs text-gray-400 mb-3">{dateStr}</p>
        </div>

        <div className="flex items-center justify-between h-8 mt-auto">
          <StatusBadge status={project.status} />

          <div className="flex justify-end relative h-full items-center gap-1.5">
            {project.status === 'COMPLETED' && project.pdfUrl && (
              <a
                href={`${project.pdfUrl}?t=${new Date(project.updatedAt).getTime()}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="p-1.5 rounded-md text-gray-700 bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors flex items-center justify-center cursor-pointer"
                title="Download PDF"
              >
                <IconDownload />
              </a>
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
                id={`delete-pdf-btn-${project.id}`}
                title="Delete"
              >
                <IconTrashSm />
              </button>
            )}
          </div>
        </div>
      </div>

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
            <h3 className="text-lg font-bold text-gray-900 mb-2">Delete PDF Presentation</h3>
            <p className="text-sm text-gray-500 mb-6 text-balance leading-relaxed">
              Are you sure you want to delete this presentation? Please note that the credit used for this generation is{' '}
              <span className="font-semibold text-gray-700">non-refundable</span> because it has already started generating or is completed.
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
