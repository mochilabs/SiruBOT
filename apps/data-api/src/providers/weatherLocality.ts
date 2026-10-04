/**
 * Open-Meteo 지오코딩은 영문 쿼리 + language=en 조합이 한국 지명 매칭에 안정적입니다.
 * 자주 쓰는 한국어 표기 → 영문 검색어(필요 시 ", South Korea" 포함).
 */
const KR_TO_EN_QUERY: Record<string, string> = {
	// 광역시·특별시
	서울: 'Seoul, South Korea',
	서울시: 'Seoul, South Korea',
	서울특별시: 'Seoul, South Korea',
	부산: 'Busan, South Korea',
	부산시: 'Busan, South Korea',
	부산광역시: 'Busan, South Korea',
	대구: 'Daegu, South Korea',
	대구시: 'Daegu, South Korea',
	대구광역시: 'Daegu, South Korea',
	인천: 'Incheon, South Korea',
	인천시: 'Incheon, South Korea',
	인천광역시: 'Incheon, South Korea',
	광주: 'Gwangju, South Korea',
	광주시: 'Gwangju, South Korea',
	광주광역시: 'Gwangju, South Korea',
	대전: 'Daejeon, South Korea',
	대전시: 'Daejeon, South Korea',
	대전광역시: 'Daejeon, South Korea',
	울산: 'Ulsan, South Korea',
	울산시: 'Ulsan, South Korea',
	울산광역시: 'Ulsan, South Korea',
	세종: 'Sejong, South Korea',
	세종시: 'Sejong, South Korea',
	세종특별자치시: 'Sejong, South Korea',

	// 도·특별자치
	제주: 'Jeju City, South Korea',
	제주도: 'Jeju City, South Korea',
	제주시: 'Jeju City, South Korea',
	제주특별자치도: 'Jeju City, South Korea',
	강원: 'Gangwon-do, South Korea',
	강원도: 'Gangwon-do, South Korea',
	강원특별자치도: 'Gangwon-do, South Korea',
	경기: 'Gyeonggi-do, South Korea',
	경기도: 'Gyeonggi-do, South Korea',
	충북: 'North Chungcheong, South Korea',
	충청북도: 'North Chungcheong, South Korea',
	충남: 'South Chungcheong, South Korea',
	충청남도: 'South Chungcheong, South Korea',
	전북: 'North Jeolla, South Korea',
	전라북도: 'North Jeolla, South Korea',
	전북특별자치도: 'North Jeolla, South Korea',
	전남: 'South Jeolla, South Korea',
	전라남도: 'South Jeolla, South Korea',
	경북: 'North Gyeongsang, South Korea',
	경상북도: 'North Gyeongsang, South Korea',
	경남: 'South Gyeongsang, South Korea',
	경상남도: 'South Gyeongsang, South Korea',

	// 수도권 주요 시
	수원: 'Suwon, South Korea',
	수원시: 'Suwon, South Korea',
	성남: 'Seongnam, South Korea',
	성남시: 'Seongnam, South Korea',
	고양: 'Goyang, South Korea',
	고양시: 'Goyang, South Korea',
	용인: 'Yongin, South Korea',
	용인시: 'Yongin, South Korea',
	부천: 'Bucheon, South Korea',
	부천시: 'Bucheon, South Korea',
	안산: 'Ansan, South Korea',
	안산시: 'Ansan, South Korea',
	안양: 'Anyang, South Korea',
	안양시: 'Anyang, South Korea',
	남양주: 'Namyangju, South Korea',
	남양주시: 'Namyangju, South Korea',
	화성: 'Hwaseong, South Korea',
	화성시: 'Hwaseong, South Korea',
	평택: 'Pyeongtaek, South Korea',
	평택시: 'Pyeongtaek, South Korea',
	의정부: 'Uijeongbu, South Korea',
	의정부시: 'Uijeongbu, South Korea',
	시흥: 'Siheung, South Korea',
	시흥시: 'Siheung, South Korea',
	파주: 'Paju, South Korea',
	파주시: 'Paju, South Korea',
	김포: 'Gimpo, South Korea',
	김포시: 'Gimpo, South Korea',
	광명: 'Gwangmyeong, South Korea',
	광명시: 'Gwangmyeong, South Korea',
	군포: 'Gunpo, South Korea',
	군포시: 'Gunpo, South Korea',
	하남: 'Hanam, South Korea',
	하남시: 'Hanam, South Korea',
	오산: 'Osan, South Korea',
	오산시: 'Osan, South Korea',
	이천: 'Icheon, South Korea',
	이천시: 'Icheon, South Korea',
	안성: 'Anseong, South Korea',
	안성시: 'Anseong, South Korea',
	의왕: 'Uiwang, South Korea',
	의왕시: 'Uiwang, South Korea',
	양주: 'Yangju, South Korea',
	양주시: 'Yangju, South Korea',
	구리: 'Guri, South Korea',
	구리시: 'Guri, South Korea',
	포천: 'Pocheon, South Korea',
	포천시: 'Pocheon, South Korea',
	/** 경기 광주시 (전남 광주와 구분) */
	경기광주: 'Gwangju-si, Gyeonggi-do, South Korea',
	'경기 광주': 'Gwangju-si, Gyeonggi-do, South Korea',
	경기도광주시: 'Gwangju-si, Gyeonggi-do, South Korea',

	// 서울 자치구
	강남구: 'Gangnam-gu, Seoul, South Korea',
	강동구: 'Gangdong-gu, Seoul, South Korea',
	강북구: 'Gangbuk-gu, Seoul, South Korea',
	강서구: 'Gangseo-gu, Seoul, South Korea',
	관악구: 'Gwanak-gu, Seoul, South Korea',
	광진구: 'Gwangjin-gu, Seoul, South Korea',
	구로구: 'Guro-gu, Seoul, South Korea',
	금천구: 'Geumcheon-gu, Seoul, South Korea',
	노원구: 'Nowon-gu, Seoul, South Korea',
	도봉구: 'Dobong-gu, Seoul, South Korea',
	동대문구: 'Dongdaemun-gu, Seoul, South Korea',
	동작구: 'Dongjak-gu, Seoul, South Korea',
	마포구: 'Mapo-gu, Seoul, South Korea',
	서대문구: 'Seodaemun-gu, Seoul, South Korea',
	서초구: 'Seocho-gu, Seoul, South Korea',
	성동구: 'Seongdong-gu, Seoul, South Korea',
	성북구: 'Seongbuk-gu, Seoul, South Korea',
	송파구: 'Songpa-gu, Seoul, South Korea',
	양천구: 'Yangcheon-gu, Seoul, South Korea',
	영등포구: 'Yeongdeungpo-gu, Seoul, South Korea',
	용산구: 'Yongsan-gu, Seoul, South Korea',
	은평구: 'Eunpyeong-gu, Seoul, South Korea',
	종로구: 'Jongno-gu, Seoul, South Korea',
	/** 서울 중구(타 광역시 '중구'와 혼동 방지: 서울/부산 등은 앞에 광역시명을 붙이세요) */
	서울중구: 'Jung-gu, Seoul, South Korea',
	'서울 중구': 'Jung-gu, Seoul, South Korea',
	중랑구: 'Jungnang-gu, Seoul, South Korea',

	// 기타 주요
	창원: 'Changwon, South Korea',
	창원시: 'Changwon, South Korea',
	청주: 'Cheongju, South Korea',
	청주시: 'Cheongju, South Korea',
	전주: 'Jeonju, South Korea',
	전주시: 'Jeonju, South Korea',
	천안: 'Cheonan, South Korea',
	천안시: 'Cheonan, South Korea',
	포항: 'Pohang, South Korea',
	포항시: 'Pohang, South Korea',
	울릉도: 'Ulleungdo, South Korea',
	독도: 'Dokdo, South Korea',

	// 추가적인 한국 주요 시/군/구
	김해: 'Gimhae, South Korea',
	김해시: 'Gimhae, South Korea',
	경주: 'Gyeongju, South Korea',
	경주시: 'Gyeongju, South Korea',
	군산: 'Gunsan, South Korea',
	군산시: 'Gunsan, South Korea',
	속초: 'Sokcho, South Korea',
	속초시: 'Sokcho, South Korea',
	강릉: 'Gangneung, South Korea',
	강릉시: 'Gangneung, South Korea',
	원주: 'Wonju, South Korea',
	원주시: 'Wonju, South Korea',
	춘천: 'Chuncheon, South Korea',
	춘천시: 'Chuncheon, South Korea',
	통영: 'Tongyeong, South Korea',
	통영시: 'Tongyeong, South Korea',
	거제: 'Geoje, South Korea',
	거제시: 'Geoje, South Korea',
	양산: 'Yangsan, South Korea',
	양산시: 'Yangsan, South Korea',
	김천: 'Gimcheon, South Korea',
	김천시: 'Gimcheon, South Korea',
	구미: 'Gumi, South Korea',
	구미시: 'Gumi, South Korea',
	안동: 'Andong, South Korea',
	안동시: 'Andong, South Korea',
	영주: 'Yeongju, South Korea',
	영주시: 'Yeongju, South Korea',
	상주: 'Sangju, South Korea',
	상주시: 'Sangju, South Korea',
	영천: 'Yeongcheon, South Korea',
	영천시: 'Yeongcheon, South Korea',
	문경: 'Mungyeong, South Korea',
	문경시: 'Mungyeong, South Korea',
	순천: 'Suncheon, South Korea',
	순천시: 'Suncheon, South Korea',
	나주: 'Naju, South Korea',
	나주시: 'Naju, South Korea',
	광양: 'Gwangyang, South Korea',
	광양시: 'Gwangyang, South Korea',
	익산: 'Iksan, South Korea',
	익산시: 'Iksan, South Korea',
	정읍: 'Jeongeup, South Korea',
	정읍시: 'Jeongeup, South Korea',
	남원: 'Namwon, South Korea',
	남원시: 'Namwon, South Korea',
	김제: 'Gimje, South Korea',
	김제시: 'Gimje, South Korea',
	서산: 'Seosan, South Korea',
	서산시: 'Seosan, South Korea',
	논산: 'Nonsan, South Korea',
	논산시: 'Nonsan, South Korea',
	공주: 'Gongju, South Korea',
	공주시: 'Gongju, South Korea',
	보령: 'Boryeong, South Korea',
	보령시: 'Boryeong, South Korea',
	아산: 'Asan, South Korea',
	아산시: 'Asan, South Korea',
	당진: 'Dangjin, South Korea',
	당진시: 'Dangjin, South Korea',
	동해: 'Donghae, South Korea',
	동해시: 'Donghae, South Korea',
	삼척: 'Samcheok, South Korea',
	삼척시: 'Samcheok, South Korea',
	태백: 'Taebaek, South Korea',
	태백시: 'Taebaek, South Korea',
	목포: 'Mokpo, South Korea',
	목포시: 'Mokpo, South Korea',
	여수: 'Yeosu, South Korea',
	여수시: 'Yeosu, South Korea',
	진주: 'Jinju, South Korea',
	진주시: 'Jinju, South Korea',
	밀양: 'Miryang, South Korea',
	밀양시: 'Miryang, South Korea',
	사천: 'Sacheon, South Korea',
	사천시: 'Sacheon, South Korea',
	제천: 'Jecheon, South Korea',
	제천시: 'Jecheon, South Korea',
	충주: 'Chungju, South Korea',
	충주시: 'Chungju, South Korea',
	계룡: 'Gyeryong, South Korea',
	계룡시: 'Gyeryong, South Korea',
	서귀포: 'Seogwipo, South Korea',
	서귀포시: 'Seogwipo, South Korea',
	의성: 'Uiseong, South Korea',
	의성군: 'Uiseong, South Korea',
	신안: 'Shinan, South Korea',
	신안군: 'Shinan, South Korea',
	울릉: 'Ulleung, South Korea',
	울릉군: 'Ulleung, South Korea',

	// 해외 주요 도시 (한글명)
	도쿄: 'Tokyo, Japan',
	동경: 'Tokyo, Japan',
	오사카: 'Osaka, Japan',
	교토: 'Kyoto, Japan',
	후쿠오카: 'Fukuoka, Japan',
	삿포로: 'Sapporo, Japan',
	오키나와: 'Okinawa, Japan',
	뉴욕: 'New York, USA',
	로스앤젤레스: 'Los Angeles, USA',
	LA: 'Los Angeles, USA',
	시카고: 'Chicago, USA',
	샌프란시스코: 'San Francisco, USA',
	시애틀: 'Seattle, USA',
	라스베이거스: 'Las Vegas, USA',
	라스베가스: 'Las Vegas, USA',
	워싱턴: 'Washington, D.C., USA',
	보스턴: 'Boston, USA',
	런던: 'London, UK',
	파리: 'Paris, France',
	베이징: 'Beijing, China',
	북경: 'Beijing, China',
	상하이: 'Shanghai, China',
	상해: 'Shanghai, China',
	홍콩: 'Hong Kong',
	마카오: 'Macau',
	타이베이: 'Taipei, Taiwan',
	대북: 'Taipei, Taiwan',
	방콕: 'Bangkok, Thailand',
	싱가포르: 'Singapore',
	하노이: 'Hanoi, Vietnam',
	호치민: 'Ho Chi Minh City, Vietnam',
	다낭: 'Da Nang, Vietnam',
	시드니: 'Sydney, Australia',
	멜버른: 'Melbourne, Australia',
	멜번: 'Melbourne, Australia',
	로마: 'Rome, Italy',
	밀라노: 'Milan, Italy',
	베네치아: 'Venice, Italy',
	베니스: 'Venice, Italy',
	피렌체: 'Florence, Italy',
	뮌헨: 'Munich, Germany',
	베를린: 'Berlin, Germany',
	프랑크푸르트: 'Frankfurt, Germany',
	바르셀로나: 'Barcelona, Spain',
	마드리드: 'Madrid, Spain',
	블라디보스토크: 'Vladivostok, Russia',
	블라디보스톡: 'Vladivostok, Russia',
	모스크바: 'Moscow, Russia',
	토론토: 'Toronto, Canada',
	밴쿠버: 'Vancouver, Canada',
	벤쿠버: 'Vancouver, Canada',
	상파울루: 'Sao Paulo, Brazil',
	상파울로: 'Sao Paulo, Brazil',
	부에노스아이레스: 'Buenos Aires, Argentina',
	카이로: 'Cairo, Egypt',
	케이프타운: 'Cape Town, South Africa',
	두바이: 'Dubai, UAE'
};

