"use client";

import { LOCALES } from "@/lib/i18n";
import { Sheet } from "@/components/ui/Sheet";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export function LanguageSheet({
  open,
  onClose,
  value,
  supported,
  onChange,
  title,
}: {
  open: boolean;
  onClose: () => void;
  value: string;
  supported: string[];
  onChange: (lang: string) => void;
  title: string;
}) {
  const options = LOCALES.filter((l) => supported.includes(l.code));
  const list = options.length ? options : LOCALES.slice(0, 2);
  return (
    <Sheet open={open} onClose={onClose} title={title} height="tall">
      <div className="px-4 pb-6 pt-2">
        {list.map((l) => {
          const active = l.code === value;
          return (
            <button
              key={l.code}
              onClick={() => onChange(l.code)}
              className={cn(
                "flex w-full items-center justify-between border-b border-line px-2 py-4 text-left last:border-0"
              )}
            >
              <span
                className={cn(
                  "text-base",
                  active ? "font-bold text-brand" : "font-medium"
                )}
              >
                {l.label}
              </span>
              {active && <Check size={20} className="text-brand" />}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}
