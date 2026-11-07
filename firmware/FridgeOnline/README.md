# FridgeOnline：自动联网固件

## 已确定硬件
ESP32-C3 / AirM2M_CORE_ESP32C3，4MB，COM4。Z96自定义驱动；SCK2 MOSI3 CS7 DC6 RST10 BUSY0，高电平忙；SPI1MHz；reset2ms；rotation2+mirror。GPIO4/5/13上拉低电平按下，40ms去抖。

## 行为
每5分钟用独立设备身份从HTTPS fridge-frame接口获取15000字节位图。严格验证TLS证书、画面格式、长度和SHA256；禁止重定向。ETag/304用于跳过未变化画面。失败每30秒重试，保留内存及原有屏幕画面，不显示空白替代。GPIO4切换库存/状态，GPIO5请求同步（至少30秒一次），GPIO13切换库存/状态。全刷结束后至少15秒才再次刷新；刷新期间驱动阻塞、暂不采集按键。

LittleFS保存已校验画面，临时文件写完后rename替换；重启时复核长度、magic和SHA256。首次挂载失败会初始化/格式化文件系统分区，仅用于画面缓存；不会擦除整片Flash或NVS。状态页报告cache saved/ready/unavailable，不应在存储失败时宣称缓存成功。本版本保持主控联网，不做深睡，不承诺电池续航。

## 私人配置（不要上传GitHub）
网页fridge-screen.html中由家庭创建者绑定，下载fridge-device.local.json。tools/prepare-fridge-ca.cjs取得正式项目经校验的公开TLS根证书。tools/prepare-fridge-online.cjs接收设备JSON和CA路径，复用本机CookingPebble/pebble_secrets.h的WiFi设置，生成被Git忽略的fridge_secrets.h和fridge_wifi.local.h；不会输出密码或密钥。换网络时由用户在本机更新WiFi配置。设备不持有网页登录令牌或Supabase anon/service-role key。

## 构建
ESP32 core3.1.0/GxEPD2 1.6.9；打开本目录FridgeOnline.ino并保留驱动文件；AirM2M_CORE_ESP32C3，4MB，上传COM4（先确认端口）。默认分区下无配置构建占Flash970240字节、静态RAM65004字节。

## 验证状态（检查点）
云端函数已部署，家庭owner绑定RPC已安装。独立设备密钥在电脑HTTPS请求实测200、15000字节、SHA256一致，再次请求304；未认证请求401。已生成正式私有配置，带配置版本正在编译。尚未把本版本上传到实体设备，WiFi直连、缓存重启恢复及5分钟自动更新仍待实测。原先手动库存快照固件已由用户目视验收。

服务端render.mjs使用Noto Sans CJK SC字形（SIL OFL，见FONT-LICENSE.txt）生成400x300、MSB-first、bit1黑位图。未知字形用方框代替；库存最多500条，屏幕显示临期前三项，服务器日期按Asia/Shanghai计算，画面时间以半小时取整避免分钟级重复全刷。
