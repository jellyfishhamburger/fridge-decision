# 中文演示位图生成器
运行 generate.py，依赖 Python Pillow；默认使用 C:/Windows/Fonts/msyh.ttc，也可 --font 指定中文字体路径。
输出四个400x300黑白PNG预览及 firmware/FridgeDemo/DemoPages.h。每页15000字节，MSB-first，bit1为黑，适配Adafruit drawBitmap。注意这与某些面板原始RAM的bit0为黑语义不同，不可直接混用。
这是离线演示素材，不包含实际库存或账户资料。
