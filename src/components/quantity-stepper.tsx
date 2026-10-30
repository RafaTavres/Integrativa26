"use client";

import { Minus, Plus } from "lucide-react";

interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label?: string;
}

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 9999,
  label = "Quantidade",
}: QuantityStepperProps) {
  function set(next: number) {
    const clamped = Math.max(min, Math.min(max, next));
    onChange(Number.isFinite(clamped) ? clamped : min);
  }

  return (
    <div className="inline-flex items-stretch rounded-[4px] border border-line bg-paper">
      <button
        type="button"
        onClick={() => set(value - 1)}
        disabled={value <= min}
        className="grid size-11 place-items-center border-r border-line text-ink transition-colors hover:bg-sand disabled:opacity-35"
        aria-label="Diminuir quantidade"
      >
        <Minus className="size-4" strokeWidth={2.2} />
      </button>
      <div className="flex w-[3.75rem] items-center justify-center">
        <input
          aria-label={label}
          inputMode="numeric"
          value={value}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => {
            const parsed = Number.parseInt(
              event.target.value.replace(/\D/g, ""),
              10,
            );
            if (Number.isNaN(parsed)) return;
            set(parsed);
          }}
          className="tabular w-full border-0 bg-transparent text-center text-base font-bold text-ink outline-none"
        />
      </div>
      <button
        type="button"
        onClick={() => set(value + 1)}
        disabled={value >= max}
        className="grid size-11 place-items-center border-l border-line text-ink transition-colors hover:bg-sand disabled:opacity-35"
        aria-label="Aumentar quantidade"
      >
        <Plus className="size-4" strokeWidth={2.2} />
      </button>
    </div>
  );
}
