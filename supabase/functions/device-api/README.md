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
