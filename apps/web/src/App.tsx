import { useEffect, useState, useRef } from 'react';
import { Play, Loader2, CheckCircle, XCircle, FileVideo, Terminal, Trash2 } from 'lucide-react';

interface Job {
  id: string;
  userId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  videoUrl?: string;
  parameters: {
    prompt: string;
    [key: string]: any;
  };
  createdAt: string;
}

interface LogEvent {
  jobId: string;
  type: string;
  event: any;
}

interface LogLine {
  type: 'PTY' | 'AI' | 'RUN' | 'EDIT' | 'ERROR' | 'SYSTEM';
  content: string;
  id?: string;
}

export default function App() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [logs, setLogs] = useState<Record<string, LogLine[]>>({});
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const fetchJobs = async () => {
    try {
      const res = await fetch('http://localhost:3000/jobs');
      const data = await res.json();
      setJobs(data);
    } catch (e) {
      console.error('Failed to fetch jobs', e);
    }
  };

  useEffect(() => {
    fetchJobs();

    const evtSource = new EventSource('http://localhost:3000/jobs/stream');
    
    evtSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'LOG') {
        const logEvt = data as LogEvent;
        const msg = formatLogEvent(logEvt.event);
        if (msg) {
          setLogs(prev => {
            const currentLogs = prev[logEvt.jobId] || [];
            if (msg.id) {
              const lastIdx = currentLogs.findLastIndex(l => l.id === msg.id);
              if (lastIdx !== -1) {
                const nextLogs = [...currentLogs];
                nextLogs[lastIdx] = msg;
                return { ...prev, [logEvt.jobId]: nextLogs };
              }
            }
            return {
              ...prev,
              [logEvt.jobId]: [...currentLogs, msg]
            };
          });
        }
      } else if (data.id && data.status) {
        // It's a job update
        setJobs(prev => {
          const exists = prev.find(j => j.id === data.id);
          if (exists) {
            return prev.map(j => j.id === data.id ? { ...j, ...data } : j);
          }
          return [data, ...prev];
        });
      }
    };

    return () => evtSource.close();
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const formatLogEvent = (event: any): LogLine | null => {
    if (!event || !event.type) return null;

    switch (event.type) {
      case 'pty.updated':
        return { type: 'PTY', content: event.properties?.output || '' };

      case 'message.updated': {
        const info = event.properties?.message || event.properties?.info;
        const parts = info?.parts;
        if (!parts) return null;
        const textPart = parts.find((p: any) => p.type === 'text');
        return textPart?.text ? { type: 'AI', content: `[AI]: ${textPart.text}`, id: info.id } : null;
      }

      case 'command.executed':
        return { type: 'RUN', content: `[Run]: ${event.properties?.name} ${event.properties?.arguments || ''}` };

      case 'file.edited':
        return { type: 'EDIT', content: `[Edit]: ${event.properties?.file}` };

      case 'session.error':
        return { type: 'ERROR', content: `[Error]: ${event.properties?.message || 'Unknown error'}` };

      case 'pty.exited':
        return { type: 'SYSTEM', content: `[System]: Process exited with code ${event.properties?.exitCode}` };

      default:
        // Suppress "status" events like session.updated, event.created, etc.
        // unless they are explicitly useful.
        if (event.type.endsWith('.updated') || event.type.endsWith('.created') || event.type.endsWith('.status')) {
          return null;
        }
        return { type: 'SYSTEM', content: `[System]: ${event.type}` };
    }
  };

  const submitJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    
    setLoading(true);
    try {
      await fetch('http://localhost:3000/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'user-demo',
          parameters: { prompt }
        })
      });
      setPrompt('');
    } catch (e) {
      console.error('Failed to submit job', e);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'COMPLETED': return <CheckCircle className="w-5 h-5 text-emerald-500" />;
      case 'FAILED': return <XCircle className="w-5 h-5 text-red-500" />;
      case 'PROCESSING': return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      default: return <Loader2 className="w-5 h-5 text-zinc-500" />;
    }
  };

  const deleteJob = async (id: string) => {
    try {
      await fetch(`http://localhost:3000/jobs/${id}`, { method: 'DELETE' });
      setJobs(prev => prev.filter(j => j.id !== id));
      setLogs(prev => {
        const nextLogs = { ...prev };
        delete nextLogs[id];
        return nextLogs;
      });
    } catch (e) {
      console.error('Failed to delete job', e);
    }
  };

  return (
    <div className="min-h-screen max-w-5xl mx-auto p-6 flex flex-col gap-8">
      <header className="border-b border-zinc-800 pb-6">
        <h1 className="text-3xl font-bold tracking-tight">Video Generator</h1>
        <p className="text-zinc-400 mt-2">Autonomous demo generation powered by OpenCode</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        <div className="lg:col-span-1 flex flex-col gap-6">
          <form onSubmit={submitJob} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">Instructions</label>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="Make a demo video showing how to use standard notes..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-sm focus:ring-1 focus:ring-zinc-600 outline-none h-32 resize-none"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !prompt.trim()}
              className="flex items-center justify-center gap-2 bg-white text-black font-semibold rounded-lg px-4 py-2.5 hover:bg-zinc-200 transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Dispatch Job
            </button>
          </form>

          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Recent Jobs</h2>
            {jobs.map(job => (
              <div key={job.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-zinc-500">{job.id}</span>
                  <div className="flex items-center gap-2.5">
                    {getStatusIcon(job.status)}
                    <button 
                      onClick={() => deleteJob(job.id)} 
                      className="text-zinc-600 hover:text-red-400 transition-colors bg-zinc-800/50 hover:bg-zinc-800 p-1.5 rounded"
                      title="Delete Job"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <p className="text-sm line-clamp-2 text-zinc-300">{job.parameters.prompt}</p>
                {job.videoUrl && (
                  <a href={job.videoUrl} target="_blank" rel="noreferrer" className="text-xs flex items-center gap-1.5 text-blue-400 hover:text-blue-300 mt-2 bg-blue-500/10 w-max px-2.5 py-1.5 rounded-md">
                    <FileVideo className="w-3.5 h-3.5" />
                    View Output
                  </a>
                )}
              </div>
            ))}
            {jobs.length === 0 && <p className="text-sm text-zinc-500 italic">No jobs found.</p>}
          </div>
        </div>

        <div className="lg:col-span-2 bg-[#0a0a0a] border border-zinc-800 rounded-xl overflow-hidden h-[800px] flex flex-col shadow-2xl">
          <div className="bg-zinc-900/50 border-b border-zinc-800 p-3 flex items-center gap-2">
            <Terminal className="w-4 h-4 text-zinc-400" />
            <span className="text-xs font-medium text-zinc-300 font-mono">Live Logs</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed text-zinc-400 flex flex-col gap-1.5">
            {jobs.filter(j => ['PROCESSING', 'COMPLETED', 'FAILED'].includes(j.status)).slice(0,1).map(activeJob => (
              <div key={activeJob.id} className="flex flex-col gap-1.5">
                <div className="text-blue-400 mb-2">Attached to session for job {activeJob.id}...</div>
                {logs[activeJob.id]?.map((log, i) => {
                  if (log.type === 'PTY') {
                    return <span key={i} className="text-zinc-300 whitespace-pre-wrap">{log.content}</span>;
                  }
                  
                  let colorClass = 'text-zinc-500';
                  if (log.type === 'AI') colorClass = 'text-emerald-400';
                  if (log.type === 'RUN') colorClass = 'text-blue-400';
                  if (log.type === 'EDIT') colorClass = 'text-amber-400';
                  if (log.type === 'ERROR') colorClass = 'text-red-400';
                  if (log.type === 'SYSTEM') colorClass = 'text-zinc-600';

                  return (
                    <div key={i} className={`mt-1 ${colorClass}`}>
                      {log.content}
                    </div>
                  );
                })}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
