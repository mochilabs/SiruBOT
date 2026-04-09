import { Card, Flex, Heading, Text, Button, Slider, ScrollArea } from "@radix-ui/themes";
import Link from "next/link";
import Image from "next/image";

export default function ServerDashboardPage() {
  // Mock data for the UI
  const mockCurrentTrack = {
    title: "Mili - Rightfully",
    artist: "Mili",
    duration: 214000,
    progress: 85000,
    thumbnail: "https://i.ytimg.com/vi/aH1y8OksVDU/hqdefault.jpg"
  };

  const mockQueue = [
    { id: "1", title: "YOASOBI - Idol", artist: "Ayase / YOASOBI", duration: 213000 },
    { id: "2", title: "Ado - Odo", artist: "Ado", duration: 205000 },
    { id: "3", title: "Kenshi Yonezu - KICK BACK", artist: "Kenshi Yonezu", duration: 193000 },
    { id: "4", title: "Hoshimachi Suisei - Stellar Stellar", artist: "Hoshimachi Suisei", duration: 305000 },
    { id: "5", title: "ZUTOMAYO - Byoushin wo Kamu", artist: "ZUTOMAYO", duration: 261000 },
  ];

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-[calc(100vh-80px)] bg-siru-bg flex">
      {/* Sidebar - Server Selection & Settings (Mockup) */}
      <aside className="w-64 bg-siru-base border-r border-siru-text/5 hidden md:flex flex-col h-[calc(100vh-80px)] sticky top-[80px]">
        <div className="p-6">
          <Link href="/servers" className="text-siru-text/50 hover:text-siru-text flex items-center gap-2 mb-8 transition-colors">
            <span>←</span> 돌아가기
          </Link>
          <Flex align="center" gap="3" className="mb-8">
            <div className="w-12 h-12 rounded-full bg-siru-panel flex items-center justify-center text-siru-text font-bold shadow-siru-glow ring-2 ring-siru-primary/20">
              S
            </div>
            <div>
              <Heading size="3" className="text-siru-text">Siru&apos;s Server</Heading>
              <Text size="1" className="text-siru-text/50">관리자</Text>
            </div>
          </Flex>

          <nav className="space-y-2">
            <a href="#" className="flex items-center gap-3 px-4 py-3 rounded-xl bg-siru-panel text-siru-primary font-medium transition-colors">
              <span>🎵</span> 음악 대시보드
            </a>
            <a href="#" className="flex items-center gap-3 px-4 py-3 rounded-xl text-siru-text/60 hover:bg-siru-panel/50 transition-colors">
              <span>⚙️</span> 기본 설정
            </a>
            <a href="#" className="flex items-center gap-3 px-4 py-3 rounded-xl text-siru-text/60 hover:bg-siru-panel/50 transition-colors">
              <span>🎛️</span> 컨트롤러 패널
            </a>
          </nav>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-10 relative overflow-hidden">
        {/* Watermark */}
        <div className="absolute top-0 right-0 w-full h-full opacity-5 pointer-events-none flex justify-end items-start overflow-hidden -z-10">
          <div className="w-[600px] h-[600px] bg-siru-primary rounded-full blur-[100px] transform translate-y-[-20%] translate-x-[20%]"></div>
        </div>

        <Heading size="8" className="text-siru-text mb-2 tracking-tight">음악 대시보드</Heading>
        <Text size="4" className="text-siru-text/60 mb-8 block">현재 재생 중인 곡과 대기열을 실시간으로 관리하세요.</Text>

        <div className="grid lg:grid-cols-12 gap-8">

          {/* Now Playing Section */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            <Card className="bg-siru-panel border-0 rounded-[2rem] shadow-lg overflow-hidden p-0 relative group">
              {/* Blurred background image of the thumbnail */}
              <div
                className="absolute inset-0 bg-cover bg-center opacity-20 group-hover:opacity-30 transition-opacity duration-500 blur-xl"
                style={{ backgroundImage: `url(${mockCurrentTrack.thumbnail})` }}
              />

              <div className="p-8 relative z-10">
                <Flex align="center" justify="between" className="mb-6">
                  <span className="bg-siru-primary/20 text-siru-primary px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase">
                    Now Playing
                  </span>
                  <div className="flex gap-2">
                    <span className="w-1.5 h-4 bg-siru-primary rounded-full animate-pulse"></span>
                    <span className="w-1.5 h-6 bg-siru-primary rounded-full animate-pulse delay-75"></span>
                    <span className="w-1.5 h-3 bg-siru-primary rounded-full animate-pulse delay-150"></span>
                  </div>
                </Flex>

                <Flex direction="column" align="center" className="text-center">
                  <div className="w-48 h-48 sm:w-64 sm:h-64 rounded-2xl overflow-hidden shadow-2xl mb-8 relative">
                    <Image
                      src={mockCurrentTrack.thumbnail}
                      alt="Thumbnail"
                      fill
                      className="object-cover hover:scale-105 transition-transform duration-700"
                    />
                  </div>

                  <Heading size="7" className="text-siru-text mb-2 drop-shadow-md">{mockCurrentTrack.title}</Heading>
                  <Text size="4" className="text-siru-text/70 mb-8">{mockCurrentTrack.artist}</Text>

                  {/* Progress Bar */}
                  <div className="w-full max-w-md mx-auto mb-8">
                    <Slider
                      defaultValue={[mockCurrentTrack.progress]}
                      max={mockCurrentTrack.duration}
                      className="mb-2"
                      color="pink"
                    />
                    <Flex justify="between" className="text-xs text-siru-text/50 font-mono">
                      <span>{formatTime(mockCurrentTrack.progress)}</span>
                      <span>{formatTime(mockCurrentTrack.duration)}</span>
                    </Flex>
                  </div>

                  {/* Controls */}
                  <Flex justify="center" align="center" gap="6">
                    <button className="text-siru-text/60 hover:text-siru-text transition-colors">
                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M11 17l-5-5 5-5v10z M18 17l-5-5 5-5v10z"/></svg>
                    </button>
                    <button className="w-16 h-16 rounded-full bg-siru-primary text-siru-bg flex items-center justify-center hover:scale-105 hover:shadow-siru-glow transition-all">
                      <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                    </button>
                    <button className="text-siru-text/60 hover:text-siru-text transition-colors">
                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 17l5-5-5-5v10z M13 17l5-5-5-5v10z"/></svg>
                    </button>
                  </Flex>
                </Flex>
              </div>
            </Card>

            <Flex gap="4" justify="center">
              <Button variant="soft" className="bg-siru-panel text-siru-text/80 hover:bg-siru-panel/80 rounded-xl px-6">
                🔁 반복 모드: 꺼짐
              </Button>
              <Button variant="soft" className="bg-siru-panel text-siru-text/80 hover:bg-siru-panel/80 rounded-xl px-6">
                🔀 셔플
              </Button>
            </Flex>
          </div>

          {/* Queue Section */}
          <div className="lg:col-span-5 flex flex-col">
            <Card className="bg-siru-panel border-0 rounded-[2rem] shadow-lg p-6 flex-1 flex flex-col">
              <Flex justify="between" align="center" className="mb-6">
                <Heading size="5" className="text-siru-text">재생 대기열</Heading>
                <span className="text-xs bg-siru-base text-siru-text/60 px-3 py-1.5 rounded-full font-mono">
                  {mockQueue.length} 곡 대기중
                </span>
              </Flex>

              <ScrollArea className="flex-1 pr-4 -mr-4" type="auto">
                <div className="space-y-2">
                  {mockQueue.map((track, i) => (
                    <div
                      key={track.id}
                      className="group flex items-center gap-4 p-3 rounded-xl hover:bg-siru-base/50 transition-colors cursor-pointer"
                    >
                      <div className="w-6 text-center text-siru-text/40 font-mono text-sm group-hover:text-siru-primary transition-colors">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <Text className="text-siru-text block truncate font-medium">{track.title}</Text>
                        <Text size="1" className="text-siru-text/50 truncate">{track.artist}</Text>
                      </div>
                      <Text size="1" className="text-siru-text/40 font-mono">
                        {formatTime(track.duration)}
                      </Text>
                      <button className="opacity-0 group-hover:opacity-100 p-2 text-siru-text/40 hover:text-red-400 transition-all">
                         ✕
                      </button>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <div className="mt-6 pt-4 border-t border-siru-text/10">
                <Button className="w-full bg-siru-base text-siru-text hover:bg-siru-base/80 rounded-xl py-6 border border-siru-text/5 border-dashed">
                  + URL 또는 검색어로 곡 추가
                </Button>
              </div>
            </Card>
          </div>

        </div>
      </main>
    </div>
  );
}