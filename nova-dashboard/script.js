"use strict";

const STORAGE_KEYS = {
  tasks: "nova-dashboard-tasks",
  notes: "nova-dashboard-notes",
  timers: "nova-dashboard-timers"
};

const TASK_PERIODS = ["daily", "weekly", "monthly"];
const DEFAULT_TIMER_MINUTES = 25;

const clockTime = document.querySelector("#current-time");
const clockDate = document.querySelector("#current-date");
const taskForm = document.querySelector("#task-form");
const taskInput = document.querySelector("#task-input");
const taskList = document.querySelector("#task-list");
const taskCount = document.querySelector("#task-count");
const taskEmpty = document.querySelector("#task-empty");
const taskTabs = Array.from(document.querySelectorAll(".task-tab"));
const notesInput = document.querySelector("#notes-input");
const notesStatus = document.querySelector("#notes-status");
const timerForm = document.querySelector("#timer-form");
const timerName = document.querySelector("#timer-name");
const timerDuration = document.querySelector("#timer-duration");
const timerList = document.querySelector("#timer-list");
const timerCount = document.querySelector("#timer-count");
const timerEmpty = document.querySelector("#timer-empty");

let tasks = readTasks();
let activeTaskPeriod = "daily";
let timers = readTimers();
let timerInterval = null;
let notesSaveTimeout = null;
const timerElements = new Map();

function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readTasks() {
  const emptyLists = { daily: [], weekly: [], monthly: [] };

  try {
    const savedTasks = JSON.parse(localStorage.getItem(STORAGE_KEYS.tasks));

    // Earlier versions stored one flat list. Preserve it as the Daily list.
    if (Array.isArray(savedTasks)) {
      return { ...emptyLists, daily: savedTasks };
    }

    if (savedTasks && typeof savedTasks === "object") {
      return Object.fromEntries(
        TASK_PERIODS.map((period) => [
          period,
          Array.isArray(savedTasks[period]) ? savedTasks[period] : []
        ])
      );
    }
  } catch {
    // Fall through to empty lists if local data cannot be parsed.
  }

  return emptyLists;
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(tasks));
}

function readTimers() {
  const savedValue = localStorage.getItem(STORAGE_KEYS.timers);

  if (savedValue === null) {
    return [createTimer("Pomodoro", DEFAULT_TIMER_MINUTES)];
  }

  try {
    const savedTimers = JSON.parse(savedValue);

    if (!Array.isArray(savedTimers)) {
      return [createTimer("Pomodoro", DEFAULT_TIMER_MINUTES)];
    }

    return savedTimers.flatMap((timer) => {
      const durationSeconds = Number.parseInt(timer.durationSeconds, 10);
      const savedRemaining = Number.parseInt(timer.secondsRemaining, 10);

      if (!timer.id || !timer.name || !Number.isFinite(durationSeconds) || durationSeconds < 60) {
        return [];
      }

      let secondsRemaining = Math.min(
        durationSeconds,
        Math.max(0, Number.isFinite(savedRemaining) ? savedRemaining : durationSeconds)
      );
      let isRunning = Boolean(timer.isRunning && Number.isFinite(timer.endTime));
      let endTime = isRunning ? timer.endTime : null;

      if (isRunning) {
        secondsRemaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
        if (secondsRemaining === 0) {
          isRunning = false;
          endTime = null;
        }
      }

      return [{
        id: String(timer.id),
        name: String(timer.name).slice(0, 40),
        durationSeconds,
        secondsRemaining,
        isRunning,
        endTime
      }];
    });
  } catch {
    return [createTimer("Pomodoro", DEFAULT_TIMER_MINUTES)];
  }
}

function createTimer(name, minutes) {
  const durationSeconds = minutes * 60;

  return {
    id: createId(),
    name,
    durationSeconds,
    secondsRemaining: durationSeconds,
    isRunning: false,
    endTime: null
  };
}

function saveTimers() {
  localStorage.setItem(STORAGE_KEYS.timers, JSON.stringify(timers));
}

function updateClock() {
  const now = new Date();

  clockTime.textContent = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(now);

  clockTime.dateTime = now.toISOString();
  clockDate.textContent = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric"
  }).format(now);
}

