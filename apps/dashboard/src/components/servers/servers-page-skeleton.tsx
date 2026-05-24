export function ServersGridSkeleton({ count = 9 }: { count?: number }) {
    return (
        <section className="space-y-12" aria-busy="true" aria-live="polite">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: count }).map((_, index) => (
                    <div
                        key={index}
                        className="glass-panel flex flex-col gap-6 p-6"
                    >
                        <div className="flex items-center gap-4">
                            <div className="h-14 w-14 animate-pulse rounded-full bg-foreground/10" />
                            <div className="flex-1 space-y-2">
                                <div className="h-4 w-2/3 animate-pulse rounded bg-foreground/10" />
                                <div className="h-3 w-1/2 animate-pulse rounded bg-foreground/10" />
                            </div>
                        </div>

                        <div className="mt-auto h-12 w-full animate-pulse rounded-xl bg-foreground/10" />
                    </div>
                ))}
            </div>
        </section>
    );
}

export function ServersPageSkeleton() {
    return (
        <>
            <header className="mb-6 flex flex-col items-start justify-between gap-8 md:flex-row md:items-end">
                <div className="w-full max-w-2xl space-y-4">
                    <div className="h-10 w-72 animate-pulse rounded bg-foreground/10 md:h-12" />
                    <div className="h-5 w-full animate-pulse rounded bg-foreground/10" />
                </div>
                <div className="h-16 w-full max-w-sm animate-pulse rounded-2xl bg-foreground/10" />
            </header>

            <ServersGridSkeleton />
        </>
    );
}
