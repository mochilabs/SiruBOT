import { Loader2 } from "lucide-react";

interface LoaderProps {
    className?: string;
    size?: "xs" | "sm" | "md" | "lg" | "xl";
    text?: string;
    description?: string;
    fullPage?: boolean;
    withBlur?: boolean;
    iconOnly?: boolean;
}

const sizeMap = {
    xs: "h-3 w-3",
    sm: "h-4 w-4",
    md: "h-8 w-8",
    lg: "h-12 w-12",
    xl: "h-16 w-16",
};

/**
 * Reusable Loader component for consistent loading UI across the dashboard.
 */
export default function Loader({
    className = "",
    size = "lg",
    text,
    description,
    fullPage = false,
    withBlur = false,
    iconOnly = false,
}: LoaderProps) {
    const sizeClass = sizeMap[size];
    
    const LoaderIcon = (
        <div className={iconOnly ? "" : "relative"}>
            <Loader2 className={`${sizeClass} animate-spin ${iconOnly ? "" : "text-primary/40"} ${className}`} />
            {!iconOnly && withBlur && (
                <div className={`absolute inset-0 blur-xl bg-primary/20 animate-pulse ${sizeClass}`} />
            )}
        </div>
    );

    if (iconOnly) {
        return LoaderIcon;
    }

    if (fullPage) {
        return (
            <div className="flex flex-col h-[80vh] items-center justify-center gap-6">
                {LoaderIcon}
                {(text || description) && (
                    <div className="text-center space-y-2">
                        {text && (
                            <p className="text-xl font-black tracking-tight text-foreground/80 animate-pulse">
                                {text}
                            </p>
                        )}
                        {description && (
                            <p className="text-sm text-muted-foreground font-medium">
                                {description}
                            </p>
                        )}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center gap-4 py-12">
            {LoaderIcon}
            {text && (
                <p className="text-lg font-bold text-muted-foreground/60 animate-pulse tracking-tight">
                    {text}
                </p>
            )}
        </div>
    );
}
