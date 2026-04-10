export default function Container({ children }: { children: React.ReactNode }) {
    return (
        <main className="w-full relative min-h-[90vh] lg:pt-[12vh] pt-[10vh] pb-20 overflow-hidden">
            {children}
        </main>
    )
}