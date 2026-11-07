# Device API draft — 未部署

先审查并运行 013_pebble_sessions.sql，再部署函数；本次没有执行以上动作。
设备使用独立随机 32 字节 secret（64 位十六进制字符串）；devices.secret_hash 保存该字符串 UTF-8 编码的 SHA-256 十六进制摘要。
设备绝不持有 Supabase anon 或 service-role key。service-role 仅从函数服务器环境读取。

GET /device-api/state?device_id=UUID
POST /device-api/action?device_id=UUID
两者均要求 x-device-secret 请求头。
POST 内容：session_id、revision、action，set_step 另需 step_index。
返回 409 时先重新读取状态；不得在未知结果时自动把 toggle_timer 重发为新 revision。

函数必须配置为 verify_jwt=false（设备使用自己的认证），目前没有改全局配置。
手机会话创建、配对、取消、中文显示、ESP32 HTTPS 轮询仍待实现，因此接口当前尚不能形成完整手机同步。
不创建通用服务角色写入口，不调用任何库存 RPC。
上线前还需请求限流、部署环境数据库隔离/并发测试和设备 TLS 校验；POST 在读取后检查 2KB，平台层仍需请求体上限。

## 冰箱只读库存接口（新增源码，未部署）
GET /device-api/inventory?device_id=UUID，仍需x-device-secret。家庭只取认证设备的household_id，不接受查询参数指定家庭；只返回该家庭未删除且qty>0的最多500行，显式白名单id/name/qty/unit/life/added_at/days_left。无做饭会话也可读取，不调用任何库存写入。超过500行时当前为有上限的快照，不能宣称全量库存。
返回schema_version=1、generated_at UTC及items。未知设备/错误secret返回401；数据读取失败503，不伪装空库存。设备绑定及secret必须由已认证的家庭管理流程创建，不能复用另一家庭或隔离测试项目的设备凭证。
电脑侧 tools/fridge_demo/render_inventory.py 接受此JSON，按Asia/Shanghai日期计算剩余天数，负数保留、未知日期明确标识，生成400x300 PNG/15000字节bin/InventoryPage.local.h。bit1为黑，供drawBitmap使用，不可直接当面板原始RAM数据。快照标时间，不代表实时同步。原始JSON和生成快照可能包含私人库存，应放仓库外；不要上传GitHub。
本轮仅源码和本地测试；未部署函数、未创建真实家庭设备、未读取用户真实库存，ESP32仍运行已验收离线演示。下一步需确认正式Supabase项目及对应家庭的设备配对，随后接入TLS下载/缓存；当前不存在端到端真实库存同步。
