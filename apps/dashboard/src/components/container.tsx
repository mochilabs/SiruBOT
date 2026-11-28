export default function Container({ children }: { children: React.ReactNode }) {
    return (
        <main className="mx-auto w-full max-w-7xl px-4 pt-6 pb-16 sm:px-6 sm:pt-8 lg:px-8 min-h-[calc(100svh-var(--navbar-h))]">
            {children}
        </main>
    )
}
