## 데이터 분석

이 과제의 핵심은 메타데이터를 UI 탐색/겹쳐보기/리비전 추적에 최적화된 형태로 해석하고 정규화하는 것입니다. 현재 구현에서는 Zod 기반의 런타임 검증·경량 정칙화와, UI 파생 모델 생성(normalize)을 명확히 분리했습니다. 아래는 `metadata.json`을 분석하며 세운 해석 기준과, 이를 바탕으로 만든 내부 데이터 모델/인덱스 및 실제 구현 구조입니다.

### 구현 상태 요약

- 런타임 검증/정칙화(Zod)
  - 위치: `src/validation/raw.zod.ts`, `src/validation/validateMetadata.zod.ts`
  - 역할: 스키마 검증(필수/옵션/타입) + 경량 정칙화(파일 경로 `/drawings/...`, Transform 기본값)
  - 무결성 검사: key=id, parent 존재, 공종 키 화이트리스트, 리전 리비전의 `imageTransform` 필수, `relativeTo`는 경고 수준으로 알려진 이미지 집합과 비교
  - 동작 모드: 개발 모드에서 오류 시 fail-fast, 프로덕션에서 오류는 로그 후 진행(경고는 콘솔 안내)
- 파생 모델 생성(Normalize)
  - 위치: `src/data/normalizeMetadata.ts`
  - 역할: 레이어/인덱스 생성에 집중(`layersByKey`, `childrenByParent`, `referenceGroups`), 기본값/경로 변환은 수행하지 않음(Zod 결과 신뢰)
  - 단순화: `toImageTransform`/`toTransform`/`toPolygon`/`toPublicDrawingSrc` 제거, 폴리곤 매핑은 인라인 처리
  - 널 가드: non-null assertion(`!`) 사용 지양, 필요한 경우 방어적 분기

폴더/파일 구조(핵심)

- `src/validation/raw.zod.ts`: 원본 스키마(Zod) + 경량 정칙화(파일 경로/기본값)
- `src/validation/validateMetadata.zod.ts`: 무결성 검사(key/id, parent, discipline 허용, region revision transform 등), dev/prod 정책
- `src/data/loadMetadata.ts`: fetch → 검증 호출 → dev fail-fast/prod 경고 처리 → 캐시 반환
- `src/data/normalizeMetadata.ts`: 레이어/인덱스 생성. 경로/기본값 변환은 수행하지 않음(Zod 결과 신뢰)

로드 경로: `loadMetadata` → `validateMetadata`(Zod) → 정상 시 결과 반환(경고는 콘솔) → `normalizeMetadata`로 파생 모델 생성

### 원본 스키마 해석

- 프로젝트 루트: `project(name, unit)`, `disciplines[{name}]`는 공종 키의 허용 목록 역할을 함.
- 도면 단위: `drawings: Record<string, Drawing>` 구조로, 키는 도면 ID(예: "00", "01"). 각 `Drawing`은 `id`, `name`, `image`, `parent`, `position`, `disciplines`를 가짐.
- 포지션: `position.vertices`는 상위 도면 이미지 좌표계 상의 폴리곤, `position.imageTransform`은 부모 도면에 정렬하기 위한 변환(상대 기준은 `parent`가 대신하므로 `relativeTo` 불필요).
- 공종 단위: `disciplines[discipline]`는 선택적으로 `image`, `imageTransform(relativeTo)`, `polygon(vertices+polygonTransform)`, `regions`, 그리고 필수 `revisions`를 가짐.
- 리전과 리비전: `regions[region]` 아래에 리전별 `polygon`(옵션)과 `revisions`(필수). 각 리비전은 `version`, `image`, `date`, `description`, `changes`, 그리고 필요 시 `imageTransform(relativeTo)`/`polygon`을 가질 수 있음.

### 두 좌표 변환의 역할

- imageTransform: 이미지 A를 기준 이미지 B 위에 정렬하기 위한 변환. 기준은 `relativeTo`(파일명). 도면 조합마다 상이할 수 있음.
- polygonTransform: 폴리곤을 화면에 정확히 그리기 위한 렌더링 좌표계 변환. 이미지 정렬과 별개로 동작.

이 구분을 타입으로 명확히 반영해, 오버레이 정렬과 영역 하이라이트를 각각 독립적으로 제어할 수 있도록 했습니다. 구현상 `imageTransform`/`polygonTransform`의 기본값(0,0,1,0)은 Zod에서 부여되며, Normalizer는 해당 값을 그대로 사용합니다.

### 특수 케이스 처리 원칙

- 구조(101동) 리전 A/B: 리전 리비전은 구조 도면을 기준(`relativeTo=구조`)으로 정렬. 리전 레벨의 `polygon`을 리비전이 별도로 가지지 않으면 리전 기본 폴리곤을 상속.
- 주민공동시설 건축: 리비전마다 독립적인 `imageTransform`과 `polygon`을 보유(= self-contained). 공종 레벨에 공통 폴리곤/정렬이 없음.
- 폴리곤이 없는 공종: 예를 들어 기준 도면 역할을 하는 케이스(주차장 구조)는 `imageTransform`만 존재.

