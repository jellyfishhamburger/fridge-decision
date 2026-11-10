#include <SPI.h>
#include <WiFi.h>
#include <new>

#include <LittleFS.h>
#include <mbedtls/sha256.h>
#include <time.h>
#include "FridgeHttps.h"
#include <GxEPD2_BW.h>
#include "GxEPD2_420c_Z96.h"
#if __has_include("InventoryPage.local.h")
#include "InventoryPage.local.h"
#endif
#if __has_include("fridge_secrets.h")
#include "fridge_secrets.h"
#else
#include "fridge_secrets.example.h"
#endif

// 服务器一次下发 3 页（每页 400x300 1-bit = 15000 字节），设备本地翻页。
constexpr size_t PAGE_BYTES = 15000;
constexpr int PAGE_COUNT = 3;
constexpr size_t PACK_BYTES = PAGE_BYTES * PAGE_COUNT;   // 45000
constexpr uint32_t REFRESH_GAP = 15000;   // 两次刷屏最短间隔
constexpr uint32_t POLL_MS = 300000;      // 5 分钟
constexpr uint32_t RETRY_MS = 30000;      // 失败 30 秒重试
constexpr uint32_t ROTATE_MS = 600000;    // 10 分钟没按键就自动翻页
constexpr uint8_t KEY_PREV = 4, KEY_SYNC = 5, KEY_NEXT = 13;
static const uint8_t KEYS[3] = {KEY_PREV, KEY_SYNC, KEY_NEXT};

GxEPD2_BW<GxEPD2_420c_Z96, GxEPD2_420c_Z96::HEIGHT> display(GxEPD2_420c_Z96(7, 6, 10, 0));

struct Pack { uint8_t bytes[PACK_BYTES]; char sha[65]; };
static Pack current{};
static Pack incoming{};   // 静态下载缓冲：3 页 45KB，避免每次 new 造成堆碎片（曾出现 ESP_ERR_NO_MEM）
static QueueHandle_t frames = nullptr;
static TaskHandle_t workerHandle = nullptr;
static volatile int netState = 0, httpCode = 0, tlsCode = 0;
static volatile uint32_t lastSuccess = 0, lastInput = 0;
static bool hasPack = false, cacheReady = false, cacheSaved = false, dirty = true;
static uint32_t refreshEnded = 0;
static int page = 0, lastNet = -1;

struct Key { int raw = HIGH, stable = HIGH; uint32_t changed = 0; };
static Key keys[3];

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
  if (!cacheReady) return false;
  auto f = LittleFS.open("/frame.bin", "r");
  if (!f || f.size() != PACK_BYTES + 68) return false;
  char magic[4];
  bool ok = f.readBytes(magic, 4) == 4 && memcmp(magic, "FRD2", 4) == 0 &&
            f.readBytes(current.sha, 64) == 64;
  current.sha[64] = 0;
  ok = ok && f.read(current.bytes, PACK_BYTES) == PACK_BYTES;
  f.close();
  return ok && valid(current);
}

static bool saveCache() {
  if (!cacheReady) return false;
  auto f = LittleFS.open("/frame.new", "w");
  if (!f) return false;
  bool ok = f.write((const uint8_t*)"FRD2", 4) == 4 &&
            f.write((const uint8_t*)current.sha, 64) == 64 &&
            f.write(current.bytes, PACK_BYTES) == PACK_BYTES;
  f.flush(); f.close();
  return ok && LittleFS.rename("/frame.new", "/frame.bin");
}

