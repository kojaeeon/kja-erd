# SQLite 메타데이터 입력 → ERD 가져오기

직접 작성한 테이블·컬럼 목록을 SQLite에 보관하고, 필요한 테이블만 선택해 ERD 에디터에 추가합니다.

## 1. 어느 파일에 입력하나요?

앱 서버 폴더의 **`data/erd.sqlite`** 파일입니다. 상대 경로의 기준은 `server.mjs`가 있는 폴더입니다. 다른 PC의 브라우저로 접속했다면 브라우저 PC가 아닌 서버 PC의 파일을 수정합니다.

앱을 한 번 실행하면 아래 두 테이블이 **빈 상태로 자동 생성**됩니다. 기존 프로젝트·공용 사전·저장 이력은 유지됩니다. 예제 데이터는 자동으로 넣지 않습니다.

| 저장용 테이블 | 넣을 데이터 |
| --- | --- |
| `metadata_tables` | ERD에 추가할 테이블 한 개당 한 행 |
| `metadata_columns` | 해당 테이블의 컬럼 한 개당 한 행 |

예를 들어 `APP.CUSTOMER`에 컬럼이 3개라면 첫 테이블에 1행, 두 번째 테이블에 3행을 넣습니다. 업무 테이블인 `CUSTOMER` 자체를 SQLite에 생성할 필요는 없습니다. `sqlite_master`에서 실제 테이블을 분석하는 기능이 아닙니다.

앱 실행 전에 미리 준비하려면 [생성 SQL](../src/metadata-schema.sql)을 같은 SQLite 파일에서 실행하세요. 원본 DB는 백업해 두고, DBeaver·DB Browser for SQLite 등에서 SQLite 연결로 파일을 여세요. 컬럼 추가 시 **테이블 정보부터 입력하고 커밋**하세요. SQLite 편집 도구에서도 `PRAGMA foreign_keys = ON;`을 실행하세요.

## 2. 테이블 정보: metadata_tables

| 컬럼 | 입력 규칙 | 예시 / 기본값 |
| --- | --- | --- |
| `schema_name` | 스키마. 없으면 NULL 대신 빈 문자열. 앞뒤 공백 금지 | `'APP'` / `''` |
| `table_name` | 필수 물리명. 앞뒤 공백 금지 | `'CUSTOMER'` |
| `logical_name` | 한글명. 생략하면 빈 문자열 | `'고객'` / `''` |

`schema_name + table_name`이 키입니다. 스키마가 다르면 같은 테이블명을 입력할 수 있습니다. 물리명 키의 영문 대소문자는 구분하지 않고, 입력한 표기는 ERD에 유지합니다. 대소문자만 다른 두 객체를 별도로 보관하는 방식은 지원하지 않습니다.

## 3. 컬럼 정보: metadata_columns

| 컬럼 | 필수 / 기본값 | 입력 규칙 및 예시 |
| --- | --- | --- |
| `schema_name` | 기본 `''` | 테이블 정보와 같은 스키마 |
| `table_name` | 필수 | 테이블 정보와 같은 물리명 |
| `ordinal_position` | 필수 | 1부터 시작하는 양의 정수. 테이블 안에서 중복 불가. 중간 번호가 비어도 됨 |
| `column_name` | 필수 | 컬럼 물리명. 같은 테이블 안에서 중복 불가. 앞뒤 공백 금지 |
| `logical_name` | 기본 `''` | 컬럼 한글명. 예: `'고객번호'` |
| `data_type` | 필수 | **길이·소수 자리수까지 한 문자열**. `'BIGINT'`, `'VARCHAR(100)'`, `'DECIMAL(15,2)'`, `'DATE'`, `'TIMESTAMP'` |
| `is_pk` | 기본 `0` | PK이면 `1`. 복합 PK는 해당하는 모든 컬럼을 `1`로 지정 |
| `is_nullable` | 기본 `1` | NULL 허용 `1`, NOT NULL `0`. **PK·IDENTITY는 반드시 `0`** |
| `is_unique` | 기본 `0` | 단일 컬럼 UNIQUE이면 `1`. 복합 UNIQUE는 ERD에서 인덱스로 편집 |
| `default_value` | 기본 `''` | 기본값 SQL 표현식. 없음 `''`, 숫자 `'0'`, 문자열 `'''Y'''`, 일시 `'CURRENT TIMESTAMP'` |
| `is_identity` | 기본 `0` | 자동증가이면 `1`. NOT NULL, 기본값 없음으로 설정 |
| `identity_mode` | 기본 `'BY DEFAULT'` | `'ALWAYS'` 또는 `'BY DEFAULT'`. 자동증가가 아니면 기본값 그대로 |

플래그는 `'Y'/'N'`, `'true'/'false'` 대신 **숫자 `1/0`**으로 입력합니다. 선택 항목도 명시할 때는 SQL NULL 대신 기본값을 사용하세요. DBMS별 타입과 자동증가 제약은 ERD의 대상 DBMS에 맞춰 입력하세요. 메타데이터를 가져와도 프로젝트의 DBMS 설정은 자동 변경되지 않습니다.

FK·관계선·일반 인덱스·복합 UNIQUE는 이 두 테이블로 가져오지 않습니다. 필요한 관계와 인덱스는 ERD에서 추가합니다.

## 4. 최소 입력 예제

아래 SQL을 `data/erd.sqlite`에서 실행하고 커밋합니다. 이미 같은 키가 있다면 INSERT 대신 UPDATE를 쓰세요.

