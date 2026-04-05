const STORAGE_KEY = "wpm-reading-records";
const TRASH_STORAGE_KEY = "wpm-reading-trash";
const ATTEMPTS_STORAGE_KEY = "wpm-reading-attempts";
const THEME_MODE_KEY = "wpm-theme-mode";
const THEME_COLOR_KEY = "wpm-theme-color";
const DEFAULT_ATTEMPTS = ["\u7b2c\u4e00\u8f6e", "\u7b2c\u4e8c\u8f6e", "\u7b2c\u4e09\u8f6e"];
const ATTEMPT_LABELS = [
  "\u7b2c\u4e00\u8f6e",
  "\u7b2c\u4e8c\u8f6e",
  "\u7b2c\u4e09\u8f6e",
  "\u7b2c\u56db\u8f6e",
  "\u7b2c\u4e94\u8f6e",
  "\u7b2c\u516d\u8f6e"
];
const MAX_ATTEMPTS = 6;
const THEME_MODES = ["light", "dark"];
const THEME_COLORS = ["red", "orange", "yellow", "green", "cyan", "blue", "purple", "graphite"];

const form = document.getElementById("record-form");
const root = document.documentElement;
const attemptInput = document.getElementById("attempt");
const sourceTextInput = document.getElementById("source-text");
const minutesInput = document.getElementById("minutes");
const secondsInput = document.getElementById("seconds");
const modeToggleButtons = document.querySelectorAll("[data-mode-option]");
const themeSwatchButtons = document.querySelectorAll("[data-theme-option]");
const timeModeButtons = document.querySelectorAll("[data-time-mode]");
const timerPanel = document.getElementById("timer-panel");
const manualTimeGrid = document.querySelector(".manual-time-grid");
const timerDisplay = document.getElementById("timer-display");
const timerStartButton = document.getElementById("timer-start");
const timerStopButton = document.getElementById("timer-stop");
const timerResetButton = document.getElementById("timer-reset");
const liveWords = document.getElementById("live-words");
const liveWpm = document.getElementById("live-wpm");
const submitButton = document.getElementById("submit-button");
const activeAttemptLabel = document.getElementById("active-attempt-label");
const avgWpm = document.getElementById("avg-wpm");
const recordCount = document.getElementById("record-count");
const trendCaption = document.getElementById("trend-caption");
const chartEmpty = document.getElementById("chart-empty");
const trendChart = document.getElementById("trend-chart");
const recordList = document.getElementById("record-list");
const emptyState = document.getElementById("empty-state");
const undoWrap = document.getElementById("undo-wrap");
const undoButton = document.getElementById("undo-button");
const clearHistoryButton = document.getElementById("clear-history-button");
const exportButton = document.getElementById("export-button");
const importButton = document.getElementById("import-button");
const importFileInput = document.getElementById("import-file");
const trashPanel = document.getElementById("trash-panel");
const trashList = document.getElementById("trash-list");
const trashCount = document.getElementById("trash-count");
const restoreAllButton = document.getElementById("restore-all-button");
const emptyTrashButton = document.getElementById("empty-trash-button");
const installAppButton = document.getElementById("install-app-button");
const installAppCopy = document.getElementById("install-app-copy");
const statusToast = document.getElementById("status-toast");
const updateToast = document.getElementById("update-toast");
const updateToastButton = document.getElementById("update-toast-button");
const itemTemplate = document.getElementById("record-item-template");
const attemptSwitch = document.getElementById("attempt-switch");
const addAttemptButton = document.getElementById("add-attempt-button");
const removeAttemptButton = document.getElementById("remove-attempt-button");

let records = loadRecords();
let trashRecords = loadTrashRecords();
let attempts = loadAttempts(records, trashRecords);
let deletedSnapshot = null;
let activeAttempt = attempts.includes(records[0]?.attempt) ? records[0].attempt : attempts[0];
let toastTimer = null;
let timeMode = "timer";
let timerStartAt = 0;
let timerElapsedMs = 0;
let timerIntervalId = null;
let timerHasStarted = false;
let themeMode = THEME_MODES.includes(root.dataset.mode) ? root.dataset.mode : "dark";
let themeColor = THEME_COLORS.includes(root.dataset.theme) ? root.dataset.theme : "green";
let deferredInstallPrompt = null;
let waitingServiceWorker = null;
let isRefreshingForUpdate = false;

applyThemePreferences();
registerOfflineSupport();
render();
updateLiveMetrics();

sourceTextInput.addEventListener("input", updateLiveMetrics);
minutesInput.addEventListener("input", updateLiveMetrics);
secondsInput.addEventListener("input", updateLiveMetrics);

