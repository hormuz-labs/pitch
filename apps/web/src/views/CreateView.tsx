import { useState } from 'react';

import { Switch } from '../components/Switch';
import { ThemeSwitch } from '../components/ThemeSwitch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/Select';
import { WaveformScrub } from '../components/WaveformScrub';
import { ContainerTextFlip } from '../components/ContainerTextFlip';
import { PlaceholdersAndVanishInput } from '../components/PlaceholdersAndVanishInput';


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

const AI_AGENT_PROMPTS = [
  "Go to flipkart.com, search for 'iPhone 15', click the first result, and highlight the key specs for a product review.",
  "Navigate to dodopayments.com, click 'Docs', search for 'Payment Intents', and summarize the integration steps.",
  "Open our startup's landing page, click 'Get Started', fill the signup form, and walk through the onboarding dashboard.",
  "Go to github.com, search for 'React', navigate to 'Issues', and show how to filter for 'good first issues'.",
  "Visit the company intranet, click 'HR Portal', navigate to 'Leave Requests', and submit a time-off application."
];

// ── Create View ────────────────────────────────────────────────────────────────
interface CreateViewProps {
  isMobile: boolean;
  formValues: Record<string, string>;
  setFormValues: (v: Record<string, string>) => void;
  isSubmitting: boolean;
  onQueueJob: (values: any) => Promise<void>;
}

export const CreateView = ({ formValues, setFormValues, isSubmitting, onQueueJob }: CreateViewProps) => {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showAudioPreview, setShowAudioPreview] = useState(false);

  const update = (key: string, value: string) => {
    setFormValues({ ...formValues, [key]: value });
    if (key === 'audio') setShowAudioPreview(true);
    if (errors[key]) setErrors(e => { const n = { ...e }; delete n[key]; return n; });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const url = formValues.url?.trim();
    
    if (!url) {
      errs.url = 'Please enter a URL';
    } else {
      try {
        // First check if it's a validly formatted URL
        new URL(url);
      } catch {
        errs.url = 'Please enter a valid URL (e.g. https://example.com)';
      }
    }

    if (!formValues.instructions?.trim()) errs.instructions = 'Please provide instructions';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    onQueueJob({ 
      url: formValues.url, 
      subtitles: formValues.subtitles === 'true', 
      theme: formValues.theme || 'light', 
      audio: formValues.audio ? formValues.audio.replace('.mp3', '') : '',
      instructions: formValues.subtitles === 'true' 
        ? `${formValues.instructions} (Please ensure subtitles are included in the final video)` 
        : formValues.instructions, 
      script: formValues.script 
    });
  };

  const inputBase = "w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-colors bg-white";
  const inputError = "border-red-300 focus:ring-red-200 focus:border-red-400";

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto w-full">
      {/* Page heading */}
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center flex-wrap gap-1">
          <span>Generate</span>
          <ContainerTextFlip
            words={["cinematic", "stunning", "polished", "engaging", "premium"]}
            interval={2500}
          />
          <span>demos</span>
        </h1>
        <p className="text-sm text-gray-500 mt-1.5">Tell the AI agent what to record, and it will craft a production-ready walkthrough.</p>
      </div>

      <div className="w-full">

        {/* ── Form ──────────────────────────────────────────────────────── */}
        <div className="min-w-0">
          <form
            onSubmit={handleSubmit}
            className="bg-white border border-gray-200 rounded-xl p-6 space-y-5 shadow-sm"
            id="create-video-form"
          >
            <div className="grid md:grid-cols-2 gap-6">
              {/* Product URL */}
              <div>
                <FieldLabel required label="Product URL" tooltip="The starting point for the AI agent." />
                <input
                  id="url-input"
                  type="url"
                  className={`${inputBase} ${errors.url ? inputError : ''}`}
                  placeholder="https://trypitch.co"
                  value={formValues.url || ''}
                  onChange={e => update('url', e.target.value)}
                />
                {errors.url && <p className="text-xs text-red-500 mt-1">{errors.url}</p>}
              </div>

              {/* Audio Track */}
              <div>
                <FieldLabel label="Background Audio" tooltip="Select an AI generated voice or background track." />
                <Select 
                  value={formValues.audio || ''} 
                  onValueChange={(val) => update('audio', val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an audio track" />
                  </SelectTrigger>
                  <SelectContent>
                    <div className="px-2 py-1.5 text-xs font-semibold text-gray-400">Gemini Native Voices</div>
                    <SelectItem value="Orus.mp3">Orus (Deep, professional)</SelectItem>
                    <SelectItem value="Charon.mp3">Charon (Clear, conversational)</SelectItem>
                    <SelectItem value="Fenrir.mp3">Fenrir (Dynamic, excitable)</SelectItem>
                    <SelectItem value="Puck.mp3">Puck (Upbeat, energetic)</SelectItem>
                    <SelectItem value="Aoede.mp3">Aoede (Natural, conversational)</SelectItem>
                    <SelectItem value="Kore.mp3">Kore (Confident, firm)</SelectItem>
                  </SelectContent>
                </Select>
                
                {formValues.audio && showAudioPreview && (
                  <WaveformScrub 
                    fileName={formValues.audio} 
                    onConfirm={() => setShowAudioPreview(false)}
                  />
                )}
              </div>
            </div>

            {/* Options Row - Commented out for future use
            <div className="grid grid-cols-2 gap-4 sm:gap-6 py-2">
              {/* Subtitles * /}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
                <Switch
                  id="subtitles-toggle"
                  checked={formValues.subtitles === 'true'}
                  onCheckedChange={(checked) => update('subtitles', checked ? 'true' : 'false')}
                  aria-label="Toggle subtitles"
                />
                <div>
                  <label htmlFor="subtitles-toggle" className="text-sm font-medium text-gray-900 cursor-pointer block">
                    Include Subtitles
                  </label>
                  <p className="text-[11px] text-gray-500 mt-0.5">Overlay AI subtitles.</p>
                </div>
              </div>

              {/* Theme Option * /}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
                <ThemeSwitch 
                  checked={formValues.theme === 'dark'} 
                  onCheckedChange={(checked) => update('theme', checked ? 'dark' : 'light')} 
                />
                <div>
                  <label className="text-sm font-medium text-gray-900 cursor-pointer block">
                    Video Theme
                  </label>
                  <p className="text-[11px] text-gray-500 mt-0.5">Choose dark or light theme for the video.</p>
                </div>
              </div>
            </div>
            */}

            {/* Instructions */}
            <div className="z-10 relative">
              <FieldLabel required label="What should the AI agent do?" tooltip="Provide step-by-step instructions." />
              <div className={errors.instructions ? "ring-2 ring-red-300 rounded-xl" : ""}>
                <PlaceholdersAndVanishInput
                  placeholders={AI_AGENT_PROMPTS}
                  onChange={(e) => update('instructions', e.target.value)}
                  value={formValues.instructions || ''}
                />
              </div>
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
              className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all duration-500 ease-out disabled:opacity-50 flex items-center justify-center gap-2 border-none cursor-pointer bg-transparent bg-gradient-to-r from-gray-900 via-gray-700 to-gray-900 [background-size:200%_auto] [background-position:0%_center] text-white hover:[background-position:99%_center] shadow-lg shadow-black/5 disabled:cursor-not-allowed"
            >
              {isSubmitting ? <IconLoader /> : <IconPlay />}
              {isSubmitting ? 'Queuing…' : 'Generate Demo'}
            </button>
          </form>
        </div>

      </div>
    </div>
  );
};