### 정규화 전략(내부 모델)

- 레이어 유니온: `LayerNode`를 아래 6종으로 구분해 탐색/표시/겹쳐보기를 일관되게 처리
  - `DrawingLayer`: 도면 자체
  - `DisciplineLayer`: 도면 내 공종
  - `RegionLayer`: 공종 내 리전(A/B 등)
  - `SimpleRevisionLayer`: 공종 레벨 리비전(별도 transform/polygon 없음)
  - `RegionRevisionLayer`: 리전 리비전(자체 `imageTransform` 필수, `polygon`은 리비전/리전 중 선택)
  - `SelfContainedRevisionLayer`: 리비전이 자체 `imageTransform`+`polygon`을 보유(주민공동시설 건축)
- 키 스킴: 탐색/참조/URL 직렬화를 위해 문자열 키를 사용
  - `drawing:{drawingId}` / `discipline:{drawingId}:{discipline}` / `region:{drawingId}:{discipline}:{region}` / `revision:{drawingId}:{discipline}:{region?}:{revision}`
- 탐색 인덱스
  - `childrenByParent: Record<string, string[]>`: `parent -> [childDrawingId]` 트리 탐색에 사용(정렬 보장)
  - `referenceGroups: Record<string, LayerKey[]>`: `relativeTo`(기준 이미지)별로 오버레이 가능한 후보 레이어 키 묶음
  - `layersByKey: Record<LayerKey, LayerNode>`: 뷰/네비게이션이 키로 즉시 조회 가능
  - `drawingsById: Record<string, unknown>`: 필요 시 원본 필드 접근(뷰모델 결합 최소화 목적)

### 무결성 규칙(검증 대상)

- 외형 스키마: 문서 정의와 일치(필수/선택 필드, 타입 일치)
- 참조 일관성
  - `drawings`의 레코드 키와 `Drawing.id` 일치
  - `parent`가 있으면 해당 도면이 존재
  - `disciplines`의 키가 `metadata.disciplines[].name` 허용 목록에 포함
  - 리전 리비전은 `imageTransform`(기준 도면)이 반드시 존재
- 파일 참조
  - `image`/`imageTransform.relativeTo`는 `public/drawings/` 내 파일명이며, 경로 정규화는 Zod에서 `/drawings/{filename}`으로 수행됨

실행 시에는 Zod가 즉시 검증과 기본값/경로 정규화를 담당하며, Normalizer는 파생 모델 생성만 수행합니다. 개발 모드에서는 무결성 위반 시 로딩을 즉시 중단하여 문제를 빠르게 드러내고, 프로덕션에서는 오류/경고를 콘솔로 남기고 최대한 렌더링을 진행합니다.

### 대안 데이터 표현과의 비교

- 배열 vs 레코드: 정렬은 배열이 편하지만, 탐색/참조는 레코드가 유리. 본 과제는 탐색/겹쳐보기에서 키 기반 조회가 많아 `Record<string, Drawing>`이 적합.
- Map: 반복/정렬 제어는 좋지만 JSON 직렬화/전달에 불리. 파싱 이후 내부 표현으로는 가능하나 이점이 제한적이라 채택하지 않음.
- 중첩 트리 vs 평탄화+인덱스: UI는 특정 축(도면/공종/리전/리비전)으로 빠르게 전환해야 하므로, 평탄화된 `layersByKey` + 목적별 인덱스(`childrenByParent`, `referenceGroups`) 조합이 유리. 경로/기본값 정칙화는 Normalizer가 아닌 Zod 단계에서 수행.

### 사용자 시나리오 매핑

- 최신 현황 파악/비교: 같은 `referenceGroups[relativeTo]` 내에서 동일 기준 이미지에 정렬된 리비전 후보들을 나열, `SimpleRevisionLayer`/`SelfContainedRevisionLayer`를 즉시 비교 가능.
- 공종 간 간섭 확인: 베이스 레이어(예: 건축) + 오버레이 레이어(예: 설비)를 `referenceGroups`에서 추천, `imageTransform`로 정렬하여 겹쳐보기.
- 변경 이력 추적: `discipline:{drawingId}:{discipline}` 기준으로 연결된 `revision:*` 레이어를 시계열(날짜/버전 정렬)로 탐색, 설명/변경점(`changes`) 확인.

### 한계와 개선 방향