attemptInput.addEventListener("change", () => {
  activeAttempt = attemptInput.value;
  render();
});

attemptSwitch.addEventListener("click", (event) => {
  const button = event.target.closest("[data-attempt-tab]");

  if (!button) {
    return;
  }

  activeAttempt = button.dataset.attemptTab;
  attemptInput.value = activeAttempt;
  render();
});

addAttemptButton.addEventListener("click", addAttempt);
removeAttemptButton.addEventListener("click", removeAttempt);

modeToggleButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setThemeMode(button.dataset.modeOption);
  });
});

themeSwatchButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setThemeColor(button.dataset.themeOption);
  });
});

timeModeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setTimeMode(button.dataset.timeMode);
  });
});

timerStartButton.addEventListener("click", startTimer);
timerStopButton.addEventListener("click", stopTimer);
timerResetButton.addEventListener("click", resetTimer);

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const metrics = getCurrentMetrics();

  if (!metrics.isValid) {
    return;
  }

  activeAttempt = attemptInput.value;

  records.unshift({
    id: crypto.randomUUID(),
    attempt: activeAttempt,
    wpm: metrics.wpm,
    words: metrics.words,
    durationSeconds: metrics.totalSeconds,
    createdAt: new Date().toISOString()
  });

  deletedSnapshot = null;
  saveRecords();
  render();
  form.reset();
  attemptInput.value = activeAttempt;
  resetTimer();
  updateLiveMetrics();
  sourceTextInput.focus();
});

undoButton.addEventListener("click", () => {
  if (!deletedSnapshot) {
    return;
  }

  records.splice(deletedSnapshot.index, 0, deletedSnapshot.record);
  removeFromTrash(deletedSnapshot.record.id);
  deletedSnapshot = null;
  saveRecords();
  saveTrashRecords();
  render();
});

clearHistoryButton.addEventListener("click", clearHistory);
exportButton.addEventListener("click", exportRecords);
importButton.addEventListener("click", () => importFileInput.click());
importFileInput.addEventListener("change", importRecords);
restoreAllButton.addEventListener("click", restoreAllTrash);
emptyTrashButton.addEventListener("click", emptyTrash);
installAppButton.addEventListener("click", installOfflineApp);

function updateLiveMetrics() {
  const metrics = getCurrentMetrics();

  liveWords.textContent = String(metrics.words);
  liveWpm.textContent = metrics.words > 0 && metrics.totalSeconds > 0 ? formatAverage(metrics.wpm) : "0";
  submitButton.disabled = !metrics.isValid;
  syncTimeModeUI();
}

function applyThemePreferences() {
  root.dataset.mode = themeMode;
  root.dataset.theme = themeColor;
  syncThemeControls();
}

function setThemeMode(nextMode) {
  if (!THEME_MODES.includes(nextMode) || nextMode === themeMode) {
    syncThemeControls();
    return;
  }

  themeMode = nextMode;
  localStorage.setItem(THEME_MODE_KEY, themeMode);
  applyThemePreferences();
}

function setThemeColor(nextTheme) {
  if (!THEME_COLORS.includes(nextTheme) || nextTheme === themeColor) {
    syncThemeControls();
    return;
  }

  themeColor = nextTheme;
  localStorage.setItem(THEME_COLOR_KEY, themeColor);
  applyThemePreferences();
}

