import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { CheckIcon, InfoIcon, XIcon } from '../components/Icons';

type Kind = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  text: string;
  kind: Kind;
  onClick?: () => void;
}

const ToastContext = createContext<(text: string, kind?: Kind, onClick?: () => void) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const show = useCallback((text: string, kind: Kind = 'info', onClick?: () => void) => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-2), { id, text, kind, onClick }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 5000);
  }, []);

  const dismiss = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <button
            key={t.id}
            className={`toast toast-${t.kind}`}
            onClick={() => {
              t.onClick?.();
              dismiss(t.id);
            }}
          >
            <span className="toast-icon">
              {t.kind === 'success' ? <CheckIcon /> : t.kind === 'error' ? <XIcon /> : <InfoIcon />}
            </span>
            <span>{t.text}</span>
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