- 검증 강화 여지: 현재 `relativeTo`는 경고 수준(알려진 이미지 집합 비교). 옵션으로 오류 승격 가능.
- 파일 존재 확인: 개발 모드에서 `/drawings/{filename}` 존재 확인(네트워크/환경 제약 고려) 기능 추가 여지.
- 버전 정렬: `REV10` > `REV2` 같은 문자열 정렬 이슈 → 접두사/규칙 파싱하여 자연 정렬 도입.
- 좌표 단위/기준: `unit(px)` 외 실좌표 지원 여지, 앵커 포인트/스냅 도구 등 정렬 보조 UX 추가.
- 테스트: 검증/정규화 유닛 테스트 추가(샘플 변형 데이터에 대한 회귀 방지).

## UI 설계 결정

- 레이아웃: 상단 네비게이션 바 + 제어 툴바 + 2열 그리드(좌 컨텍스트, 우 뷰어). 선택한 레이어의 메타(도면명/ID, 공종, 리비전)를 좌측 카드로 고정해 문맥을 유지하고, 우측은 이미지에 초점을 둠. 이 구성은 정보-작업 분리로 인지 부하를 낮추고, 향후 오버레이(비교)·타임라인 확장을 쉽게 함.
- 탐색 흐름: 모든 LayerNode를 단일 셀렉트에서 탐색. 정렬 기준은 리비전 > 공종 > 영역 > 도면 순서로, 실제 사용 빈도가 높은 최신 변경(리비전)을 상단에 배치. 라벨은 “유형 · 도면명 · 공종 · 리비전/영역” 패턴으로 일관화하여 시각적 스캔이 빠름.
- 컨텍스트 인식: 선택 시 항상 도면명/ID가 노출되며, 공종/리비전은 조건부로 표시. 최소 뷰에서는 한 단계 컨텍스트만 보여주되, 확장 시에는 Crumb(도면 > 공종 > 영역 > 리비전)으로 계층을 드러낼 계획.
- 겹쳐보기 대비(설계만 반영): `referenceGroups`(동일 relativeTo) 기반으로 베이스/오버레이 후보를 추천하고, 투명도 슬라이더를 두어 공종 간 간섭 확인을 돕는다. 현재 뷰는 단일 선택이지만, UI 구조(좌 컨텍스트/우 뷰어)는 2중 선택과 툴바 컨트롤을 쉽게 수용함.
- 변경 이력(설계만 반영): 공종 기준으로 리비전 타임라인(슬라이더 or 리스트) 제공, 날짜/버전/변경점(`changes`) 요약을 함께 표시. 현재는 리비전 단건 선택만 지원하며, 타임라인은 동일 영역/공종 필터로 확장 예정.
- 스타일 가이드: Tailwind CSS + daisyUI. 이유는 빠른 프로토타이핑(미리 정의된 컴포넌트), 일관된 테마(다크/라이트), 확장성(유틸리티 우선). 커스텀 디자인 없이도 가독성 높은 기본 UI를 확보.
- 접근성/국제화: 폼 레이블과 상태(로딩/오류)를 명시적으로 표시. 최소 뷰에서는 한국어 고정이나, 라벨/문구를 상수화해 i18n 확장 여지 확보 가능.
- 성능/반응성: 이미지 컨테이너는 스크롤 가능 영역으로 구성하여 대형 이미지도 브라우저 기본 성능을 활용해 표시. 향후에는 가상화/타일링, 프리로드, 뷰포트 기반 지연 로딩을 고려.

이러한 최소 뷰는 사용자 시나리오의 첫 관문(“빠르게 찾아보고 확인”)에 집중합니다. 이후 단계에서 오버레이 비교와 리비전 타임라인을 추가하면 “간섭 확인”과 “변경 이력 추적”까지 자연스럽게 확장됩니다.

## 원본 텍스트 (최후 제출시 삭제)

단순히 결과물을 나열하는 것이 아닌, **어떤 고민을 통해 UI를 설계했는지 그 과정**을 보여주는 것이 중요합니다. 아래 질문들에 대해 자유롭게 서술해주세요.

- **데이터 분석**: metadata.json을 어떻게 해석했나요? 데이터 구조를 어떻게 이해했나요? 더 나은 데이터 표현 방법이 있을까요?
- **접근 방식**: 전체 과제를 어떤 순서와 방식으로 해결하셨나요?
- **UI 설계 결정**:
  - 어떤 레이아웃을 선택했고, 왜 그 방식이 최선이라고 판단했나요?
  - 고려했던 대안들과 각각의 장단점은 무엇이었나요?
- **기술 선택**: 상태 관리, 스타일링 등을 어떤 기준으로 선택했나요?
- **어려웠던 점 및 개선 방안**: 과제를 수행하며 겪었던 어려움은 무엇이었고, 시간이 더 주어진다면 어떤 부분을 개선하고 싶으신가요?

**다 구현하지 못해도 제출 가능합니다. 방법론과 문제해결 과정을 더 중요하게 봅니다.**

- 미완성이어도 좋습니다. 대신 아래를 명확히 남겨주세요.
  - 미해결 문제 정의
  - 시도한 방법론
  - 시도 가능한 대안
