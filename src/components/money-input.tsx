"use client";

import { parseMoneyInput, formatBRLInput } from "@/lib/format";
import { cn } from "@/lib/cn";

interface MoneyInputProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  ariaLabel?: string;
  placeholder?: string;
  autoFocus?: boolean;
  describedBy?: string;
  invalid?: boolean;
}

export function MoneyInput({
  value,
  onChange,
  id,
  ariaLabel,
  placeholder = "0,00",
  autoFocus = false,
  describedBy,
  invalid = false,
}: MoneyInputProps) {
  return (
    <div
      className={cn(
        "money-field",
        invalid && "border-terracotta shadow-[0_0_0_3px_rgba(217,119,87,0.12)]",
      )}
    >
      <span className="money-prefix">R$</span>
      <input
        id={id}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        inputMode="decimal"
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={value}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => {
          const cents = parseMoneyInput(value);
          onChange(cents > 0 ? formatBRLInput(cents) : "");
        }}
      />
    </div>
  );
}
