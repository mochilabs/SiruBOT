import { InteractiveGlow } from "./interactive-glow";

export default function Container({ children }: { children: React.ReactNode }) {
    return (
        <main className="min-h-[90vh] lg:pt-[12vh] pt-[10vh] pb-20 relative overflow-hidden">
            {children}
        </main>
    )
}