# 待批准的测试部署范围

本文件不是部署授权。当前没有执行云端操作。

目标：独立Supabase测试项目，不使用生产家庭数据。项目地址/项目编号尚未指定。

批准后才执行：

1. 核对测试项目已有 households、household_members、devices 结构与当前仓库一致。
2. 执行 migrations/013_pebble_sessions.sql、014_pebble_phone.sql、015_pebble_phone_action.sql。新增 pebble_sessions 表及4个 pebble_* 手机RPC，不改库存表、不调用扣库存RPC。
3. 部署 supabase/functions/device-api；仅该函数使用自定义设备认证（verify_jwt=false），其他函数不变。服务器从环境读取service-role，旋钮不接收Supabase key。
4. 用两个测试家庭验证匿名拒绝、跨家庭拒绝、实际JWT/PostgREST、并发旧revision；无真实食材数据。
5. 测试通过后才为实物登记独立设备密钥、配置本地根证书及接口地址、烧录并用一份已覆盖字库的菜谱验证。

不包含：部署GitHub Pages、推送Git、修改现有库存逻辑、购买服务、向他人发消息。

限制：设备登记目前为开发接口，尚没有最终用户六位配对码界面。此轮仅用于测试联调。