static bool fetchFrame(char* etag) {
  tlsCode = 0;
  const String base(FRIDGE_FRAME_URL);
  if (!base.startsWith("https://") || base.indexOf('/', 8) < 0 ||
      base.indexOf('?') >= 0 || base.indexOf('#') >= 0 || base.indexOf('@') >= 0) {
    httpCode = -10; Serial.println("HTTPS config: invalid HTTPS endpoint"); return false;
  }
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
  if (!client) { httpCode = -15; Serial.println("HTTPS init: allocation failed"); return false; }
  const uint32_t started = millis();
  auto finish = [&](const char* phase, esp_err_t result) {
    const int socketError = esp_http_client_get_errno(client);
    if (socketError) diag.socketError = socketError;
    esp_http_client_close(client);
    fridgeHttpsLog(phase, result, client, diag, started);
    esp_http_client_cleanup(client);
    tlsCode = diag.tlsError;
  };

  esp_err_t error = esp_http_client_set_header(client, "x-device-secret", FRIDGE_DEVICE_SECRET);
  if (error == ESP_OK) error = esp_http_client_set_header(client, "Connection", "close");
  if (error == ESP_OK && etag[0]) {
    const String quoted = String('"') + etag + '"';
    error = esp_http_client_set_header(client, "If-None-Match", quoted.c_str());
  }
  if (error != ESP_OK) { httpCode = -10; finish("request-config", error); return false; }

  Serial.println("HTTPS START client=esp_http_client tls=1.2 http=1.1 verify=required connect_timeout_ms=15000");
  error = esp_http_client_open(client, 0);
  if (error != ESP_OK) { httpCode = -23; finish("connect", error); return false; }
  const int64_t length = esp_http_client_fetch_headers(client);
  if (length < 0) { httpCode = -24; finish("headers", ESP_FAIL); return false; }
  const int status = esp_http_client_get_status_code(client);
  httpCode = status;
  Serial.printf("HTTPS HEADERS http=%d content_length=%lld chunked=%d\n", status,
                (long long)length, esp_http_client_is_chunked_response(client));

  if (status == 304 && etag[0]) { lastSuccess = millis(); finish("not-modified", ESP_OK); return true; }

  bool shaOK = strlen(diag.sha) == 64;
  for (size_t i = 0; shaOK && i < 64; ++i)
    shaOK = (diag.sha[i] >= '0' && diag.sha[i] <= '9') || (diag.sha[i] >= 'a' && diag.sha[i] <= 'f');
  if (status != 200 || length != (int64_t)PACK_BYTES || esp_http_client_is_chunked_response(client) ||
      diag.invalidHeaders || !shaOK || strcmp(diag.format, "400x300-msb-black1-v1") != 0) {
    if (status == 200 || status == 304) httpCode = -16;
    finish("response-rejected", ESP_ERR_INVALID_RESPONSE); return false;
  }

  Pack* received = &incoming;
  strlcpy(received->sha, diag.sha, sizeof(received->sha));
  const uint32_t bodyStarted = millis();
  size_t count = 0;
  while (count < PACK_BYTES) {
    const uint32_t elapsed = millis() - bodyStarted;
    if (elapsed >= 30000) { error = ESP_ERR_TIMEOUT; break; }
    esp_http_client_set_timeout_ms(client, min(uint32_t(1500), uint32_t(30000 - elapsed)));
    const int got = esp_http_client_read(client, reinterpret_cast<char*>(received->bytes + count),
                                         min(size_t(1024), PACK_BYTES - count));
    if (got < 0) { error = got == -ESP_ERR_HTTP_EAGAIN ? ESP_ERR_TIMEOUT : ESP_FAIL; break; }
    if (got == 0) { error = ESP_ERR_INVALID_SIZE; break; }
    count += got;
  }
  const bool complete = count == PACK_BYTES && esp_http_client_is_complete_data_received(client);
  if (!complete || !valid(*received)) {
    Serial.printf("HTTPS BODY rejected bytes=%u expected=%u complete=%d\n",
                  (unsigned)count, (unsigned)PACK_BYTES, complete);
    httpCode = error == ESP_ERR_TIMEOUT ? -17 : -11;
    finish("body-or-sha", error == ESP_OK ? ESP_ERR_INVALID_CRC : error); return false;
  }
  finish("verified-frame", ESP_OK);
  if (xQueueSend(frames, &received, 0) != pdTRUE) { httpCode = -12; return false; }
  strlcpy(etag, diag.sha, 65);
  lastSuccess = millis();
  return true;
}

