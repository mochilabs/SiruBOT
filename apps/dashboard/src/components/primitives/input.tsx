import { forwardRef } from "react";

import { cn } from "@/lib/utils";

const controlBase =
	"w-full rounded-control border border-border bg-input text-sm text-foreground placeholder:text-muted-foreground transition-colors " +
	"focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring " +
	"disabled:cursor-not-allowed disabled:opacity-50 " +
	"aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, type = "text", ...props }, ref) {
	return <input ref={ref} type={type} className={cn(controlBase, "h-9 pl-3 pr-3", className)} {...props} />;
});

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;
export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ className, rows = 3, ...props }, ref) {
	return <textarea ref={ref} rows={rows} className={cn(controlBase, "min-h-20 resize-y py-2 leading-relaxed", className)} {...props} />;
});

/** 네이티브 셀렉트 — 드롭다운 케럿은 소비자가 오버레이로 얹는다(appearance-none + 우측 여백 확보) */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ className, children, ...props }, ref) {
	return (
		<select ref={ref} className={cn(controlBase, "h-11 cursor-pointer appearance-none pl-3 pr-9", className)} {...props}>
			{children}
		</select>
	);
});
