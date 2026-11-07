"""Render device-api inventory response. Read-only, no credentials or network."""
import argparse,json,math
from pathlib import Path
from datetime import date,datetime,timedelta,timezone
from PIL import Image,ImageDraw,ImageFont
TZ=timezone(timedelta(hours=8))
def number(v):
    return isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v)
def rows_for(data,today):
    if data.get('schema_version')!=1 or not isinstance(data.get('items'),list):raise ValueError('Expected inventory schema_version=1')
    if len(data['items'])>500:raise ValueError('Too many items')
    rows=[]
    for item in data['items']:
        if not number(item.get('qty')) or item['qty']<=0:continue
        name=item.get('name')
        if not isinstance(name,str) or not name.strip():name='未命名食材'
        name=''.join(c for c in name if c.isprintable()).strip()
        days=None
        if number(item.get('life')) and isinstance(item.get('added_at'),str):
            try:days=item['life']-(today-date.fromisoformat(item['added_at'][:10])).days
            except ValueError:pass
        if days is None and number(item.get('days_left')):days=item['days_left']
        rows.append((name,days))
    return sorted(rows,key=lambda r:(r[1] is None,r[1] if r[1] is not None else 0,r[0]))
def render(data,out,font,today):
    rows=rows_for(data,today)
    stamp=datetime.fromisoformat(data['generated_at'].replace('Z','+00:00'))
    if stamp.tzinfo is None:raise ValueError('generated_at must have timezone')
    stamp=stamp.astimezone(TZ)
    im=Image.new('1',(400,300),1);d=ImageDraw.Draw(im)
    f={n:ImageFont.truetype(font,n) for n in (16,22,30,36)}
    def fit(text,width,size):
        while text and d.textlength(text,font=f[size])>width:text=text[:-1]
        return text
    d.rectangle((0,0,399,299),outline=0);d.rectangle((0,0,399,28),fill=0)
    d.text((12,2),'FRIDGE DECISION · 库存快照',font=f[16],fill=1)
    d.text((14,36),'先吃这些',font=f[36],fill=0)
    if not rows:d.text((16,115),'当前没有可用库存',font=f[30],fill=0)
    for y,(name,days) in zip((94,146,198),rows[:3]):
        if days is None:label='日期待确认'
        elif days<0:label=f'已过期 {abs(days):g} 天'
        elif days==0:label='今天到期'
        else:label=f'还剩 {days:g} 天'
        d.text((16,y),fit(name,365,30),font=f[30],fill=0)
        d.text((16,y+33),fit(label,365,16),font=f[16],fill=0)
    d.line((12,253,387,253),fill=0)
    d.text((14,259),f'快照 {stamp:%m-%d %H:%M}  共 {len(rows)} 样',font=f[22],fill=0)
    d.text((14,283),'日期为估算；请核实包装及食材状态',font=f[16],fill=0)
    packed=bytes(sum((im.getpixel((x+b,y))==0)<<(7-b) for b in range(8)) for y in range(300) for x in range(0,400,8))
    assert len(packed)==15000
    out=Path(out);out.mkdir(parents=True,exist_ok=True)
    im.save(out/'inventory.png');(out/'inventory.bin').write_bytes(packed)
    body=','.join(f'0x{v:02x}' for v in packed)
    (out/'InventoryPage.local.h').write_text('#pragma once\n#include <Arduino.h>\nconst uint8_t INVENTORY_PAGE[15000] PROGMEM={'+body+'};\n',encoding='utf-8')
    return rows
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('input');p.add_argument('--out',required=True);p.add_argument('--font',default='C:/Windows/Fonts/msyh.ttc');p.add_argument('--today',type=date.fromisoformat)
    a=p.parse_args();render(json.loads(Path(a.input).read_text(encoding='utf-8-sig')),a.out,a.font,a.today or datetime.now(TZ).date())
    print('Rendered inventory snapshot; 400x300, 15000 bytes, bit 1 = black')
