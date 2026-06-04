export default function Container({ children }: { children: React.ReactNode }) {
    return (
        <main className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 pt-16 lg:pt-24 pb-16 min-h-[100vh]">
            {children}
        </main>
    )
}