function syncThemeControls() {
  modeToggleButtons.forEach((button) => {
    const selected = button.dataset.modeOption === themeMode;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });

  themeSwatchButtons.forEach((button) => {
    const selected = button.dataset.themeOption === themeColor;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

function getCurrentMetrics() {
  const text = sourceTextInput.value.trim();
  const timerSeconds = Math.round(getTimerElapsedMs() / 1000);
  const minutes = timeMode === "timer" ? Math.floor(timerSeconds / 60) : parseNonNegativeInteger(minutesInput.value);
  const seconds = timeMode === "timer" ? timerSeconds % 60 : parseNonNegativeInteger(secondsInput.value);
  const words = countWords(text);
  const secondsAreValid = seconds !== null && seconds >= 0 && seconds <= 59;
  const minutesAreValid = minutes !== null && minutes >= 0;
  const totalSeconds = minutesAreValid && secondsAreValid ? minutes * 60 + seconds : 0;
  const hasDuration = totalSeconds > 0;
  const wpm = hasDuration && words > 0 ? (words / totalSeconds) * 60 : 0;

  return {
    words,
    wpm,
    totalSeconds,
    isValid: Boolean(text) && words > 0 && minutesAreValid && secondsAreValid && hasDuration && !isTimerRunning()
  };
}

function setTimeMode(nextMode) {
  if (!["manual", "timer"].includes(nextMode) || timeMode === nextMode) {
    syncTimeModeUI();
    return;
  }

  const previousMode = timeMode;
  timeMode = nextMode;

  if (previousMode === "timer" && timeMode === "manual") {
    if (isTimerRunning()) {
      stopTimer();
    }

    timerElapsedMs = 0;
    timerStartAt = 0;
    timerDisplay.textContent = "00:00";
    minutesInput.value = "";
    secondsInput.value = "";
  }

  if (timeMode === "timer") {
    syncTimerInputsFromElapsed();
  }

  updateLiveMetrics();
}

function syncTimeModeUI() {
  const timerModeActive = timeMode === "timer";

  timeModeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.timeMode === timeMode);
  });

  timerPanel.classList.toggle("hidden", !timerModeActive);
  manualTimeGrid.classList.toggle("hidden", timerModeActive);
  minutesInput.readOnly = timerModeActive;
  secondsInput.readOnly = timerModeActive;
  minutesInput.classList.toggle("is-readonly", timerModeActive);
  secondsInput.classList.toggle("is-readonly", timerModeActive);
  minutesInput.parentElement.classList.toggle("time-field-muted", timerModeActive);
  secondsInput.parentElement.classList.toggle("time-field-muted", timerModeActive);
  timerStartButton.disabled = isTimerRunning();
  timerStopButton.disabled = !isTimerRunning();
  timerResetButton.disabled = timerModeActive ? getTimerElapsedMs() === 0 && !isTimerRunning() : false;
  timerStartButton.textContent = timerHasStarted ? "继续" : "开始";
}

function startTimer() {
  if (isTimerRunning()) {
    return;
  }

  timeMode = "timer";
  timerHasStarted = true;
  timerStartAt = performance.now() - timerElapsedMs;
  timerIntervalId = window.setInterval(() => {
    syncTimerInputsFromElapsed();
    updateLiveMetrics();
  }, 200);
  syncTimeModeUI();
}

function stopTimer() {
  if (!isTimerRunning()) {
    return;
  }

  timerElapsedMs = performance.now() - timerStartAt;
  window.clearInterval(timerIntervalId);
  timerIntervalId = null;
  syncTimerInputsFromElapsed();
  updateLiveMetrics();
}

function resetTimer() {
  if (isTimerRunning()) {
    window.clearInterval(timerIntervalId);
    timerIntervalId = null;
  }

  timerStartAt = 0;
  timerElapsedMs = 0;
  timerHasStarted = false;
  timerDisplay.textContent = "00:00";

  if (timeMode === "timer") {
    minutesInput.value = "";
    secondsInput.value = "";
  }

  syncTimeModeUI();
}

function getTimerElapsedMs() {
  return isTimerRunning() ? performance.now() - timerStartAt : timerElapsedMs;
}

function isTimerRunning() {
  return timerIntervalId !== null;
}

