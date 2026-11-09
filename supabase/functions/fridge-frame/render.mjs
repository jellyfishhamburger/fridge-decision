import {FONT} from './font.mjs';
const DAY=86400000;

const RECIPES=[["清蒸鲈鱼",["fish"],20,false],["白灼虾",["shrimp","onion"],15,false],["蒜蓉虾",["shrimp"],20,false],["微波炉蒸蛋",["egg"],10,false],["可乐鸡翅",["chicken","cola"],20,false],["宫保鸡丁",["chicken","chili"],20,false],["洋葱炒猪肉",["onion","pork"],20,false],["辣椒炒肉",["chili","pork"],30,false],["青椒土豆炒肉",["chili","potato","pork"],20,false],["香菇滑鸡",["chicken","mushroom"],20,false],["麻婆豆腐",["tofu","pork"],20,false],["西红柿鸡蛋汤",["tomato","egg"],15,true],["蛋炒饭",["egg","carrot","beef"],25,false],["西红柿鸡蛋挂面",["noodle","tomato","egg","chili"],20,true],["凉拌豆腐",["tofu"],10,false],["洋葱炒鸡蛋",["egg","onion"],20,false],["炒茄子",["eggplant"],20,false],["炒青菜",["greens"],10,true],["蒜蓉空心菜",["greens"],15,true],["蒜蓉西兰花",["broccoli"],15,true],["咖喱炒蟹",["curry_block","egg"],56,false],["微波葱姜黑鳕鱼",["fish"],44,false],["水煮鱼",["fish","douchi"],52,false],["红烧鱼",["fish","chili"],68,false],["红烧鱼头",["fish"],90,false],["红烧鲤鱼",["pork","fish","chili"],90,false],["肉蟹煲",["shrimp","potato","rice_cake","chili","red_chili","tomato"],28,true],["酱炖蟹",["tomato","egg","pork"],30,true],["小龙虾",["shrimp","chili"],36,false],["干煎阿根廷红虾",["shrimp","grape","lemon"],20,false],["油焖大虾",["shrimp"],72,false],["烤鱼",["fish","chili","tofu_skin","bean_sprout","celery","peanut"],88,false],["糖醋鲤鱼",["fish","tomato"],90,true],["芥末黄油罗氏虾",["shrimp"],36,false],["葱油桂鱼",["fish","red_chili"],84,false],["蒜香黄油虾",["shrimp","grape","lemon"],44,false],["蛏抱蛋",["egg"],30,false],["阳朔啤酒鱼",["fish","tomato","chili","red_chili"],48,true],["香煎翘嘴鱼",["fish","chili"],52,false],["鲤鱼炖白菜",["fish","baby_cabbage","chili"],32,true],["鳊鱼炖豆腐",["fish","tofu","chili"],36,false],["黄油煎虾",["shrimp"],32,false],["乡村啤酒鸭",["duck","chili","red_chili"],90,false],["冬瓜桑拿鸡",["chicken","wax_gourd"],28,false],["冷吃兔",["chili"],48,false],["咕噜肉",["pork","chili"],56,false],["商芝肉",["pork","honey","egg"],28,false],["孜然牛肉",["chili","beef"],45,false],["小炒肉",["pork","douchi"],52,false],["小米辣炒肉",["red_chili","pork"],24,false],["小酥肉",["pork","egg","flour"],90,false],["尖椒炒牛肉",["beef","chili"],72,false],["山西过油肉",["pork","egg","wood_ear"],36,false],["带把肘子",["tofu"],32,false],["意式烤鸡",["chicken_thigh","lemon"],44,false],["杀猪菜",["ribs","chili"],52,false],["椒盐排条",["egg","flour"],40,false],["水煮肉片",["pork","egg","bean_sprout","celery","chili","red_chili"],64,false],["烤鸡翅",["chicken_wing"],40,false],["猪肉烩酸菜",["pork"],60,false],["甜辣烤全翅",["chili"],44,false],["番茄红酱",["beef","carrot","celery","tomato","milk"],28,true],["白菜猪肉炖粉条",["pork","cabbage","potato"],52,true],["粉蒸肉",["pork","potato"],64,false],["糖醋里脊",["pork","egg","tomato"],36,true],["红烧鸡翅",["chicken_wing","chili"],72,false],["肉饼炖蛋",["pork","egg"],20,false],["腐乳肉",["pork"],36,false],["葱烧鸡腿",["chicken"],64,false],["蒜苔炒肉末",["pork"],44,false],["蚂蚁上树",["sweet_potato","pork"],48,false],["豉汁排骨",["ribs","douchi"],36,false],["香干肉丝",["pork","dried_tofu","chili"],60,false],["鱼香肉丝",["pork","carrot","chili","wood_ear","egg"],90,false],["麻辣香锅",["tofu","chili","sausage","greens"],52,true],["黄油鸡",["chicken_thigh","yogurt","tomato","red_chili","lemon"],90,true],["黄焖鸡",["chicken","mushroom","chili","potato"],72,false],["黄瓜炒肉",["cucumber","red_chili","pork"],44,false],["农家一碗香",["pork","chili"],17,false],["冬瓜酿肉",["wax_gourd","pork","egg"],56,false],["凉拌鸡丝",["chicken"],64,false],["卤菜",["chili"],90,false],["口水鸡",["chili","peanut"],56,false],["台式卤肉饭",["pork","egg","rice"],72,false],["咖喱肥牛",["milk","carrot","potato","beef","curry_block"],40,false],["啤酒鸭",["duck","chili"],32,false],["回锅肉",["pork","red_chili"],90,false],["土豆炖排骨",["ribs","potato","chili"],90,false],["奥尔良风味烤鸡腿",["chicken"],84,false],["奶酪培根通心粉",["cheese","flour","milk","bacon"],84,false],["姜葱捞鸡",["chicken_thigh","chicken"],52,false],["小炒黄牛肉",["pork","celery"],44,false],["尖叫牛蛙",["red_chili"],48,false],["巴基斯坦牛肉咖喱",["beef","tomato","yogurt"],48,true],["干煸仔鸡",["chicken","potato","chili","chicken_thigh"],48,false],["广式萝卜牛腩",["beef","radish","chili"],48,false],["徽派红烧肉",["pork"],36,false],["新疆大盘鸡",["potato","chicken"],52,false],["无骨鸡爪",["chicken_feet","red_chili","lemon"],90,false],["枝竹羊腩煲",["yuba","mushroom","potato"],2,false],["柱候牛腩",["beef","red_chili","chili"],90,false],["桂林十八酿",["chili","pork","shrimp"],90,false],["梅菜扣肉",["pork"],44,false],["水煮牛肉",["beef","bean_sprout","egg","chili","red_chili"],52,false],["淄博烧烤",["pork"],40,false],["清蒸鳜鱼",["fish","red_chili"],56,false],["湖南家常红烧肉",["pork"],32,false],["湘祁米夫鸭",["duck","chili","pork"],36,false],["澳门湿版免治牛肉饭",["pork","egg","tomato","rice"],44,true],["煎烤羊排",["lamb_chop","chili"],44,false],["牛排",["potato","cherry_tomato"],90,true],["田螺酿",["pork","bamboo_shoot","chili"],90,false],["瘦肉土豆片",["potato"],40,false],["空气炸锅脆皮现腌炸鸡",["chicken_wing","flour","milk","egg"],88,false],["糖醋排骨",["ribs","tomato"],45,true],["南派红烧肉",["pork"],80,false],["简易红烧肉",["egg","pork"],90,false],["羊排焖面",["lamb_chop","chili"],48,false],["老式锅包肉",["carrot","flour"],90,false],["芥末罗氏虾",["shrimp","red_chili"],60,false],["荔枝肉",["pear","egg","tomato","mushroom"],45,true],["荷兰豆炒腊肠",["snow_peas","sausage"],32,false],["血浆鸭",["duck","chili"],36,false],["西红柿土豆炖牛肉",["beef","potato","tomato"],88,true],["西红柿牛腩",["tomato","beef"],40,true],["豆豉鲮鱼油麦菜",["fish"],48,false],["豉汁蒸白鱔",["douchi","red_chili"],84,false],["贵州辣子鸡",["corn","potato","chili"],36,false],["酱排骨",["ribs"],32,false],["醉排骨",["ribs","fish","tomato","sweet_potato","egg"],36,true],["青椒酿",["chili","pork","egg"],90,false],["香干芹菜炒肉",["dried_tofu","celery","pork","chili"],2,false],["香煎五花肉",["pork","greens"],32,true],["鱼香茄子",["eggplant","pork"],36,false],["黑椒牛柳",["beef"],44,false],["黔式腊肠娃娃菜",["sausage","baby_cabbage"],28,true],["奶油蘑菇汤",["mushroom","flour","milk"],40,false],["山药南瓜炖鸡汤",["chicken","chestnut","yam","pumpkin","red_date"],32,false],["生汆丸子汤",["egg","wood_ear","vermicelli"],90,false],["番茄牛肉蛋花汤",["beef","tomato","egg"],72,true],["米粥",["rice"],32,false],["紫菜蛋花汤",["egg","seaweed","peeled_shrimp"],28,false],["罗宋汤",["beef","tomato","potato","carrot"],76,true],["腊八粥",["rice","peanut","red_date","lotus_seed","chestnut","peach","grape"],32,false],["金针菇汤",["enoki","egg"],28,false],["勾芡香菇汤",["mushroom"],32,false],["排骨山药玉米汤",["ribs","yam","carrot","corn"],1,false],["排骨苦瓜汤",["ribs","dried_shrimp"],52,false],["昂刺鱼豆腐汤",["fish","tofu"],28,false],["朱雀汤",["egg"],20,false],["玉米排骨汤",["ribs","corn","carrot"],56,false],["羊肉汤",["lamb"],40,false],["菌菇炖乳鸽",["mushroom","corn"],28,false],["陈皮排骨汤",["ribs"],44,false],["利提巧卡",["flour","eggplant","tomato","potato","chili","lemon","red_chili"],90,true],["印度烤饼",["flour","yogurt"],90,false],["印度焖饭",["rice","chicken_thigh","yogurt","tomato","chili","milk","red_chili","lemon"],90,true],["可乐炒饭",["rice","egg","sausage","cola"],20,false],["咸肉菜饭",["rice","greens","bamboo_shoot"],44,true],["手工水饺",["flour","pork","egg"],90,false],["汤面",["noodle","fish","egg","tofu_skin","carrot","greens"],36,true],["滕州菜煎饼",["cabbage","tofu","carrot","chives","egg","sausage","chili"],15,true],["炒年糕",["rice_cake","greens"],48,true],["炒河粉",["pork","bean_sprout"],90,false],["炒馍",["mantou","egg","chili"],15,false],["炸酱面",["pork","noodle"],36,false],["热干面",["green_beans","pork","radish"],32,false],["照烧鸡腿饭",["chicken","honey","broccoli","carrot","rice"],30,true],["煮泡面加蛋",["egg"],10,false],["猪油拌饭",["rice"],28,false],["红芸豆拌饭",["rice","tomato","chili","red_chili","curry_block"],90,true],["肉蛋盖饭",["rice","egg","pork"],40,false],["葱油拌面",["noodle"],72,false],["蒸卤面",["pork","celery","noodle","red_chili","chili"],68,false],["蛋包饭",["egg","carrot","corn","sausage","rice","tomato","milk"],48,true],["螺蛳粉",["bamboo_shoot","wood_ear"],40,false],["酸辣蕨根粉",["red_chili"],76,false],["韭菜盒子",["chives","peeled_shrimp","egg","flour"],28,true],["鲜肉烧卖",["pork","bamboo_shoot","mushroom","peeled_shrimp"],64,false],["鹰嘴豆炸饼",["flour","yogurt","tomato","chili","red_chili","lemon","curry_block"],90,true],["麻辣减脂荞麦面",["baby_cabbage","peanut","greens","milk"],28,true],["中式馅饼",["flour","egg","carrot"],88,false],["凉粉",["red_chili","chili","peanut"],48,false],["基础牛奶面包",["flour","egg","milk"],90,false],["微波炉腊肠煲仔饭",["sausage","egg","carrot"],72,false],["扬州炒饭",["egg","shrimp","ham","carrot","corn"],80,false],["披萨饼皮",["flour"],64,false],["日式咖喱饭",["curry_block","potato","carrot","bacon","egg"],88,false],["日式肥牛丼饭",["beef","egg","rice"],80,false],["河南蒸面条",["noodle","pork"],90,false],["火腿饭团",["ham","rice","corn"],32,false],["炒意大利面",["beef"],32,false],["炒方便面",["egg","sausage"],15,false],["烙饼",["flour"],44,false],["芝麻烧饼",["flour"],24,false],["电饭煲三文鱼炊饭",["fish","corn"],45,false],["空气炸锅照烧鸡饭",["chicken","egg"],28,false],["煮锅蒸米饭",["rice"],36,false],["电饭煲蒸米饭",["rice"],30,false],["老友猪肉粉",["pork","bamboo_shoot","douchi"],32,false],["茄子肉煎饼",["egg","eggplant","flour"],32,false],["豆角焖面",["noodle","green_beans"],90,false],["酱拌荞麦面",["cucumber","carrot"],20,false],["陕西油泼面",["noodle","greens","bean_sprout"],64,true],["韩式拌饭",["rice","egg","beef","bean_sprout","mushroom","carrot"],44,false],["鲣鱼海苔玉米饭",["fish","corn"],40,false],["凉拌金针菇",["enoki"],60,false],["凉拌黄瓜",["cucumber"],32,false],["印度土豆花菜",["potato","cauliflower","tomato","chili","red_chili"],68,true],["印度葫芦丸子",["tomato","chili","red_chili"],88,true],["家常日本豆腐",["tofu","chili","carrot","sausage","wood_ear","tomato"],30,true],["松仁玉米",["corn","carrot"],32,false],["油醋爆蛋",["egg","red_chili"],32,false],["清炒花菜",["cauliflower"],52,false],["清蒸南瓜",["pumpkin"],36,false],["炒土豆和胡萝卜蒸菜",["potato","carrot","chili"],32,false],["素炒豆角",["green_beans"],20,false],["红烧茄子",["chili","tomato","eggplant","egg","flour"],56,true],["脆皮豆腐",["tofu","egg"],40,false],["茄子炖土豆",["eggplant","potato","chili"],48,false],["葱煎豆腐",["tofu","chili"],44,false],["蒲烧茄子",["eggplant","honey"],44,false],["蚝油生菜",["greens"],40,true],["西红柿炒鸡蛋",["tomato","egg"],72,true],["酸辣土豆丝",["potato","chili","red_chili"],36,false],["金针菇日本豆腐煲",["enoki","tofu"],20,false],["金钱蛋",["egg","red_chili"],48,false],["陕北熬豆角",["green_beans","potato","tomato"],52,true],["鸡蛋火腿炒黄瓜",["cucumber","egg","sausage","chili"],44,false],["上汤娃娃菜",["baby_cabbage","century_egg","ham","enoki"],56,true],["乾隆白菜",["cabbage"],32,true],["凉拌木耳",["wood_ear","red_chili"],32,false],["凉拌莴笋",["celtuce","radish","red_chili"],28,false],["包菜炒鸡蛋粉丝",["egg","vermicelli","carrot"],52,false],["地三鲜",["eggplant","potato","chili"],90,false],["小炒藕丁",["red_chili","lotus_root"],20,false],["干锅花菜",["cauliflower","pork","chili"],44,false],["手撕包菜",["pork","red_chili"],20,false],["拔丝土豆",["potato"],32,false],["椒盐玉米",["corn"],64,false],["榄菜肉末四季豆",["green_beans","pork","red_chili"],52,false],["炒滑蛋",["egg","milk"],28,false],["炸洋葱花",["egg","flour","chili"],90,false],["烤茄子",["eggplant","chili"],52,false],["白灼菜心",["greens","rice"],40,true],["糖拌西红柿",["tomato"],40,true],["红烧冬瓜",["wax_gourd"],40,false],["芹菜拌茶树菇",["celery"],48,false],["莴笋叶煎饼",["celtuce","egg"],10,false],["菠菜炒鸡蛋",["greens","egg"],40,true],["蒜蓉炒芹菜",["celery"],36,false],["虎皮青椒",["chili"],44,false],["蚝油三鲜菇",["mushroom","red_chili","broccoli"],15,true],["西红柿豆腐汤羹",["tomato","egg","tofu"],15,true],["西葫芦炒鸡蛋",["egg","tomato"],44,true],["韭菜炒蛋",["chives","egg"],44,true],["微波炉鸡蛋羹",["egg","dried_shrimp"],52,false],["蒸箱鸡蛋羹",["egg"],64,false],["鸡蛋羹",["egg"],84,false],["鸡蛋花",["egg"],32,false],["响油鳝丝",[],40,false],["清蒸生蚝",[],32,false],["葱烧海参",[],56,false],["萝卜炖羊排",["lamb_chop","radish"],15,false],["虎皮肘子",[],20,false],["姜炒鸡",[],36,false],["小炒鸡肝",[],90,false],["猪皮冻",[],32,false],["红烧猪蹄",["pork_trotter"],44,false],["老妈蹄花",["pork_trotter"],40,false],["茭白炒肉",[],44,false],["酱牛肉",[],44,false],["香辣鸡爪煲",["chicken_feet"],40,false],["小米粥",[],28,false],["白萝卜丝清汤",["radish"],10,false],["银耳莲子粥",["lotus_seed","red_date"],36,false],["老干妈拌面",[],40,false],["醪糟小汤圆",[],28,false],["麻油拌面",[],36,false],["意式肉酱面",[],40,false],["炒凉粉",[],36,false],["凉拌油麦菜",[],24,false],["水油焖蔬菜",[],36,false],["话梅煮毛豆",[],20,false]];


