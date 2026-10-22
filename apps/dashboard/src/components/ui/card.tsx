import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const cardVariants = cva(
	// 보더리스 규칙 — 서피스 대비 + elevation(다크에서는 강한 --elev-1)만으로 카드를 띄워요.
	// 아웃라인 대신 그림자가 구분감을 만들고, 라이트는 그림자만으로도 충분히 떠 보여요
	"group/card relative flex flex-col gap-4 overflow-hidden rounded-card border-0 bg-card text-sm text-card-foreground shadow-sm",
	{
		variants: {
			variant: {
				default: "",
				muted: "bg-muted",
				raised: "shadow-md",
				interactive: "cursor-pointer hover:bg-muted",
			},
			padding: {
				none: "",
				sm: "p-4",
				md: "p-5",
				lg: "p-6",
			},
		},
		defaultVariants: {
			variant: "default",
			padding: "md",
		},
	},
);

interface CardProps extends React.ComponentProps<"div">, VariantProps<typeof cardVariants> {}

function Card({ className, variant, padding, ...props }: CardProps) {
	return (
		<div
			data-slot="card"
			className={cn(cardVariants({ variant, padding, className }))}
			{...props}
		/>
	);
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
	return <div data-slot="card-header" className={cn("flex flex-col gap-1.5", className)} {...props} />;
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
	return <div data-slot="card-title" className={cn("text-base font-semibold leading-tight text-foreground", className)} {...props} />;
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
	return <div data-slot="card-description" className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
	return <div data-slot="card-content" className={cn("min-w-0", className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
	return <div data-slot="card-footer" className={cn("flex items-center gap-2", className)} {...props} />;
}

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, cardVariants };
export type { CardProps };
