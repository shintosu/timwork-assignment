## 데이터 분석

이 과제의 핵심은 메타데이터를 UI 탐색/겹쳐보기/리비전 추적에 최적화된 형태로 해석하고 정규화하는 것입니다. 아래는 `metadata.json`을 분석하며 세운 해석 기준과, 이를 바탕으로 만든 내부 데이터 모델/인덱스입니다.

### 원본 스키마 해석

- 프로젝트 루트: `project(name, unit)`, `disciplines[{name}]`는 공종 키의 허용 목록 역할을 함.
- 도면 단위: `drawings: Record<string, Drawing>` 구조로, 키는 도면 ID(예: "00", "01"). 각 `Drawing`은 `id`, `name`, `image`, `parent`, `position`, `disciplines`를 가짐.
- 포지션: `position.vertices`는 상위 도면 이미지 좌표계 상의 폴리곤, `position.imageTransform`은 부모 도면에 정렬하기 위한 변환(상대 기준은 `parent`가 대신하므로 `relativeTo` 불필요).
- 공종 단위: `disciplines[discipline]`는 선택적으로 `image`, `imageTransform(relativeTo)`, `polygon(vertices+polygonTransform)`, `regions`, 그리고 필수 `revisions`를 가짐.
- 리전과 리비전: `regions[region]` 아래에 리전별 `polygon`(옵션)과 `revisions`(필수). 각 리비전은 `version`, `image`, `date`, `description`, `changes`, 그리고 필요 시 `imageTransform(relativeTo)`/`polygon`을 가질 수 있음.

### 두 좌표 변환의 역할

- imageTransform: 이미지 A를 기준 이미지 B 위에 정렬하기 위한 변환. 기준은 `relativeTo`(파일명). 도면 조합마다 상이할 수 있음.
- polygonTransform: 폴리곤을 화면에 정확히 그리기 위한 렌더링 좌표계 변환. 이미지 정렬과 별개로 동작.

이 구분을 타입으로 명확히 반영해, 오버레이 정렬과 영역 하이라이트를 각각 독립적으로 제어할 수 있도록 했습니다.

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
  - `drawingsById: Record<string, Raw>`: 필요 시 원본 필드 접근(과도한 결합 방지 위해 `unknown` 유지)

### 무결성 규칙(검증 대상)

- 외형 스키마: 문서 정의와 일치(필수/선택 필드, 타입 일치)
- 참조 일관성
  - `drawings`의 레코드 키와 `Drawing.id` 일치
  - `parent`가 있으면 해당 도면이 존재
  - `disciplines`의 키가 `metadata.disciplines[].name` 허용 목록에 포함
  - 리전 리비전은 `imageTransform`(기준 도면)이 반드시 존재
- 파일 참조
  - `image`/`imageTransform.relativeTo`는 `public/drawings/` 내 파일명이며, 정규화 시 `/drawings/{filename}`으로 경로 정규화

실행 시에는 우선 정규화가 안전하게 동작하도록 디폴트 값(fallback transform 등)을 두고, 추후 zod로 값 검증 및 기본값 할당 등을 진행할 예정입니다.

### 대안 데이터 표현과의 비교

- 배열 vs 레코드: 정렬은 배열이 편하지만, 탐색/참조는 레코드가 유리. 본 과제는 탐색/겹쳐보기에서 키 기반 조회가 많아 `Record<string, Drawing>`이 적합.
- Map: 반복/정렬 제어는 좋지만 JSON 직렬화/전달에 불리. 파싱 이후 내부 표현으로는 가능하나 이점이 제한적이라 채택하지 않음.
- 중첩 트리 vs 평탄화+인덱스: UI는 특정 축(도면/공종/리전/리비전)으로 빠르게 전환해야 하므로, 평탄화된 `layersByKey` + 목적별 인덱스(`childrenByParent`, `referenceGroups`) 조합이 유리.

### 사용자 시나리오 매핑

- 최신 현황 파악/비교: 같은 `referenceGroups[relativeTo]` 내에서 동일 기준 이미지에 정렬된 리비전 후보들을 나열, `SimpleRevisionLayer`/`SelfContainedRevisionLayer`를 즉시 비교 가능.
- 공종 간 간섭 확인: 베이스 레이어(예: 건축) + 오버레이 레이어(예: 설비)를 `referenceGroups`에서 추천, `imageTransform`로 정렬하여 겹쳐보기.
- 변경 이력 추적: `discipline:{drawingId}:{discipline}` 기준으로 연결된 `revision:*` 레이어를 시계열(날짜/버전 정렬)로 탐색, 설명/변경점(`changes`) 확인.

### 한계와 개선 방향

- 런타임 검증: Zod 스키마로 무결성 검증을 추가(키/ID 일치, parent 존재, 공종 키 유효성, 리전 리비전 transform 필수 등). 개발 모드에만 강제하여 사용자 경험 저하 방지.
- 파일 존재 확인: 선택적으로 개발 모드에서 `/drawings/{filename}` HEAD 체크(네트워크/환경 제약 고려).
- 버전 정렬: `REV10` > `REV2` 같은 문자열 정렬 이슈 → 접두사/규칙 파싱하여 자연 정렬 도입.
- 좌표 단위/기준: `unit(px)` 외 실좌표 지원 여지, 앵커 포인트/스냅 도구 등 정렬 보조 UX 추가.

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
