export default function Container({ children }: { children: React.ReactNode }) {
    return (
        // navbar은 루트 flex 컬럼의 sticky 요소로 흐름 공간을 차지해요 — 페이지별 클리어런스 패딩이 필요 없어요
        <main className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 pb-16 min-h-[calc(100svh-var(--navbar-h))]">
            {children}
        </main>
    )
}
