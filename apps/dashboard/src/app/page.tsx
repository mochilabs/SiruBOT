import { Flex, Heading, Text, Button, Card } from '@radix-ui/themes';
import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen relative overflow-hidden bg-siru-bg">
      {/* Background Watermark/Image Placeholder */}
      <div className="absolute top-0 right-0 w-full h-full opacity-10 pointer-events-none flex justify-end items-center">
        {/* Replace with full body shot_rough_sketch when available */}
        <div className="w-[1098px] h-[1840px] bg-siru-primary rounded-full blur-[150px] transform translate-x-1/3"></div>
      </div>

      <div className="container mx-auto px-6 py-20 relative z-10">
        <Flex direction="column" align="center" justify="center" className="min-h-[60vh] text-center mb-16">
          <div className="mb-8 relative">
            <div className="w-40 h-40 rounded-[2rem] bg-siru-panel shadow-siru-glow overflow-hidden mx-auto flex items-center justify-center border-2 border-siru-primary/20">
              {/* Replace with sd_portrait_bot_profile_picture_with_hand */}
              <span className="text-6xl block">🎵</span>
            </div>
          </div>

          <Heading size="9" className="text-siru-text mb-6 tracking-tight drop-shadow-md">
            SiruBOT
          </Heading>

          <Text size="5" className="text-siru-text/80 mb-10 max-w-2xl font-medium leading-relaxed">
            당신의 디스코드 서버에 부드럽고 몽환적인 선율을 더하세요.<br />
            깔끔한 대시보드와 귀여운 기능들이 준비되어 있습니다.
          </Text>

          <Flex gap="4">
            <Button size="4" className="bg-siru-primary text-siru-bg hover:opacity-90 font-bold rounded-2xl cursor-pointer" asChild>
              <Link href="/servers">서버에 초대하기</Link>
            </Button>
            <Button size="4" variant="soft" className="bg-siru-panel text-siru-primary hover:bg-siru-panel/80 rounded-2xl cursor-pointer" asChild>
              <Link href="/servers">대시보드 로그인</Link>
            </Button>
          </Flex>
        </Flex>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          <Card className="bg-siru-panel border-0 rounded-[1.5rem] shadow-lg p-6 hover:shadow-siru-glow transition-shadow duration-300">
            <Flex direction="column" gap="3">
              <div className="w-12 h-12 rounded-xl bg-siru-base flex items-center justify-center mb-2">
                <span className="text-2xl">🏆</span>
              </div>
              <Heading size="5" className="text-siru-primary">노래 순위</Heading>
              <Text className="text-siru-text/70 mb-4 h-12">
                시루봇과 함께 가장 많이 재생된 인기 곡들을 확인해보세요.
              </Text>
              <Button variant="surface" className="text-siru-secondary bg-siru-base hover:bg-siru-base/80 rounded-xl cursor-pointer" asChild>
                <Link href="/track">순위 보러가기 →</Link>
              </Button>
            </Flex>
          </Card>

          <Card className="bg-siru-panel border-0 rounded-[1.5rem] shadow-lg p-6 hover:shadow-siru-glow transition-shadow duration-300">
            <Flex direction="column" gap="3">
              <div className="w-12 h-12 rounded-xl bg-siru-base flex items-center justify-center mb-2">
                <span className="text-2xl">⚡</span>
              </div>
              <Heading size="5" className="text-siru-primary">샤드 모니터링</Heading>
              <Text className="text-siru-text/70 mb-4 h-12">
                서버의 연결 상태와 봇의 실시간 퍼포먼스를 모니터링합니다.
              </Text>
              <Button variant="surface" className="text-siru-secondary bg-siru-base hover:bg-siru-base/80 rounded-xl cursor-pointer" asChild>
                <Link href="/shards">상태 확인하기 →</Link>
              </Button>
            </Flex>
          </Card>

          <Card className="bg-siru-panel border-0 rounded-[1.5rem] shadow-lg p-6 hover:shadow-siru-glow transition-shadow duration-300">
            <Flex direction="column" gap="3">
              <div className="w-12 h-12 rounded-xl bg-siru-base flex items-center justify-center mb-2">
                <span className="text-2xl">⚙️</span>
              </div>
              <Heading size="5" className="text-siru-primary">서버 설정</Heading>
              <Text className="text-siru-text/70 mb-4 h-12">
                웹 대시보드를 통해 봇의 설정을 쉽고 직관적으로 관리하세요.
              </Text>
              <Button variant="surface" className="text-siru-secondary bg-siru-base hover:bg-siru-base/80 rounded-xl cursor-pointer" asChild>
                <Link href="/servers">설정 관리하기 →</Link>
              </Button>
            </Flex>
          </Card>
        </div>
      </div>
    </div>
  );
}