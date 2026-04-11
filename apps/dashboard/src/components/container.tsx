import { InteractiveGlow } from "@/components/interactive-glow";

export default function Container({ children }: { children: React.ReactNode }) {
    return (
        <main className="relative w-full min-h-screen overflow-visible pt-26 pb-26">
            <InteractiveGlow />
            <div className="relative z-10 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
                {children}
            </div>
        </main>
    )
}
