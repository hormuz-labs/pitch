import { useEffect, useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import type { Project } from '../types';
import { PdfProgressWidget } from '../components/PdfProgressWidget';
import { PitchLogoAnimation } from '../components/PitchLogoAnimation';
import { api } from '../lib/api';
import { useAuth } from '@clerk/clerk-react';

interface PdfEditorViewProps {
  projects: Project[];
  setPdfSlides?: (slides: { id: number; title: string }[]) => void;
  activePdfSlide?: number;
  setActivePdfSlide?: (slide: number) => void;
  setOnScrollToPdfSlide?: (scrollFn: ((index: number) => void) | null) => void;
}


const normalizeColor = (col: string): string => {
  if (!col) return '';
  const trimmed = col.trim().toLowerCase();
  if (trimmed === 'transparent' || trimmed === 'rgba(0, 0, 0, 0)') return 'transparent';
  if (trimmed.startsWith('#')) return trimmed;
  const match = trimmed.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/);
  if (match) {
    const r = parseInt(match[1], 10);
    const g = parseInt(match[2], 10);
    const b = parseInt(match[3], 10);
    const a = match[4] ? parseFloat(match[4]) : 1;
    if (a === 0) return 'transparent';
    const hex = '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    return hex;
  }
  return trimmed;
};

const BG_PRESETS = ['transparent', '#ffffff', '#000000', '#f3f4f6', '#e5e7eb', '#1f2937'];

