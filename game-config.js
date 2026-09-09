/*
 * === 事件設定區 ===
 *
 * 要新增事件：複製 EVENT_DEFINITIONS 裡任一事件物件，再修改 title、story、
 * category、sentiment、weight、effectType、value、displayEffect、enabled 即可。
 * 所有事件直接執行；只使用既有 effectType 時，不必修改 game.js。
 * weight 越大越常出現；enabled: false 的事件不會被抽中，也不列入機率計算。
 */

const SCORE_CONFIG = Object.freeze({
  line: Object.freeze({ first: 30, second: 60, thirdPlus: 90 }),
  // 花色數值是「該門目前總獎勵值」，不是每個 milestone 的額外加分。
  suit: Object.freeze({ five: 5, seven: 9, nine: 15 }),
  honor: Object.freeze({ fourWinds: 5, threeDragons: 5 }),
  special: Object.freeze({ earlyWaiting: 5, lastTileFirstLine: 5 })
});

// Temporary / Phase 1-B only. Phase 1-C will replace these placeholders with
// draw-ready equipment, bet, and special-event definitions from the same pool.
const PRE_ROUND_EVENT_DEFINITIONS = Object.freeze([
  Object.freeze({ id: "phase-1b-event-a", title: "測試場中事件 A", description: "Phase 1-B 測試事件，本局暫無效果。", type: "PLACEHOLDER" }),
  Object.freeze({ id: "phase-1b-event-b", title: "測試場中事件 B", description: "Phase 1-B 測試事件，本局暫無效果。", type: "PLACEHOLDER" }),
  Object.freeze({ id: "phase-1b-event-c", title: "測試場中事件 C", description: "Phase 1-B 測試事件，本局暫無效果。", type: "PLACEHOLDER" })
]);

