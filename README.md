# 건설 도면 탐색 프로토타입 (timwork-assignment)

도면 메타데이터를 정규화/검증하고, 사용자가 원하는 레이어(도면/공종/영역/리비전)를 빠르게 찾아 이미지를 확인하는 최소 뷰를 제공합니다.

github 링크 : https://github.com/shintosu/timwork-assignment

## 실행 방법

```bash
npm install
npm run dev
```

브라우저에서 표시된 로컬 주소로 접속하세요.

## 기술 스택

- React 19 + TypeScript
- Vite
- Tailwind CSS v4 + daisyUI
- Zod (런타임 스키마 검증/경량 정칙화)

## 구현 기능

- 메타데이터 로드/검증: `loadMetadata` → `validateMetadata`(Zod)로 스키마 검증·기본값/경로 정칙화, 무결성 체크(dev: 실패 시 중단, prod: 경고/오류 로그)
- 정규화와 인덱스: `normalizeMetadata`가 레이어/탐색 인덱스(`layersByKey`, `childrenByParent`, `referenceGroups`) 생성
- 레이어 탐색: 모든 레이어를 단일 셀렉트로 탐색(정렬: 리비전 > 공종 > 영역 > 도면)
- 이미지 표시: 선택 레이어의 도면 이미지를 카드에 맞춰 렌더링(컨테이너 스크롤)
- 컨텍스트 인식: 도면명/ID, 공종, 리비전/발행일 표시
- 로딩/에러 UX: daisyUI 스피너/알림으로 상태 피드백

## 미완성 기능(향후 확장 계획)

- 오버레이 비교: 베이스/오버레이 2중 선택 + 투명도 슬라이더, `referenceGroups` 기반 후보 추천
- 리비전 타임라인: 공종/영역 기준의 버전 스크러빙, `changes` 요약 표시
- URL 상태 동기화: 선택 레이어 key를 쿼리스트링으로 유지/공유
- 추가 검증: 개발 모드에서 `/drawings/{filename}` 존재 확인(옵션)

## 폴더 안내(핵심)

- `src/validation/raw.zod.ts`: Zod 스키마 + 경량 정칙화(파일 경로/Transform 기본값)
- `src/validation/validateMetadata.zod.ts`: 무결성 검사(key=id, parent, discipline 허용, region revision transform 등), dev/prod 정책
- `src/data/loadMetadata.ts`: fetch → 검증 호출 → dev fail-fast/prod 경고 처리 → 캐시 반환
- `src/data/normalizeMetadata.ts`: 레이어/인덱스 생성(Zod 결과 신뢰, 기본값/경로 변환 없음)
- `src/App.tsx`: 최소 뷰(레이어 선택, 컨텍스트, 이미지 뷰어)

## 참고

- 디자인/설계 의사결정은 DESIGN.md에 정리되어 있습니다.
