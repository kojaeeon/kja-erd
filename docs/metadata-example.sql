-- Run src/metadata-schema.sql first (or start the app once).
-- This example is opt-in and transactional. Re-running updates only these two examples.
PRAGMA foreign_keys = ON;
BEGIN IMMEDIATE;
INSERT INTO metadata_tables (schema_name, table_name, logical_name)
VALUES ('APP', 'CUSTOMER', '고객'), ('APP', 'CUSTOMER_REVIEW', '고객 정기점검')
ON CONFLICT (schema_name, table_name) DO UPDATE SET logical_name = excluded.logical_name;

INSERT INTO metadata_columns
(schema_name, table_name, ordinal_position, column_name, logical_name, data_type,
 is_pk, is_nullable, is_unique, default_value, is_identity, identity_mode)
VALUES
('APP', 'CUSTOMER', 1, 'CUSTOMER_ID', '고객번호', 'BIGINT', 1, 0, 0, '', 0, 'BY DEFAULT'),
('APP', 'CUSTOMER', 2, 'CUSTOMER_NAME', '고객명', 'VARCHAR(100)', 0, 0, 0, '', 0, 'BY DEFAULT'),
('APP', 'CUSTOMER', 3, 'USE_YN', '사용여부', 'CHAR(1)', 0, 0, 0, '''Y''', 0, 'BY DEFAULT'),
('APP', 'CUSTOMER_REVIEW', 1, 'REVIEW_ID', '점검번호', 'BIGINT', 1, 0, 0, '', 1, 'ALWAYS'),
('APP', 'CUSTOMER_REVIEW', 2, 'CUSTOMER_ID', '고객번호', 'BIGINT', 0, 0, 0, '', 0, 'BY DEFAULT'),
('APP', 'CUSTOMER_REVIEW', 3, 'CRA_SCORE', '위험평가점수', 'DECIMAL(15,2)', 0, 1, 0, '0', 0, 'BY DEFAULT'),
('APP', 'CUSTOMER_REVIEW', 4, 'REVIEW_DATE', '점검일자', 'DATE', 0, 1, 0, '', 0, 'BY DEFAULT'),
('APP', 'CUSTOMER_REVIEW', 5, 'CREATED_AT', '등록일시', 'TIMESTAMP', 0, 0, 0, 'CURRENT TIMESTAMP', 0, 'BY DEFAULT')
ON CONFLICT (schema_name, table_name, column_name) DO UPDATE SET
 ordinal_position = excluded.ordinal_position, logical_name = excluded.logical_name,
 data_type = excluded.data_type, is_pk = excluded.is_pk, is_nullable = excluded.is_nullable,
 is_unique = excluded.is_unique, default_value = excluded.default_value,
 is_identity = excluded.is_identity, identity_mode = excluded.identity_mode;
COMMIT;

SELECT t.schema_name, t.table_name, t.logical_name AS table_logical_name,
       c.ordinal_position, c.column_name, c.logical_name AS column_logical_name,
       c.data_type, c.is_pk, c.is_nullable, c.default_value
FROM metadata_tables t JOIN metadata_columns c
  ON c.schema_name = t.schema_name AND c.table_name = t.table_name
ORDER BY t.schema_name, t.table_name, c.ordinal_position;