function syncTimerInputsFromElapsed() {
  const totalSeconds = Math.round(getTimerElapsedMs() / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  minutesInput.value = totalSeconds > 0 ? String(minutes) : "";
  secondsInput.value = totalSeconds > 0 ? String(seconds).padStart(2, "0") : "";
  timerDisplay.textContent = formatStopwatch(totalSeconds);
}

function parseNonNegativeInteger(value) {
  if (value === "") {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function countWords(text) {
  if (!text) {
    return 0;
  }

  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    return countWordsWithSegmenter(text);
  }

  return countWordsWithRegex(text);
}

function countWordsWithSegmenter(text) {
  const segmenter = new Intl.Segmenter("en", { granularity: "word" });
  let count = 0;

  for (const segment of segmenter.segment(text)) {
    if (!segment.isWordLike) {
      continue;
    }

    if (isCountableWord(segment.segment)) {
      count += 1;
    }
  }

  return count;
}

function countWordsWithRegex(text) {
  const matches = text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g);
  return matches ? matches.length : 0;
}

function isCountableWord(token) {
  return /^[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*$/.test(token);
}

function normalizeAttempt(attempt) {
  if (typeof attempt !== "string") {
    return DEFAULT_ATTEMPTS[0];
  }

  const normalized = attempt.trim().replace(/\u904d/g, "\u8f6e");
  return ATTEMPT_LABELS.includes(normalized) ? normalized : DEFAULT_ATTEMPTS[0];
}

function sanitizeAttemptList(source) {
  if (!Array.isArray(source)) {
    return [];
  }

  const seen = new Set(
    source
      .map((attempt) => normalizeAttempt(attempt))
      .filter((attempt) => ATTEMPT_LABELS.includes(attempt))
  );

  return ATTEMPT_LABELS.filter((attempt) => seen.has(attempt)).slice(0, MAX_ATTEMPTS);
}

function ensureAttemptsForData(currentAttempts, sourceRecords = [], sourceTrashRecords = []) {
  const baseAttempts = sanitizeAttemptList(currentAttempts);
  const attemptsWithFallback = baseAttempts.length ? [...baseAttempts] : DEFAULT_ATTEMPTS.slice();
  const usedAttempts = [...sourceRecords, ...sourceTrashRecords]
    .map((record) => normalizeAttempt(record.attempt))
    .filter((attempt) => ATTEMPT_LABELS.includes(attempt));

  usedAttempts.forEach((attempt) => {
    if (!attemptsWithFallback.includes(attempt) && attemptsWithFallback.length < MAX_ATTEMPTS) {
      attemptsWithFallback.push(attempt);
    }
  });

  return attemptsWithFallback;
}

function hasDataForAttempt(attempt) {
  return records.some((record) => record.attempt === attempt)
    || trashRecords.some((record) => record.attempt === attempt);
}

function loadRecords() {
  if (!localStorage.getItem(STORAGE_KEY)) {
    const seeded = createSeedRecords();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }

  const raw = localStorage.getItem(STORAGE_KEY);

  try {
    const parsed = JSON.parse(raw);
    return sanitizeImportedRecords(parsed);
  } catch {
    return [];
  }
}

function loadTrashRecords() {
  const raw = localStorage.getItem(TRASH_STORAGE_KEY);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return sanitizeTrashRecords(parsed);
  } catch {
    return [];
  }
}

function loadAttempts(sourceRecords = [], sourceTrashRecords = []) {
  const raw = localStorage.getItem(ATTEMPTS_STORAGE_KEY);
  let stored = [];

  if (raw) {
    try {
      stored = sanitizeAttemptList(JSON.parse(raw));
    } catch {
      stored = [];
    }
  }

  const withRecords = ensureAttemptsForData(stored.length ? stored : DEFAULT_ATTEMPTS.slice(), sourceRecords, sourceTrashRecords);

  if (withRecords.length === 0) {
    return DEFAULT_ATTEMPTS.slice();
  }

  return withRecords;
}

function saveRecords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function saveTrashRecords() {
  localStorage.setItem(TRASH_STORAGE_KEY, JSON.stringify(trashRecords));
}

function saveAttempts() {
  localStorage.setItem(ATTEMPTS_STORAGE_KEY, JSON.stringify(attempts));
}

function render() {
  attempts = ensureAttemptsForData(attempts, records, trashRecords);
  activeAttempt = attempts.includes(activeAttempt) ? activeAttempt : attempts[0];
  saveAttempts();
  syncAttemptControls();
  renderStats();
  renderTrend();
  renderList();
  renderTrash();
  renderUndo();
}

function syncAttemptControls() {
  attemptSwitch.innerHTML = "";
  attemptInput.innerHTML = "";
  activeAttemptLabel.textContent = activeAttempt;

  attempts.forEach((attempt) => {
    const option = document.createElement("option");
    option.value = attempt;
    option.textContent = attempt;
    attemptInput.appendChild(option);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "attempt-tab";
    button.dataset.attemptTab = attempt;
    button.textContent = attempt;
    button.classList.toggle("active", attempt === activeAttempt);
    attemptSwitch.appendChild(button);
  });

  attemptInput.value = activeAttempt;
  addAttemptButton.disabled = attempts.length >= MAX_ATTEMPTS;
  removeAttemptButton.disabled = attempts.length <= 1;
}

function addAttempt() {
  if (attempts.length >= MAX_ATTEMPTS) {
    showStatusToast("\u6700\u591a\u53ea\u80fd\u521b\u5efa 6 \u8f6e");
    return;
  }

  const nextAttempt = ATTEMPT_LABELS.find((attempt) => !attempts.includes(attempt));

  if (!nextAttempt) {
    showStatusToast("\u65e0\u6cd5\u518d\u65b0\u589e\u8f6e\u6b21");
    return;
  }

  attempts = [...attempts, nextAttempt];
  activeAttempt = nextAttempt;
  saveAttempts();
  render();
  showStatusToast(`\u5df2\u65b0\u589e ${nextAttempt}`);
}

function removeAttempt() {
  if (attempts.length <= 1) {
    showStatusToast("\u81f3\u5c11\u9700\u4fdd\u7559 1 \u8f6e");
    return;
  }

  if (activeAttempt !== attempts.at(-1)) {
    showStatusToast("\u4e3a\u4e86\u4fdd\u6301\u8f6e\u6b21\u987a\u5e8f\uff0c\u53ea\u80fd\u5220\u9664\u6700\u540e\u4e00\u8f6e");
    return;
  }

  if (hasDataForAttempt(activeAttempt)) {
    showStatusToast("\u5f53\u524d\u8f6e\u6b21\u8fd8\u6709\u8bb0\u5f55\u6216\u56de\u6536\u7ad9\u6570\u636e\uff0c\u8bf7\u5148\u6e05\u7406");
    return;
  }

  const currentIndex = attempts.indexOf(activeAttempt);
  attempts = attempts.filter((attempt) => attempt !== activeAttempt);
  activeAttempt = attempts[Math.max(0, currentIndex - 1)] || attempts[0];
  saveAttempts();
  render();
  showStatusToast("\u5df2\u5220\u9664\u5f53\u524d\u8f6e");
}

function getAttemptRecords() {
  return records.filter((record) => record.attempt === activeAttempt);
}

function renderStats() {
  const attemptRecords = getAttemptRecords();
  const recentSeven = attemptRecords.slice(0, 7);
  const totals = recentSeven.reduce(
    (accumulator, record) => {
      accumulator.wpm += record.wpm;
      return accumulator;
    },
    { wpm: 0 }
  );

  const divisor = recentSeven.length || 1;

  avgWpm.textContent = recentSeven.length ? formatAverage(totals.wpm / divisor) : "0";
  recordCount.textContent = String(attemptRecords.length);
}

function renderTrend() {
  const attemptRecords = getAttemptRecords().slice().reverse();

  trendCaption.textContent = `${activeAttempt}历史 WPM 变化`;
  trendChart.innerHTML = "";

  if (attemptRecords.length === 0) {
    chartEmpty.classList.remove("hidden");
    trendChart.classList.add("hidden");
    return;
  }

  chartEmpty.classList.add("hidden");
  trendChart.classList.remove("hidden");

  const width = 640;
  const height = 220;
  const padding = 24;
  const values = attemptRecords.map((record) => record.wpm);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue || 1;

  const points = attemptRecords.map((record, index) => {
    const x = attemptRecords.length === 1
      ? width / 2
      : padding + (index * (width - padding * 2)) / (attemptRecords.length - 1);
    const normalized = (record.wpm - minValue) / range;
    const y = height - padding - normalized * (height - padding * 2);
    return { x, y, record, index };
  });

  const polyline = createSvgElement("polyline", {
    points: points.map((point) => `${point.x},${point.y}`).join(" "),
    class: "trend-line"
  });

  const areaPoints = [`${points[0].x},${height - padding}`, ...points.map((point) => `${point.x},${point.y}`), `${points.at(-1).x},${height - padding}`];
  const area = createSvgElement("polygon", {
    points: areaPoints.join(" "),
    class: "trend-area"
  });

  trendChart.appendChild(area);
  trendChart.appendChild(polyline);

  points.forEach((point) => {
    trendChart.appendChild(createSvgElement("circle", {
      cx: point.x,
      cy: point.y,
      r: 4.5,
      class: "trend-dot"
    }));

    trendChart.appendChild(createSvgElement("text", {
      x: point.x,
      y: point.y - 12,
      class: "trend-label"
    }, formatAverage(point.record.wpm)));

    trendChart.appendChild(createSvgElement("text", {
      x: point.x,
      y: height - 8,
      class: "trend-axis"
    }, String(point.index + 1)));
  });
}

function createSvgElement(tagName, attributes, textContent = "") {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tagName);

  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, String(value));
  });

  if (textContent) {
    element.textContent = textContent;
  }

  return element;
}