function renderTasks() {
  const activeTasks = tasks[activeTaskPeriod];
  const periodLabel = `${activeTaskPeriod[0].toUpperCase()}${activeTaskPeriod.slice(1)}`;
  taskList.replaceChildren();

  activeTasks.forEach((task) => {
    const item = document.createElement("li");
    item.className = `task-item${task.completed ? " completed" : ""}`;
    item.dataset.id = task.id;

    const checkButton = document.createElement("button");
    checkButton.className = "task-check";
    checkButton.type = "button";
    checkButton.setAttribute(
      "aria-label",
      task.completed ? `Mark ${task.text} as incomplete` : `Mark ${task.text} as complete`
    );
    checkButton.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.2 6.2 11 13 4.8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    const text = document.createElement("span");
    text.className = "task-text";
    text.textContent = task.text;

    const deleteButton = document.createElement("button");
    deleteButton.className = "task-delete";
    deleteButton.type = "button";
    deleteButton.setAttribute("aria-label", `Delete ${task.text}`);
    deleteButton.textContent = "×";

    checkButton.addEventListener("click", () => toggleTask(task.id));
    deleteButton.addEventListener("click", () => deleteTask(task.id));

    item.append(checkButton, text, deleteButton);
    taskList.append(item);
  });

  const openTasks = activeTasks.filter((task) => !task.completed).length;
  taskCount.textContent = `${openTasks} ${openTasks === 1 ? "task" : "tasks"}`;
  taskEmpty.textContent = `Nothing on your ${activeTaskPeriod} list yet.`;
  taskEmpty.classList.toggle("hidden", activeTasks.length > 0);
  taskInput.placeholder = `Add a ${activeTaskPeriod} task…`;
  taskList.setAttribute("aria-label", `${periodLabel} tasks`);

  taskTabs.forEach((tab) => {
    const isActive = tab.dataset.period === activeTaskPeriod;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
    tab.tabIndex = isActive ? 0 : -1;
  });
  taskList.setAttribute("aria-labelledby", `${activeTaskPeriod}-tab`);
}

function addTask(text) {
  tasks[activeTaskPeriod].unshift({
    id: createId(),
    text,
    completed: false
  });
  saveTasks();
  renderTasks();
}

function toggleTask(id) {
  tasks[activeTaskPeriod] = tasks[activeTaskPeriod].map((task) =>
    task.id === id ? { ...task, completed: !task.completed } : task
  );
  saveTasks();
  renderTasks();
}

function deleteTask(id) {
  tasks[activeTaskPeriod] = tasks[activeTaskPeriod].filter((task) => task.id !== id);
  saveTasks();
  renderTasks();
}

function selectTaskPeriod(period, shouldFocus = false) {
  if (!TASK_PERIODS.includes(period)) {
    return;
  }

  activeTaskPeriod = period;
  renderTasks();

  if (shouldFocus) {
    document.querySelector(`[data-period="${period}"]`).focus();
  }
}

function restoreNotes() {
  notesInput.value = localStorage.getItem(STORAGE_KEYS.notes) || "";
}

function saveNotes() {
  localStorage.setItem(STORAGE_KEYS.notes, notesInput.value);
  notesStatus.textContent = "Saved locally";
}