static void networkTask(void*) {
  char etag[65] = {};
  if (hasPack) strlcpy(etag, current.sha, 65);
  if (!strlen(FRIDGE_WIFI_SSID) || !strlen(FRIDGE_DEVICE_ID) ||
      !strlen(FRIDGE_DEVICE_SECRET) || !strlen(FRIDGE_ROOT_CA)) {
    netState = -1; vTaskDelete(nullptr); return;
  }
  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(FRIDGE_WIFI_SSID, FRIDGE_WIFI_PASSWORD);
  configTime(0, 0, "pool.ntp.org", "time.cloudflare.com");
  for (;;) {
    tlsCode = 0; netState = 1;
    uint32_t start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) vTaskDelay(pdMS_TO_TICKS(200));
    bool ok = false;
    if (WiFi.status() == WL_CONNECTED) {
      netState = 2;
      start = millis();
      while (time(nullptr) < 1700000000 && millis() - start < 30000) vTaskDelay(pdMS_TO_TICKS(200));
      if (time(nullptr) >= 1700000000) { start = millis(); ok = fetchFrame(etag); }
      else { httpCode = -13; Serial.println("HTTPS skipped: clock not synchronized within 30000 ms"); }
    } else httpCode = -14;
    netState = ok ? 3 : -2;
    Serial.printf("SYNC result=%s code=%d; previous frame preserved on failure\n", ok ? "OK" : "FAILED", httpCode);
    uint32_t command = 0;
    xTaskNotifyWait(0, UINT32_MAX, &command, pdMS_TO_TICKS(ok ? POLL_MS : RETRY_MS));
    if (command & 2U) { etag[0] = 0; Serial.println("SYNC next request: full fetch; cached frame preserved"); }
    const uint32_t elapsed = millis() - start;
    if (elapsed < RETRY_MS) vTaskDelay(pdMS_TO_TICKS(RETRY_MS - elapsed));
  }
}

static void text(int x, int y, const char* value, int size = 2) {
  display.setTextSize(size); display.setCursor(x, y); display.print(value);
}

static void statusPage() {
  display.fillScreen(GxEPD_WHITE);
  display.fillRect(0, 0, 400, 35, GxEPD_BLACK);
  display.setTextColor(GxEPD_WHITE); text(15, 9, "FRIDGE / CONNECTION", 2);
  display.setTextColor(GxEPD_BLACK);
  text(16, 60, WiFi.status() == WL_CONNECTED ? "WiFi connected" : "WiFi offline", 2);
  const char* state = netState == 3 ? "SYNC OK" : netState == -1 ? "Setup required"
                    : netState == -2 ? "Retrying; old frame kept" : "Connecting securely...";
  text(16, 100, state, 2);
  char row[64];
  snprintf(row, sizeof(row), "HTTP %d  cache %s", httpCode, cacheSaved ? "saved" : cacheReady ? "ready" : "unavailable");
  text(16, 140, row, 2);
  text(16, 190, "4 / 13: page   5: sync", 2);
  text(16, 230, "waiting for first frame", 1);
}

static void draw() {
  if (!hasPack) { display.setFullWindow(); display.firstPage(); do { statusPage(); } while (display.nextPage()); display.hibernate(); refreshEnded = millis(); dirty = false; return; }
  if (page < 0 || page >= PAGE_COUNT) page = 0;
  display.setFullWindow();
  display.firstPage();
  do {
    display.fillScreen(GxEPD_WHITE);
    display.drawBitmap(0, 0, current.bytes + page * PAGE_BYTES, 400, 300, GxEPD_BLACK);
  } while (display.nextPage());
  display.hibernate();
  refreshEnded = millis();
  dirty = false;
  for (int i = 0; i < 3; i++) { keys[i].raw = keys[i].stable = digitalRead(KEYS[i]); keys[i].changed = millis(); }
  Serial.printf("DISPLAY RETURNED page=%d/%d has_frame=%d cache_saved=%d; visual confirmation required\n",
                page + 1, PAGE_COUNT, hasPack, cacheSaved);
}