```sql
PRAGMA foreign_keys = ON;
BEGIN IMMEDIATE;

INSERT INTO metadata_tables (schema_name, table_name, logical_name)
VALUES ('APP', 'CUSTOMER', '고객');

INSERT INTO metadata_columns
    (schema_name, table_name, ordinal_position, column_name,
     logical_name, data_type, is_pk, is_nullable)
VALUES
    ('APP', 'CUSTOMER', 1, 'CUSTOMER_ID', '고객번호', 'BIGINT', 1, 0),
    ('APP', 'CUSTOMER', 2, 'CUSTOMER_NAME', '고객명', 'VARCHAR(100)', 0, 0);

COMMIT;
```

이후 **SQL → SQLite 메타데이터 가져오기 → 메타데이터 조회 / 새로고침 → `APP.CUSTOMER` 체크 → 선택한 테이블 ERD에 적용**을 누릅니다. `고객` 테이블에 `고객번호`, `고객명`이 입력한 순서로 추가됩니다.

[전체 INSERT 예제](metadata-example.sql)는 고객·고객 정기점검 두 테이블과 문자열 기본값·DECIMAL·날짜·IDENTITY 입력을 포함합니다. 같은 예제를 다시 실행하면 예제 키의 값이 갱신됩니다. 예제 키에 실제 정보를 입력해 두었다면 해당 정보를 바꿀 수 있으므로 별도 테스트 데이터로 실행하세요.

### 문자열 기본값 입력

ERD에서 출력할 SQL이 `DEFAULT 'Y'`라면 SQLite에 저장할 실제 텍스트는 `'Y'`입니다.

```sql
UPDATE metadata_columns
SET default_value = '''Y'''
WHERE schema_name = 'APP' AND table_name = 'CUSTOMER' AND column_name = 'USE_YN';
```

DBeaver 데이터 편집기로 입력한다면 셀 값에 `'Y'`를 그대로 적습니다. SQL INSERT/UPDATE에서는 따옴표를 위와 같이 이스케이프합니다. 기본값은 가져오기 과정에서 실행되지 않습니다.

## 5. 조회·선택·충돌 처리

- 스키마는 정확히 일치하는 이름을 입력합니다(영문 대소문자 무관). 빈 값이면 전체 스키마입니다.
- 검색어는 테이블 물리명 또는 논리명의 부분 문자열입니다. `%`, `_`는 와일드카드가 아닌 문자로 검색합니다.
- 조회 후 원하는 테이블을 체크합니다. 처음에는 모두 미선택입니다. 전체 선택·한 테이블 선택도 지원합니다.
- 테이블별 컬럼·타입·PK·NULL·기본값 미리보기를 확인합니다. 컬럼이 없는 테이블은 오류로 표시되며 선택할 수 없습니다.
- 같은 스키마/이름이 ERD에 있으면 기본은 **건너뛰기**입니다. **기존 테이블 갱신** 또는 **이름 변경 후 추가**를 선택할 수 있습니다.
- 갱신은 기존 테이블 위치·일치 컬럼의 ID를 유지합니다. 기본적으로 메타데이터에 없는 기존 컬럼도 유지합니다. 삭제하려면 해당 삭제 옵션과 적용 미리보기를 확인하세요.
- 논리명 기본 우선순위는 메타 논리명 → 용어사전입니다. 물리명·타입이 일치하는 사전 자동 연결은 해제할 수 있습니다.
- 가져오기는 현재 ERD의 편집 작업입니다. 기존 자동 저장 대상이며, 적용 전체를 한 번에 실행 취소할 수 있습니다.
- 이후 SQLite를 수정해도 이미 추가한 ERD가 즉시 변경되지는 않습니다. 다시 조회 → 해당 테이블 선택 → 갱신을 적용하세요. ERD 수정도 메타데이터에 역저장되지 않습니다.
- 한 번에 500개 테이블·10000개 컬럼까지 조회합니다. 초과하면 검색 범위를 좁히라는 안내가 표시됩니다.

## 6. 수정·삭제·점검 SQL

```sql
-- 컬럼 논리명 / 타입 변경
UPDATE metadata_columns
SET logical_name = '고객 성명', data_type = 'VARCHAR(200)'
WHERE schema_name = 'APP' AND table_name = 'CUSTOMER' AND column_name = 'CUSTOMER_NAME';

-- 현재 입력 내용 확인
SELECT t.schema_name, t.table_name, t.logical_name AS table_logical_name,
       c.ordinal_position, c.column_name, c.logical_name AS column_logical_name,
       c.data_type, c.is_pk, c.is_nullable, c.default_value
FROM metadata_tables t LEFT JOIN metadata_columns c
  ON c.schema_name = t.schema_name AND c.table_name = t.table_name
ORDER BY t.schema_name, t.table_name, c.ordinal_position;

-- 참조 오류 확인: 정상이라면 결과 행이 없음
PRAGMA foreign_key_check;

-- 메타데이터에서 테이블 한 개 제거 (FK 설정 시 컬럼도 함께 삭제)
-- ERD에 이미 추가한 테이블은 별도로 편집/삭제해야 함
PRAGMA foreign_keys = ON;
BEGIN IMMEDIATE;
DELETE FROM metadata_columns WHERE schema_name = 'APP' AND table_name = 'CUSTOMER';
DELETE FROM metadata_tables WHERE schema_name = 'APP' AND table_name = 'CUSTOMER';
COMMIT;
```

컬럼 순서를 교환할 때 UNIQUE 오류가 나면 한 컬럼을 사용하지 않는 양의 번호(예: 99999)로 임시 변경한 뒤 다른 컬럼 번호와 차례로 교환하세요. 한 트랜잭션 안에서 완료합니다.

`database is locked`가 나오면 편집 도구에서 열린 트랜잭션을 커밋/롤백하고 다시 시도하세요. 복사본을 수정했거나 커밋하지 않으면 앱에 나타나지 않습니다. 백업은 앱과 편집 도구를 닫은 뒤 `data` 폴더 전체를 복사하는 방식이 간단합니다.
