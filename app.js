(() => {
  const SOURCE_LABELS = {
    "国际金融": "国际金融（综合）",
    "国际金融判断题三": "外汇市场判断题",
    "国际金融选择题三": "国际收支选择题",
    "语言学_题目解析": "Exercise 1-3",
    "德语选择题": "德语单选题练习",
    "英1": "英国文学 · 中古英语时期",
    "英2": "英国文学 · 文艺复兴至新古典主义",
    "英3": "英国文学 · 启蒙运动时期",
    "英4": "英国文学 · 浪漫主义时期",
    "美1": "美国文学 · 殖民地至独立革命时期",
    "美2": "美国文学 · 浪漫主义时期",
    "美3": "美国文学 · 现实主义至现代主义时期",
    "吃点": "吃点",
  };
  const TYPE_LABELS = { single: "单选题", truefalse: "判断题", fill: "填空题", matching: "匹配题" };
  const TYPE_ORDER = ["single", "truefalse", "fill", "matching"];
  const SUBJECT_ICONS = {
    "国际金融": "💰",
    "德语": "🇩🇪",
    "英美文学": "📖",
    "语言学": "🗣️",
  };

  // Hidden question bank: only revealed once the secret phrase is entered
  // via the easter-egg dialog triggered from the 德语 breadcrumb.
  const SECRET_SOURCE = "吃点";
  const SECRET_PHRASE = "胖婆捆鸭";
  const UNLOCK_STORAGE_KEY = "shua-unlocked-sources";

  function getUnlockedSources() {
    try {
      return new Set(JSON.parse(localStorage.getItem(UNLOCK_STORAGE_KEY) || "[]"));
    } catch {
      return new Set();
    }
  }
  function unlockSource(source) {
    const unlocked = getUnlockedSources();
    unlocked.add(source);
    localStorage.setItem(UNLOCK_STORAGE_KEY, JSON.stringify([...unlocked]));
  }
  function isSourceUnlocked(source) {
    return source !== SECRET_SOURCE || getUnlockedSources().has(SECRET_SOURCE);
  }
  function visibleQuestions() {
    return ALL_QUESTIONS.filter((q) => isSourceUnlocked(q.source));
  }

  let ALL_QUESTIONS = [];
  let queue = [];
  let current = 0;
  let score = 0;
  let answered = 0;
  let wrongIds = [];
  let answeredThisQuestion = false;
  let currentSubject = null;

  const el = (id) => document.getElementById(id);
  const homeScreen = el("home-screen");
  const subjectScreen = el("subject-screen");
  const quizScreen = el("quiz-screen");
  const resultScreen = el("result-screen");

  function show(screen) {
    [homeScreen, subjectScreen, quizScreen, resultScreen].forEach((s) => s.classList.add("hidden"));
    screen.classList.remove("hidden");
    updateCrumb(screen);
  }

  function updateCrumb(screen) {
    const crumb = el("crumb");
    if (screen === homeScreen) crumb.textContent = "";
    else if (screen === subjectScreen) crumb.textContent = currentSubject || "";
    else if (screen === quizScreen) crumb.textContent = `${currentSubject || ""} · 答题中`;
    else if (screen === resultScreen) crumb.textContent = `${currentSubject || ""} · 结算`;
  }

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function renderInline(text) {
    // minimal markdown: **bold**
    return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  }

  function getSelectedSubject() {
    return currentSubject;
  }
  function getSelectedSources() {
    return [...document.querySelectorAll("#source-options input:checked")].map((i) => i.value);
  }
  function getSelectedTypes() {
    return [...document.querySelectorAll("#type-options input:checked")].map((i) => i.value);
  }
  function getOrder() {
    return document.querySelector('input[name="order"]:checked').value;
  }

  function buildHomeList() {
    const visible = visibleQuestions();
    const subjects = [...new Set(visible.map((q) => q.subject))];
    const listWrap = el("subject-list");
    listWrap.innerHTML = subjects.map((s) => {
      const count = visible.filter((q) => q.subject === s).length;
      return `
        <button class="subject-item" role="listitem" data-subject="${s}">
          <span class="subject-icon">${SUBJECT_ICONS[s] || "📚"}</span>
          <span class="subject-info">
            <span class="subject-name">${s}</span>
            <span class="subject-meta">共 ${count} 题</span>
          </span>
          <span class="subject-chevron">›</span>
        </button>
      `;
    }).join("");

    listWrap.querySelectorAll(".subject-item").forEach((btn) => {
      btn.addEventListener("click", () => openSubject(btn.dataset.subject));
    });
  }

  function openSubject(subject) {
    currentSubject = subject;
    el("subject-title").textContent = subject;
    refreshSubjectCount();
    buildDependentOptions();
    show(subjectScreen);
  }

  function refreshSubjectCount() {
    const count = visibleQuestions().filter((q) => q.subject === currentSubject).length;
    el("subject-count").textContent = `共 ${count} 题`;
  }

  function buildDependentOptions() {
    const subject = getSelectedSubject();
    const inSubject = visibleQuestions().filter((q) => q.subject === subject);

    const sources = [...new Set(inSubject.map((q) => q.source))];
    el("source-options").innerHTML = sources.map((s) => `
      <label class="chip">
        <input type="checkbox" value="${s}" checked>
        <span>${SOURCE_LABELS[s] || s} (${inSubject.filter((q) => q.source === s).length})</span>
      </label>
    `).join("");

    const types = TYPE_ORDER.filter((t) => inSubject.some((q) => q.type === t));
    el("type-options").innerHTML = types.map((t) => `
      <label class="chip">
        <input type="checkbox" value="${t}" checked>
        <span>${TYPE_LABELS[t] || t} (${inSubject.filter((q) => q.type === t).length})</span>
      </label>
    `).join("");

    [...document.querySelectorAll("#source-options input, #type-options input")]
      .forEach((input) => input.addEventListener("change", updateSummary));

    updateSummary();
  }

  function filteredQuestions() {
    const subject = getSelectedSubject();
    const sources = getSelectedSources();
    const types = getSelectedTypes();
    return visibleQuestions().filter(
      (q) => q.subject === subject && sources.includes(q.source) && types.includes(q.type)
    );
  }

  function updateSummary() {
    const n = filteredQuestions().length;
    el("setup-summary").textContent = n > 0
      ? `共 ${n} 道题符合条件`
      : "没有符合条件的题目，请至少选择一个题库和题型";
    el("start-btn").disabled = n === 0;
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function startQuiz(list) {
    queue = list;
    current = 0;
    score = 0;
    answered = 0;
    wrongIds = [];
    show(quizScreen);
    renderQuestion();
  }

  function renderQuestion() {
    if (current >= queue.length) {
      showResult();
      return;
    }
    answeredThisQuestion = false;
    const q = queue[current];

    el("progress-fill").style.width = `${(current / queue.length) * 100}%`;
    el("progress-text").textContent = `第 ${current + 1} / ${queue.length} 题`;
    el("score-text").textContent = `答对 ${score} / 已答 ${answered}`;

    el("q-source").textContent = `${q.subject} · ${SOURCE_LABELS[q.source] || q.source} · ${TYPE_LABELS[q.type]}`;
    el("q-text").innerHTML = renderInline(q.question || "");

    const optionsWrap = el("q-options");
    optionsWrap.innerHTML = "";
    el("feedback").classList.add("hidden");
    el("next-btn").classList.add("hidden");

    if (q.type === "single") {
      q.options.forEach((opt) => {
        const div = document.createElement("div");
        div.className = "option";
        div.dataset.label = opt.label;
        div.innerHTML = `<span class="option-label">${opt.label}</span><span>${renderInline(opt.text)}</span>`;
        div.addEventListener("click", () => selectSingle(q, opt.label, div));
        optionsWrap.appendChild(div);
      });
    } else if (q.type === "truefalse") {
      [{ v: true, t: "对 (True)" }, { v: false, t: "错 (False)" }].forEach((opt) => {
        const div = document.createElement("div");
        div.className = "option";
        div.dataset.value = String(opt.v);
        div.innerHTML = `<span class="option-label">${opt.v ? "T" : "F"}</span><span>${opt.t}</span>`;
        div.addEventListener("click", () => selectTrueFalse(q, opt.v, div));
        optionsWrap.appendChild(div);
      });
    } else if (q.type === "fill") {
      const div = document.createElement("div");
      div.className = "recall-reveal";
      div.textContent = "🤔 想好答案了吗？点击查看解析";
      div.addEventListener("click", () => revealFill(q, div));
      optionsWrap.appendChild(div);
    } else if (q.type === "matching") {
      renderMatching(q, optionsWrap);
    }
  }

  function lockOptions() {
    document.querySelectorAll(".option").forEach((o) => o.classList.add("disabled"));
  }

  function selectSingle(q, label, div) {
    if (answeredThisQuestion) return;
    answeredThisQuestion = true;
    answered++;
    lockOptions();
    const correct = label === q.answer;
    if (correct) score++;
    else wrongIds.push(q.id);

    document.querySelectorAll(".option").forEach((o) => {
      if (o.dataset.label === q.answer) o.classList.add("correct");
      else if (o.dataset.label === label) o.classList.add("incorrect");
      else o.classList.add("dim");
    });

    showFeedback(correct, q, `正确答案：${q.answer}. ${q.options.find((o) => o.label === q.answer).text}`);
  }

  function selectTrueFalse(q, value, div) {
    if (answeredThisQuestion) return;
    answeredThisQuestion = true;
    answered++;
    lockOptions();
    const correct = value === q.answer;
    if (correct) score++;
    else wrongIds.push(q.id);

    const opts = document.querySelectorAll(".option");
    opts.forEach((o) => {
      const optVal = o.dataset.value === "true";
      if (optVal === q.answer) o.classList.add("correct");
      else o.classList.add(optVal === value ? "incorrect" : "dim");
    });

    showFeedback(correct, q, `正确答案：${q.answer ? "对 (True)" : "错 (False)"}`);
  }

  function revealFill(q, div) {
    if (answeredThisQuestion) return;
    answeredThisQuestion = true;
    answered++;
    div.classList.add("disabled");
    div.style.cursor = "default";
    div.textContent = "已查看解析 ↓";
    showFeedback(null, q, `参考答案：${q.answerLabel}`);
  }

  // Matching questions: click one item from the left column, then one from
  // the right column, to connect them. Once every left item has a pick,
  // correctness for each pair is revealed.
  function renderMatching(q, wrap) {
    const rightShuffled = q.right.map((text, idx) => ({ text, idx })); // idx = original right-index
    const picks = new Array(q.left.length).fill(null); // picks[leftIdx] = rightShuffled position
    let selectedLeft = null;

    const box = document.createElement("div");
    box.className = "matching-box";

    const leftCol = document.createElement("div");
    leftCol.className = "matching-col";
    const rightCol = document.createElement("div");
    rightCol.className = "matching-col";

    const leftItems = q.left.map((text, i) => {
      const item = document.createElement("div");
      item.className = "matching-item";
      item.textContent = `${i + 1}. ${text}`;
      item.addEventListener("click", () => {
        if (answeredThisQuestion) return;
        selectedLeft = i;
        leftItems.forEach((it) => it.classList.remove("active"));
        item.classList.add("active");
      });
      leftCol.appendChild(item);
      return item;
    });

    const rightItems = rightShuffled.map((r, pos) => {
      const item = document.createElement("div");
      item.className = "matching-item";
      item.textContent = `${String.fromCharCode(65 + pos)}. ${r.text}`;
      item.addEventListener("click", () => {
        if (answeredThisQuestion || selectedLeft === null) return;
        picks[selectedLeft] = pos;
        leftItems[selectedLeft].classList.add("paired");
        leftItems[selectedLeft].dataset.pickedLabel = String.fromCharCode(65 + pos);
        leftItems[selectedLeft].textContent = `${selectedLeft + 1}. ${q.left[selectedLeft]} → ${String.fromCharCode(65 + pos)}`;
        selectedLeft = null;
        leftItems.forEach((it) => it.classList.remove("active"));
        if (picks.every((p) => p !== null)) submitMatching();
      });
      rightCol.appendChild(item);
      return item;
    });

    box.appendChild(leftCol);
    box.appendChild(rightCol);
    wrap.appendChild(box);

    function submitMatching() {
      if (answeredThisQuestion) return;
      answeredThisQuestion = true;
      answered++;
      let allCorrect = true;
      leftItems.forEach((item, leftIdx) => {
        const pickedRightIdx = rightShuffled[picks[leftIdx]].idx;
        const isRight = q.pairs[leftIdx] === pickedRightIdx;
        item.classList.add(isRight ? "correct" : "incorrect", "disabled");
        if (!isRight) allCorrect = false;
      });
      rightItems.forEach((item) => item.classList.add("disabled"));
      if (allCorrect) score++;
      else wrongIds.push(q.id);

      const correctLines = q.left.map((text, i) => `${text} → ${q.right[q.pairs[i]]}`).join("；");
      showFeedback(allCorrect, q, `正确匹配：${correctLines}`);
    }
  }

  function showFeedback(correct, q, answerLine) {
    const fb = el("feedback");
    fb.classList.remove("hidden", "is-correct", "is-wrong");
    if (correct === true) {
      fb.classList.add("is-correct");
      el("feedback-title").textContent = "✅ 回答正确";
    } else if (correct === false) {
      fb.classList.add("is-wrong");
      el("feedback-title").textContent = "❌ 回答错误";
    } else {
      el("feedback-title").textContent = "📖 解析";
    }
    el("feedback-answer").textContent = answerLine;
    el("feedback-explanation").innerHTML = renderInline(q.explanation || "");
    el("next-btn").classList.remove("hidden");
    fb.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function showResult() {
    show(resultScreen);
    const gradable = answered - (queue.filter((q) => q.type === "fill").length);
    el("result-score").textContent = gradable > 0 ? `${score} / ${gradable}` : "完成复习";
    const wrongCount = wrongIds.length;
    el("result-detail").textContent = wrongCount > 0
      ? `共 ${queue.length} 题，答错 ${wrongCount} 题`
      : `共 ${queue.length} 题，全部正确 ✨`;
    const retryBtn = el("retry-wrong-btn");
    if (wrongCount > 0) {
      retryBtn.classList.remove("hidden");
    } else {
      retryBtn.classList.add("hidden");
    }
  }

  function init() {
    fetch("questions.json")
      .then((r) => r.json())
      .then((data) => {
        ALL_QUESTIONS = data;
        buildHomeList();
      })
      .catch((err) => {
        el("subject-list").textContent = "题库加载失败：" + err.message;
      });

    el("start-btn").addEventListener("click", () => {
      let list = filteredQuestions();
      if (getOrder() === "shuffled") list = shuffle(list);
      startQuiz(list);
    });

    el("next-btn").addEventListener("click", () => {
      current++;
      renderQuestion();
    });

    el("exit-btn").addEventListener("click", () => {
      if (confirm("确定退出本轮刷题吗？")) show(subjectScreen);
    });

    el("restart-btn").addEventListener("click", () => show(subjectScreen));

    el("retry-wrong-btn").addEventListener("click", () => {
      const wrongList = ALL_QUESTIONS.filter((q) => wrongIds.includes(q.id));
      startQuiz(shuffle(wrongList));
    });

    el("back-to-home-btn").addEventListener("click", () => show(homeScreen));

    el("brand-home-link").addEventListener("click", () => show(homeScreen));

    initSecretModal();
  }

  function initSecretModal() {
    const modal = el("secret-modal");
    const input = el("secret-input");
    const errorMsg = el("secret-error");

    function openModal() {
      errorMsg.classList.add("hidden");
      input.value = "";
      modal.classList.remove("hidden");
      setTimeout(() => input.focus(), 30);
    }
    function closeModal() {
      modal.classList.add("hidden");
    }
    function attemptUnlock() {
      if (input.value.trim() === SECRET_PHRASE) {
        unlockSource(SECRET_SOURCE);
        closeModal();
        if (currentSubject === "德语") {
          refreshSubjectCount();
          buildDependentOptions();
        }
        buildHomeList();
      } else {
        errorMsg.classList.remove("hidden");
        input.value = "";
        input.focus();
      }
    }

    el("crumb").addEventListener("click", () => {
      if (!subjectScreen.classList.contains("hidden") && currentSubject === "德语") {
        openModal();
      }
    });

    el("secret-cancel-btn").addEventListener("click", closeModal);
    el("secret-confirm-btn").addEventListener("click", attemptUnlock);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") attemptUnlock();
      if (e.key === "Escape") closeModal();
    });
  }

  init();
})();