function renderList() {
  const attemptRecords = getAttemptRecords();
  recordList.innerHTML = "";

  attemptRecords.forEach((record) => {
    const fragment = itemTemplate.content.cloneNode(true);
    const item = fragment.querySelector(".record-item");

    fragment.querySelector(".attempt-badge").textContent = record.attempt;
    fragment.querySelector(".record-time").textContent = formatDate(record.createdAt);
    fragment.querySelector(".wpm-value").textContent = formatAverage(record.wpm);
    fragment.querySelector(".words-value").textContent = String(record.words);
    fragment.querySelector(".duration-value").textContent = formatDuration(record.durationSeconds);
    fragment.querySelector(".delete-btn").addEventListener("click", () => deleteRecord(record.id));

    item.dataset.id = record.id;
    recordList.appendChild(fragment);
  });

  emptyState.classList.toggle("hidden", attemptRecords.length > 0);
}

function renderUndo() {
  undoWrap.classList.toggle("hidden", !deletedSnapshot);
}

function deleteRecord(id) {
  const index = records.findIndex((record) => record.id === id);

  if (index === -1) {
    return;
  }

  const [removedRecord] = records.splice(index, 1);
  deletedSnapshot = { record: removedRecord, index };
  moveToTrash([removedRecord]);
  saveRecords();
  saveTrashRecords();
  render();
}