const FOODS={"shrimp":["虾","protein"],"chicken":["鸡肉","protein"],"pork":["猪肉","protein"],"beef":["牛肉","protein"],"fish":["鱼","protein"],"ham":["火腿","protein"],"eggs":["鸡蛋","protein"],"tofu":["豆腐","protein"],"leafy greens":["青菜","greens"],"broccoli":["西兰花","greens"],"tomato":["番茄","greens"],"green chili":["青椒","veg"],"onion":["洋葱","veg"],"carrot":["胡萝卜","veg"],"potato":["土豆","carb"],"eggplant":["茄子","veg"],"mushrooms":["香菇","veg"],"cooked rice":["米饭","carb"],"noodles":["面条","carb"],"frozen dumplings":["速冻饺子","carb"],"bread":["面包","carb"],"milk":["牛奶","dairy"],"cheese":["芝士","dairy"],"yogurt":["酸奶","dairy"],"cola":["可乐","other"],"napa cabbage":["白菜","greens"],"baby cabbage":["娃娃菜","greens"],"lettuce":["生菜","greens"],"spinach":["菠菜","greens"],"celery":["芹菜","veg"],"chives":["韭菜","greens"],"bean sprouts":["豆芽","veg"],"cucumber":["黄瓜","veg"],"pumpkin":["南瓜","veg"],"wax gourd":["冬瓜","veg"],"luffa":["丝瓜","veg"],"lotus root":["莲藕","veg"],"chinese yam":["山药","veg"],"sweet corn":["玉米","carb"],"green beans":["豆角","veg"],"snow peas":["荷兰豆","veg"],"cauliflower":["花菜","veg"],"enoki mushroom":["金针菇","veg"],"wood ear":["木耳","veg"],"kelp":["海带","veg"],"cherry tomato":["小番茄","greens"],"red chili":["红辣椒","veg"],"chicken wings":["鸡翅","protein"],"pork ribs":["排骨","protein"],"bacon":["培根","protein"],"sausage":["香肠","protein"],"peeled shrimp":["虾仁","protein"],"firm tofu":["豆干","protein"],"duck":["鸭肉","protein"],"lamb":["羊肉","protein"],"steamed bun":["馒头","carb"],"flour":["面粉","carb"],"rice cake":["年糕","carb"],"sweet potato":["红薯","carb"],"purple sweet potato":["紫薯","carb"],"butter":["黄油","dairy"],"cream":["淡奶油","dairy"],"apple":["苹果","fruit"],"banana":["香蕉","fruit"],"mandarin":["砂糖橘","fruit"],"orange":["橙子","fruit"],"grapes":["葡萄","fruit"],"strawberry":["草莓","fruit"],"blueberry":["蓝莓","fruit"],"pear":["梨","fruit"],"watermelon":["西瓜","fruit"],"peach":["桃","fruit"],"kiwi":["猕猴桃","fruit"],"mango":["芒果","fruit"],"dragon fruit":["火龙果","fruit"],"lemon":["柠檬","fruit"],"avocado":["牛油果","fruit"],"cherries":["车厘子","fruit"],"white radish":["白萝卜","veg"],"lamb chops":["羊排","protein"],"taro":["芋头","carb"],"celtuce":["莴笋","veg"],"bamboo shoots":["春笋","veg"],"fermented beans":["豆豉","veg"],"glass noodles":["粉丝","carb"],"bean curd stick":["腐竹","protein"],"tofu skin":["千张","protein"],"century egg":["皮蛋","protein"],"garlic sprouts":["蒜苗","veg"],"red dates":["红枣","other"],"chicken thigh":["鸡腿肉","protein"],"pork belly":["五花肉","protein"],"honey":["蜂蜜","other"],"curry cubes":["咖喱块","other"],"peanuts":["花生","other"],"chestnuts":["板栗","other"],"chinese kale":["芥蓝","greens"],"crown daisy":["茼蒿","greens"],"asparagus":["芦笋","veg"],"okra":["秋葵","veg"],"dried seaweed":["紫菜","other"],"dried shrimp":["虾皮","protein"],"squid":["鱿鱼","protein"],"beef brisket":["牛腩","protein"],"pork trotter":["猪蹄","protein"],"chicken feet":["鸡爪","protein"],"lotus seeds":["莲子","other"],"edamame":["毛豆","veg"],"frozen tangyuan":["汤圆","carb"]};
const CN_TAG={"虾":"protein","鸡肉":"protein","猪肉":"protein","牛肉":"protein","鱼":"protein","火腿":"protein","鸡蛋":"protein","豆腐":"protein","青菜":"greens","西兰花":"greens","番茄":"greens","青椒":"veg","洋葱":"veg","胡萝卜":"veg","土豆":"carb","茄子":"veg","香菇":"veg","米饭":"carb","面条":"carb","速冻饺子":"carb","面包":"carb","牛奶":"dairy","芝士":"dairy","酸奶":"dairy","可乐":"other","白菜":"greens","娃娃菜":"greens","生菜":"greens","菠菜":"greens","芹菜":"veg","韭菜":"greens","豆芽":"veg","黄瓜":"veg","南瓜":"veg","冬瓜":"veg","丝瓜":"veg","莲藕":"veg","山药":"veg","玉米":"carb","豆角":"veg","荷兰豆":"veg","花菜":"veg","金针菇":"veg","木耳":"veg","海带":"veg","小番茄":"greens","红辣椒":"veg","鸡翅":"protein","排骨":"protein","培根":"protein","香肠":"protein","虾仁":"protein","豆干":"protein","鸭肉":"protein","羊肉":"protein","馒头":"carb","面粉":"carb","年糕":"carb","红薯":"carb","紫薯":"carb","黄油":"dairy","淡奶油":"dairy","苹果":"fruit","香蕉":"fruit","砂糖橘":"fruit","橙子":"fruit","葡萄":"fruit","草莓":"fruit","蓝莓":"fruit","梨":"fruit","西瓜":"fruit","桃":"fruit","猕猴桃":"fruit","芒果":"fruit","火龙果":"fruit","柠檬":"fruit","牛油果":"fruit","车厘子":"fruit","白萝卜":"veg","羊排":"protein","芋头":"carb","莴笋":"veg","春笋":"veg","豆豉":"veg","粉丝":"carb","腐竹":"protein","千张":"protein","皮蛋":"protein","蒜苗":"veg","红枣":"other","鸡腿肉":"protein","五花肉":"protein","蜂蜜":"other","咖喱块":"other","花生":"other","板栗":"other","芥蓝":"greens","茼蒿":"greens","芦笋":"veg","秋葵":"veg","紫菜":"other","虾皮":"protein","鱿鱼":"protein","牛腩":"protein","猪蹄":"protein","鸡爪":"protein","莲子":"other","毛豆":"veg","汤圆":"carb"};


