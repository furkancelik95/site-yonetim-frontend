import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Alert } from "./ui";

// İşlem sonucu bildirimi. Backend yazma yanıtındaki Türkçe `message` burada gösterilir.
// Odak çalmaz (role=status), 5 sn sonra kaybolur.

interface Toast {
  id: number;
  tone: "ok" | "danger" | "info";
  text: string;
}

const ToastContext = createContext<(text: string, tone?: Toast["tone"]) => void>(() => {});

let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const show = useCallback((text: string, tone: Toast["tone"] = "ok") => {
    const id = ++seq;
    setToasts((t) => [...t, { id, tone, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-region" aria-live="polite">
        {toasts.map((t) => (
          <Alert key={t.id} tone={t.tone}>
            {t.text}
          </Alert>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