function clearHistory() {
  if (records.length === 0) {
    showStatusToast("没有可清空的历史记录");
    return;
  }

  moveToTrash(records);
  records = [];
  deletedSnapshot = null;
  saveRecords();
  saveTrashRecords();
  render();
  showStatusToast("已清空历史记录");
}

function moveToTrash(items) {
  const movedAt = new Date().toISOString();

  items.forEach((record) => {
    if (trashRecords.some((trashItem) => trashItem.id === record.id)) {
      return;
    }

    trashRecords.unshift({
      ...record,
      deletedAt: movedAt
    });
  });
}

function removeFromTrash(id) {
  trashRecords = trashRecords.filter((record) => record.id !== id);
}

function renderTrash() {
  trashList.innerHTML = "";
  trashPanel.classList.toggle("hidden", trashRecords.length === 0);
  trashCount.textContent = `${trashRecords.length} 条`;
  restoreAllButton.disabled = trashRecords.length === 0;
  emptyTrashButton.disabled = trashRecords.length === 0;

  trashRecords.forEach((record) => {
    const item = document.createElement("li");
    item.className = "record-item trash-item";

    const deletedTime = record.deletedAt ? formatDate(record.deletedAt) : "";

    item.innerHTML = `
      <div class="record-meta">
        <span class="attempt-badge">${record.attempt}</span>
        <span class="record-time">删除于 ${deletedTime}</span>
      </div>
      <div class="record-values">
        <div>
          <p>WPM</p>
          <strong>${formatAverage(record.wpm)}</strong>
        </div>
        <div>
          <p>阅读词数</p>
          <strong>${record.words}</strong>
        </div>
        <div>
          <p>阅读时间</p>
          <strong>${formatDuration(record.durationSeconds)}</strong>
        </div>
      </div>
      <button type="button" class="ghost-btn restore-btn">恢复</button>
    `;

    item.querySelector(".restore-btn").addEventListener("click", () => restoreTrashRecord(record.id));
    trashList.appendChild(item);
  });
}

function restoreTrashRecord(id) {
  const index = trashRecords.findIndex((record) => record.id === id);

  if (index === -1) {
    return;
  }

  const [restoredRecord] = trashRecords.splice(index, 1);
  const { deletedAt, ...cleanRecord } = restoredRecord;
  cleanRecord.attempt = normalizeAttempt(cleanRecord.attempt);
  records.unshift(cleanRecord);
  records.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  saveRecords();
  saveTrashRecords();
  render();
  showStatusToast("已从回收站恢复记录");
}

function restoreAllTrash() {
  if (trashRecords.length === 0) {
    return;
  }

  const restored = trashRecords.map(({ deletedAt, ...record }) => ({
    ...record,
    attempt: normalizeAttempt(record.attempt)
  }));
  records = [...restored, ...records].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  trashRecords = [];
  saveRecords();
  saveTrashRecords();
  render();
  showStatusToast("已恢复全部回收站记录");
}

function emptyTrash() {
  if (trashRecords.length === 0) {
    showStatusToast("回收站已经是空的");
    return;
  }

  trashRecords = [];
  saveTrashRecords();
  render();
  showStatusToast("已清空回收站");
}

