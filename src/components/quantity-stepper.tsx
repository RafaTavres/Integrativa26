"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";

interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label?: string;
  /** 1 para unidades inteiras; 0,01 para quantidades pesadas (kg, litro). */
  step?: number;
}

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 9999,
  label = "Quantidade",
  step = 1,
}: QuantityStepperProps) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");

  function format(next: number): string {
    return String(next).replace(".", ",");
  }

  function set(next: number) {
    const clamped = Math.max(min, Math.min(max, next));
    const rounded = Math.round(clamped * 1000) / 1000;
    onChange(Number.isFinite(rounded) ? rounded : min);
  }

  function handleChange(raw: string) {
    setDraft(raw);
    const parsed = Number(raw.replace(",", "."));
    if (!Number.isNaN(parsed)) set(parsed);
  }

  return (
    <div className="inline-flex items-stretch rounded-[4px] border border-line bg-paper">
      <button
        type="button"
        onClick={() => set(value - step)}
        disabled={value <= min}
        className="grid size-11 place-items-center border-r border-line text-ink transition-colors hover:bg-sand disabled:opacity-35"
        aria-label="Diminuir quantidade"
      >
        <Minus className="size-4" strokeWidth={2.2} />
      </button>
      <div className="flex w-[3.75rem] items-center justify-center">
        <input
          aria-label={label}
          inputMode="decimal"
          value={focused ? draft : format(value)}
          onFocus={(event) => {
            setFocused(true);
            setDraft(format(value));
            event.currentTarget.select();
          }}
          onChange={(event) => handleChange(event.target.value)}
          onBlur={() => setFocused(false)}
          className="tabular w-full border-0 bg-transparent text-center text-base font-bold text-ink outline-none"
        />
      </div>
      <button
        type="button"
        onClick={() => set(value + step)}
        disabled={value >= max}
        className="grid size-11 place-items-center border-l border-line text-ink transition-colors hover:bg-sand disabled:opacity-35"
        aria-label="Aumentar quantidade"
      >
        <Plus className="size-4" strokeWidth={2.2} />
      </button>
    </div>
  );
}
