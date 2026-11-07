"""Generate a local LVGL v8 subset font; supply a font you may use locally.
Generated C assets are ignored by Git; do not redistribute system fonts.
"""
import argparse
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

p=argparse.ArgumentParser()
p.add_argument('--font',required=True)
p.add_argument('--size',type=int,default=24)
p.add_argument('--name',default='pebble_zh24')
p.add_argument('--text',required=True)
p.add_argument('--out',required=True)
a=p.parse_args()
font=ImageFont.truetype(a.font,a.size)
chars=sorted(set(Path(a.text).read_text(encoding='utf-8'))-{'\n','\r'})
bitmap=[]; desc=['{0,0,0,0,0,0}']; offsets=[]
start=ord(chars[0])
for ch in chars:
    l,t,r,b=font.getbbox(ch,anchor='ls')
    w,h=r-l,b-t
    img=Image.new('L',(max(1,w),max(1,h)))
    ImageDraw.Draw(img).text((-l,-t),ch,font=font,fill=255,anchor='ls')
    pixels=[(v+8)//17 for v in img.getdata()] if w*h else []
    index=len(bitmap)
    for i in range(0,len(pixels),2): bitmap.append((min(15,pixels[i])<<4)|(min(15,pixels[i+1]) if i+1<len(pixels) else 0))
    desc.append('{%d,%d,%d,%d,%d,%d}'%(index,round(font.getlength(ch)*16),w,h,l,-b))
    offsets.append(str(ord(ch)-start))
source='''#include "lvgl.h"
static const uint8_t bitmap[]={%s};
static const lv_font_fmt_txt_glyph_dsc_t glyphs[]={%s};
static const uint16_t unicodes[]={%s};
static const lv_font_fmt_txt_cmap_t cmap[]={
{.range_start=%d,.range_length=%d,.glyph_id_start=1,.unicode_list=unicodes,.glyph_id_ofs_list=NULL,.list_length=%d,.type=LV_FONT_FMT_TXT_CMAP_SPARSE_TINY}};
static lv_font_fmt_txt_dsc_t dsc={.glyph_bitmap=bitmap,.glyph_dsc=glyphs,.cmaps=cmap,.kern_dsc=NULL,.kern_scale=0,.cmap_num=1,.bpp=4,.kern_classes=0,.bitmap_format=0};
const lv_font_t %s={.get_glyph_dsc=lv_font_get_glyph_dsc_fmt_txt,.get_glyph_bitmap=lv_font_get_bitmap_fmt_txt,.line_height=%d,.base_line=%d,.dsc=&dsc};
'''%(','.join(map(str,bitmap)),','.join(desc),','.join(offsets),start,ord(chars[-1])-start+1,len(chars),a.name,a.size+4,4)
Path(a.out).write_text(source,encoding='utf-8')
print(f'{a.name}: {len(chars)} glyphs, {len(bitmap)} bitmap bytes')