function formatTime(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getTimerState(timer) {
  if (timer.isRunning) {
    return "Running";
  }

  if (timer.secondsRemaining === 0) {
    return "Complete";
  }

  if (timer.secondsRemaining < timer.durationSeconds) {
    return "Paused";
  }

  return "Ready";
}

function updateTimerElement(timer) {
  const elements = timerElements.get(timer.id);

  if (!elements) {
    return;
  }

  const state = getTimerState(timer);
  const formattedTime = formatTime(timer.secondsRemaining);
  elements.item.classList.toggle("running", timer.isRunning);
  elements.item.classList.toggle("complete", state === "Complete");
  elements.display.textContent = formattedTime;
  elements.display.setAttribute("aria-label", `${timer.name}: ${formattedTime} remaining`);
  elements.status.textContent = state;
  elements.toggle.textContent = timer.isRunning ? "Pause" : "Start";
}

function renderTimers() {
  timerElements.clear();
  timerList.replaceChildren();

  timers.forEach((timer) => {
    const item = document.createElement("article");
    item.className = "timer-item";
    item.dataset.timerId = timer.id;

    const heading = document.createElement("div");
    heading.className = "timer-item-heading";

    const name = document.createElement("span");
    name.className = "timer-item-name";
    name.textContent = timer.name;
    name.title = timer.name;

    const meta = document.createElement("div");
    meta.className = "timer-meta";

    const status = document.createElement("span");

    const deleteButton = document.createElement("button");
    deleteButton.className = "timer-delete";
    deleteButton.type = "button";
    deleteButton.textContent = "×";
    deleteButton.setAttribute("aria-label", `Delete ${timer.name} timer`);
    deleteButton.addEventListener("click", () => deleteTimer(timer.id));

    meta.append(status, deleteButton);
    heading.append(name, meta);

    const body = document.createElement("div");
    body.className = "timer-body";

    const display = document.createElement("div");
    display.className = "timer-display";
    display.setAttribute("role", "timer");
    display.setAttribute("aria-live", "off");

    const actions = document.createElement("div");
    actions.className = "timer-actions";

    const toggleButton = document.createElement("button");
    toggleButton.className = "primary-button";
    toggleButton.type = "button";
    toggleButton.addEventListener("click", () => toggleTimer(timer.id));

    const resetButton = document.createElement("button");
    resetButton.className = "secondary-button";
    resetButton.type = "button";
    resetButton.textContent = "Reset";
    resetButton.addEventListener("click", () => resetTimer(timer.id));

    actions.append(toggleButton, resetButton);
    body.append(display, actions);
    item.append(heading, body);
    timerList.append(item);

    timerElements.set(timer.id, {
      item,
      display,
      status,
      toggle: toggleButton
    });
    updateTimerElement(timer);
  });

  timerCount.textContent = `${timers.length} ${timers.length === 1 ? "timer" : "timers"}`;
  timerEmpty.classList.toggle("hidden", timers.length > 0);
  syncTimerTicker();
}

function addTimer(name, minutes) {
  timers.unshift(createTimer(name, minutes));
  saveTimers();
  renderTimers();
}

function toggleTimer(id) {
  const timer = timers.find((candidate) => candidate.id === id);

  if (!timer) {
    return;
  }

  if (timer.isRunning) {
    updateRunningTimer(timer);
    timer.isRunning = false;
    timer.endTime = null;
  } else {
    if (timer.secondsRemaining === 0) {
      timer.secondsRemaining = timer.durationSeconds;
    }
    timer.isRunning = true;
    timer.endTime = Date.now() + timer.secondsRemaining * 1000;
  }

  saveTimers();
  updateTimerElement(timer);
  syncTimerTicker();
}

function resetTimer(id) {
  const timer = timers.find((candidate) => candidate.id === id);

  if (!timer) {
    return;
  }

  timer.isRunning = false;
  timer.endTime = null;
  timer.secondsRemaining = timer.durationSeconds;
  saveTimers();
  updateTimerElement(timer);
  syncTimerTicker();
}

function deleteTimer(id) {
  timers = timers.filter((timer) => timer.id !== id);
  saveTimers();
  renderTimers();
}

function updateRunningTimer(timer) {
  if (!timer.isRunning || !timer.endTime) {
    return false;
  }

  timer.secondsRemaining = Math.max(0, Math.ceil((timer.endTime - Date.now()) / 1000));

  if (timer.secondsRemaining === 0) {
    timer.isRunning = false;
    timer.endTime = null;
    return true;
  }

  return false;
}

function tickTimers() {
  let timerCompleted = false;

  timers.forEach((timer) => {
    if (timer.isRunning) {
      timerCompleted = updateRunningTimer(timer) || timerCompleted;
      updateTimerElement(timer);
    }
  });

  if (timerCompleted) {
    saveTimers();
    syncTimerTicker();
  }
}

function syncTimerTicker() {
  const hasRunningTimer = timers.some((timer) => timer.isRunning);

  if (hasRunningTimer && !timerInterval) {
    timerInterval = window.setInterval(tickTimers, 250);
  } else if (!hasRunningTimer && timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const taskText = taskInput.value.trim();

  if (!taskText) {
    return;
  }

  addTask(taskText);
  taskInput.value = "";
  taskInput.focus();
});

taskTabs.forEach((tab) => {
  tab.addEventListener("click", () => selectTaskPeriod(tab.dataset.period));
  tab.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) {
      return;
    }

    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const currentIndex = TASK_PERIODS.indexOf(activeTaskPeriod);
    const nextIndex = (currentIndex + direction + TASK_PERIODS.length) % TASK_PERIODS.length;
    selectTaskPeriod(TASK_PERIODS[nextIndex], true);
  });
});

notesInput.addEventListener("input", () => {
  notesStatus.textContent = "Saving…";
  clearTimeout(notesSaveTimeout);
  notesSaveTimeout = window.setTimeout(saveNotes, 350);
});

timerForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = timerName.value.trim();
  const minutes = Number.parseInt(timerDuration.value, 10);

  if (!name || !Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
    return;
  }

  addTimer(name, minutes);
  timerName.value = "";
  timerName.focus();
});

window.addEventListener("beforeunload", () => {
  if (notesSaveTimeout) {
    saveNotes();
  }
  timers.forEach(updateRunningTimer);
  saveTimers();
});

updateClock();
window.setInterval(updateClock, 1000);
restoreNotes();
renderTasks();
renderTimers();
