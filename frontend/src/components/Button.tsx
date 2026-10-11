import type { ButtonHTMLAttributes } from "react";

const STYLES = {
  primary:
    "bg-brand-600 text-white shadow-md shadow-brand-600/25 hover:bg-brand-700 hover:shadow-lg disabled:bg-brand-200 disabled:shadow-none",
  secondary:
    "border border-slate-300 bg-white/80 text-slate-700 backdrop-blur hover:border-brand-300 hover:bg-white disabled:text-slate-400",
  ghost: "text-brand-600 hover:bg-brand-50 disabled:text-slate-400",
} as const;

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof STYLES;
}

export function Button({ variant = "primary", className = "", ...rest }: Props) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed ${STYLES[variant]} ${className}`}
    />
  );
}