const S16='16',S32='32';
const g16=ch=>FONT[S16][ch]||FONT[S16]['□'], g32=ch=>FONT[S32][ch]||FONT[S32]['□'];
function measure(value,size){let w=0;for(const ch of value){const g=size===32?g32(ch):g16(ch);if(g)w+=g.w;}return w;}
function fit(value,size,maxWidth){
 if(measure(value,size)<=maxWidth)return value;
 let out=value;
 while(out.length>1&&measure(out+'…',size)>maxWidth)out=out.slice(0,-1);
 return out+'…';
}

// 常见英文写法（data.js 之外）
const EXTRA={
 "fish":["鱼","protein"],"salmon":["三文鱼","protein"],"tuna":["金枪鱼","protein"],
 "cod":["鳕鱼","protein"],"squid":["鱿鱼","protein"],"crab":["蟹","protein"],
 "prawn":["虾","protein"],"prawns":["虾","protein"],"bacon":["培根","protein"],
 "sausage":["香肠","protein"],"dumpling":["饺子","carb"],"dumplings":["饺子","carb"],
 "chicken wings":["鸡翅","protein"],"chicken wing":["鸡翅","protein"],
 "chicken breast":["鸡胸肉","protein"],"steak":["牛排","protein"],
 "minced pork":["猪肉末","protein"],"pork belly":["五花肉","protein"],
 "spinach":["菠菜","greens"],"lettuce":["生菜","greens"],"bok choy":["小白菜","greens"],
 "chinese cabbage":["大白菜","greens"],"cabbage":["卷心菜","greens"],
 "celery":["芹菜","greens"],"kale":["羽衣甘蓝","greens"],
 "tomato":["番茄","veg"],"tomatoes":["番茄","veg"],"potato":["土豆","carb"],
 "potatoes":["土豆","carb"],"sweet potato":["红薯","carb"],
 "carrot":["胡萝卜","veg"],"carrots":["胡萝卜","veg"],"onion":["洋葱","veg"],
 "garlic":["大蒜","veg"],"ginger":["姜","veg"],"cucumber":["黄瓜","veg"],
 "mushroom":["蘑菇","veg"],"mushrooms":["蘑菇","veg"],"broccoli":["西兰花","greens"],
 "corn":["玉米","veg"],"peas":["豌豆","veg"],"bell pepper":["彩椒","veg"],
 "pumpkin":["南瓜","veg"],"eggplant":["茄子","veg"],
 "apple":["苹果","fruit"],"apples":["苹果","fruit"],"banana":["香蕉","fruit"],
 "bananas":["香蕉","fruit"],"orange":["橙子","fruit"],"oranges":["橙子","fruit"],
 "grape":["葡萄","fruit"],"grapes":["葡萄","fruit"],"strawberry":["草莓","fruit"],
 "watermelon":["西瓜","fruit"],"pear":["梨","fruit"],"peach":["桃","fruit"],
 "mango":["芒果","fruit"],"blueberry":["蓝莓","fruit"],"lemon":["柠檬","fruit"],
 "milk":["牛奶","dairy"],"yogurt":["酸奶","dairy"],"yoghurt":["酸奶","dairy"],
 "cheese":["奶酪","dairy"],"butter":["黄油","dairy"],"cream":["奶油","dairy"],
 "bread":["面包","carb"],"rice":["米饭","carb"],"noodles":["面条","carb"],
 "noodle":["面条","carb"],"pasta":["意面","carb"],"flour":["面粉","carb"],
 "egg":["鸡蛋","protein"],"eggs":["鸡蛋","protein"],"tofu":["豆腐","protein"],
 "ham":["火腿","protein"],"leafy greens":["青菜","greens"],
 "snap peas":["荷兰豆","veg"],
};

