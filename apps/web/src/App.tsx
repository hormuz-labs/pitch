import { useState, useRef, useEffect } from 'react';
import { ArrowUp, Plus, Settings2, Link2, X, Image as ImageIcon, Music, FileText, Play, AlertCircle, Loader2, Sparkles, MessageSquare, User, PanelLeft, ExternalLink } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import './App.css';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type JobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

interface Job {
  id: string;
  userId: string;
  status: JobStatus;
  videoUrl?: string;
  parameters: {
    url: string;
    instruction?: string;
    assetNames?: string[];
    [key: string]: any;
  };
  createdAt: string;
  updatedAt: string;
}

function App() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [url, setUrl] = useState('');
  const [instruction, setInstruction] = useState('');
  const [assets, setAssets] = useState<File[]>([]);
  const [userId] = useState('user_' + Math.random().toString(36).substring(7));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const API_BASE = 'http://localhost:3000';

  useEffect(() => {
    fetchJobs();
    const eventSource = new EventSource(`${API_BASE}/jobs/stream`);
    eventSource.onmessage = (event) => {
      const updatedJob = JSON.parse(event.data);
      setJobs(prev => {
        const index = prev.findIndex(j => j.id === updatedJob.id);
        if (index === -1) return [updatedJob, ...prev];
        const newJobs = [...prev];
        newJobs[index] = updatedJob;
        return newJobs;
      });
    };
    return () => eventSource.close();
  }, []);

  const fetchJobs = async () => {
    try {
      const res = await fetch(`${API_BASE}/jobs`);
      const data = await res.json();
      setJobs(data);
    } catch (err) {
      console.error('Failed to fetch jobs:', err);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setAssets(prev => [...prev, ...newFiles]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAsset = (index: number) => {
    setAssets(prev => prev.filter((_, i) => i !== index));
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return <ImageIcon className="w-3.5 h-3.5" />;
    if (type.startsWith('audio/')) return <Music className="w-3.5 h-3.5" />;
    return <FileText className="w-3.5 h-3.5" />;
  };

  const handleSubmit = async () => {
    if (!url && !instruction) return;
    setIsSubmitting(true);
    const assetNames = assets.map(a => a.name);

    try {
      await fetch(`${API_BASE}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          parameters: { url, instruction, assetNames }
        }),
      });
      setUrl('');
      setInstruction('');
      setAssets([]);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className={cn("sidebar", !sidebarOpen && "sidebar-closed")}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <Sparkles className="w-5 h-5 text-sky-500" />
            <span className="font-bold">VideoGen</span>
          </div>
          <button className="icon-btn sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
             <PanelLeft className="w-5 h-5" />
          </button>
        </div>

        <nav className="sidebar-nav">
          <button className="new-chat-btn" onClick={() => { setUrl(''); setInstruction(''); }}>
            <Plus className="w-4 h-4" />
            <span>New Video</span>
          </button>

          <div className="sidebar-section">
            <h4 className="sidebar-label">History</h4>
            <div className="history-list">
              {jobs.slice(0, 10).map(job => (
                <div key={job.id} className="history-item">
                  <MessageSquare className="w-4 h-4 shrink-0" />
                  <span className="truncate">{job.parameters.instruction || job.parameters.url || 'Untitled Video'}</span>
                </div>
              ))}
              {jobs.length === 0 && <span className="empty-history">No history yet</span>}
            </div>
          </div>
        </nav>

        <div className="sidebar-footer">
           <div className="user-profile">
              <div className="avatar">{userId[5].toUpperCase()}</div>
              <div className="user-info truncate">
                <span className="user-name">{userId}</span>
                <span className="user-plan">Free Plan</span>
              </div>
              <Settings2 className="w-4 h-4 text-slate-400" />
           </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <div className="top-bar">
          {!sidebarOpen && (
            <button className="icon-btn" onClick={() => setSidebarOpen(true)}>
              <PanelLeft className="w-5 h-5" />
            </button>
          )}
          <div className="flex-1" />
          <button className="icon-btn">
             <Settings2 className="w-5 h-5" />
          </button>
        </div>

        <div className="content-inner">
          <div className={cn("scroll-view", jobs.length === 0 && "center-view")}>
            {jobs.length === 0 ? (
              <div className="welcome-hero">
                <div className="welcome-badge">
                   <Sparkles className="w-4 h-4" />
                   <span>AI Video Engine</span>
                </div>
                <h1 className="hero-title">What demo would you like to create?</h1>
              </div>
            ) : (
              <div className="feed-container">
                {jobs.map((job) => (
                  <div key={job.id} className="feed-card">
                    <div className="feed-card-header">
                       <div className="user-request-badge">
                          <User className="w-3.5 h-3.5" />
                          <span>Request</span>
                       </div>
                       <StatusBadge status={job.status} />
                    </div>
                    
                    <div className="feed-card-content">
                      <div className="params-stack">
                        {job.parameters.url && (
                          <div className="param-url">
                            <Link2 className="w-4 h-4 text-sky-500" />
                            <a href={job.parameters.url} target="_blank" rel="noreferrer" className="hover:underline">
                              {job.parameters.url}
                            </a>
                          </div>
                        )}
                        {job.parameters.instruction && (
                          <p className="param-instruction">{job.parameters.instruction}</p>
                        )}
                      </div>

                      <div className="video-section">
                        {job.status === 'COMPLETED' && job.videoUrl ? (
                          <div className="video-player-container">
                             <video src={job.videoUrl} controls className="video-player" />
                             <div className="video-actions">
                                <button className="action-pill"><Play className="w-3.5 h-3.5" /> Replay</button>
                                <a href={job.videoUrl} target="_blank" rel="noreferrer" className="action-pill">
                                   <ExternalLink className="w-3.5 h-3.5" /> Open
                                </a>
                             </div>
                          </div>
                        ) : (
                          <div className="loading-stage">
                            {job.status === 'FAILED' ? (
                              <div className="status-box failed">
                                <AlertCircle className="w-8 h-8" />
                                <span>Failed to generate cinematic video</span>
                              </div>
                            ) : (
                              <div className="status-box">
                                <Loader2 className="w-8 h-8 animate-spin" />
                                <span>{job.status === 'PENDING' ? 'Enqueued in pipeline...' : 'Capturing & narrating walkthrough...'}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Fixed Composer at bottom */}
          <div className="composer-container">
            <div className="composer-card">
              <div className="composer-header">
                <div className="target-pill">
                  <Link2 className="w-3.5 h-3.5 text-sky-500" />
                  <input 
                    type="url" 
                    placeholder="Enter target URL..." 
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                  />
                </div>
              </div>
              
              <div className="composer-body">
                <textarea
                  className="idea-textarea"
                  placeholder="Describe your video idea, or specific features to highlight..."
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                />
              </div>

              <div className="composer-footer">
                <div className="action-group">
                  <input type="file" multiple className="hidden" ref={fileInputRef} onChange={handleFileChange} accept="image/*,audio/*,.pdf" />
                  <button className="round-btn" onClick={() => fileInputRef.current?.click()}><Plus className="w-5 h-5" /></button>
                  <button className="round-btn"><Sparkles className="w-4 h-4" /></button>
                  
                  <div className="assets-preview">
                    {assets.map((file, idx) => (
                      <div key={idx} className="asset-chip">
                        {getFileIcon(file.type)}
                        <span className="asset-name">{file.name}</span>
                        <X className="w-3 h-3 cursor-pointer" onClick={() => removeAsset(idx)} />
                      </div>
                    ))}
                  </div>
                </div>

                <button 
                  className="submit-btn" 
                  disabled={isSubmitting || (!url && !instruction)}
                  onClick={handleSubmit}
                >
                  {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowUp className="w-5 h-5" />}
                </button>
              </div>
            </div>
            <p className="legal-notice">AI-generated videos may require refinement. Review before publishing.</p>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatusBadge({ status }: { status: JobStatus }) {
  const styles = {
    PENDING: "text-slate-500 bg-slate-100",
    PROCESSING: "text-sky-600 bg-sky-50",
    COMPLETED: "text-emerald-600 bg-emerald-50",
    FAILED: "text-rose-600 bg-rose-50",
  };
  return (
    <div className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider", styles[status])}>
      {status}
    </div>
  );
}

export default App;
