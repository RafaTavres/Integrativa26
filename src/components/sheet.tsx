"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

interface SheetProps {
  title: string;
  eyebrow?: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

export function Sheet({
  title,
  eyebrow,
  description,
  onClose,
  children,
  footer,
  wide = false,
}: SheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  function close() {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      className={cn("sheet", wide && "lg:max-w-[40rem]")}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) close();
      }}
    >
      <div className="sheet-inner flex max-h-[92dvh] flex-col">
        <header className="flex flex-none items-start justify-between gap-4 border-b border-line px-5 pb-4 pt-5 sm:px-6">
          <div className="min-w-0">
            {eyebrow ? <p className="eyebrow mb-1.5">{eyebrow}</p> : null}
            <h2
              id={titleId}
              className="display text-[1.65rem] leading-[1.15] text-ink"
            >
              {title}
            </h2>
            {description ? (
              <p
                id={descriptionId}
                className="mt-1.5 text-[0.8125rem] leading-snug text-muted"
              >
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={close}
            className="icon-button -mr-1 -mt-1 size-10 flex-none"
            aria-label="Fechar"
          >
            <X className="size-5" strokeWidth={1.9} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {children}
        </div>

        {footer ? (
          <footer className="flex-none border-t border-line bg-paper px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:px-6">
            {footer}
          </footer>
        ) : null}
      </div>
    </dialog>
  );
}