export function localize(name){
 const raw=String(name||'').replace(/[\r\n\t]/g,' ').trim().slice(0,64);
 if(!raw)return {label:'未命名食材',tag:'other'};
 const key=raw.toLowerCase();
 if(EXTRA[key])return {label:EXTRA[key][0],tag:EXTRA[key][1]};
 if(FOODS[key])return {label:FOODS[key][0],tag:FOODS[key][1]};
 if(CN_TAG[raw])return {label:raw,tag:CN_TAG[raw]};
 return {label:raw,tag:tagOf(raw)};
}

function tagOf(text){
 const t=text.toLowerCase();
 if(/鱼|虾|蟹|贝|海鲜|fish|shrimp|salmon|tuna|prawn/.test(t))return 'protein';
 if(/蛋|egg/.test(t))return 'protein';
 if(/豆|tofu|bean/.test(t))return 'protein';
 if(/菜|菠菜|生菜|白菜|青菜|芹|韭|greens|spinach|lettuce|cabbage|celery/.test(t))return 'greens';
 if(/奶|芝士|奶酪|酸奶|黄油|milk|cheese|yogurt|butter|cream/.test(t))return 'dairy';
 if(/米|面|馒头|面包|土豆|红薯|rice|noodle|bread|potato|pasta/.test(t))return 'carb';
 if(/果|apple|banana|orange|grape|berry|melon|peach|pear/.test(t))return 'fruit';
 if(/肉|鸡|猪|牛|羊|鸭|ham|chicken|beef|pork|lamb|meat/.test(t))return 'protein';
 if(/椒|茄|瓜|菇|葱|姜|蒜|萝卜|tomato|pepper|onion|garlic|mushroom|cucumber|carrot/.test(t))return 'veg';
 return 'other';
}

