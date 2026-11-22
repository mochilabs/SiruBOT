# Font assets

서버(카드 캔버스)와 대시보드에서 사용하는 폰트 자산이에요. 각 항목의 라이선스·출처는 대시보드 `/licenses` 페이지에도 고지돼요.

## PretendardJPVariable.ttf

- Pretendard JP (variable) v1.3.9 — 카드 캔버스에서 한글·라틴·일본어를 한 체인으로 렌더해요.
- 라이선스: SIL Open Font License 1.1 (출처: <https://github.com/orioncactus/pretendard>)
- Pretendard Variable은 Inter(라틴)와 Noto Sans KR(한글)을 서브셋팅한 폰트예요. 본체에는 일본어 한자가 없어 JP 변형을 쓰며, 여기엔 일본식 자형(桜·姫 등)까지 포함돼요.

## PretendardJP-SemiBold.subset.ttf · PretendardJP-Black.subset.ttf · PretendardJP-Regular.subset.ttf · PretendardJP-Bold.subset.ttf

- 위 PretendardJPVariable.ttf에서 `wght=600` / `wght=900` 정적 인스턴스를 뽑아 한글(가–힣)·자모·라틴·가나·기본 기호만 남긴 서브셋이에요 (각 약 2.6MB). 일본어 한자는 빠져 있어요.
- Regular(`wght=400`)와 Bold(`wght=700`)는 인사 카드 텍스트 레이어의 `weight` 단계(400/600/700/900)용이에요. 서버는 가변 폰트로 모든 굵기를 그리고, 대시보드 미리보기는 400·700 레이어가 있을 때만 이 두 파일을 받아요.
- Takumi 카드(Wrapped·프로필·now-playing·인사)용이에요. 대시보드 인사 카드 미리보기도 같은 두 파일을 `apps/dashboard/public/fonts/`에 복사해 써요 — 서브셋을 다시 만들면 두 곳을 함께 갱신해요. 서버(`@takumi-rs/core`)는 가변 폰트로 모든 굵기를 그리지만, 대시보드 미리보기(`@takumi-rs/wasm`)는 굵기별 정적 파일이 필요해서 이 서브셋을 써요. 이 서브셋엔 일본어 한자가 없어요. 라이선스는 원본과 같은 SIL OFL 1.1이에요.
- 다시 만들 때: `fonttools varLib.instancer PretendardJPVariable.ttf wght=900 -o black.ttf` → `pyftsubset black.ttf --unicodes=U+0020-007E,U+00A0-00FF,U+2010-205E,U+2190-21FF,U+25A0-26FF,U+3000-30FF,U+1100-11FF,U+3130-318F,U+AC00-D7A3,U+FF01-FF5E --layout-features=kern,liga,locl --no-hinting --desubroutinize`.

## TwemojiMozilla.ttf (COLR/CPAL)

- twemoji-colr v0.7.0 — 카드의 색 이모지 렌더와 대시보드 이모지 폴백에 써요.
- 폰트 코드: Apache License 2.0 (Copyright 2016-2018 Mozilla Foundation, <https://github.com/mozilla/twemoji-colr>)
- 이모지 아트: Twemoji by Twitter, Inc and other contributors — **CC-BY 4.0** (<https://github.com/jdecked/twemoji>). CC-BY 4.0 고지 조건은 대시보드 `/licenses` 페이지에서 이행해요.
