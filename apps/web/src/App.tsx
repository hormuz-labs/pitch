import { useState, useRef, useEffect } from 'react';
import { ArrowUp, Plus, Settings2, Link2, X, Image as ImageIcon, Music, FileText, CheckCircle2, Play, AlertCircle, Loader2, Sparkles, LayoutTemplate } from 'lucide-react';
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

    // In a real implementation, we would upload the files via FormData or to a presigned URL first.
    // Since the prompt noted "we will see later how to use this", we pass the names as metadata for now.
    const assetNames = assets.map(a => a.name);

    try {
      await fetch(`${API_BASE}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          parameters: { 
            url, 
            instruction,
            assetNames
          }
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
      <main className="main-content">
        <h1 className="hero-title">Turn your ideas into production-ready video</h1>

        <div className="composer-card">
          <div className="composer-header">
            <div className="target-pill-group">
              <span className="pill-label">Target</span>
              <div className="target-pill">
                <div className="pill-icon-wrapper">
                  <Link2 className="w-4 h-4 text-emerald-600" />
                </div>
                <input 
                  type="url" 
                  className="target-input" 
                  placeholder="https://your-product.com" 
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>
            </div>
            <button className="icon-btn" aria-label="Settings">
              <Settings2 className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          <div className="composer-body">
            <textarea
              className="idea-textarea"
              placeholder="Describe your video idea, specific features to highlight, or the exact flow..."
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
            />
          </div>

          <div className="composer-footer">
            <div className="action-group">
              <input 
                type="file" 
                multiple 
                className="hidden" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept="image/*,audio/*,.pdf"
              />
              <button className="round-btn" onClick={() => fileInputRef.current?.click()} aria-label="Add Asset">
                <Plus className="w-5 h-5" />
              </button>
              <button className="round-btn" aria-label="AI Suggestions">
                <Sparkles className="w-4 h-4" />
              </button>
              <button className="round-btn" aria-label="Templates">
                <LayoutTemplate className="w-4 h-4" />
              </button>

              <div className="assets-list">
                {assets.map((file, idx) => (
                  <div key={idx} className="asset-chip">
                    {getFileIcon(file.type)}
                    <span className="asset-name">{file.name}</span>
                    <button className="asset-remove" onClick={() => removeAsset(idx)}>
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="submit-group">
              <div className="generate-pill">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Generate</span>
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
        </div>

        {jobs.length > 0 && (
          <div className="jobs-container">
            <h3 className="queue-title">Recent Productions</h3>
            <div className="jobs-list">
              {jobs.map((job) => (
                <div key={job.id} className="job-row">
                  <div className="job-row-main">
                    <div className="job-meta">
                      <span className="job-url">{job.parameters.url || 'No URL provided'}</span>
                      {job.parameters.instruction && (
                        <span className="job-instruction">{job.parameters.instruction}</span>
                      )}
                    </div>
                  </div>
                  
                  <div className="job-row-status">
                    {job.status === 'COMPLETED' && job.videoUrl ? (
                      <a href={job.videoUrl} target="_blank" rel="noreferrer" className="action-link">
                        <Play className="w-4 h-4" /> Watch
                      </a>
                    ) : (
                      <StatusBadge status={job.status} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function StatusBadge({ status }: { status: JobStatus }) {
  const styles = {
    PENDING: "text-gray-500 bg-gray-100",
    PROCESSING: "text-blue-600 bg-blue-50 border-blue-200",
    COMPLETED: "text-emerald-600 bg-emerald-50 border-emerald-200",
    FAILED: "text-rose-600 bg-rose-50 border-rose-200",
  };

  const Icons = {
    PENDING: Loader2,
    PROCESSING: Loader2,
    COMPLETED: CheckCircle2,
    FAILED: AlertCircle,
  };

  const Icon = Icons[status];

  return (
    <div className={cn("inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border border-transparent", styles[status])}>
      <Icon className={cn("w-3.5 h-3.5", (status === 'PENDING' || status === 'PROCESSING') && "animate-spin")} />
      {status}
    </div>
  );
}

export default App;
