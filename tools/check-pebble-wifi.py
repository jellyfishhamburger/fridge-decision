"""Compare Wi-Fi names locally; never print credentials or network names."""
import json,re,subprocess
from pathlib import Path
s=(Path(__file__).resolve().parents[1]/'firmware/CookingPebble/pebble_secrets.h').read_text(encoding='utf-8')
m=re.search(r'^#define\s+PEBBLE_WIFI_SSID\s+(".*")',s,re.M)
configured=json.loads(m.group(1)) if m else None
raw=subprocess.run(['netsh','wlan','show','interfaces'],capture_output=True).stdout
t=raw.decode('gbk',errors='replace')
n=re.search(r'^\s*SSID\s*:\s*(.+)$',t,re.M)
current=n.group(1).strip() if n else None
print('same_wifi='+str(configured==current if configured and current else 'unknown'))