const EVENT_DEFINITIONS = [
  { id: "boss-happy", title: "老闆今天心情很好", story: "今天生意不錯，老闆順手多送你一些分數。", category: "NORMAL", sentiment: "POSITIVE", effectType: "ADD_SCORE", value: 2, weight: 16, displayEffect: "+2 分", enabled: true },
  { id: "wrong-change", title: "老闆算錯錢", story: "老闆找錢找多了，而且他完全沒有發現。", category: "NORMAL", sentiment: "POSITIVE", effectType: "ADD_SCORE", value: 3, weight: 12, displayEffect: "+3 分", enabled: true },
  { id: "boss-helps", title: "老闆偷偷放水", story: "老闆趁沒人注意，偷偷幫你把獎金加了一點。", category: "NORMAL", sentiment: "POSITIVE", effectType: "ADD_SCORE", value: 4, weight: 7, displayEffect: "+4 分", enabled: true },
  { id: "broadcast", title: "夜市廣播抽中你", story: "廣播突然叫到你的號碼，你莫名其妙中了活動獎。", category: "NORMAL", sentiment: "POSITIVE", effectType: "ADD_SCORE", value: 5, weight: 7, displayEffect: "+5 分", enabled: true },
  { id: "red-envelope", title: "神秘紅包", story: "地上出現一個不知道誰掉的紅包，裡面居然是夜市分數。", category: "NORMAL", sentiment: "POSITIVE", effectType: "RANDOM_SCORE", value: [1, 5], weight: 10, displayEffect: "隨機 +1～+5 分", enabled: true },
  { id: "boss-drink", title: "老闆請你喝飲料", story: "老闆看你摸得認真，豪氣地請你喝一杯。", category: "NORMAL", sentiment: "POSITIVE", effectType: "ADD_SCORE", value: 2, weight: 14, displayEffect: "+2 分", enabled: true },
  { id: "jackpot", title: "神秘大獎", story: "老闆從桌子下面拿出一個連他自己都忘記的紅包。", category: "NORMAL", sentiment: "POSITIVE", effectType: "ADD_SCORE", value: 5, weight: 7, displayEffect: "+5 分", enabled: true },
  { id: "pocket-points", title: "口袋發現上次的分數", story: "手伸進口袋，竟然摸到上次忘記用完的分數。", category: "NORMAL", sentiment: "POSITIVE", effectType: "ADD_SCORE", value: 4, weight: 8, displayEffect: "+4 分", enabled: true },
  { id: "drain", title: "手滑掉進水溝", story: "你剛摸到的幸運突然跟著麻將一起掉進水溝。", category: "NORMAL", sentiment: "NEGATIVE", effectType: "SUB_SCORE", value: 2, weight: 16, displayEffect: "-2 分", enabled: true },
  { id: "caught", title: "老闆抓到你偷看", story: "老闆：少年欸，你是不是偷看牌？", category: "NORMAL", sentiment: "NEGATIVE", effectType: "SUB_SCORE", value: 5, weight: 9, displayEffect: "-5 分", enabled: true },
  { id: "crying-kid", title: "隔壁小屁孩哭著求你給他分數", story: "哭聲太有穿透力，你只好分一點換取清靜。", category: "NORMAL", sentiment: "NEGATIVE", effectType: "SUB_SCORE", value: 3, weight: 13, displayEffect: "-3 分", enabled: true },
  { id: "thief", title: "小偷來了", story: "趁你專心看著盤面時，小偷偷走桌上的分數。", category: "NORMAL", sentiment: "NEGATIVE", effectType: "SUB_SCORE", value: 5, weight: 9, displayEffect: "-5 分", enabled: true },
  { id: "neighbor-leaves", title: "隔壁攤不玩了", story: "隔壁玩家突然去買雞排，把剩下的次數送給你。", category: "SPECIAL", sentiment: "POSITIVE", effectType: "ADD_ROUNDS", value: 2, weight: 6, displayEffect: "+2 次", enabled: true },
  { id: "free-round", title: "免費再來一次", story: "老闆說你長得很面熟，今天算你一次免費的。", category: "SPECIAL", sentiment: "POSITIVE", effectType: "ADD_ROUNDS", value: 1, weight: 9, displayEffect: "+1 次", enabled: true },
  { id: "temple", title: "夜市神明保佑", story: "附近宮廟遶境經過，鑼鼓一響，今晚運氣突然變好了。", category: "SPECIAL", sentiment: "POSITIVE", effectType: "ADD_ROUNDS", value: 2, weight: 5, displayEffect: "+2 次", enabled: true },
  { id: "reversal", title: "命運逆轉", story: "你以為完蛋了，結果老闆突然多送三次。", category: "SPECIAL", sentiment: "POSITIVE", effectType: "ADD_ROUNDS", value: 3, weight: 2, displayEffect: "+3 次", enabled: true },
  { id: "double-round", title: "老闆突然加碼", story: "老闆拍桌大喊：這局最後結算整個翻倍！", category: "SPECIAL", sentiment: "POSITIVE", effectType: "DOUBLE_FINAL_MULTIPLIER", value: 2, weight: 6, displayEffect: "本局最終倍率 ×2", enabled: true },
  { id: "expert", title: "隔壁高手來亂", story: "隔壁高手突然開始大聲指揮，把你搞得完全不會摸。", category: "SPECIAL", sentiment: "NEGATIVE", effectType: "HALVE_ROUND_SCORE", value: 0.5, weight: 7, displayEffect: "本局目前分數減半", enabled: true },
  { id: "no-invite", title: "不揪被抓到", story: "被朋友發現來夜市竟然沒有揪，只好分他一局去玩。", category: "SPECIAL", sentiment: "NEGATIVE", effectType: "SUB_ROUNDS", value: 1, weight: 6, displayEffect: "失去 1 次", enabled: true },
  { id: "explosion", title: "隔壁瓦斯桶爆炸", story: "碰！！！隔壁攤位傳來巨響，所有人拔腿就跑！", category: "SPECIAL", sentiment: "NEGATIVE", effectType: "END_GAME", value: true, weight: 1, displayEffect: "完成本局結算後 GAME OVER", enabled: true },
  { id: "on-purpose-accident", title: "故意不小心", story: "老闆趁你低頭時，偷偷拿走一張牌。", category: "SPECIAL", sentiment: "NEGATIVE", effectType: "REMOVE_DRAWN_TILE", value: 1, weight: 4, displayEffect: "隨機移除一張已取得普通麻將", enabled: true },
  { id: "blackout", title: "停電", story: "啪！整條夜市突然停電，老闆摸黑宣布這局到此為止。", category: "SPECIAL", sentiment: "NEUTRAL", effectType: "END_ROUND", value: true, weight: 4, displayEffect: "立即結束本局並結算", enabled: true },
  { id: "five-tiao-mistake", title: "五條誤", story: "老闆拿起牌看了一眼：『啊？這不是五條喔？』", category: "SPECIAL", sentiment: "NEUTRAL", effectType: "REPLACE_DRAWN_TILE", value: { from: "suo-5", targetSuit: "suo" }, weight: 5, displayEffect: "將五條換成另一張未取得條子", enabled: true },
  { id: "sleight-of-hand", title: "偷天換日", story: "老闆手一晃，場上一張牌竟然悄悄換了位置。", category: "SPECIAL", sentiment: "NEUTRAL", effectType: "SWAP_DRAWN_TILE", value: 1, weight: 5, displayEffect: "已取得牌與未取得普通牌互換", enabled: true },
  { id: "baseball-reset", title: "隔壁棒球攤的球飛過來", story: "球突然飛過來把桌上的牌打亂，只好重新擺桌。", category: "SPECIAL", sentiment: "NEUTRAL", effectType: "RESTART_ROUND", value: true, weight: 4, displayEffect: "本局重新開始，不重扣次數", enabled: true }
];

const BET_DEFINITIONS = [
  { id: "believe-guoju", title: "相信國聚", description: "東、南、西、北、中、發、白中，正式取得任意 5 張。", reward: 30, penalty: 30, conditionType: "MIN_HONORS", conditionValue: { tileIds: ["east", "south", "west", "north", "red", "green", "white"], minimum: 5 }, enabled: true },
  { id: "one-line", title: "我一定會連！", description: "本局至少完成 1 條正式連線。", reward: 15, penalty: 10, conditionType: "MIN_LINES", conditionValue: 1, enabled: true },
  { id: "waiting", title: "我要聽牌", description: "本局曾經至少形成一次 5/6 聽牌。", reward: 5, penalty: 5, conditionType: "EVER_WAITED", conditionValue: true, enabled: true },
  { id: "three-lines", title: "豪賭三線", description: "高風險：本局完成至少 3 條正式連線。", reward: 50, penalty: 20, conditionType: "MIN_LINES", conditionValue: 3, enabled: true }
];