function stripNoise(s: string): string {
	return s
		.trim()
		.replace(/\s+/g, ' ')
		.replace(/[，、]/g, ',')
		.replace(/^,+|,+$/g, '')
		.trim();
}

function hasHangul(text: string): boolean {
	return /[가-힣]/.test(text);
}

/**
 * 사용자 입력(한글 지명 등)을 Open-Meteo 지오코딩용 영문 검색어로 바꿉니다.
 * 매핑에 없으면 원문을 그대로 둡니다(해외 도시 등).
 */
export function normalizeWeatherLocationQuery(raw: string): {
	geocodeQuery: string;
	originalQuery: string;
	mappedFromKorean: boolean;
} {
	const originalQuery = stripNoise(raw);
	if (!originalQuery) {
		return { geocodeQuery: '', originalQuery: '', mappedFromKorean: false };
	}

	const direct = KR_TO_EN_QUERY[originalQuery];
	if (direct) {
		return { geocodeQuery: direct, originalQuery, mappedFromKorean: true };
	}

	// "서울 강남구" 같이 짧게 붙인 경우
	const compact = originalQuery.replace(/\s+/g, '');
	const compactHit = KR_TO_EN_QUERY[compact];
	if (compactHit) {
		return { geocodeQuery: compactHit, originalQuery, mappedFromKorean: true };
	}

	// 접미사만 다른 경우 (특별시/광역시/특별자치시/특별자치도/시/군/구/도)
	const noMetroSuffix = originalQuery.replace(/(특별시|광역시|특별자치시|특별자치도|시|군|구|도)$/, '');
	const hit2 = KR_TO_EN_QUERY[stripNoise(noMetroSuffix)];
	if (hit2) {
		return { geocodeQuery: hit2, originalQuery, mappedFromKorean: true };
	}

	if (hasHangul(originalQuery)) {
		return {
			geocodeQuery: originalQuery,
			originalQuery,
			mappedFromKorean: false
		};
	}

	return {
		geocodeQuery: originalQuery,
		originalQuery,
		mappedFromKorean: false
	};
}
