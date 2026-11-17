"""Run with: python -m unittest discover -s tests -p 'test_*.py'."""
import importlib.util
import unittest
from pathlib import Path

import pandas as pd

spec = importlib.util.spec_from_file_location('db2_sync', Path(__file__).resolve().parents[1] / 'docs/db2_to_kja_erd.py')
sync_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync_module)


class JavaString:
    def __init__(self, value): self.value = value
    def __str__(self): return self.value
    def __iter__(self): return iter(self.value)
    def getClass(self): return self
    def getName(self): return 'java.lang.String'


class QueryTests(unittest.TestCase):
    def test_callback_aliases_and_java_strings(self):
        sync = sync_module.Db2ToKjaErd('unused.sqlite', query_df=lambda *_: pd.DataFrame(
            [[JavaString('APP'), JavaString('CUSTOMER'), JavaString('고객')]],
            columns=[' TABSCHEMA ', 'TABNAME', 'LOGICAL_NAME']))
        tables = sync._query('', ())
        self.assertEqual(list(tables.columns), sync_module.TABLE_FIELDS)
        self.assertEqual(tables.iloc[0].tolist(), ['APP', 'CUSTOMER', '고객'])
        self.assertIsInstance(tables.iloc[0]['table_name'], str)

    def test_cursor_converts_before_dataframe_and_preserves_numbers(self):
        class Cursor:
            description = [('TABNAME',), ('ORDINAL_POSITION',), ('DEFAULT_VALUE',)]
            closed = False
            def execute(self, *_): pass
            def fetchall(self): return [(JavaString('CUSTOMER'), 1, None)]
            def close(self): self.closed = True
        cursor = Cursor()
        class Connection:
            def cursor(self): return cursor
        sync = sync_module.Db2ToKjaErd('unused.sqlite', connection=Connection())
        result = sync._query('', ())
        self.assertEqual(result.iloc[0].tolist(), ['CUSTOMER', 1, None])
        self.assertTrue(cursor.closed)

    def test_duplicate_normalized_labels_are_rejected(self):
        sync = sync_module.Db2ToKjaErd('unused.sqlite', query_df=lambda *_: pd.DataFrame(columns=['TABNAME', 'TABLE_NAME']))
        with self.assertRaisesRegex(ValueError, '중복'):
            sync._query('', ())

    def test_missing_fields_report_actual_columns(self):
        sync = sync_module.Db2ToKjaErd('unused.sqlite', query_df=lambda *_: pd.DataFrame({'wrong': ['x']}))
        with self.assertRaisesRegex(ValueError, '실제 컬럼'):
            sync.fetch_metadata('APP', ['CUSTOMER'])


if __name__ == '__main__': unittest.main()