export const PdfEditorView = ({
  projects,
  setPdfSlides,
  setActivePdfSlide,
  setOnScrollToPdfSlide,
}: PdfEditorViewProps) => {
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
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeImageRef = useRef<{ id: string; src: string } | null>(null);

  // Canva-like color extraction and bulk states
  const [slideColorsHash, setSlideColorsHash] = useState<number>(0);

  // Styling editor states
  const [selectedEl, setSelectedEl] = useState<HTMLElement | null>(null);
  const [selectedColor, setSelectedColor] = useState<string>('');
  const [selectedFontSize, setSelectedFontSize] = useState<string>('');
  const [selectedBulletColor, setSelectedBulletColor] = useState<string>('');

  const slideColorStats = useMemo(() => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentDocument) return [];

    const slideEl = iframe.contentDocument.getElementById(`slide-node-${activeSlide}`);
    if (!slideEl) return [];

    const colorCounts: { [color: string]: { textCount: number; bgCount: number } } = {};

    // Check slide background itself
    const slideBg = normalizeColor(slideEl.style.backgroundColor || window.getComputedStyle(slideEl).backgroundColor);
    if (slideBg && slideBg !== 'transparent') {
      colorCounts[slideBg] = { textCount: 0, bgCount: 1 };
    }

    // Find all child elements
    const children = slideEl.querySelectorAll('*');
    children.forEach((child) => {
      const htmlChild = child as HTMLElement;
      if (!htmlChild.style) return;

      // Extract text color
      const textColor = normalizeColor(htmlChild.style.color || window.getComputedStyle(htmlChild).color);
      if (textColor && textColor !== 'transparent') {
        if (!colorCounts[textColor]) {
          colorCounts[textColor] = { textCount: 0, bgCount: 0 };
        }
        colorCounts[textColor].textCount += 1;
      }

      // Extract background color
      const bgColor = normalizeColor(htmlChild.style.backgroundColor || window.getComputedStyle(htmlChild).backgroundColor);
      if (bgColor && bgColor !== 'transparent') {
        if (!colorCounts[bgColor]) {
          colorCounts[bgColor] = { textCount: 0, bgCount: 0 };
        }
        colorCounts[bgColor].bgCount += 1;
      }
    });

    return Object.entries(colorCounts)
      .map(([color, stats]) => ({
        color,
        textCount: stats.textCount,
        bgCount: stats.bgCount,
        totalCount: stats.textCount + stats.bgCount,
      }))
      .sort((a, b) => b.totalCount - a.totalCount);
  }, [activeSlide, slideColorsHash, htmlContent, loadingHtml]);


  const activeSlideBgColor = useMemo(() => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentDocument) return '';

    const slideEl = iframe.contentDocument.getElementById(`slide-node-${activeSlide}`);
    if (!slideEl) return '';

    const rawBgColor = slideEl.style.backgroundColor || window.getComputedStyle(slideEl).backgroundColor || '';
    return normalizeColor(rawBgColor);
  }, [activeSlide, slideColorsHash, htmlContent, loadingHtml]);

  useEffect(() => {
    // TopHeader renders #pdf-editor-header-actions when isPdfEditorPage is true
    setPortalTarget(document.getElementById('pdf-editor-header-actions'));
  }, []);

  // Synchronize slides list to the main Sidebar context
  useEffect(() => {
    if (setPdfSlides) {
      setPdfSlides(slides);
    }
  }, [slides, setPdfSlides]);

  // Synchronize active slide selection to the main Sidebar context
  useEffect(() => {
    if (setActivePdfSlide) {
      setActivePdfSlide(activeSlide);
    }
  }, [activeSlide, setActivePdfSlide]);

  // Expose scroll callback to the main Sidebar context
  useEffect(() => {
    if (setOnScrollToPdfSlide) {
      setOnScrollToPdfSlide(() => (index: number) => {
        scrollToSlide(index);
      });
    }
    return () => {
      if (setOnScrollToPdfSlide) {
        setOnScrollToPdfSlide(null);
      }
    };
  }, [setOnScrollToPdfSlide, htmlContent]);

  // Reset parent navigation state upon unmount
  useEffect(() => {
    return () => {
      if (setPdfSlides) setPdfSlides([]);
      if (setActivePdfSlide) setActivePdfSlide(0);
      if (setOnScrollToPdfSlide) setOnScrollToPdfSlide(null);
    };
  }, [setPdfSlides, setActivePdfSlide, setOnScrollToPdfSlide]);


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
      .selected-for-styling {
        outline: 2px solid #10b981 !important; /* Premium emerald selection border */
        outline-offset: 2px;
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

      // Click listener to update active slide context and element selection
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        
        doc.querySelectorAll('.selected-for-styling').forEach(item => {
          item.classList.remove('selected-for-styling');
        });
        el.classList.add('selected-for-styling');

        const htmlEl = el as HTMLElement;
        setSelectedEl(htmlEl);
        setSelectedColor(htmlEl.style.color || window.getComputedStyle(htmlEl).color);
        setSelectedFontSize(htmlEl.style.fontSize || window.getComputedStyle(htmlEl).fontSize);

        if (htmlEl.tagName === 'LI') {
          const bulColor = htmlEl.style.getPropertyValue('--primary') || window.getComputedStyle(htmlEl).getPropertyValue('--primary');
          setSelectedBulletColor(bulColor.trim());
        } else {
          setSelectedBulletColor('');
        }

        const parentSlide = el.closest('.slide');
        if (parentSlide) {
          const slideIdStr = parentSlide.getAttribute('id');
          if (slideIdStr) {
            const index = parseInt(slideIdStr.replace('slide-node-', ''), 10);
            if (!isNaN(index)) {
              setActiveSlide(index);
            }
          }
        }
      });

      // Input listener to trigger unsaved changes state
      el.addEventListener('input', () => {
        setSaveStatus('idle');
        setSlideColorsHash(prev => prev + 1);
      });
    });

    // Tag slide elements and register click mapping
    const slideElements = doc.querySelectorAll('.slide');
    const slideMetaList = Array.from(slideElements).map((slideEl, index) => {
      const h1 = slideEl.querySelector('h1, .main-title');
      const title = h1?.textContent?.trim() || `Slide ${index + 1}`;
      // Add id to slide element for easy scrolling
      slideEl.setAttribute('id', `slide-node-${index}`);

      // Click listener to select slide background and deselect elements
      slideEl.addEventListener('click', () => {
        setActiveSlide(index);
        doc.querySelectorAll('.selected-for-styling').forEach(item => {
          item.classList.remove('selected-for-styling');
        });
        setSelectedEl(null);
      });

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

        // Update active slide when image is clicked
        const parentSlide = img.closest('.slide');
        if (parentSlide) {
          const slideIdStr = parentSlide.getAttribute('id');
          if (slideIdStr) {
            const index = parseInt(slideIdStr.replace('slide-node-', ''), 10);
            if (!isNaN(index)) {
              setActiveSlide(index);
            }
          }
        }
      });
    });

    // Trigger initial color extraction
    setSlideColorsHash(prev => prev + 1);
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
        setSlideColorsHash(prev => prev + 1); // update used colors
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
      cloneDoc.querySelectorAll('.selected-for-styling').forEach(el => el.classList.remove('selected-for-styling'));
      const editables = cloneDoc.querySelectorAll('[contenteditable="true"]');
      editables.forEach(el => el.removeAttribute('contenteditable'));

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

  // 7. Styling mutators
  const changeSlideBgColor = (newBgColor: string) => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentDocument) return;

    const slideEl = iframe.contentDocument.getElementById(`slide-node-${activeSlide}`);
    if (slideEl) {
      slideEl.style.backgroundColor = newBgColor;
      setSaveStatus('idle');
      setSlideColorsHash(prev => prev + 1);
    }
  };



  const changeSelectedColor = (newColor: string) => {
    if (!selectedEl) return;
    selectedEl.style.color = newColor;
    setSelectedColor(newColor);
    setSaveStatus('idle');
    setSlideColorsHash(prev => prev + 1);
  };

  const changeSelectedFontSize = (increase: boolean) => {
    if (!selectedEl) return;
    const currentSizeStr = selectedEl.style.fontSize || window.getComputedStyle(selectedEl).fontSize;
    const currentSize = parseFloat(currentSizeStr) || 16;
    const newSize = increase ? currentSize + 2 : Math.max(8, currentSize - 2);
    selectedEl.style.fontSize = `${newSize}px`;
    setSelectedFontSize(`${newSize}px`);
    setSaveStatus('idle');
  };

  const changeSelectedBulletColor = (newColor: string) => {
    if (!selectedEl || selectedEl.tagName !== 'LI') return;
    selectedEl.style.setProperty('--primary', newColor);
    setSelectedBulletColor(newColor);
    setSaveStatus('idle');
    setSlideColorsHash(prev => prev + 1);
  };

  const deselectElement = () => {
    if (iframeRef.current?.contentDocument) {
      iframeRef.current.contentDocument.querySelectorAll('.selected-for-styling').forEach(el => el.classList.remove('selected-for-styling'));
    }
    setSelectedEl(null);
  };

  const handleSlideColorSwap = (oldColor: string, newColor: string) => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentDocument) return;

    const slideEl = iframe.contentDocument.getElementById(`slide-node-${activeSlide}`);
    if (!slideEl) return;

    const oldNorm = normalizeColor(oldColor);
    const newNorm = normalizeColor(newColor);
    if (oldNorm === newNorm) return;

    const children = slideEl.querySelectorAll('*');
    children.forEach((child) => {
      const htmlChild = child as HTMLElement;
      if (!htmlChild.style) return;
      
      const textNorm = normalizeColor(htmlChild.style.color || window.getComputedStyle(htmlChild).color);
      if (textNorm === oldNorm) {
        htmlChild.style.color = newColor;
      }

      const bgNorm = normalizeColor(htmlChild.style.backgroundColor || window.getComputedStyle(htmlChild).backgroundColor);
      if (bgNorm === oldNorm) {
        htmlChild.style.backgroundColor = newColor;
      }
    });

    const slideBgNorm = normalizeColor(slideEl.style.backgroundColor || window.getComputedStyle(slideEl).backgroundColor);
    if (slideBgNorm === oldNorm) {
      slideEl.style.backgroundColor = newColor;
    }

    setSaveStatus('idle');
    setSlideColorsHash(prev => prev + 1);
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
      {/* ── Portaled Editor Actions ────────────────────────────────────────── */}
      {portalTarget && createPortal(
        <>
          {selectedProject.pdfUrl && (
            <a
              href={`${selectedProject.pdfUrl}?t=${new Date(selectedProject.updatedAt).getTime()}`}
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
        </>,
        portalTarget
      )}

      {/* ── Slide Theme & Colors Panel ────────────────────────────────────────── */}
      {!loadingHtml && htmlContent && (
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex flex-col gap-4 z-10 shadow-sm shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-6">
            
            {/* Left Column: Slide Styles (Always Visible) */}
            <div className="flex flex-wrap items-center gap-6">
              {/* Active Slide Info */}
              <div className="flex items-center gap-3 pr-4 border-r border-gray-200">
                <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-100 flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <line x1="9" y1="3" x2="9" y2="21"/>
                  </svg>
                  Slide {activeSlide + 1}
                </span>
                <div className="hidden sm:block">
                  <h4 className="text-xs font-bold text-gray-800">Slide Theme & Colors</h4>
                </div>
              </div>

              {/* Slide Background Color Control */}
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                <span className="text-xs text-gray-500 font-semibold">Background</span>
                <div className="flex items-center gap-1.5">
                  {BG_PRESETS.map((col) => {
                    const isSelected = normalizeColor(activeSlideBgColor) === normalizeColor(col);
                    return (
                      <button
                        key={col}
                        onClick={() => changeSlideBgColor(col)}
                        style={{ backgroundColor: col === 'transparent' ? 'transparent' : col }}
                        className={`w-5 h-5 rounded-full border border-gray-300 shadow-sm transition-all hover:scale-110 flex items-center justify-center ${
                          isSelected ? 'ring-2 ring-indigo-500 scale-110' : ''
                        }`}
                        title={`Background: ${col}`}
                      >
                        {col === 'transparent' && <span className="text-[10px] text-gray-400">∅</span>}
                      </button>
                    );
                  })}
                  {/* Custom Background Color Picker */}
                  {(() => {
                    const normBgColor = normalizeColor(activeSlideBgColor);
                    const bgPresetsNormalized = BG_PRESETS.map(normalizeColor);
                    const isCustomBg = normBgColor && !bgPresetsNormalized.includes(normBgColor);
                    return (
                      <div 
                        className={`relative w-5 h-5 rounded-full overflow-hidden border border-gray-300 shadow-sm hover:scale-110 transition-transform cursor-pointer flex items-center justify-center ${
                          isCustomBg ? 'ring-2 ring-indigo-500 scale-110' : ''
                        }`}
                        style={{ background: 'conic-gradient(from 0deg, red, yellow, green, cyan, blue, magenta, red)' }}
                        title="Custom Background Color"
                      >
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <span className="text-[10px] text-white font-black drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">+</span>
                        </div>
                        <input
                          type="color"
                          value={normBgColor.startsWith('#') && normBgColor.length === 7 ? normBgColor : '#ffffff'}
                          onChange={(e) => changeSlideBgColor(e.target.value)}
                          className="absolute inset-0 w-full h-full cursor-pointer opacity-0"
                        />
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Right Column: Element-specific editor (Renders only when an element is selected) */}
            {selectedEl && (
              <div className="flex items-center gap-4 bg-emerald-50/50 border border-emerald-100 rounded-2xl px-4 py-2 animate-in fade-in duration-200">
                <div className="flex items-center gap-2 pr-3 border-r border-emerald-100">
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-lg uppercase tracking-wider">
                    {selectedEl.tagName === 'LI' ? 'List Item' : selectedEl.tagName === 'H1' ? 'Heading' : 'Text Block'}
                  </span>
                </div>

                {/* Font Size Control */}
                <div className="flex items-center gap-1.5 pr-3 border-r border-emerald-100">
                  <span className="text-xs text-gray-500 font-medium mr-1">Size</span>
                  <button
                    onClick={() => changeSelectedFontSize(false)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-250 bg-white hover:bg-gray-50 text-gray-600 transition-colors text-xs font-bold cursor-pointer"
                  >
                    -
                  </button>
                  <span className="text-xs font-mono font-bold text-gray-700 min-w-[32px] text-center">
                    {selectedFontSize || 'N/A'}
                  </span>
                  <button
                    onClick={() => changeSelectedFontSize(true)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-250 bg-white hover:bg-gray-50 text-gray-600 transition-colors text-xs font-bold cursor-pointer"
                  >
                    +
                  </button>
                </div>

                {/* Element Text Color Picker */}
                <div className="flex items-center gap-2 pr-3 border-r border-emerald-100">
                  <span className="text-xs text-gray-500 font-medium">Color</span>
                  <div 
                    className="relative w-5 h-5 rounded-full border border-gray-300 shadow-sm hover:scale-110 transition-transform cursor-pointer"
                    style={{ backgroundColor: selectedColor || '#000000' }}
                  >
                    <input
                      type="color"
                      value={normalizeColor(selectedColor).startsWith('#') && normalizeColor(selectedColor).length === 7 ? normalizeColor(selectedColor) : '#000000'}
                      onChange={(e) => changeSelectedColor(e.target.value)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Bullet Color Picker (Only for List Items) */}
                {selectedEl.tagName === 'LI' && (
                  <div className="flex items-center gap-2 pr-3 border-r border-emerald-100">
                    <span className="text-xs text-gray-500 font-medium">Bullet</span>
                    <div 
                      className="relative w-5 h-5 rounded-full border border-gray-300 shadow-sm hover:scale-110 transition-transform cursor-pointer"
                      style={{ backgroundColor: selectedBulletColor || '#000000' }}
                    >
                      <input
                        type="color"
                        value={normalizeColor(selectedBulletColor).startsWith('#') && normalizeColor(selectedBulletColor).length === 7 ? normalizeColor(selectedBulletColor) : '#000000'}
                        onChange={(e) => changeSelectedBulletColor(e.target.value)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                    </div>
                  </div>
                )}

                {/* Deselect element button */}
                <button
                  onClick={deselectElement}
                  className="text-gray-400 hover:text-gray-600 transition-colors p-1 hover:bg-emerald-100/50 rounded-lg cursor-pointer"
                  title="Deselect Element"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            )}

          </div>

          {/* Bottom Row: Detected / Used Colors Swapper */}
          {slideColorStats.length > 0 && (
            <div className="border-t border-gray-100 pt-3 flex flex-col gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Used Colors in this Slide (Click color to swap slide-wide)</span>
              </div>
              <div className="flex flex-wrap gap-2.5">
                {slideColorStats.map(({ color, textCount, bgCount }) => (
                  <div 
                    key={color} 
                    className="flex items-center gap-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg pl-2 pr-3 py-1.5 transition-all hover:border-gray-300 shadow-sm text-xs select-none"
                  >
                    <div 
                      className="relative w-5 h-5 rounded-full border border-gray-300 shadow-sm hover:scale-110 transition-transform cursor-pointer flex items-center justify-center"
                      style={{ backgroundColor: color }}
                    >
                      <input
                        type="color"
                        value={color.startsWith('#') && color.length === 7 ? color : '#ffffff'}
                        onChange={(e) => handleSlideColorSwap(color, e.target.value)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                    </div>
                    <span className="font-mono text-[10px] text-gray-600 font-bold uppercase">{color}</span>
                    <span className="text-[10px] text-gray-400 font-medium">
                      ({textCount > 0 && `${textCount} text`}{textCount > 0 && bgCount > 0 && ', '}{bgCount > 0 && `${bgCount} bg`}{textCount === 0 && bgCount === 0 && '0 items'})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}

      {/* ── Editor Workspace ──────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        


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
