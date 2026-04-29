import { useState, useRef, useEffect } from 'react';
import { ArrowUp, Plus, Settings2, Link2, X, Image as ImageIcon, Music, FileText, CheckCircle2, AlertCircle, Loader2, Sparkles, LayoutTemplate } from 'lucide-react';
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
                  <Link2 className="w-4 h-4 text-sky-500" />
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
              <Settings2 className="w-5 h-5" />
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
                <Sparkles className="w-4 h-4" />
                <span>Generate</span>
              </div>
              <button 
                className="submit-btn" 
                disabled={isSubmitting || (!url && !instruction)}
                onClick={handleSubmit}
              >
                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin text-white" /> : <ArrowUp className="w-5 h-5 text-white" />}
              </button>
            </div>
          </div>
        </div>

        {jobs.length > 0 && (
          <div className="jobs-container">
            {jobs.map((job) => (
              <div key={job.id} className="generated-video-card">
                <div className="job-header">
                  <div className="job-meta">
                    <span className="job-url">
                      <Link2 className="w-4 h-4" />
                      {job.parameters.url || 'No URL provided'}
                    </span>
                    {job.parameters.instruction && (
                      <p className="job-instruction">{job.parameters.instruction}</p>
                    )}
                  </div>
                  <div className="job-status">
                    <StatusBadge status={job.status} />
                  </div>
                </div>
                
                <div className="job-content">
                  {job.status === 'COMPLETED' && job.videoUrl ? (
                    <div className="video-wrapper">
                      <video 
                        src={job.videoUrl} 
                        controls 
                        className="video-player"
                        preload="metadata"
                      />
                    </div>
                  ) : (
                    <div className="processing-state">
                      {job.status === 'FAILED' ? (
                        <div className="flex flex-col items-center gap-3 text-rose-500">
                           <AlertCircle className="w-8 h-8" />
                           <span className="font-medium">Failed to generate video</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-4 text-sky-500">
                           <Loader2 className="w-8 h-8 animate-spin" />
                           <span className="font-medium text-slate-500">
                             {job.status === 'PENDING' ? 'Waiting in queue...' : 'Orchestrating cinematic video...'}
                           </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function StatusBadge({ status }: { status: JobStatus }) {
  const styles = {
    PENDING: "text-slate-500 bg-slate-100 border-slate-200",
    PROCESSING: "text-sky-600 bg-sky-50 border-sky-200",
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
    <div className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border", styles[status])}>
      <Icon className={cn("w-3.5 h-3.5", (status === 'PENDING' || status === 'PROCESSING') && "animate-spin")} />
      {status}
    </div>
  );
}

export default App;
