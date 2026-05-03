import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

// ── Icons ──────────────────────────────────────────────────────────────────────
const IconArrowLeft = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
  </svg>
);
const IconPlay = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <polygon points="5 3 19 12 5 21 5 3"/>
  </svg>
);
const IconInfo = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
);
const IconLoader = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
  </svg>
);

// ── Label with tooltip ─────────────────────────────────────────────────────────
const FieldLabel = ({ required, label, tooltip }: { required?: boolean; label: string; tooltip?: string }) => (
  <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
    {required && <span className="text-red-500 text-xs">*</span>}
    {label}
    {tooltip && (
      <span className="text-gray-400 cursor-help" title={tooltip}>
        <IconInfo />
      </span>
    )}
  </label>
);

// ── How It Works Step ─────────────────────────────────────────────────────────
const Step = ({ n, title, desc, isLast }: { n: number; title: string; desc: string; isLast?: boolean }) => (
  <div className="flex gap-3">
    <div className="flex flex-col items-center">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
        n === 1 ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 border border-gray-200'
      }`}>
        {n}
      </div>
      {!isLast && <div className="w-px flex-1 bg-gray-200 mt-1" />}
    </div>
    <div className={`pb-5 ${isLast ? '' : ''}`}>
      <p className="text-sm font-semibold text-gray-800 leading-tight">{title}</p>
      <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
    </div>
  </div>
);

// ── Create View ────────────────────────────────────────────────────────────────
interface CreateViewProps {
  isMobile: boolean;
  formValues: Record<string, string>;
  setFormValues: (v: Record<string, string>) => void;
  isSubmitting: boolean;
  onQueueJob: (values: any) => Promise<void>;
}

export const CreateView = ({ isMobile, formValues, setFormValues, isSubmitting, onQueueJob }: CreateViewProps) => {
  const navigate = useNavigate();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const update = (key: string, value: string) => {
    setFormValues({ ...formValues, [key]: value });
    if (errors[key]) setErrors(e => { const n = { ...e }; delete n[key]; return n; });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!formValues.url?.trim()) errs.url = 'Please enter a URL';
    if (!formValues.instructions?.trim()) errs.instructions = 'Please provide instructions';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    onQueueJob({ url: formValues.url, instructions: formValues.instructions, script: formValues.script });
  };

  const inputBase = "w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-colors bg-white";
  const inputError = "border-red-300 focus:ring-red-200 focus:border-red-400";

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto w-full">
      {/* Page heading */}
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-gray-900">Generate AI Demo</h1>
        <p className="text-sm text-gray-500 mt-1">Tell the AI agent what to record, and it will handle the rest.</p>
      </div>

      <div className={`flex gap-6 ${isMobile ? 'flex-col' : 'flex-row items-start'}`}>

        {/* ── Left: Form ──────────────────────────────────────────────────── */}
        <div className="flex-[1.8] min-w-0">
          <form
            onSubmit={handleSubmit}
            className="bg-white border border-gray-200 rounded-xl p-6 space-y-5"
            id="create-video-form"
          >
            {/* Product URL */}
            <div>
              <FieldLabel required label="Product URL" tooltip="The starting point for the AI agent." />
              <input
                id="url-input"
                type="url"
                className={`${inputBase} ${errors.url ? inputError : ''}`}
                placeholder="https://your-app.com/login"
                value={formValues.url || ''}
                onChange={e => update('url', e.target.value)}
              />
              {errors.url && <p className="text-xs text-red-500 mt-1">{errors.url}</p>}
            </div>

            {/* Instructions */}
            <div>
              <FieldLabel required label="What should the AI agent do?" tooltip="Provide step-by-step instructions." />
              <textarea
                id="instructions-input"
                rows={6}
                className={`${inputBase} resize-none ${errors.instructions ? inputError : ''}`}
                placeholder="e.g. Log in with test@example.com, navigate to the billing section, click 'Upgrade to Pro', and show the success banner."
                value={formValues.instructions || ''}
                onChange={e => update('instructions', e.target.value)}
              />
              {errors.instructions && <p className="text-xs text-red-500 mt-1">{errors.instructions}</p>}
            </div>

            {/* Voiceover */}
            <div>
              <FieldLabel label="Voiceover Script (Optional)" tooltip="Leave blank to let the AI generate one automatically." />
              <textarea
                id="voiceover-input"
                rows={4}
                className={`${inputBase} resize-none`}
                placeholder="Start by welcoming the user..."
                value={formValues.script || ''}
                onChange={e => update('script', e.target.value)}
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              id="generate-demo-btn"
              className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed border-none cursor-pointer"
            >
              {isSubmitting ? <IconLoader /> : <IconPlay />}
              {isSubmitting ? 'Queuing…' : 'Generate Demo'}
            </button>
          </form>
        </div>

        {/* ── Right: How it works ─────────────────────────────────────────── */}
        <div className="flex-1 min-w-0" style={{ minWidth: isMobile ? 0 : 240 }}>
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">How it works</p>
            <Step n={1} title="Queue Job" desc="Your request is sent to our worker queue." />
            <Step n={2} title="Agent Navigation" desc="A headless browser opens and follows your instructions." />
            <Step n={3} title="Video Synthesis" desc="Interactions are recorded and stitched together." />
            <Step n={4} title="Voiceover & Polish" desc="AI voiceover is added and aligned with the video." />
            <Step n={5} title="Ready for Edit" desc="Review and tweak the final video in our editor." isLast />
          </div>
        </div>

      </div>
    </div>
  );
};
