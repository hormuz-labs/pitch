import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Project } from '../types';

// ── Icons ──────────────────────────────────────────────────────────────────────
const IconVideoPlaceholder = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-300">
    <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
    <line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/>
    <line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/>
    <line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/>
    <line x1="17" y1="7" x2="22" y2="7"/>
  </svg>
);
const IconFilter = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="12" y1="18" x2="12" y2="18" strokeWidth="3"/>
  </svg>
);
const IconSort = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="9" y2="18"/>
  </svg>
);
const IconMoreH = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>
  </svg>
);
const IconTrash = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6"/><path d="M14 11v6"/>
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>
);
const IconEmptyVideo = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-300">
    <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
  </svg>
);
const IconPlus = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);
const IconChevronUp = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="18 15 12 9 6 15"/>
  </svg>
);
const IconChevronDown = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);

// ── Status Badge ───────────────────────────────────────────────────────────────
const StatusBadge = ({ status }: { status: Project['status'] }) => {
  const map: Record<string, { label: string; className: string }> = {
    COMPLETED:  { label: 'Ready',       className: 'bg-green-50 text-green-700 border border-green-200' },
    FAILED:     { label: 'Failed',      className: 'bg-red-50 text-red-600 border border-red-200' },
    PROCESSING: { label: 'Rendering…',  className: 'bg-amber-50 text-amber-600 border border-amber-200' },
    PENDING:    { label: 'Draft',       className: 'bg-gray-100 text-gray-500 border border-gray-200' },
  };
  const cfg = map[status] ?? { label: status, className: 'bg-gray-100 text-gray-500 border border-gray-200' };
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${cfg.className}`}>
      {status === 'PROCESSING' && (
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse inline-block" />
      )}
      {cfg.label}
    </span>
  );
};

const Avatar = ({ initials, color = 'bg-gray-400' }: { initials: string; color?: string }) => (
  <div className={`w-6 h-6 rounded-full ${color} flex items-center justify-center text-white text-xs font-semibold`}>
    {initials}
  </div>
);

// ── Video Card ─────────────────────────────────────────────────────────────────
interface VideoCardProps {
  project: Project;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
}
const VideoCard = ({ project, onClick, onDelete }: VideoCardProps) => {
  const dateStr = new Date(project.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const title = project.parameters?.url
    ? project.parameters.url.replace(/^https?:\/\//, '').split('/')[0]
    : 'Untitled Job';

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl border border-gray-200 overflow-hidden cursor-pointer hover:shadow-md hover:border-gray-300 transition-all duration-200 group"
      id={`video-card-${project.id}`}
    >
      {/* Thumbnail */}
      <div className="relative h-40 bg-gray-100 overflow-hidden">
        {project.status === 'COMPLETED' && project.videoUrl ? (
          <video src={project.videoUrl} className="w-full h-full object-cover" muted />
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
        <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded font-mono">
          {project.status === 'COMPLETED' ? '—:——' : '…'}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(e); }}
          className="absolute top-2 right-2 p-1.5 bg-white rounded-md border border-gray-200 text-gray-400 hover:bg-red-50 hover:border-red-200 hover:text-red-500 shadow-sm transition-colors"
          id={`delete-btn-${project.id}`}
          title="Delete"
        >
          <IconTrash />
        </button>
      </div>

      {/* Body */}
      <div className="p-3">
        <p className="text-sm font-semibold text-gray-900 truncate mb-1">{title}</p>
        <p className="text-xs text-gray-400 mb-3">{dateStr}</p>
        <div className="flex items-center justify-between">
          <StatusBadge status={project.status} />
          <Avatar initials="U" color="bg-gray-400" />
        </div>
      </div>
    </div>
  );
};

// ── Confirm Delete Modal ───────────────────────────────────────────────────────
const ConfirmDeleteModal = ({ onConfirm, onCancel }: { onConfirm: () => void, onCancel: () => void }) => (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
      <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Video?</h3>
      <p className="text-sm text-gray-500 mb-6">Are you sure you want to delete this video? This action cannot be undone.</p>
      <div className="flex gap-3 justify-end">
        <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors border-none cursor-pointer">Cancel</button>
        <button onClick={onConfirm} className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors border-none cursor-pointer">Delete</button>
      </div>
    </div>
  </div>
);

// ── Dashboard View ─────────────────────────────────────────────────────────────
interface DashboardViewProps {
  projects: Project[];
  searchQuery: string;
  isMobile: boolean;
  onDelete: (id: string) => void;
}

export const DashboardView = ({ projects, searchQuery, isMobile, onDelete }: DashboardViewProps) => {
  const navigate = useNavigate();
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const displayedProjects = useMemo(() => {
    let list = [...projects];

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p =>
        (p.parameters?.url || '').toLowerCase().includes(q) ||
        (p.parameters?.instructions || '').toLowerCase().includes(q) ||
        p.status.toLowerCase().includes(q)
      );
    }

    // Sort
    list.sort((a, b) => {
      const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return sortOrder === 'newest' ? -diff : diff;
    });

    return list;
  }, [projects, searchQuery, sortOrder]);

  const toggleSort = () => setSortOrder(o => o === 'newest' ? 'oldest' : 'newest');

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto w-full">
      {/* Page header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 leading-tight">Recent Videos</h1>
          <p className="text-sm text-gray-500 mt-1">Manage and organize your generated content.</p>
        </div>
        {/* Filter / Sort */}
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
            id="filter-btn"
          >
            <IconFilter /> Filter
          </button>
          <button
            onClick={toggleSort}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
            id="sort-btn"
          >
            <IconSort />
            Sort: {sortOrder === 'newest' ? 'Newest' : 'Oldest'}
            <span className="ml-0.5 text-gray-400">
              {sortOrder === 'newest' ? <IconChevronDown /> : <IconChevronUp />}
            </span>
          </button>
        </div>
      </div>

      {/* No search results */}
      {searchQuery && displayedProjects.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-14 h-14 bg-gray-100 rounded-xl flex items-center justify-center mb-4">
            <IconEmptyVideo />
          </div>
          <h3 className="text-sm font-semibold text-gray-700 mb-1">No results found</h3>
          <p className="text-xs text-gray-400 max-w-xs">No videos match "<span className="font-medium">{searchQuery}</span>". Try a different search.</p>
        </div>
      )}

      {/* Empty state (no projects at all) */}
      {!searchQuery && projects.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-14 h-14 bg-gray-100 rounded-xl flex items-center justify-center mb-4">
            <IconEmptyVideo />
          </div>
          <h3 className="text-sm font-semibold text-gray-700 mb-1">No videos yet</h3>
          <p className="text-xs text-gray-400 mb-5 max-w-xs">Create your first AI demo video and it will appear here.</p>
          <button
            onClick={() => navigate('/new')}
            className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors border-none cursor-pointer"
            id="empty-create-btn"
          >
            <IconPlus /> Create New Video
          </button>
        </div>
      )}

      {/* Card grid */}
      {displayedProjects.length > 0 && (
        <div className={`grid gap-4 ${
          isMobile ? 'grid-cols-1' : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
        }`}>
          {displayedProjects.map(project => (
            <VideoCard
              key={project.id}
              project={project}
              onClick={() => navigate(`/editor/${project.id}`)}
              onDelete={(e) => { e.stopPropagation(); setDeleteTargetId(project.id); }}
            />
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTargetId && (
        <ConfirmDeleteModal
          onConfirm={() => {
            onDelete(deleteTargetId);
            setDeleteTargetId(null);
          }}
          onCancel={() => setDeleteTargetId(null)}
        />
      )}
    </div>
  );
};
