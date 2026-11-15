/**
 * 사용자 데이터 기능의 공개 표면 — 사용자가 직접 저장한 프로필(생일·소개)을 읽는 조회예요.
 * `/프로필`·`/개인정보` 명령과 열람·삭제 서비스는 features/user-data 안에서만 써요.
 * 다른 feature나 core는 이 파일을 통해서만 들어와요.
 */
export { getUserProfile } from './discord/utils/userProfile.ts';
