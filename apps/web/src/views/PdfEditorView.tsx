import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Project } from '../types';
import { PdfProgressWidget } from '../components/PdfProgressWidget';
import { PitchLogoAnimation } from '../components/PitchLogoAnimation';
import { api } from '../lib/api';
import { useAuth } from '@clerk/clerk-react';

interface PdfEditorViewProps {
  projects: Project[];
}

export const PdfEditorView = ({ projects }: PdfEditorViewProps) => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { getToken } = useAuth();

  const selectedProject = projects.find(p => p.id === id);

  const [htmlContent, setHtmlContent] = useState<string>('');
  const [loadingHtml, setLoadingHtml] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [slides, setSlides] = useState<{ id: number; title: string }[]>([]);
  const [activeSlide, setActiveSlide] = useState<number>(0);
  const [scale, setScale] = useState(1);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeImageRef = useRef<{ id: string; src: string } | null>(null);

  // 1. Handle responsive scaling for the 1280x720 viewport
  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current) return;
      const width = containerRef.current.clientWidth;
      const calculatedScale = Math.min((width - 40) / 1280, 1);
      setScale(calculatedScale > 0.2 ? calculatedScale : 0.2);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [htmlContent]);

  // 2. Fetch the raw presentation HTML from storage
  useEffect(() => {
    if (!selectedProject || selectedProject.status !== 'COMPLETED') return;

    const htmlUrl = selectedProject.parameters?.htmlUrl;
    if (!htmlUrl) {
      setLoadingHtml(false);
      return;
    }

    setLoadingHtml(true);
    fetch(htmlUrl)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch presentation HTML');
        return res.text();
      })
      .then((text) => {
        setHtmlContent(text);
        setLoadingHtml(false);
      })
      .catch((err) => {
        console.error('Error fetching presentation HTML:', err);
        setLoadingHtml(false);
      });
  }, [selectedProject]);

  // 3. Inject interactive handlers (contentEditable & image upload click) once iframe loads
  const handleIframeLoad = () => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentDocument) return;

    const doc = iframe.contentDocument;

    // Inject styles for helper overlays in editor mode
    const style = doc.createElement('style');
    style.textContent = `
      [contenteditable="true"]:hover {
        box-shadow: 0 0 0 1px #3b82f6 !important;
        border-radius: 4px;
        cursor: text;
      }
      [contenteditable="true"]:focus {
        box-shadow: 0 0 0 2px #2563eb !important;
        outline: none;
        border-radius: 4px;
      }
      img:hover {
        box-shadow: 0 0 0 2px #3b82f6 !important;
        cursor: pointer;
        opacity: 0.9;
        transition: all 0.2s ease-in-out;
      }
    `;
    doc.head.appendChild(style);

    // Make text contentEditable
    const selectors = 'h1, p, li, .subtitle, .stat-num, .stat-label, .stat-desc, .si-card-heading, .si-card-body, .main-title, .chart-source';
    const textEls = doc.querySelectorAll(selectors);
    textEls.forEach((el) => {
      el.setAttribute('contenteditable', 'true');
      el.setAttribute('spellcheck', 'false');
    });

    // Tag slide elements and register click mapping
    const slideElements = doc.querySelectorAll('.slide');
    const slideMetaList = Array.from(slideElements).map((slideEl, index) => {
      const h1 = slideEl.querySelector('h1, .main-title');
      const title = h1?.textContent?.trim() || `Slide ${index + 1}`;
      // Add id to slide element for easy scrolling
      slideEl.setAttribute('id', `slide-node-${index}`);
      return { id: index, title };
    });
    setSlides(slideMetaList);

    // Make images clickable for replacement
    const images = doc.querySelectorAll('img');
    images.forEach((img, idx) => {
      // Ensure it has a unique ID to find it during file selection callback
      if (!img.id) img.setAttribute('id', `editable-img-${idx}`);
      img.addEventListener('click', (e) => {
        e.stopPropagation();
        activeImageRef.current = { id: img.id, src: img.src };
        fileInputRef.current?.click();
      });
    });
  };

  // 4. Handle image file replacement and load as base64 DataURL
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeImageRef.current || !iframeRef.current?.contentDocument) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64Data = reader.result as string;
      const targetImg = iframeRef.current?.contentDocument?.getElementById(activeImageRef.current!.id) as HTMLImageElement;
      if (targetImg) {
        targetImg.src = base64Data;
        setSaveStatus('idle'); // changes unsaved
      }
    };
    reader.readAsDataURL(file);
    // Reset file input value to allow selecting same file again
    e.target.value = '';
  };

  // 5. Scroll active slide into view inside the iframe
  const scrollToSlide = (index: number) => {
    setActiveSlide(index);
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentDocument) return;

    const targetSlide = iframe.contentDocument.getElementById(`slide-node-${index}`);
    if (targetSlide) {
      targetSlide.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // 6. Save modified HTML back to storage
  const handleSave = async () => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentDocument) return;

    setSaveStatus('saving');
    try {
      // Clean up dynamic editing styles/attributes before saving
      const cloneDoc = iframe.contentDocument.cloneNode(true) as Document;
      const editables = cloneDoc.querySelectorAll('[contenteditable="true"]');
      editables.forEach(el => el.removeAttribute('contenteditable'));

      const cleanHtml = '<!DOCTYPE html>\n' + cloneDoc.documentElement.outerHTML;
      // strip off spellcheck too
      const editables2 = cloneDoc.querySelectorAll('[spellcheck]');
      editables2.forEach(el => el.removeAttribute('spellcheck'));

      const finalHtml = '<!DOCTYPE html>\n' + cloneDoc.documentElement.outerHTML;

      const token = await getToken();
      await api.post(`/pdf-jobs/${id}/save`, token!, { html: finalHtml });

      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err) {
      console.error('Failed to save presentation changes:', err);
      setSaveStatus('error');
    }
  };

  if (!selectedProject) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-12">
        <div className="w-48 sm:w-64 mb-8">
          <PitchLogoAnimation startAnimation={true} loop={true} />
        </div>
        <p className="font-bold text-gray-900 tracking-tight leading-none text-xl mb-4 animate-pulse">Loading presentation…</p>
        <button
          onClick={() => navigate('/dashboard')}
          className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors cursor-pointer mt-2"
        >
          Cancel
        </button>
      </div>
    );
  }

  const isProcessing = selectedProject.status === 'PROCESSING' || selectedProject.status === 'PENDING';
  const isFailed = selectedProject.status === 'FAILED';

  // Render the progress updates when processing
  if (isProcessing) {
    return (
      <div className="p-6 md:p-8 max-w-3xl mx-auto w-full">
        <div className="bg-white border border-gray-200 rounded-xl p-6 md:p-8 text-center space-y-6">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Generating your presentation slide deck…</h2>
            <p className="text-sm text-gray-500 mt-1">This typically takes 2–4 minutes. Hang tight!</p>
          </div>
          <PdfProgressWidget project={selectedProject} />
        </div>
      </div>
    );
  }

  if (isFailed) {
    return (
      <div className="p-6 md:p-8 max-w-3xl mx-auto w-full">
        <div className="bg-white border border-gray-200 rounded-xl p-6 md:p-8 text-center space-y-6">
          <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto text-red-500">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">PDF Generation Failed</h2>
            <p className="text-sm text-gray-500 mt-1">{selectedProject.error || 'Something went wrong during generation.'}</p>
          </div>
          <PdfProgressWidget project={selectedProject} />
          <button
            onClick={() => navigate('/dashboard')}
            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors cursor-pointer"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-150 select-none">
      {/* ── Editor Top Header ─────────────────────────────────────────────── */}
      <header className="h-14 bg-white border-b border-gray-200 px-4 flex items-center justify-between z-20 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="p-1 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors cursor-pointer"
            title="Back to Dashboard"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
            </svg>
          </button>
          <div>
            <h2 className="text-sm font-bold text-gray-900 truncate max-w-xs sm:max-w-md">
              {selectedProject.parameters?.topic || 'Edit Presentation'}
            </h2>
            <p className="text-[10px] text-gray-400 mt-0.5 uppercase tracking-wider font-semibold">PDF Editor</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {selectedProject.videoUrl && (
            <a
              href={`${selectedProject.videoUrl}?t=${new Date(selectedProject.updatedAt).getTime()}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download PDF
            </a>
          )}

          <button
            onClick={handleSave}
            disabled={saveStatus === 'saving'}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 border-none cursor-pointer flex items-center gap-1.5 shadow-sm ${
              saveStatus === 'saving'
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : saveStatus === 'saved'
                ? 'bg-green-600 text-white hover:bg-green-700'
                : saveStatus === 'error'
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-gray-900 text-white hover:bg-gray-800'
            }`}
          >
            {saveStatus === 'saving' && (
              <span className="w-3.5 h-3.5 border-2 border-gray-400 border-t-gray-600 rounded-full animate-spin shrink-0" />
            )}
            {saveStatus === 'saving' ? 'Saving Changes...' : saveStatus === 'saved' ? 'Saved!' : saveStatus === 'error' ? 'Failed to Save' : 'Save Changes'}
          </button>
        </div>
      </header>

      {/* ── Editor Workspace ──────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        
        {/* Left Slide Thumbnail Navigation Sidebar */}
        <aside className="w-64 bg-white border-r border-gray-200 overflow-y-auto z-10 hidden md:block shrink-0">
          <div className="p-4 border-b border-gray-100">
            <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Slides ({slides.length})</h3>
          </div>
          <div className="p-2.5 space-y-1">
            {slides.map((slide) => (
              <button
                key={slide.id}
                onClick={() => scrollToSlide(slide.id)}
                className={`w-full text-left p-3 rounded-xl transition-all duration-200 flex items-start gap-3 cursor-pointer ${
                  activeSlide === slide.id
                    ? 'bg-indigo-50 border border-indigo-100 text-indigo-900 font-semibold'
                    : 'bg-transparent border border-transparent text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span className={`text-xs font-mono shrink-0 px-1.5 py-0.5 rounded ${
                  activeSlide === slide.id ? 'bg-indigo-100/50 text-indigo-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {String(slide.id + 1).padStart(2, '0')}
                </span>
                <span className="text-xs truncate">{slide.title}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* Main Editable Preview Window */}
        <main ref={containerRef} className="flex-1 overflow-auto flex items-center justify-center p-6 bg-gray-50/50 relative">
          {loadingHtml ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="w-8 h-8 border-3 border-gray-200 border-t-indigo-600 rounded-full animate-spin" />
              <p className="text-xs font-semibold text-gray-500">Loading presentation slides…</p>
            </div>
          ) : htmlContent ? (
            <div
              style={{
                width: 1280 * scale,
                height: 720 * scale,
                minWidth: 1280 * scale,
                minHeight: 720 * scale,
                transformOrigin: 'center center',
                transition: 'all 0.1s ease-out',
              }}
              className="rounded-2xl overflow-hidden shadow-2xl border border-gray-200 bg-white"
            >
              <iframe
                ref={iframeRef}
                srcDoc={htmlContent}
                onLoad={handleIframeLoad}
                style={{
                  width: 1280,
                  height: 720,
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
                  border: 'none',
                  overflow: 'hidden',
                }}
                title="Presentation Preview"
                sandbox="allow-same-origin allow-scripts"
              />
            </div>
          ) : (
            <div className="text-center p-8 border border-dashed border-gray-200 rounded-2xl bg-white max-w-sm">
              <p className="text-sm font-semibold text-gray-600">Failed to render presentation</p>
              <p className="text-xs text-gray-400 mt-1">We couldn't retrieve the slide builder templates for this project.</p>
            </div>
          )}
        </main>
      </div>

      {/* Hidden file input for image uploading */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />
    </div>
  );
};
