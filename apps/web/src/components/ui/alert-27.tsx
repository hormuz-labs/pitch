import { useEffect, useRef, useState } from "react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { FaCheckCircle } from "react-icons/fa";

interface Alert27Props {
  title?: string;
  description?: string;
  className?: string;
  /** Called after the alert is dismissed (by user or auto-timer) */
  onDismiss?: () => void;
  /** Seconds before auto-dismiss. Default: 5 */
  duration?: number;
}

export const Alert27 = ({
  title = "Preferences saved",
  description = "Your settings have been updated and applied successfully.",
  className,
  onDismiss,
  duration = 5,
}: Alert27Props) => {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = () => {
    setFading(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    setTimeout(() => {
      setVisible(false);
      onDismiss?.();
    }, 300);
  };

  useEffect(() => {
    timerRef.current = setTimeout(dismiss, duration * 1000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!visible) return null;

  return (
    <div
      className={`transition-all duration-300 ${fading ? "opacity-0 -translate-y-1" : "opacity-100 translate-y-0"}`}
    >
      <Alert
        className={`border-none bg-green-600 text-white dark:bg-green-400 relative pr-10 overflow-hidden ${className || ""}`}
      >
        <FaCheckCircle className="size-4 shrink-0" />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription className="text-white/80">{description}</AlertDescription>

        {/* Close button */}
        <button
          onClick={dismiss}
          aria-label="Dismiss alert"
          className="absolute top-2 right-2 flex items-center justify-center w-6 h-6 rounded-full text-white/70 hover:text-white hover:bg-white/20 transition-colors cursor-pointer border-none bg-transparent"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Auto-dismiss progress bar */}
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/20 overflow-hidden">
          <div
            className="h-full bg-white/50 origin-left"
            style={{ animation: `alert27-shrink ${duration}s linear forwards` }}
          />
        </div>
      </Alert>

      <style>{`
        @keyframes alert27-shrink {
          from { transform: scaleX(1); }
          to   { transform: scaleX(0); }
        }
      `}</style>
    </div>
  );
};

export default Alert27;
