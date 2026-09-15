(function exposeMemoryMaster(global) {
  "use strict";

  const REVEAL_SECONDS = 5;
  const CARD_COUNT = 4;
  const WRONG_REVEAL_DELAY_MS = 1000;
  const RESULT_DELAY_MS = 800;

  const THEMES = Object.freeze([
    Object.freeze({ id: "fruit", name: Object.freeze({ zh: "水果", en: "Fruits" }), items: Object.freeze([
      ["apple", "🍎", "蘋果", "Apple"], ["banana", "🍌", "香蕉", "Banana"], ["grape", "🍇", "葡萄", "Grape"], ["watermelon", "🍉", "西瓜", "Watermelon"],
      ["strawberry", "🍓", "草莓", "Strawberry"], ["pineapple", "🍍", "鳳梨", "Pineapple"], ["orange", "🍊", "橘子", "Orange"], ["lemon", "🍋", "檸檬", "Lemon"],
      ["cherry", "🍒", "櫻桃", "Cherry"], ["peach", "🍑", "桃子", "Peach"], ["kiwi", "🥝", "奇異果", "Kiwi"], ["mango", "🥭", "芒果", "Mango"]
    ].map(([id, emoji, zh, en]) => Object.freeze({ id, emoji, name: Object.freeze({ zh, en }) }))) }),
    Object.freeze({ id: "animal", name: Object.freeze({ zh: "動物", en: "Animals" }), items: Object.freeze([
      ["lion", "🦁", "獅子", "Lion"], ["elephant", "🐘", "大象", "Elephant"], ["shark", "🦈", "鯊魚", "Shark"], ["dinosaur", "🦖", "恐龍", "Dinosaur"],
      ["monkey", "🐒", "猴子", "Monkey"], ["panda", "🐼", "熊貓", "Panda"], ["rabbit", "🐰", "兔子", "Rabbit"], ["tiger", "🐯", "老虎", "Tiger"],
      ["penguin", "🐧", "企鵝", "Penguin"], ["frog", "🐸", "青蛙", "Frog"], ["fox", "🦊", "狐狸", "Fox"], ["giraffe", "🦒", "長頸鹿", "Giraffe"]
    ].map(([id, emoji, zh, en]) => Object.freeze({ id, emoji, name: Object.freeze({ zh, en }) }))) }),
    Object.freeze({ id: "food", name: Object.freeze({ zh: "食物", en: "Foods" }), items: Object.freeze([
      ["hamburger", "🍔", "漢堡", "Hamburger"], ["pizza", "🍕", "披薩", "Pizza"], ["fries", "🍟", "薯條", "Fries"], ["donut", "🍩", "甜甜圈", "Donut"],
      ["iceCream", "🍦", "冰淇淋", "Ice Cream"], ["cake", "🍰", "蛋糕", "Cake"], ["hotDog", "🌭", "熱狗", "Hot Dog"], ["sushi", "🍣", "壽司", "Sushi"],
      ["chicken", "🍗", "雞腿", "Chicken"], ["popcorn", "🍿", "爆米花", "Popcorn"], ["ramen", "🍜", "拉麵", "Ramen"], ["riceBall", "🍙", "飯糰", "Rice Ball"]
    ].map(([id, emoji, zh, en]) => Object.freeze({ id, emoji, name: Object.freeze({ zh, en }) }))) }),
    Object.freeze({ id: "sport", name: Object.freeze({ zh: "運動", en: "Sports" }), items: Object.freeze([
      ["baseball", "⚾", "棒球", "Baseball"], ["basketball", "🏀", "籃球", "Basketball"], ["soccer", "⚽", "足球", "Soccer"], ["tennis", "🎾", "網球", "Tennis"],
      ["badminton", "🏸", "羽球", "Badminton"], ["volleyball", "🏐", "排球", "Volleyball"], ["tableTennis", "🏓", "桌球", "Table Tennis"], ["bowling", "🎳", "保齡球", "Bowling"],
      ["golf", "⛳", "高爾夫", "Golf"], ["boxing", "🥊", "拳擊", "Boxing"], ["swimming", "🏊", "游泳", "Swimming"], ["archery", "🏹", "射箭", "Archery"]
    ].map(([id, emoji, zh, en]) => Object.freeze({ id, emoji, name: Object.freeze({ zh, en }) }))) })
  ]);

  function shuffle(items, random) {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  }

  function createRound(random = Math.random) {
    const theme = THEMES[Math.floor(random() * THEMES.length)] ?? THEMES[0];
    const language = random() < 0.5 ? "zh" : "en";
    const samplePool = [...theme.items];
    const sampled = [];
    while (sampled.length < CARD_COUNT && samplePool.length) sampled.push(samplePool.splice(Math.floor(random() * samplePool.length), 1)[0]);
    const items = shuffle(sampled, random);
    const target = items[Math.floor(random() * items.length)] ?? items[0];
    return { themeId: theme.id, themeName: theme.name[language], language, items, targetItemId: target.id, phase: "REVEAL", selectedIndex: null, resolved: false, correctAnswerRevealed: false, countdown: REVEAL_SECONDS };
  }

  function start({ container, onComplete, random = Math.random, scheduler = global } = {}) {
    if (!container || typeof onComplete !== "function") throw new TypeError("MemoryMaster.start requires container and onComplete");
    const round = createRound(random);
    const timers = { countdown: null, correctReveal: null, result: null };
    let destroyed = false;
    let completed = false;

    function itemLabel(item) { return item.name[round.language]; }
    function active() { return !destroyed && !completed; }
    function clearTimer(key, clear) {
      if (timers[key] !== null) clear.call(scheduler, timers[key]);
      timers[key] = null;
    }
    function clearTimers() {
      clearTimer("countdown", scheduler.clearInterval);
      clearTimer("correctReveal", scheduler.clearTimeout);
      clearTimer("result", scheduler.clearTimeout);
    }
    function render() {
      if (destroyed) return false;
      const target = round.items.find(item => item.id === round.targetItemId);
      const isReveal = round.phase === "REVEAL";
      const isQuestion = round.phase === "QUESTION";
      const revealPrompt = round.language === "zh" ? `記住它們的位置！ ${round.countdown}` : `Remember their positions! ${round.countdown}`;
      const questionPrompt = round.language === "zh" ? "請翻出這張牌在哪" : "Find this card";
      const prompt = isReveal
        ? `<p class="memory-master-prompt">${revealPrompt}</p>`
        : `<div class="memory-question"><p class="memory-question-prompt">${questionPrompt}</p><div class="memory-question-emoji">${target.emoji}</div><div class="memory-question-name">${itemLabel(target)}</div></div>`;
      const cards = round.items.map((item, index) => {
        const selected = round.selectedIndex === index;
        const isTarget = item.id === round.targetItemId;
        const showTarget = round.phase === "RESOLVING" && isTarget && (selected || round.correctAnswerRevealed);
        const showFace = isReveal || (round.phase === "RESOLVING" && selected) || showTarget;
        const resultClass = round.phase === "RESOLVING" ? selected ? (isTarget ? " correct" : " wrong") : showTarget ? " target" : "" : "";
        const content = showFace ? `<span>${item.emoji}</span><b>${itemLabel(item)}</b>` : "<span class=\"memory-card-back\">？</span>";
        const label = showFace ? itemLabel(item) : `${round.language === "zh" ? "蓋牌" : "Covered card"} ${index + 1}`;
        return `<button type="button" class="memory-master-card${showFace ? " face-up" : " covered"}${resultClass}" data-memory-index="${index}" aria-label="${label}"${isQuestion ? "" : " disabled"}>${content}</button>`;
      }).join("");
      container.innerHTML = `<section class="memory-master">${prompt}<div class="memory-master-grid">${cards}</div></section>`;
      container.querySelectorAll("[data-memory-index]").forEach(button => button.addEventListener("click", () => guess(Number(button.dataset.memoryIndex)), { once: true }));
      return true;
    }
    function finish(success) {
      if (!active() || round.phase !== "RESOLVING") return false;
      completed = true;
      round.phase = "COMPLETE";
      clearTimers();
      onComplete({ success });
      return true;
    }
    function guess(index) {
      if (!active() || round.phase !== "QUESTION" || round.resolved || !round.items[index]) return false;
      round.phase = "RESOLVING";
      round.selectedIndex = index;
      round.resolved = true;
      const success = round.items[index].id === round.targetItemId;
      render();
      if (success) {
        timers.result = scheduler.setTimeout(() => finish(true), RESULT_DELAY_MS);
      } else {
        timers.correctReveal = scheduler.setTimeout(() => {
          if (!active() || round.phase !== "RESOLVING") return;
          timers.correctReveal = null;
          round.correctAnswerRevealed = true;
          render();
          timers.result = scheduler.setTimeout(() => finish(false), RESULT_DELAY_MS);
        }, WRONG_REVEAL_DELAY_MS);
      }
      return success;
    }
    function beginCountdown() {
      if (!active() || round.phase !== "REVEAL" || timers.countdown !== null) return false;
      timers.countdown = scheduler.setInterval(() => {
        if (!active() || round.phase !== "REVEAL") return clearTimer("countdown", scheduler.clearInterval);
        round.countdown -= 1;
        if (round.countdown <= 0) {
          clearTimer("countdown", scheduler.clearInterval);
          round.phase = "QUESTION";
        }
        render();
      }, 1000);
      return true;
    }
    function destroy() {
      if (destroyed) return false;
      destroyed = true;
      clearTimers();
      return true;
    }

    render();
    const scheduleFrame = scheduler.requestAnimationFrame || (callback => scheduler.setTimeout(callback, 0));
    scheduleFrame.call(scheduler, beginCountdown);
    return Object.freeze({ round, guess, destroy, render, get destroyed() { return destroyed; } });
  }

  global.MemoryMaster = Object.freeze({
    start, createRound, themes: THEMES,
    CARD_COUNT, REVEAL_SECONDS, WRONG_REVEAL_DELAY_MS, RESULT_DELAY_MS
  });
})(globalThis);
