from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import base64,json,math,os
root=Path(__file__).resolve().parents[2]
text=(root/'data.js').read_text(encoding='utf-8')+'FRIDGE DECISION 先吃这些库存快照今天到期还剩天已过期日期待确认当前没有可用库存更新共样请核实包装与食材状态□…月日'
chars=sorted(set(text)|set(chr(i) for i in range(32,127)))
result={}
for size in (16,32):
 f=ImageFont.truetype(os.environ['FRIDGE_FONT_PATH'],size); glyphs={}
 for c in chars:
  if ord(c)<32:continue
  w=max(1,math.ceil(f.getlength(c)));h=size+4
  im=Image.new('1',(w,h),1);ImageDraw.Draw(im).text((0,-3),c,font=f,fill=0)
  data=bytes(sum((im.getpixel((x+b,y))==0 if x+b<w else False)<<(7-b) for b in range(8)) for y in range(h) for x in range(0,w,8))
  glyphs[c]={'w':w,'b':base64.b64encode(data).decode()}
 result[size]=glyphs
(root/'supabase/functions/fridge-frame/font.mjs').write_text('// Generated glyphs from Noto Sans CJK SC (SIL OFL) for this project; generator: tools/fridge_demo/build_edge_font.py\nexport const FONT='+json.dumps(result,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')
print('Generated glyph atlas:',len(chars),'characters')

