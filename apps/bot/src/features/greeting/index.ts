/**
 * 멤버 입퇴장 인사 기능의 공개 표면. 다른 feature나 core/services는 이 파일을 통해서만 들어와요.
 * (Sapphire 리스너는 features/greeting/discord 아래에서 스토어가 직접 읽어요.)
 */
export { MemberGreetingService } from './application/memberGreetingService.ts';
