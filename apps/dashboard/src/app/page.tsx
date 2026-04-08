export default function Home() {
  return (
    <div className="container mx-auto px-6 py-8">
      <div className="max-w-4xl mx-auto text-center">
        <div className="mb-8">
          <span className="text-8xl mb-6 block" aria-hidden="true">🎵</span>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            SiruBOT Dashboard
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            디스코드 음악 봇의 통계와 인기 곡을 확인해보세요
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-3xl mx-auto">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">인기 곡 순위</h2>
            <p className="text-gray-600 text-sm mb-4">재생 횟수가 많은 곡들을 확인하세요</p>
            <a 
              href="/track" 
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
              aria-label="인기 곡 순위 보러가기"
            >
              보러가기 <span aria-hidden="true" className="ml-1">→</span>
            </a>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">샤드 모니터링</h2>
            <p className="text-gray-600 text-sm mb-4">샤드 매니저 상태를 실시간으로 확인하세요</p>
            <a 
              href="/shards" 
              className="inline-flex items-center px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700 transition-colors"
              aria-label="샤드 모니터링 보러가기"
            >
              보러가기 <span aria-hidden="true" className="ml-1">→</span>
            </a>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">서버 대시보드</h2>
            <p className="text-gray-600 text-sm mb-4">봇 설정과 서버 통계를 관리하세요</p>
            <a 
              href="/servers" 
              className="inline-flex items-center px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 transition-colors"
              aria-label="로그인하고 서버 대시보드 관리하기"
            >
              로그인하고 관리하기 <span aria-hidden="true" className="ml-1">→</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
