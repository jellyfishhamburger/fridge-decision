// FridgeSleep —— 冰箱屏电池版：醒来同步/翻页一次，然后深睡。
// 服务端契约与 FridgeOnline 相同：45000 字节（3 页 × 15000）、ETag/304、SHA256、LittleFS 缓存。
// 与 FridgeOnline 的差别：不常连 Wi-Fi、不轮询；每 FRIDGE_SLEEP_SEC 秒或按 GPIO4/5 唤醒。
// 注意：ESP32-C3 只有 GPIO0–GPIO5 能作为深睡唤醒源，因此 GPIO13 那根键在电池版里无效。
#include <SPI.h>
#include <WiFi.h>
#include <LittleFS.h>
#include <mbedtls/sha256.h>
#include <time.h>
#include <esp_sleep.h>
#include <driver/gpio.h>
#include "FridgeHttps.h"
#include <GxEPD2_BW.h>
#include "GxEPD2_420c_Z96.h"
#if __has_include("fridge_secrets.h")
#include "fridge_secrets.h"
#else
#include "fridge_secrets.example.h"
#endif

#ifndef FRIDGE_SLEEP_SEC
#define FRIDGE_SLEEP_SEC 900          // 15 分钟
#endif

constexpr size_t PAGE_BYTES = 15000;
constexpr int PAGE_COUNT = 3;
constexpr size_t PACK_BYTES = PAGE_BYTES * PAGE_COUNT;
constexpr uint8_t KEY_PREV = 4, KEY_NEXT = 5;   // 电池版只用这两个键

GxEPD2_BW<GxEPD2_420c_Z96, GxEPD2_420c_Z96::HEIGHT> display(GxEPD2_420c_Z96(7, 6, 10, 0));

struct Pack { uint8_t bytes[PACK_BYTES]; char sha[65]; };
static Pack current{};
static Pack incoming{};

RTC_DATA_ATTR static int rtcPage = 0;
RTC_DATA_ATTR static uint32_t rtcWakes = 0;

static void digest(const uint8_t* bytes, char* hex) {
  uint8_t hash[32];
  mbedtls_sha256(bytes, PACK_BYTES, hash, 0);
  for (int i = 0; i < 32; i++) sprintf(hex + 2 * i, "%02x", hash[i]);
  hex[64] = 0;
}
static bool valid(const Pack& pack) {
  char sha[65]; digest(pack.bytes, sha);
  return memcmp(sha, pack.sha, 65) == 0;
}

static bool loadCache() {
  auto f = LittleFS.open("/frame.bin", "r");
  if (!f || f.size() != PACK_BYTES + 68) { if (f) f.close(); return false; }
  char magic[4];
  bool ok = f.readBytes(magic, 4) == 4 && memcmp(magic, "FRD2", 4) == 0 &&
            f.readBytes(current.sha, 64) == 64;
  current.sha[64] = 0;
  ok = ok && f.read(current.bytes, PACK_BYTES) == PACK_BYTES;
  f.close();
  return ok && valid(current);
}

static bool saveCache() {
  auto f = LittleFS.open("/frame.new", "w");
  if (!f) return false;
  bool ok = f.write((const uint8_t*)"FRD2", 4) == 4 &&
            f.write((const uint8_t*)current.sha, 64) == 64 &&
            f.write(current.bytes, PACK_BYTES) == PACK_BYTES;
  f.flush(); f.close();
  return ok && LittleFS.rename("/frame.new", "/frame.bin");
}

