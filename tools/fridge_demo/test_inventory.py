import unittest
from datetime import date
from render_inventory import rows_for
class InventoryTests(unittest.TestCase):
 def test_expired_unknown_and_empty(self):
  data={'schema_version':1,'items':[{'name':'egg','qty':2,'life':2,'added_at':'2026-11-03'},{'name':'milk','qty':1,'life':5,'added_at':'2026-11-07'},{'name':'unknown','qty':1},{'name':'gone','qty':0}]}
  self.assertEqual(rows_for(data,date(2026,11,7)),[('egg',-2),('milk',5),('unknown',None)])
  self.assertEqual(rows_for({'schema_version':1,'items':[]},date.today()),[])
 def test_invalid_schema(self):
  with self.assertRaises(ValueError):rows_for({'items':[]},date.today())
if __name__=='__main__':unittest.main()
