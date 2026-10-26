# Tripline

날짜별 동선을 지하철 노선도처럼 짜는 여행 플래너입니다. 장소를 검색해 1일차, 2일차에 넣으면 지도 위에 그날의 경로가 그려지고, 다녀온 곳은 역(동그라미)을 눌러 체크합니다.

여행을 만들 때 **국내 / 해외**를 고르면 지도가 알아서 바뀌어요.

| | 국내 여행 | 해외 여행 |
| --- | --- | --- |
| 지도, 장소 검색 | 카카오맵 | 구글 지도 |
| 이동시간 계산 | 카카오 (자동차, 대중교통, 도보, 자전거) | 구글 Routes |
| 비용 | 무료 한도 안에서는 0원. 결제 수단을 연결하지 않으면 요금이 나갈 수 없음 | 월 무료 한도가 있고, 결제 계정(카드) 연결이 필수 |

## 기능

- **여행 여러 개**: 왼쪽 사이드바에 쌓이고, 새 여행은 맨 위에 올라가요. 손잡이를 끌어 순서를 바꿀 수 있어요. 여행마다 D-day와 방문 진행률이 보여요.
- **날짜별 일정**: 날짜를 늘리거나 지울 수 있어요. 날짜를 지우면 그날의 장소는 보관함으로 옮겨져요.
- **장소 추가**: 검색으로 추가하거나 지도를 눌러 바로 추가해요. 국내 여행은 지도에서 원하는 곳을 누르면 그 위치의 주소로 추가되고, 해외 여행은 가게나 명소 아이콘을 누르면 돼요. 위치 없이 이름만 넣을 수도 있어요(예: “호텔 체크인”).
- **노선도 화면**: 장소 순서는 끌어서 바꾸고, 다른 날로 옮기고, 시간과 메모를 적어요. 역을 누르면 방문 완료로 표시돼요.
- **이동 시간과 거리**: 날마다 대중교통, 자동차, 도보, 자전거 중에서 이동 수단을 골라요. 국내 대중교통은 요금과 환승 횟수도 보여요. 경로가 없는 구간은 점선 직선과 직선 거리로 표시해요.
- **보관함**: 아직 날짜를 정하지 않은 가고 싶은 곳을 모아 둬요.
- **준비물 체크리스트**: 여행마다 따로 관리하고, 기본 준비물 8개를 한 번에 넣을 수 있어요.
- **공유/내보내기**: 인쇄하거나 PDF로 저장하고, 구간을 카카오맵이나 구글 지도 길찾기로 열 수 있어요. 여행은 JSON 파일로 내보내거나 가져올 수 있어요.
- **로그인과 클라우드 저장**: Supabase로 로그인하면 여러 기기에서 같은 일정을 써요. Supabase를 설정하지 않으면 로그인 없이 이 브라우저에만 저장하는 **로컬 모드**로 실행돼요.

## 빠른 시작

Node.js **20.19 이상**(또는 22.12 이상)이 필요해요. 터미널에서 `node -v`로 확인하세요.

```bash
cd "/Users/hyeongjun/Desktop/JJJunny_/Travel Plan"
cp .env.example .env   # 키를 적을 .env 파일 만들기 (처음 한 번)
npm install
npm run dev
```

브라우저에서 http://localhost:5173 을 열면 돼요. 키를 넣기 전에도 일정, 체크, 준비물은 바로 쓸 수 있고, 지도 자리에는 설정 안내가 보여요.

키는 프로젝트 폴더의 `.env` 파일에 적어요. 값을 바꾼 뒤에는 개발 서버를 껐다 켜야(`Ctrl + C` 후 `npm run dev`) 반영돼요.

```env
VITE_KAKAO_JS_KEY=카카오_JavaScript_키
KAKAO_REST_API_KEY=카카오_REST_API_키
VITE_GOOGLE_MAPS_API_KEY=구글_키
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxx
```

국내 여행만 쓸 거라면 카카오 키 두 개만 넣어도 돼요.

---

## 카카오맵 설정 (국내 여행)