function exportRecords() {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    attempts,
    records,
    trashRecords
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);

  link.href = url;
  link.download = `wpm-reading-backup-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showStatusToast("已导出备份文件");
}

async function importRecords(event) {
  const [file] = event.target.files || [];

  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const sourceRecords = Array.isArray(parsed) ? parsed : parsed.records;
    const sourceTrashRecords = Array.isArray(parsed?.trashRecords) ? parsed.trashRecords : [];
    const sourceAttempts = sanitizeAttemptList(parsed?.attempts);
    const importedRecords = sanitizeImportedRecords(sourceRecords);
    const importedTrashRecords = sanitizeTrashRecords(sourceTrashRecords);

    if (importedRecords.length === 0 && importedTrashRecords.length === 0) {
      showStatusToast("未导入任何记录");
      return;
    }

    const existingIds = new Set(records.map((record) => record.id));
    const mergedRecords = [...records];
    let addedCount = 0;

    importedRecords.forEach((record) => {
      if (!existingIds.has(record.id)) {
        mergedRecords.push(record);
        existingIds.add(record.id);
        addedCount += 1;
      }
    });

    const existingTrashIds = new Set(trashRecords.map((record) => record.id));
    const mergedTrash = [...trashRecords];

    importedTrashRecords.forEach((record) => {
      if (!existingIds.has(record.id) && !existingTrashIds.has(record.id)) {
        mergedTrash.push(record);
        existingTrashIds.add(record.id);
      }
    });

    records = mergedRecords.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    trashRecords = mergedTrash.sort((a, b) => new Date(b.deletedAt || b.createdAt) - new Date(a.deletedAt || a.createdAt));
    attempts = ensureAttemptsForData([...attempts, ...sourceAttempts], records, trashRecords);
    saveRecords();
    saveTrashRecords();
    saveAttempts();
    render();
    showStatusToast(addedCount > 0 ? `已导入 ${addedCount} 条记录` : "没有新增记录");
  } catch {
    showStatusToast("导入失败，文件格式不正确");
  } finally {
    importFileInput.value = "";
  }
}

function sanitizeImportedRecords(sourceRecords) {
  if (!Array.isArray(sourceRecords)) {
    return [];
  }

  return sourceRecords
    .filter((record) => record && typeof record === "object")
    .map((record) => ({
      id: typeof record.id === "string" && record.id ? record.id : crypto.randomUUID(),
      attempt: normalizeAttempt(record.attempt),
      words: Number(record.words),
      wpm: Number(record.wpm),
      durationSeconds: Number(record.durationSeconds),
      createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString()
    }))
    .filter((record) => Number.isFinite(record.words)
      && record.words > 0
      && Number.isFinite(record.wpm)
      && record.wpm > 0
      && Number.isFinite(record.durationSeconds)
      && record.durationSeconds > 0
      && !Number.isNaN(Date.parse(record.createdAt)));
}

function sanitizeTrashRecords(sourceRecords) {
  return sanitizeImportedRecords(sourceRecords)
    .map((record, index) => ({
      ...record,
      deletedAt: Array.isArray(sourceRecords) && typeof sourceRecords[index]?.deletedAt === "string"
        ? sourceRecords[index].deletedAt
        : new Date().toISOString()
    }))
    .filter((record) => !Number.isNaN(Date.parse(record.deletedAt)));
}

function showStatusToast(message) {
  statusToast.textContent = message;
  statusToast.classList.remove("hidden");

  if (toastTimer) {
    clearTimeout(toastTimer);
  }

  toastTimer = window.setTimeout(() => {
    statusToast.classList.add("hidden");
    toastTimer = null;
  }, 2600);
}

function registerOfflineSupport() {
  if (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone) {
    syncInstallUI("installed");
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").then((registration) => {
        if (registration.waiting) {
          promptAppUpdate(registration.waiting);
        }

        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;

          if (!newWorker) {
            return;
          }

          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              promptAppUpdate(newWorker);
            }
          });
        });

        window.setTimeout(() => {
          registration.update().catch(() => {});
        }, 12000);
      }).catch(() => {
        // Keep silent. The app still works online if registration fails.
      });
    });

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (isRefreshingForUpdate) {
        return;
      }

      isRefreshingForUpdate = true;
      window.location.reload();
    });
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    syncInstallUI("ready");
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    syncInstallUI("installed");
    showStatusToast("离线版已安装到设备");
  });

  syncInstallUI("idle");
}

function promptAppUpdate(worker) {
  waitingServiceWorker = worker;
  updateToast.classList.remove("hidden");
}

function applyAppUpdate() {
  if (!waitingServiceWorker) {
    updateToast.classList.add("hidden");
    return;
  }

  waitingServiceWorker.postMessage({ type: "SKIP_WAITING" });
}

async function installOfflineApp() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const result = await deferredInstallPrompt.userChoice.catch(() => null);

    if (result?.outcome === "accepted") {
      syncInstallUI("installed");
      showStatusToast("安装请求已提交");
    }

    deferredInstallPrompt = null;
    return;
  }

  if (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone) {
    syncInstallUI("installed");
    showStatusToast("离线版已经可直接打开");
    return;
  }

  showStatusToast("如需离线使用，可在浏览器菜单中选择“安装应用”或“添加到主屏幕”");
}

updateToastButton.addEventListener("click", applyAppUpdate);

function syncInstallUI(state) {
  if (!installAppButton || !installAppCopy) {
    return;
  }

  if (state === "installed") {
    installAppButton.textContent = "已安装";
    installAppButton.disabled = true;
    installAppCopy.textContent = "这个工具已经可以像本地应用一样打开，历史记录仍会保存在当前设备。";
    return;
  }

  if (state === "ready") {
    installAppButton.textContent = "安装离线版";
    installAppButton.disabled = false;
    installAppCopy.textContent = "当前浏览器支持安装，保存到桌面或主屏后可离线继续使用。";
    return;
  }

  installAppButton.textContent = "安装离线版";
  installAppButton.disabled = false;
  installAppCopy.textContent = "打开一次后可保存到桌面或主屏，后续离线也能继续使用。";
}

function formatStopwatch(totalSeconds) {
  const safeSeconds = Number.isFinite(totalSeconds) && totalSeconds > 0 ? totalSeconds : 0;
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatAverage(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatDate(isoString) {
  const date = new Date(isoString);

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatDuration(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return "0分 0秒";
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}分 ${seconds}秒`;
}

