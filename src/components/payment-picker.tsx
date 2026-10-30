"use client";

import { Banknote, CreditCard, QrCode } from "lucide-react";
import type { PaymentMethod } from "@/lib/types";

const OPTIONS: Array<{
  value: PaymentMethod;
  label: string;
  icon: typeof QrCode;
}> = [
  { value: "pix", label: "Pix", icon: QrCode },
  { value: "cash", label: "Dinheiro", icon: Banknote },
  { value: "card", label: "Cartão", icon: CreditCard },
];

interface PaymentPickerProps {
  value?: PaymentMethod;
  onChange: (value: PaymentMethod) => void;
  invalid?: boolean;
}

export function PaymentPicker({
  value,
  onChange,
  invalid = false,
}: PaymentPickerProps) {
  return (
    <div
      className={
        invalid
          ? "rounded-[4px] p-1 -m-1 outline outline-1 outline-terracotta/50"
          : undefined
      }
    >
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map((option) => {
          const Icon = option.icon;
          return (
            <button
              key={option.value}
              type="button"
              data-selected={value === option.value}
              onClick={() => onChange(option.value)}
              className="option-tile flex-col gap-1.5 py-2"
              aria-pressed={value === option.value}
            >
              <Icon className="size-[1.15rem]" strokeWidth={1.8} />
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
