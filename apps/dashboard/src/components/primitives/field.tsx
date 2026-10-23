import { useId } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface FieldRenderProps {
	id: string;
	describedBy?: string;
	invalid: boolean;
	/** 필수 입력 여부: 렌더 프롭 소비자가 컨트롤에 required/aria-required를 연결할 때 써요 */
	required: boolean;
}

interface FieldProps {
	label: string;
	description?: React.ReactNode;
	error?: React.ReactNode;
	required?: boolean;
	htmlFor?: string;
	className?: string;
	children: React.ReactNode | ((props: FieldRenderProps) => React.ReactNode);
}

export function Field({ label, description, error, required = false, htmlFor, className, children }: FieldProps) {
	const autoId = useId();
	const isRenderProp = typeof children === "function";
	const id = htmlFor ?? autoId;
	const descriptionId = description ? `${id}-description` : undefined;
	const errorId = error ? `${id}-error` : undefined;
	const invalid = Boolean(error);
	const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;
	// 렌더 프롭으로 id를 넘기는 경우에만 label과 실제로 연결된다.
	const labelFor = htmlFor ?? (isRenderProp ? id : undefined);

	return (
		<div className={cn("space-y-2", className)}>
			<Label htmlFor={labelFor} className="block text-sm font-semibold text-foreground">
				{label}
				{required && (
					<>
						<span aria-hidden className="ml-1 text-destructive">
							*
						</span>
						<span className="sr-only">(필수)</span>
					</>
				)}
			</Label>
			{isRenderProp ? (children as (props: FieldRenderProps) => React.ReactNode)({ id, describedBy, invalid, required }) : children}
			{description && (
				<p id={descriptionId} className="text-sm text-muted-foreground">
					{description}
				</p>
			)}
			{error && (
				<p id={errorId} role="alert" className="text-sm font-medium text-destructive">
					{error}
				</p>
			)}
		</div>
	);
}