function createSeedRecords() {
  return [
    createSeedRecord(ATTEMPT_LABELS[0], 228, 820, 216, "2026-03-12T08:10:00.000Z"),
    createSeedRecord(ATTEMPT_LABELS[0], 241, 840, 209, "2026-03-14T08:25:00.000Z"),
    createSeedRecord(ATTEMPT_LABELS[0], 259, 860, 199, "2026-03-16T08:40:00.000Z"),
    createSeedRecord(ATTEMPT_LABELS[0], 278, 880, 190, "2026-03-18T08:55:00.000Z"),
    createSeedRecord(ATTEMPT_LABELS[0], 301, 900, 179, "2026-03-20T09:10:00.000Z"),
    createSeedRecord(ATTEMPT_LABELS[0], 326, 920, 169, "2026-03-23T09:05:00.000Z"),
    createSeedRecord(ATTEMPT_LABELS[0], 354, 940, 159, "2026-03-26T08:50:00.000Z"),
    createSeedRecord(ATTEMPT_LABELS[0], 389, 960, 148, "2026-03-29T08:35:00.000Z"),
    createSeedRecord(ATTEMPT_LABELS[1], 276, 820, 178, "2026-03-12T18:20:00.000Z"),
    createSeedRecord(ATTEMPT_LABELS[1], 296, 840, 170, "2026-03-14T18:35:00.000Z"),
    createSeedRecord(ATTEMPT_LABELS[1], 321, 860, 161, "2026-03-16T18:50:00.000Z"),
    createSeedRecord(ATTEMPT_LABELS[1], 349, 880, 151, "2026-03-18T19:05:00.000Z"),
    createSeedRecord(ATTEMPT_LABELS[1], 381, 900, 142, "2026-03-20T19:20:00.000Z"),
    createSeedRecord(ATTEMPT_LABELS[1], 416, 920, 133, "2026-03-23T19:10:00.000Z"),
    createSeedRecord(ATTEMPT_LABELS[1], 454, 940, 124, "2026-03-26T18:55:00.000Z"),
    createSeedRecord(ATTEMPT_LABELS[1], 498, 960, 116, "2026-03-29T18:40:00.000Z"),
    createSeedRecord(ATTEMPT_LABELS[2], 332, 820, 148, "2026-03-13T07:30:00.000Z"),
    createSeedRecord(ATTEMPT_LABELS[2], 358, 840, 141, "2026-03-15T07:42:00.000Z"),
    createSeedRecord(ATTEMPT_LABELS[2], 389, 860, 133, "2026-03-17T07:54:00.000Z"),
    createSeedRecord(ATTEMPT_LABELS[2], 425, 880, 124, "2026-03-19T08:06:00.000Z"),
    createSeedRecord(ATTEMPT_LABELS[2], 466, 900, 116, "2026-03-21T08:18:00.000Z"),
    createSeedRecord(ATTEMPT_LABELS[2], 512, 920, 108, "2026-03-24T08:10:00.000Z"),
    createSeedRecord(ATTEMPT_LABELS[2], 563, 940, 100, "2026-03-27T07:58:00.000Z"),
    createSeedRecord(ATTEMPT_LABELS[2], 621, 960, 93, "2026-03-30T07:45:00.000Z")
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function createSeedRecord(attempt, wpm, words, durationSeconds, createdAt) {
  return {
    id: `seed-${attempt}-${createdAt}`,
    attempt,
    wpm,
    words,
    durationSeconds,
    createdAt
  };
}
