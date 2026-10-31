# migrations — 增量迁移（只加不删）

三份脚本对应 Phase 0 的交付，**需要在 Supabase Dashboard → SQL Editor 里手动执行**。
没有任何一行现有数据会被删除或改写。

| 文件 | 内容 | 什么时候跑 | 风险 |
|---|---|---|---|
| `001_schema.sql` | 新增 10 张表 + 给 `households` / `items` 补列 | **现在就可以跑** | 低：只加不删；给 `items` 加的是可空列与默认值 |
| `002_rls.sql` | 开 RLS、`my_households()` 家庭隔离 | **等前端接好登录之后** | 中：跑完以后「没登录的旧前端」读不到 items，演示前必须先接 Auth |
| `003_rpc.sql` | 5 个事务函数（确认采购 / 预留 / 扣减 / 取消 / 撤销） | 跟 002 一起 | 低：只建函数，不改数据 |

## 跑之前

1. Database → Backups 手动打个快照（虽然脚本不删东西）。
2. 确认 `items` 上的旧数据（266 行）全是演示数据 —— 已由你确认，因此**不回填 `household_id`**，
   它们在开 RLS 后自然对客户端不可见，但数据仍在表里。

## 跑完怎么验

```sql
-- 1) 表都在
select table_name from information_schema.tables
 where table_schema='public' order by 1;

-- 2) items 新列在，且旧数据没被动
select count(*) as rows, count(household_id) as with_hh from items;

-- 3) RLS 开了（002 之后）
select tablename, rowsecurity from pg_tables
 where schemaname='public' and tablename in
   ('items','household_members','capture_sessions','inventory_events');

-- 4) 函数在（003 之后）
select proname from pg_proc where proname in
  ('confirm_purchase','reserve_meal','complete_meal','cancel_meal','undo_event','my_households');
```

## 幂等怎么证明

```sql
-- 同一个 key 连调两次，第二次应返回 {"duplicate":true} 且不新增 inventory_events
select confirm_purchase('<session-uuid>', '[{"action":"add","cat":"egg","name":"Egg","tag":"protein","qty":1,"unit":"个","life":21}]', 'test-key-0001');
select confirm_purchase('<session-uuid>', '[]'::jsonb, 'test-key-0001');
select count(*) from inventory_events where idempotency_key like 'test-key-0001%';  -- 应为 1
```

## 已知未做

- `logs` / `pending` 仍是旧结构（不含 household_id），暂不纳入 RLS，等前端不再依赖时收口。
- `items.household`（文本家庭码）暂时保留，作为过渡期的兼容列；`household_id` 稳定后再删。
- 小票 OCR 与设备接入的 Edge Function 还没写，表结构已就位。
