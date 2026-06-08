import { useMemo, useState } from 'react'; // useState kept for sortOrder
import { useNavigate } from 'react-router-dom';
import type { Project } from '../types';
import { VideoCard } from '../components/VideoCard';

// ── Icons ──────────────────────────────────────────────────────────────────────
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

// ── Dashboard View ─────────────────────────────────────────────────────────────
interface DashboardViewProps {
  projects: Project[];
  searchQuery: string;
  onDelete: (id: string) => void;
  onRetry: (id: string) => void;
}

export const DashboardView = ({ projects, searchQuery, onDelete, onRetry }: DashboardViewProps) => {
  const navigate = useNavigate();
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  const displayedProjects = useMemo(() => {
    let list = [...projects];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p =>
        (p.parameters?.url || '').toLowerCase().includes(q) ||
        (p.parameters?.instructions || '').toLowerCase().includes(q) ||
        p.status.toLowerCase().includes(q)
      );
    }

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

      {/* Empty state */}
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
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {displayedProjects.map(project => (
            <VideoCard
              key={project.id}
              project={project}
              onClick={() => navigate(`/editor/${project.id}`)}
              onConfirmDelete={() => onDelete(project.id)}
              onRetry={() => onRetry(project.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};