static void report() {
  Serial.printf("STATE page=%d/%d net=%d http=%d tls=%d wifi=%d has_frame=%d cache=%d cache_ready=%d uptime=%lu heap=%lu\n",
                page + 1, PAGE_COUNT, netState, httpCode, tlsCode, (int)WiFi.status(),
                hasPack, cacheSaved, cacheReady, (unsigned long)millis(), (unsigned long)ESP.getFreeHeap());
}

static void syncNow() {
  if (workerHandle && netState != -1) xTaskNotify(workerHandle, 1U, eSetBits);
}

static void turnPage(int delta) {
  if (!hasPack) return;
  page = (page + delta + PAGE_COUNT) % PAGE_COUNT;
  dirty = true;
  lastInput = millis();
  Serial.printf("KEY page -> %d/%d\n", page + 1, PAGE_COUNT);
}

void setup() {
  Serial.begin(115200);
  delay(1500);
  for (int i = 0; i < 3; i++) pinMode(KEYS[i], INPUT_PULLUP);

  cacheReady = LittleFS.begin(true);
  hasPack = loadCache();
  cacheSaved = hasPack;
#if __has_include("InventoryPage.local.h")
  if (!hasPack) { memcpy_P(current.bytes, INVENTORY_PAGE, PAGE_BYTES); digest(current.bytes, current.sha); hasPack = true; cacheSaved = saveCache(); Serial.println("BOOT seeded local snapshot; not a fresh sync"); }
#endif
  SPI.begin(2, -1, 3, 7);
  display.epd2.selectSPI(SPI, SPISettings(1000000, MSBFIRST, SPI_MODE0));
  display.init(115200, true, 2, false);
  display.setRotation(2);
  display.mirror(true);

  frames = xQueueCreate(1, sizeof(Pack*));
  if (!frames) { netState = -1; hasPack = false; draw(); return; }
  if (xTaskCreate(networkTask, "fridge-sync", 10000, nullptr, 1, &workerHandle) != pdPASS) {
    workerHandle = nullptr; netState = -1;
  }
  lastInput = millis();
  if (hasPack) draw();
  else { dirty = false; refreshEnded = millis(); }
  Serial.printf("BOOT has_cached_frame=%d cache_ready=%d pages=%d\n", hasPack, cacheReady, PAGE_COUNT);
}

void loop() {
  Pack* next = nullptr;
  if (frames && xQueueReceive(frames, &next, 0) == pdTRUE) {
    const bool changed = !hasPack || memcmp(current.sha, next->sha, 65) != 0;
    memcpy(&current, next, sizeof(Pack));
    hasPack = true;
    if (changed) { cacheSaved = saveCache(); dirty = true; lastInput = millis(); }
  }
  if (lastNet != netState) { lastNet = netState; if (!hasPack) dirty = true; }

  while (Serial.available()) {
    const char c = Serial.read();
    if (c == 's') report();
    if (c == 'n') syncNow();
    if (c == 'f' && workerHandle && netState != -1) xTaskNotify(workerHandle, 2U, eSetBits);
    if (c == 'p') turnPage(-1);
    if (c == 'k') turnPage(1);
  }

  const uint32_t now = millis();
  for (int i = 0; i < 3; i++) {
    const int level = digitalRead(KEYS[i]);
    if (level != keys[i].raw) { keys[i].raw = level; keys[i].changed = now; }
    if (level != keys[i].stable && uint32_t(now - keys[i].changed) >= 40) {
      keys[i].stable = level;
      if (level == LOW) {
        lastInput = now;
        if (i == 0) turnPage(-1);
        else if (i == 1) { syncNow(); Serial.println("KEY sync"); }
        else turnPage(1);
      }
    }
  }

  // 长时间没人按，自动翻页
  if (hasPack && PAGE_COUNT > 1 && uint32_t(now - lastInput) > ROTATE_MS) {
    page = (page + 1) % PAGE_COUNT;
    dirty = true;
    lastInput = now;
    Serial.printf("AUTO page -> %d/%d\n", page + 1, PAGE_COUNT);
  }

  if (dirty && uint32_t(now - refreshEnded) >= REFRESH_GAP) draw();
  delay(2);
}
