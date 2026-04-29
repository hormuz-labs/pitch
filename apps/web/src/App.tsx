import { useState, useEffect } from 'react';
import { Play, Plus, Clock, CheckCircle2, AlertCircle, Video, Link as LinkIcon, User } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import './App.css';

// Utility for tailwind-like class merging
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
    [key: string]: any;
  };
  createdAt: string;
  updatedAt: string;
}

function App() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [url, setUrl] = useState('');
  const [userId, setUserId] = useState('user_' + Math.random().toString(36).substring(7));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const API_BASE = 'http://localhost:3000';

  useEffect(() => {
    fetchJobs();
    
    // Setup SSE for real-time updates
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          parameters: { url }
        }),
      });

      if (!res.ok) throw new Error('Failed to create job');
      
      setUrl('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-content">
          <div className="logo-group">
            <Video className="logo-icon" />
            <h1>VideoGen<span>SaaS</span></h1>
          </div>
          <div className="user-badge">
            <User className="w-4 h-4" />
            <span>{userId}</span>
          </div>
        </div>
      </header>

      <main className="app-main">
        <section className="creation-section">
          <div className="card creation-card">
            <h2>Create New Demo</h2>
            <p>Enter a URL to generate an autonomous cinematic walkthrough.</p>
            
            <form onSubmit={handleSubmit} className="url-form">
              <div className="input-group">
                <LinkIcon className="input-icon" />
                <input 
                  type="url" 
                  placeholder="https://example.com" 
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                />
              </div>
              <button type="submit" disabled={isSubmitting || !url}>
                {isSubmitting ? 'Processing...' : (
                  <>
                    <Plus className="w-5 h-5" />
                    <span>Generate Video</span>
                  </>
                )}
              </button>
            </form>
            {error && <div className="error-msg"><AlertCircle className="w-4 h-4" /> {error}</div>}
          </div>
        </section>

        <section className="jobs-section">
          <div className="section-header">
            <h2>Production Queue</h2>
            <span className="job-count">{jobs.length} total</span>
          </div>

          <div className="jobs-grid">
            {jobs.length === 0 ? (
              <div className="empty-state">
                <Clock className="w-12 h-12 opacity-20" />
                <p>No videos in production yet.</p>
              </div>
            ) : (
              jobs.map((job) => (
                <div key={job.id} className="card job-card">
                  <div className="job-header">
                    <div className="job-info">
                      <span className="job-id">#{job.id.slice(-6)}</span>
                      <span className="job-url">{job.parameters.url}</span>
                    </div>
                    <StatusBadge status={job.status} />
                  </div>
                  
                  <div className="job-body">
                    {job.status === 'COMPLETED' && job.videoUrl ? (
                      <a href={job.videoUrl} target="_blank" rel="noreferrer" className="preview-link">
                        <div className="video-placeholder">
                          <Play className="w-8 h-8 text-white" />
                        </div>
                        <span>Watch Demo</span>
                      </a>
                    ) : (
                      <div className={cn("status-display", job.status.toLowerCase())}>
                        {job.status === 'PROCESSING' ? (
                          <div className="spinner-group">
                            <div className="spinner"></div>
                            <span>Recording in progress...</span>
                          </div>
                        ) : job.status === 'FAILED' ? (
                          <div className="failure-group">
                            <AlertCircle className="w-6 h-6" />
                            <span>Generation failed</span>
                          </div>
                        ) : (
                          <div className="pending-group">
                            <Clock className="w-6 h-6" />
                            <span>Waiting in queue</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  
                  <div className="job-footer">
                    <span className="timestamp">{new Date(job.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function StatusBadge({ status }: { status: JobStatus }) {
  const styles = {
    PENDING: "bg-blue-100 text-blue-700",
    PROCESSING: "bg-amber-100 text-amber-700",
    COMPLETED: "bg-emerald-100 text-emerald-700",
    FAILED: "bg-rose-100 text-rose-700",
  };

  const Icons = {
    PENDING: Clock,
    PROCESSING: Play,
    COMPLETED: CheckCircle2,
    FAILED: AlertCircle,
  };

  const Icon = Icons[status];

  return (
    <div className={cn("status-badge", styles[status])}>
      <Icon className="w-3.5 h-3.5" />
      <span>{status}</span>
    </div>
  );
}

export default App;