export function inventoryRows(items,now){
 const today=Math.floor((now+8*3600000)/DAY);
 return items.filter(i=>Number.isFinite(Number(i.qty))&&Number(i.qty)>0).map(i=>{
  let days=null;
  if(typeof i.added_at==='string'&&/^\d{4}-\d{2}-\d{2}/.test(i.added_at)&&Number.isFinite(i.life)){
   const added=Date.parse(i.added_at.slice(0,10)+'T00:00:00Z');if(Number.isFinite(added))days=i.life-(today-Math.floor(added/DAY));
  }
  if(days===null&&Number.isFinite(i.days_left))days=i.days_left;
  const local=localize(i.name);
  return {name:local.label,tag:local.tag,days,cat:String(i.cat||'')};
 }).sort((a,b)=>(a.days===null)-(b.days===null)||(a.days??0)-(b.days??0)||a.name.localeCompare(b.name,'zh'));
}

export function recommend(rows){
 // 与 logic.js evaluate() 同规则：最先坏的主轴、青菜加权、慢菜扣分、缺料重扣
 const byCat={};
 for(const r of rows){if(!r.cat)continue;(byCat[r.cat]=byCat[r.cat]||[]).push(r);}
 let best=null;
 for(const item of RECIPES){
  const [name,needs,minutes,greens]=item;
  if(!needs||!needs.length)continue;
  const used=[];let missing=0;
  for(const need of needs){
   const list=(byCat[need]||[]).filter(x=>x.days===null||x.days>=0);
   if(list.length){
    list.sort((a,b)=>(a.days===null?99:a.days)-(b.days===null?99:b.days));
    used.push(list[0]);
   }else missing++;
  }
  if(!used.length)continue;
  const left=u=>u.days===null?99:u.days;
  const soonest=Math.min(...used.map(left));
  const urgency=used.reduce((acc,u)=>acc+Math.max(0,8-left(u))*0.35,0)+(soonest<=3?(4-soonest)*2.2:0);
  const score=urgency+(greens?4:0)-Math.max(0,minutes-20)*1.2-missing*10;
  if(!best||score>best.score)best={name,minutes,used:used.map(u=>u.name),ready:missing===0,score};
 }
 return best;
}