// 0 = 没有变化（304），1 = 取到新的一帧，-1 = 失败
static int fetchFrame(const char* etag) {
  const String base(FRIDGE_FRAME_URL);
  if (!base.startsWith("https://") || base.indexOf('/', 8) < 0) { Serial.println("HTTPS config invalid"); return -1; }
  const String url = base + "?device_id=" + FRIDGE_DEVICE_ID;
  FridgeHttpsDiagnostics diag;

  esp_http_client_config_t config = {};
  config.url = url.c_str();
  config.cert_pem = FRIDGE_ROOT_CA;
  config.tls_version = ESP_HTTP_CLIENT_TLS_VER_TLS_1_2;
  config.transport_type = HTTP_TRANSPORT_OVER_SSL;
  config.skip_cert_common_name_check = false;
  config.timeout_ms = 15000;
  config.disable_auto_redirect = true;
  config.buffer_size = 1024;
  config.buffer_size_tx = 1024;
  config.event_handler = fridgeHttpsEvent;
  config.user_data = &diag;

  auto client = esp_http_client_init(&config);
  if (!client) return -1;
  const uint32_t started = millis();
  auto finish = [&](const char* phase, esp_err_t result) {
    esp_http_client_close(client);
    fridgeHttpsLog(phase, result, client, diag, started);
    esp_http_client_cleanup(client);
  };

  esp_err_t error = esp_http_client_set_header(client, "x-device-secret", FRIDGE_DEVICE_SECRET);
  if (error == ESP_OK) error = esp_http_client_set_header(client, "Connection", "close");
  // Cloudflare 会把「没有 User-Agent」的请求按 error 1010 拦掉
  if (error == ESP_OK) esp_http_client_set_header(client, "User-Agent", "FridgeDisplay/1.0");
  if (error == ESP_OK && etag[0]) {
    const String quoted = String('"') + etag + '"';
    error = esp_http_client_set_header(client, "If-None-Match", quoted.c_str());
  }
  if (error != ESP_OK) { finish("request-config", error); return -1; }

  error = esp_http_client_open(client, 0);
  if (error != ESP_OK) { finish("connect", error); return -1; }
  const int64_t length = esp_http_client_fetch_headers(client);
  if (length < 0) { finish("headers", ESP_FAIL); return -1; }
  const int status = esp_http_client_get_status_code(client);
  Serial.printf("HTTPS http=%d len=%lld\n", status, (long long)length);
  if (status == 304 && etag[0]) { finish("not-modified", ESP_OK); return 0; }

  bool shaOK = strlen(diag.sha) == 64;
  if (status != 200 || length != (int64_t)PACK_BYTES || esp_http_client_is_chunked_response(client) ||
      diag.invalidHeaders || !shaOK || strcmp(diag.format, "400x300-msb-black1-v1") != 0) {
    finish("response-rejected", ESP_ERR_INVALID_RESPONSE); return -1;
  }

  strlcpy(incoming.sha, diag.sha, sizeof(incoming.sha));
  size_t count = 0;
  const uint32_t bodyStart = millis();
  while (count < PACK_BYTES) {
    const uint32_t elapsed = millis() - bodyStart;
    if (elapsed >= 30000) { error = ESP_ERR_TIMEOUT; break; }
    esp_http_client_set_timeout_ms(client, min(uint32_t(1500), uint32_t(30000 - elapsed)));
    const int got = esp_http_client_read(client, reinterpret_cast<char*>(incoming.bytes + count),
                                         min(size_t(1024), PACK_BYTES - count));
    if (got < 0) { error = ESP_FAIL; break; }
    if (got == 0) { error = ESP_ERR_INVALID_SIZE; break; }
    count += got;
  }
  const bool complete = count == PACK_BYTES && esp_http_client_is_complete_data_received(client);
  if (!complete || !valid(incoming)) {
    Serial.printf("BODY rejected bytes=%u complete=%d\n", (unsigned)count, complete);
    finish("body-or-sha", ESP_ERR_INVALID_CRC); return -1;
  }
  finish("verified-frame", ESP_OK);
  memcpy(&current, &incoming, sizeof(Pack));
  return 1;
}

