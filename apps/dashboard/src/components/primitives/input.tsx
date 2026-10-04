import { forwardRef } from "react";

import { cn } from "@/lib/utils";

/* ─────────────────────────── shared control base ─────────────────────────── */

const controlBase =
	"w-full rounded-control border border-border bg-input text-sm text-foreground placeholder:text-muted-foreground transition-colors " +
	"focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:border-ring " +
	"disabled:cursor-not-allowed disabled:opacity-50 " +
	"aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive/40";

/* ─────────────────────────── Input ─────────────────────────── */

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, type = "text", ...props }, ref) {
	return <input ref={ref} type={type} className={cn(controlBase, "h-9 pl-3 pr-3", className)} {...props} />;
});

/* ─────────────────────────── Textarea ─────────────────────────── */

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ className, rows = 3, ...props }, ref) {
	return <textarea ref={ref} rows={rows} className={cn(controlBase, "min-h-20 resize-y py-2 leading-relaxed", className)} {...props} />;
});