1. **앱 만들기**: [카카오디벨로퍼스](https://developers.kakao.com/console/app)에 카카오 계정으로 로그인하고 앱을 새로 만들어요(앱 이름 예: `Tripline`).
2. **카카오맵 켜기**: 앱 관리 페이지에서 **[앱] > [제품 설정] > [카카오맵]**으로 가서 **[사용 설정]**의 상태를 **ON**으로 바꿔요. 별도 신청이나 심사는 없어요.
3. **도메인 등록**: **[앱] > [플랫폼 키] > [JavaScript 키] > [JavaScript SDK 도메인]**에 `http://localhost:5173`을 등록해요. 나중에 배포하면 배포 주소도 추가해요(최대 10개).
4. **키 복사**: 같은 **[플랫폼 키]** 화면에서
   - **JavaScript 키**는 `.env`의 `VITE_KAKAO_JS_KEY`에,
   - **REST API 키**는 `.env`의 `KAKAO_REST_API_KEY`에 넣어요.
5. 개발 서버를 다시 켜면, 국내 여행에서 카카오 지도와 장소 검색, 이동시간 계산이 동작해요.

### 무료 한도

| 기능 | 하루 무료 |
| --- | --- |
| 지도 표시 | 300,000건 |
| 장소 검색 | 100,000건 |
| 자동차 경로 | 10,000건 |
| 대중교통 경로 | 1,000건 |
| 도보 경로 | 1,000건 |
| 자전거 경로 | 1,000건 |

- 무료 한도는 **개발자 계정마다 카카오맵을 처음 켠 앱 1개**에만 줘요. 다른 앱에서 카카오맵을 먼저 켰다면 그 앱의 키를 쓰세요.
- 비즈월렛(결제 수단)을 연결하지 않았다면 한도를 넘어도 요금이 나가지 않아요. 그날은 오류(429)가 나고 다음 날 다시 돼요.
- 같은 구간은 브라우저에 14일 동안 저장해 두고 다시 계산하지 않아요.
- 출처: [카카오 쿼터](https://developers.kakao.com/docs/latest/ko/getting-started/quota), [카카오맵 무료 쿼터 운영 방식 안내](https://devtalk.kakao.com/t/api-notice-on-new-kakao-map-api-features-and-free-quota-policy/150222)

### 왜 REST API 키에는 `VITE_`가 없나요

`VITE_`로 시작하는 값은 브라우저로 그대로 전달돼서 누구나 볼 수 있어요. JavaScript 키는 등록한 도메인에서만 동작하니 괜찮지만, REST API 키는 어디서든 쓸 수 있어서 숨겨야 해요. 그래서 경로 계산은 서버에서 해요.

- **개발 중**: `npm run dev`로 켠 개발 서버가 `/api/kakao-route`로 대신 카카오에 요청해요(`vite.config.ts`).
- **배포 후**: Supabase Edge Function `kakao-route`가 같은 일을 해요. 아래 “배포” 참고.

두 곳이 같은 코드(`supabase/functions/_shared/kakao-route.ts`)를 써요.

---

## 구글 지도 API 키 발급 (해외 여행)

1. **프로젝트 만들기**: [Google Cloud 콘솔](https://console.cloud.google.com/)에 로그인하고, 위쪽 프로젝트 선택 메뉴에서 **새 프로젝트**를 만들어요(예: `tripline`).
2. **결제 계정 연결**: 왼쪽 메뉴 **결제**에서 카드를 등록해 결제 계정을 연결해요. 구글 지도 API는 결제 계정이 있어야 동작해요. API마다 매달 무료 사용량이 있어서 혼자 쓰는 정도면 보통 무료 범위 안이에요. 정확한 한도는 [가격 안내](https://developers.google.com/maps/billing-and-pricing/pricing)에서 확인하세요.
3. **API 사용 설정**: **API 및 서비스 > 라이브러리**에서 아래 세 가지를 검색해 각각 **사용**을 눌러요.
   - **Maps JavaScript API**: 지도 표시
   - **Places API (New)**: 장소 검색과 장소 정보. 이름 끝에 “(New)”가 붙은 것을 골라야 해요.
   - **Routes API**: 구간별 이동 시간, 거리, 경로
4. **키 만들기**: **API 및 서비스 > 사용자 인증 정보 > 사용자 인증 정보 만들기 > API 키**를 눌러 키를 복사해요.
5. **키 제한(중요)**: 만든 키를 눌러 아래처럼 제한해요. 브라우저에서 쓰는 키는 누구나 볼 수 있으니 꼭 걸어 두세요.
   - **애플리케이션 제한사항**: `웹사이트` 선택 후 `http://localhost:5173/*` 추가. 배포하면 배포 주소도 추가해요.
   - **API 제한사항**: `키 제한` 선택 후 위의 세 API만 체크해요.
6. **요금 안전장치**: **API 및 서비스 > (각 API) > 할당량**에서 하루 요청 수 상한을 낮춰 두면(예: 300건), 한도를 넘었을 때 요금 대신 요청이 막혀요. **결제 > 예산 및 알림**에 예산 알림도 걸어 두세요.
7. **`.env`에 넣기**: `VITE_GOOGLE_MAPS_API_KEY=복사한키`를 적고 개발 서버를 다시 켜요.
8. **(선택) Map ID**: 비워 두면 개발용 `DEMO_MAP_ID`를 써요. 지도 스타일을 바꾸고 싶으면 **Google Maps Platform > 지도 관리**에서 JavaScript용 Map ID를 만들어 `VITE_GOOGLE_MAP_ID`에 넣어요.

키가 잘못됐거나 제한 주소가 빠져 있으면 지도 자리에 “구글 지도 API 키를 확인해 주세요”가 떠요. 브라우저 개발자 도구 콘솔에 `RefererNotAllowedMapError`, `ApiNotActivatedMapError` 같은 원인 이름이 함께 나와요.

---

## Supabase 설정 (로그인 + 클라우드 저장)

1. [supabase.com](https://supabase.com)에서 가입하고 **New project**를 만들어요. 지역은 `Northeast Asia (Seoul)`이 가까워요. 데이터베이스 비밀번호는 따로 보관해 두세요.
2. **SQL Editor**를 열고 이 폴더의 `supabase/schema.sql` 내용을 전부 붙여넣은 뒤 **Run**을 눌러요. 표 4개(`trips`, `trip_days`, `stops`, `checklist_items`)와, 자기 데이터만 보이게 하는 보안 규칙(RLS)이 만들어져요. 여러 번 실행해도 안전해서, 예전 버전을 실행했다면 다시 실행하면 국내/해외 칸(`region`)이 추가돼요.
3. **Project Settings > API Keys**에서 **Project URL**과 **Publishable key**를 복사해 `.env`의 `VITE_SUPABASE_URL`과 `VITE_SUPABASE_PUBLISHABLE_KEY`에 넣어요. 예전 프로젝트라 `anon` 키만 보이면 그 값을 넣어도 돼요. **`service_role`이나 secret 키는 절대 넣지 마세요.**
4. **Authentication > URL Configuration**에서 **Site URL**을 `http://localhost:5173`으로 바꾸고, 배포하면 배포 주소도 **Redirect URLs**에 추가해요. 가입 인증 메일의 링크가 이 주소로 돌아와요.
5. 개발 중에 인증 메일이 번거로우면 **Authentication > Sign In / Providers > Email**에서 **Confirm email**을 꺼도 돼요. 이렇게 하면 가입하자마자 바로 로그인돼요.
6. 개발 서버를 다시 켜면 로그인 화면이 나와요.

> Supabase 무료 플랜 프로젝트는 일정 기간 쓰지 않으면 일시 중지될 수 있어요. 대시보드에서 다시 켜면 데이터는 그대로예요.

### 로컬 모드에서 만든 여행을 클라우드로 옮기기

1. Supabase를 연결하기 전에, 로컬 모드에서 여행마다 **⋯ > JSON 파일로 내보내기**를 해요.
2. Supabase를 연결하고 로그인해요.
3. 사이드바 아래 **JSON 파일에서 여행 가져오기**로 파일을 올려요.

---

## 사용법

| 하고 싶은 것 | 방법 |
| --- | --- |
| 여행 만들기 | 사이드바 **새 여행**에서 국내/해외를 고르고, 시작일과 종료일을 넣으면 날짜 수만큼 일차가 생겨요 |
| 국내/해외 바꾸기 | 여행 제목 옆 연필(여행 정보 수정)에서 바꿔요. 장소는 그대로 두고 지도만 바뀌어요 |
| 여행 순서 바꾸기 | 사이드바 카드에 마우스를 올리면 오른쪽 아래에 손잡이가 나와요. 끌어서 옮겨요 |
| 장소 추가 | 일정 탭의 검색창, 또는 지도를 눌러 나온 카드에서 **N일차에 추가** |
| 방문 체크 | 노선의 번호 동그라미를 눌러요. 다시 누르면 취소돼요 |
| 순서 변경 | 장소 오른쪽 손잡이를 끌어요 |
| 다른 날로 옮기기 | 장소 이름을 눌러 펼친 뒤 **날짜** 선택 |
| 이동 수단 | 날짜 머리의 대중교통, 자동차, 도보, 자전거 |
| 구간 길찾기 | 구간 정보 오른쪽의 **카카오** 또는 **구글** 링크 |
| 전체 일정 보기 | 지도 왼쪽 위 **전체 일정**. 날짜별 색으로 모든 장소가 보여요 |
| 인쇄 / PDF | 여행 제목 옆 **⋯ > 인쇄 또는 PDF로 저장**. 인쇄 창에서 대상을 “PDF로 저장”으로 바꿔요 |

---

## 폴더 구조

```
Travel Plan/
├─ index.html
├─ vite.config.ts          ← 개발 서버 + 카카오 경로 프록시(/api/kakao-route)
├─ .env                    ← .env.example을 복사해 만들고 키를 적는 곳 (git에 올라가지 않음)
├─ .env.example
├─ supabase/
│  ├─ schema.sql           ← Supabase SQL Editor에서 실행
│  └─ functions/
│     ├─ _shared/kakao-route.ts   ← 카카오 경로 계산 (개발 서버와 Edge Function이 같이 씀)
│     └─ kakao-route/index.ts     ← 배포용 Edge Function
└─ src/
   ├─ App.tsx              ← 화면 배치, 로그인 분기, 국내/해외에 따라 지도 선택
   ├─ config.ts            ← .env 읽기
   ├─ styles.css           ← 디자인 (노선도 스타일은 "노선도" 섹션)
   ├─ lib/
   │  ├─ types.ts          ← Trip(region 포함), TripDay, Stop, ChecklistItem 타입
   │  ├─ store.tsx         ← 데이터 변경 함수 모음 (화면 먼저 바꾸고 저장은 순서대로)
   │  ├─ backend.ts        ← 로컬 저장 / Supabase 저장
   │  ├─ legs.tsx          ← 구간별 이동시간 계산(카카오/구글)과 캐시
   │  ├─ kakao.ts          ← 카카오 SDK 불러오기, 경로 프록시 호출, 카카오맵 링크
   │  ├─ supabase.ts
   │  └─ utils.ts          ← 날짜, 거리, 구글/카카오 길찾기 링크
   └─ components/
      ├─ Sidebar.tsx       ← 여행 목록 (끌어서 정렬)
      ├─ Itinerary.tsx     ← 날짜 줄, 날짜 머리, 노선도 목록
      ├─ PlaceSearch.tsx   ← 장소 검색 (카카오 / 구글)
      ├─ KakaoMapView.tsx  ← 국내 지도
      ├─ MapView.tsx       ← 해외 지도 (구글)
      ├─ mapShared.tsx     ← 두 지도가 같이 쓰는 노선 계산, 안내 화면
      ├─ Checklist.tsx     ← 준비물
      ├─ TripDialog.tsx    ← 여행 만들기 / 수정 (국내/해외 선택)
      ├─ AuthScreen.tsx    ← 로그인 / 회원가입
      ├─ PrintView.tsx     ← 인쇄용 일정표
      └─ ui.tsx            ← 모달, 메뉴, 토스트
```

## 배포

`npm run build`를 실행하면 `dist/` 폴더에 정적 파일이 생겨요. Vercel이나 Netlify에 올릴 때는

1. 환경 변수 중 `VITE_`로 시작하는 것들을 배포 서비스 설정에 똑같이 넣어요. `KAKAO_REST_API_KEY`는 넣지 않아요(아래 3번에서 Supabase에 넣어요).
2. 배포 주소를 카카오 **JavaScript SDK 도메인**, 구글 키의 **웹사이트 제한**, Supabase의 **Site URL / Redirect URLs**에 추가해요.
3. 국내 경로 계산용 Edge Function을 올려요. Supabase 로그인이 켜져 있어야 하고, 로그인한 사용자만 호출할 수 있어요.

   ```bash
   npx supabase login
   npx supabase link --project-ref 프로젝트_REF   # 대시보드 주소의 /project/ 뒤 값
   npx supabase secrets set KAKAO_REST_API_KEY=카카오_REST_API_키
   npx supabase functions deploy kakao-route
   ```

## 기술 스택

React 19, TypeScript, Vite 8, 카카오 지도 Web SDK와 카카오 길찾기 REST API, [@vis.gl/react-google-maps](https://visgl.github.io/react-google-maps/) (Maps JavaScript API의 Places / Routes 라이브러리), Supabase(Auth + Postgres + RLS + Edge Functions), dnd-kit, lucide-react.
