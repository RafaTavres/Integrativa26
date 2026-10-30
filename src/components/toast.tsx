"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Check, Info } from "lucide-react";

interface ToastItem {
  id: number;
  message: string;
  tone: "success" | "info";
}

interface ToastContextValue {
  toast: (message: string, tone?: "success" | "info") => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback(
    (message: string, tone: "success" | "info" = "success") => {
      const id = Date.now() + Math.random();
      setItems((current) => [...current.slice(-2), { id, message, tone }]);
      window.setTimeout(() => {
        setItems((current) => current.filter((item) => item.id !== id));
      }, 3600);
    },
    [],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed inset-x-0 bottom-[5.4rem] z-[120] flex flex-col items-center gap-2 px-4 lg:bottom-6"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className="animate-rise flex max-w-[26rem] items-center gap-2.5 rounded-[4px] border border-ink bg-ink px-4 py-3 text-sm font-medium text-cream shadow-[0_8px_30px_rgba(51,45,43,0.22)]"
          >
            <span
              className={
                item.tone === "success"
                  ? "grid size-5 flex-none place-items-center rounded-[2px] bg-sage text-ink"
                  : "grid size-5 flex-none place-items-center rounded-[2px] bg-mustard text-ink"
              }
            >
              {item.tone === "success" ? (
                <Check className="size-3.5" strokeWidth={3} />
              ) : (
                <Info className="size-3.5" strokeWidth={2.6} />
              )}
            </span>
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast precisa estar dentro de ToastProvider.");
  }
  return context;
}
