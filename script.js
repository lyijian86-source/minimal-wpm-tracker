const STORAGE_KEY = "wpm-reading-records";
const ATTEMPTS = ["第一遍", "第二遍", "第三遍"];

const form = document.getElementById("record-form");
const attemptInput = document.getElementById("attempt");
const sourceTextInput = document.getElementById("source-text");
const minutesInput = document.getElementById("minutes");
const secondsInput = document.getElementById("seconds");
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
const exportButton = document.getElementById("export-button");
const importButton = document.getElementById("import-button");
const importFileInput = document.getElementById("import-file");
const statusToast = document.getElementById("status-toast");
const itemTemplate = document.getElementById("record-item-template");
const attemptTabs = document.querySelectorAll("[data-attempt-tab]");

let records = loadRecords();
let deletedSnapshot = null;
let activeAttempt = ATTEMPTS.includes(records[0]?.attempt) ? records[0].attempt : ATTEMPTS[0];
let toastTimer = null;
let timeMode = "manual";
let timerStartAt = 0;
let timerElapsedMs = 0;
let timerIntervalId = null;

render();
updateLiveMetrics();

sourceTextInput.addEventListener("input", updateLiveMetrics);
minutesInput.addEventListener("input", updateLiveMetrics);
secondsInput.addEventListener("input", updateLiveMetrics);

attemptInput.addEventListener("change", () => {
  activeAttempt = attemptInput.value;
  render();
});

attemptTabs.forEach((button) => {
  button.addEventListener("click", () => {
    activeAttempt = button.dataset.attemptTab;
    attemptInput.value = activeAttempt;
    render();
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
  deletedSnapshot = null;
  saveRecords();
  render();
});

exportButton.addEventListener("click", exportRecords);
importButton.addEventListener("click", () => importFileInput.click());
importFileInput.addEventListener("change", importRecords);

function updateLiveMetrics() {
  const metrics = getCurrentMetrics();

  liveWords.textContent = String(metrics.words);
  liveWpm.textContent = metrics.words > 0 && metrics.totalSeconds > 0 ? formatAverage(metrics.wpm) : "0";
  submitButton.disabled = !metrics.isValid;
  syncTimeModeUI();
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
}

function startTimer() {
  if (isTimerRunning()) {
    return;
  }

  timeMode = "timer";
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

function loadRecords() {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRecords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function render() {
  syncAttemptControls();
  renderStats();
  renderTrend();
  renderList();
  renderUndo();
}

function syncAttemptControls() {
  activeAttemptLabel.textContent = activeAttempt;
  attemptInput.value = activeAttempt;

  attemptTabs.forEach((button) => {
    button.classList.toggle("active", button.dataset.attemptTab === activeAttempt);
  });
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
  saveRecords();
  render();
}

function exportRecords() {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    records
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
    const importedRecords = sanitizeImportedRecords(sourceRecords);

    if (importedRecords.length === 0) {
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

    records = mergedRecords.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    saveRecords();
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
      attempt: ATTEMPTS.includes(record.attempt) ? record.attempt : ATTEMPTS[0],
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