export function renderFrame(items,now=Date.now()){
 const frame=new Uint8Array(15000),rows=inventoryRows(items,now);
 const pixel=(x,y,black=true)=>{if(x<0||y<0||x>=400||y>=300)return;const n=y*50+(x>>3),mask=128>>(x&7);if(black)frame[n]|=mask;else frame[n]&=~mask;};
 const rect=(x,y,w,h,black=true)=>{for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)pixel(xx,yy,black);};
 const text=(value,x,y,size=S16,width=376,black=true)=>{
  const start=x;const pick=size===32?g32:g16;
  for(const ch of value){
   const g=pick(ch);if(!g)continue;
   if(x+g.w>start+width)break;
   const raw=Uint8Array.from(atob(g.b),c=>c.charCodeAt(0)),stride=Math.ceil(g.w/8),h=size+4;
   for(let yy=0;yy<h;yy++)for(let xx=0;xx<g.w;xx++)if(raw[yy*stride+(xx>>3)]&(128>>(xx&7)))pixel(x+xx,y+yy,black);
   x+=g.w;
  }
 };
 const textRight=(value,right,y,size=S16,black=true)=>text(value,right-measure(value,size),y,size,400,black);

 // ---- 44×44 图标（由 design44.py 生成并内嵌 base64） ----
