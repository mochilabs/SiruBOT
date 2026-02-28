import { signIn } from "@/lib/auth";
import Link from "next/link";

interface LoginPageProps {
  searchParams: Promise<{ callbackUrl?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { callbackUrl } = await searchParams;
  const redirectTarget = callbackUrl || "/servers";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
        <div className="absolute -top-[30%] -left-[10%] w-[70%] h-[70%] rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 blur-3xl opacity-50" />
        <div className="absolute top-[20%] -right-[20%] w-[60%] h-[60%] rounded-full bg-gradient-to-tl from-blue-100 to-teal-100 blur-3xl opacity-50" />
      </div>

      <div className="max-w-md w-full space-y-8 bg-white/80 backdrop-blur-xl p-10 rounded-3xl shadow-2xl border border-white">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-20 w-20 rounded-full bg-indigo-50 mb-6">
            <span className="text-4xl shadow-sm">🎵</span>
          </div>
          <h2 className="mt-2 text-3xl font-extrabold text-gray-900 tracking-tight">
            SiruBOT 대시보드
          </h2>
          <p className="mt-3 text-sm text-gray-500">
            봇을 설정하고 통계를 확인하려면 디스코드 계정으로 로그인해주세요.
          </p>
        </div>

        <div className="mt-8 space-y-6">
          <form
            action={async () => {
              "use server";
              await signIn("discord", { redirectTo: redirectTarget });
            }}
          >
            <button
              type="submit"
              className="group relative w-full flex justify-center items-center py-3.5 px-4 border border-transparent text-sm font-semibold rounded-xl text-white bg-[#5865F2] hover:bg-[#4752C4] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#5865F2] transition-all duration-200 ease-in-out shadow-md hover:shadow-lg"
            >
              <svg
                className="w-5 h-5 mr-3"
                role="img"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
                fill="currentColor"
              >
                <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
              </svg>
              Discord로 계속하기
            </button>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">또는</span>
              </div>
            </div>

            <div className="mt-6 text-center">
              <Link
                href="/"
                className="font-medium text-indigo-600 hover:text-indigo-500 transition-colors"
              >
                홈으로 돌아가기
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
