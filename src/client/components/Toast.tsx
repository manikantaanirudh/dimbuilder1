import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react";

type ToastType = "success" | "error" | "info" | "warning";

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

let toastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, type: ToastType = "info", duration = 4000) => {
    const id = ++toastId;
    setToasts(prev => [...prev.slice(-2), { id, message, type }]); // max 3
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const icons = { success: CheckCircle2, error: XCircle, warning: AlertTriangle, info: Info };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="toast-container" aria-live="polite" aria-atomic="false">
        {toasts.map(t => {
          const Icon = icons[t.type];
          return (
            <div key={t.id} className={`toast ${t.type}`} role="alert">
              <Icon size={16} />
              <span>{t.message}</span>
              <button type="button" className="toast-dismiss" aria-label="Dismiss notification" onClick={() => dismiss(t.id)}>
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