const ICONS={"leaf":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgAAAAAAfwAAAAAD/8AAAAAf/+AAAAD//+AAAAH//+AAAAP/9+AAAAf/5+AAAAf/z8AAAA//n8AAAB//v8AAAD//f4AAAD/+/4AAAH/8/4AAAP/5/wAAAf/z3wAAAf/nnwAAAP/vvgAAAP/ffAAAAP++eAAAAP888AAAAH594AAAAHz7wAAAAH/zgAAAAD/nAAAAAD/uAAAAAD/8AAAAAD/4AAAAAB/wAAAAAB/AAAAAAB+AAAAAAD4AAAAAAHwAAAAAAHAAAAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","bone":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH4AAfgAAP+AA/4AAf+AB/4AA//AD/8AA//AD/8AA//AD/8AA//AD/8AA//AD/8AAf/AB/8AAf////4AAP////wAAH////gAAA///+AAAA///8AAAB///+AAAH////wAAP////4AAf/AB/8AA//AD/8AA//AD/8AA//AD/8AA//AD/8AA//AD/8AAf/AB/8AAf+AB/4AAP8AA/wAADwAAPAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","cube":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAB8AAAAAAD+AAAAAAP/gAAAAA//wAAAAD//8AAAAH//+AAAAf///gAAB////wAAD////gAAD///+IAAI///84AAOf//z4AAPn//H4AAPx/8f4AAP8/5/4AAP+Pn/4AAP/mP/4AAP/4//4AAP/9//4AAP/9//4AAP/9//4AAP/9//4AAP/9//4AAP/9//gAAD/9//AAAB/9/8AAAAf9/wAAAAP9/gAAAAD9+AAAAAA94AAAAAAdgAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","fish":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAHAAAAAAAPAAAHgAAfAAD//AA/AAP//wB/AA///8D/AB///+H/AD8///P/AH4f////AHwP////AH4f////AP4f////AP//////AH//////AH////v/AD////H/AB///+D/AA///8B/AAf//4A/AAD//gAfAAAf4AAPAAAAAAAHAAAAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","egg":"AAAAAAAAAAAAAAAAAAAGAAAAAAA/wAAAAAB/4AAAAAD/8AAAAAH/+AAAAAH//AAAAAP//AAAAAP//gAAAAeH/gAAAAcD/gAAAA8D/wAAAA8D/wAAAA8D/wAAAA8D/4AAAB+H/4AAAB///4AAAB///4AAAB///4AAAB///4AAAB///4AAAB///4AAAB///4AAAB///4AAAB///4AAAB///4AAAB///4AAAA///4AAAA///wAAAA///wAAAA///wAAAAf//gAAAAf//gAAAAP//gAAAAP//AAAAAH//AAAAAH/+AAAAAD/8AAAAAB/4AAAAAA/wAAAAAAGAAAAAAAAAAAAAAAAAAAA","milk":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB//8AAAADgP8AAAAHgP8AAAAPgP8AAAAPgP8AAAAfgP8AAAA/gP8AAAB///8AAAB///8AAAD///8AAAD///8AAAD///8AAAD///8AAAD///8AAAD///8AAAD///8AAAD///8AAAD///8AAAD///8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD///8AAAD///8AAAD///8AAAD///8AAAD///8AAAD///8AAAD///8AAAD///8AAAD///8AAAD///8AAAD///8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","bowl":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8AAAAAf//gAAAB///4AAAD///8AAAH///+AAAH///+AAAP////AAAP////AAAH///+AAAH///+AAAH///+AAf//////gf//////gf//////gf//////gP//////AAAAAAAAAAAAAAAAAP//////AP//////AH/////+AH/////+AH/////+AH/////+AD/////8AD/////8AB/////4AB/////4AA/////wA","apple":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH8AAAAAHv/AAAAAH//AAAAAH//gAAAAH//gAAAAH//AAAAAHv/AAAAAHn8AAAAAHgAAAAAAPgAAAAAH/+AAAAAf//gAAAB///4AAAD///8AAAH///+AAAP////AAAf////gAA/////wAA/////wAA/j///wAB/B///4AB+A///4AB+A///4AB+A///4AB+A///4AB+A///4AB/B///4AA/j///wAA/////wAA/////wAAf////gAAP////AAAH///+AAAD///8AAAB///4AAAAf//gAAAAH/+AAAAAAPAAAAAAAAAAAAAAAAAAAA","box":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA////+AAA////8AAA////4QAA////xwAA////jwAA+A//HwAA+A/+PwAA+A/8fwAA+A/4/wAA+A/x/wAA+A/j/wAA///H/wAA//+P/wAA//8f/wAA//4//wAA//x//wAA//j//wAA//H//wAA/+P//wAA/8f//wAA/4///wAA/x///wAA/D///wAA+H///wAA8P///wAA4f///wAAw////wAAh////wAAD////wAAP////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"};
const ICON=44, ICON_STRIDE=6;
 function drawIcon(kind,X,Y){
  const b=ICONS[kind]||ICONS.box;
  const raw=Uint8Array.from(atob(b),c=>c.charCodeAt(0));
  for(let y=0;y<ICON;y++)for(let x=0;x<ICON;x++)if(raw[y*ICON_STRIDE+(x>>3)]&(128>>(x&7)))pixel(X+x,Y+y);
 }
 function iconFor(tag,label){
  if(tag==='greens'||tag==='veg')return 'leaf';
  if(tag==='carb')return 'bowl';
  if(tag==='dairy')return 'milk';
  if(tag==='fruit')return 'apple';
  if(tag==='protein'){
   if(/鱼|虾|蟹|贝|鱿/.test(label))return 'fish';
   if(/蛋/.test(label))return 'egg';
   if(/豆/.test(label))return 'cube';
   return 'bone';
  }
  return 'box';
 }

 // ---- 版式 400×300：上半临期、下半今晚的菜 ----
 rect(0,0,400,28);
 text('FRIDGE DECISION',14,3,16,240,false);
 textRight('共 '+rows.length+' 样',386,3,16,false);

 // 过期不显示；只留还能吃的
 const soon=rows.filter(r=>r.days===null||r.days>=0).slice(0,2);
 text('先吃这些',16,34,16,200);
 rect(84,42,56,1);
 if(!soon.length)text('没有临期食材',16,64,16);
 soon.forEach((r,index)=>{
  const y=56+index*60;
  const urgent=r.days!==null&&r.days<=1;
  drawIcon(iconFor(r.tag,r.name),8,y+8);
  const label=r.days===null?'日期待确认':r.days===0?'今天到期':'还剩 '+r.days+' 天';
  const lw=measure(label,S16);
  text(fit(r.name,32,384-64-lw-16),64,y,32,384-64-lw-16);
  const ly=y+8;
  if(urgent){
   rect(384-lw-6,ly-2,lw+12,21);
   text(label,384-lw,ly,16,400,false);
  }else{
   text(label,384-lw,ly,16,400);
  }
 });

 rect(16,166,368,1);

 const pick=recommend(rows);
 text('今晚做这个',16,174,16,200);
 rect(116,182,52,1);
 if(pick){
  text(fit(pick.name,32,368),16,200,32,368);
  let meta=pick.minutes+' 分钟，用掉 '+pick.used.slice(0,3).join('、');
  if(!pick.ready)meta+='，还缺料';
  text(fit(meta,16,368),16,242,16,368);
 }else{
  text('库存还不够做一道菜',16,206,16);
 }

 const stamp=new Date(Math.floor(now/(30*60000))*30*60000+8*3600000).toISOString().slice(5,16).replace('T',' ');
 text('更新 '+stamp+'，请核实包装',16,274,16,368);
 return frame;
}
