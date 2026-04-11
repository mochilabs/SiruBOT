export default function Container({ children }: { children: React.ReactNode }) {
    return (
        <main className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-26">
            {children}
        </main>
    )
}