static void drawPage(int page) {
  if (page < 0 || page >= PAGE_COUNT) page = 0;
  display.init(115200, true, 2, false);
  display.setRotation(2);
  display.mirror(true);
  display.setFullWindow();
  display.firstPage();
  do {
    display.fillScreen(GxEPD_WHITE);
    display.drawBitmap(0, 0, current.bytes + page * PAGE_BYTES, 400, 300, GxEPD_BLACK);
  } while (display.nextPage());
  display.hibernate();
  Serial.printf("DRAW page=%d/%d\n", page + 1, PAGE_COUNT);
}

static void sleepNow() {
  WiFi.disconnect(true, true);
  WiFi.mode(WIFI_OFF);
  pinMode(KEY_PREV, INPUT_PULLUP);
  pinMode(KEY_NEXT, INPUT_PULLUP);
  const uint64_t mask = (1ULL << KEY_PREV) | (1ULL << KEY_NEXT);
  esp_deep_sleep_enable_gpio_wakeup(mask, ESP_GPIO_WAKEUP_GPIO_LOW);
  esp_sleep_enable_timer_wakeup((uint64_t)FRIDGE_SLEEP_SEC * 1000000ULL);
  Serial.printf("SLEEP wakes=%lu page=%d next_wake=%ds\n", (unsigned long)rtcWakes, rtcPage + 1, FRIDGE_SLEEP_SEC);
  Serial.flush();
  delay(80);
  esp_deep_sleep_start();
}

void setup() {
  Serial.begin(115200);
  delay(200);
  esp_sleep_wakeup_cause_t cause = esp_sleep_get_wakeup_cause();
  rtcWakes++;
  Serial.printf("\nBOOT cause=%d wakes=%lu\n", (int)cause, (unsigned long)rtcWakes);

  pinMode(KEY_PREV, INPUT_PULLUP);
  pinMode(KEY_NEXT, INPUT_PULLUP);
  LittleFS.begin(true);
  const bool haveCache = loadCache();

  // ---- 按键唤醒：只翻页，不联网 ----
  if (cause == ESP_SLEEP_WAKEUP_GPIO && haveCache) {
    const bool prev = digitalRead(KEY_PREV) == LOW;
    const bool next = digitalRead(KEY_NEXT) == LOW;
    Serial.printf("WAKE key prev=%d next=%d\n", prev, next);
    if (prev && !next) rtcPage = (rtcPage + PAGE_COUNT - 1) % PAGE_COUNT;
    else if (next && !prev) rtcPage = (rtcPage + 1) % PAGE_COUNT;
    drawPage(rtcPage);
    sleepNow();
    return;
  }

  // ---- 定时唤醒 / 上电：联网同步 ----
  if (!haveCache) rtcPage = 0;
  if (!strlen(FRIDGE_WIFI_SSID) || !strlen(FRIDGE_DEVICE_ID) || !strlen(FRIDGE_DEVICE_SECRET)) {
    Serial.println("BOOT no credentials; nothing to do");
    sleepNow();
    return;
  }

  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(false);
  WiFi.begin(FRIDGE_WIFI_SSID, FRIDGE_WIFI_PASSWORD);
  uint32_t t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 20000) delay(100);
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WIFI failed; keep panel as-is");
    sleepNow();
    return;
  }
  Serial.printf("WIFI ok rssi=%d ip=%s\n", WiFi.RSSI(), WiFi.localIP().toString().c_str());

  // 深睡后 RTC 仍在走时；只有真实时钟无效时才等 NTP
  if (time(nullptr) < 1700000000) {
    configTime(0, 0, "pool.ntp.org", "time.cloudflare.com");
    t0 = millis();
    while (time(nullptr) < 1700000000 && millis() - t0 < 20000) delay(100);
  }

  char etag[65] = {};
  if (haveCache) strlcpy(etag, current.sha, 65);
  const int result = fetchFrame(etag);
  if (result == 1) {
    saveCache();
    rtcPage = 0;
    drawPage(0);
  } else if (result == 0) {
    Serial.println("SYNC unchanged; panel keeps current image");
  } else {
    Serial.println("SYNC failed; panel keeps current image");
  }
  sleepNow();
}

void loop() {}
