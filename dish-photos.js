/* 每道菜的成品照 —— Wikimedia Commons（CC / 公有领域）。
   键 = data.js 里的菜谱中文名；null = 没有可靠对得上的开放图，界面退回食材插画。
   作者与许可证见 img/dish/credits.json，图片右下角标注，可点回原页溯源。 */
window.DISH_PHOTO = (function(){
  var M = {
    "清蒸鲈鱼": {src:"img/dish/qingzheng_luyu.jpg",credit:"Apeach316",license:"CC BY-SA 2.0",page:"https://commons.wikimedia.org/wiki/File:Cantonese_style_steamed_fish_and_special_side_dishes_in_lunch.jpg"},
    "白灼虾": {src:"img/dish/baizhuo_xia.jpg",credit:"Alpha",license:"CC BY-SA 2.0",page:"https://commons.wikimedia.org/wiki/File:Canto_white_boiled_shrimp.jpg"},
    "蒜蓉虾": {src:"img/dish/suanrong_xia.jpg",credit:"LadyPinayForever",license:"CC BY 4.0",page:"https://commons.wikimedia.org/wiki/File:Buttered_Garlic_Shrimp_Viand_at_Night.jpg"},
    "微波炉蒸蛋": {src:"img/dish/weibolu_zhengdan.jpg",credit:"tak.wing",license:"CC BY-SA 2.0",page:"https://commons.wikimedia.org/wiki/File:%E9%B8%A1%E8%9B%8B%E7%BE%B9%E9%85%8D%E9%87%8E%E7%94%9F%E8%8F%8C-%E4%BA%91%E5%8D%97%E6%98%86%E6%98%8E.jpg"},
    "可乐鸡翅": {src:"img/dish/kele_jichi.jpg",credit:"Pauloleong2002",license:"CC BY-SA 4.0",page:"https://commons.wikimedia.org/wiki/File:Home_made_chicken_wings_with_coca_cola.jpg"},
    "宫保鸡丁": {src:"img/dish/gongbao_jiding.jpg",credit:"Steven G. Johnson",license:"CC BY-SA 3.0",page:"https://commons.wikimedia.org/wiki/File:Kung-pao-shanghai.jpg"},
    "洋葱炒猪肉": null,
    "辣椒炒肉": {src:"img/dish/lajiao_chao_rou.jpg",credit:"N509FZ",license:"CC BY-SA 4.0",page:"https://commons.wikimedia.org/wiki/File:Nongjia_Xiaochaorou_at_Xiangdu_Xiangwei_Restaurant,_Beijing_(20240125114913).jpg"},
    "青椒土豆炒肉": null,
    "香菇滑鸡": {src:"img/dish/xianggu_hua_ji.jpg",credit:"Alpha from Melbourne, Australia",license:"CC BY-SA 2.0",page:"https://commons.wikimedia.org/wiki/File:%E9%A6%99%E8%8F%87_%E8%85%8A%E8%82%A0_%E6%BB%91%E9%B8%A1_%E7%85%B2%E4%BB%94%E9%A5%AD_Chicken,_Shiitake_Mushroom_and_Chinese_Sausage_Hotpot_Rice_-_Soup,_Box_Hill_(2171035663).jpg"},
    "麻婆豆腐": {src:"img/dish/mapo_doufu.jpg",credit:"Sichuanfoodlover",license:"CC BY-SA 4.0",page:"https://commons.wikimedia.org/wiki/File:Authentic_Mapo_Tofu.jpg"},
    "西红柿鸡蛋汤": {src:"img/dish/xihongshi_jidan_tang.jpg",credit:"NNU-10-HanRongrong",license:"CC BY 3.0",page:"https://commons.wikimedia.org/wiki/File:Tomato_and_egg_soup.jpg"},
    "蛋炒饭": {src:"img/dish/dan_chao_fan.jpg",credit:"Euniceyeoh07",license:"CC BY-SA 4.0",page:"https://commons.wikimedia.org/wiki/File:Chinese_egg_fried_rice.jpg"},
    "西红柿鸡蛋挂面": null,
    "凉拌豆腐": null,
    "洋葱炒鸡蛋": null,
    "炒茄子": {src:"img/dish/chao_qiezi.jpg",credit:"Wr120galen",license:"CC BY-SA 4.0",page:"https://commons.wikimedia.org/wiki/File:WechatIMG419.png"},
    "炒青菜": {src:"img/dish/chao_qingcai.jpg",credit:"Judgefloro",license:"CC0",page:"https://commons.wikimedia.org/wiki/File:9665Saut%C3%A9ed_winged_bean_and_green_shingkang_with_tofu_10.jpg"},
    "蒜蓉空心菜": {src:"img/dish/suanrong_kongxincai.jpg",credit:"pelican from Tokyo, Japan",license:"CC BY-SA 2.0",page:"https://commons.wikimedia.org/wiki/File:Fried_chinese_green_vegetable_(5673670357).jpg"},
    "蒜蓉西兰花": {src:"img/dish/suanrong_xilanhua.jpg",credit:"Laurel F",license:"CC BY-SA 2.0",page:"https://commons.wikimedia.org/wiki/File:Beef_and_Broccoli.jpg"},
  };
  return { get: function(n){ return M[n] || null; }, have: function(n){ return !!M[n]; } };
})();
