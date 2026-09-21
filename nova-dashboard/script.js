"use strict";

const STORAGE_KEYS = {
  tasks: "nova-dashboard-tasks",
  notes: "nova-dashboard-notes"
};

const clockTime = document.querySelector("#current-time");
const clockDate = document.querySelector("#current-date");
const taskForm = document.querySelector("#task-form");
const taskInput = document.querySelector("#task-input");
const taskList = document.querySelector("#task-list");
const taskCount = document.querySelector("#task-count");
const taskEmpty = document.querySelector("#task-empty");
const notesInput = document.querySelector("#notes-input");
const notesStatus = document.querySelector("#notes-status");
const timerMinutes = document.querySelector("#timer-minutes");
const timerSeconds = document.querySelector("#timer-seconds");
const timerToggle = document.querySelector("#timer-toggle");
const timerReset = document.querySelector("#timer-reset");
const timerStatus = document.querySelector("#timer-status");

const POMODORO_SECONDS = 25 * 60;
let tasks = readTasks();
let secondsRemaining = POMODORO_SECONDS;
let timerInterval = null;
let timerEndTime = null;
let notesSaveTimeout = null;

function readTasks() {
  try {
    const savedTasks = JSON.parse(localStorage.getItem(STORAGE_KEYS.tasks));
    return Array.isArray(savedTasks) ? savedTasks : [];
  } catch {
    return [];
  }
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(tasks));
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

function createTaskId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function renderTasks() {
  taskList.replaceChildren();

  tasks.forEach((task) => {
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

  const openTasks = tasks.filter((task) => !task.completed).length;
  taskCount.textContent = `${openTasks} ${openTasks === 1 ? "task" : "tasks"}`;
  taskEmpty.classList.toggle("hidden", tasks.length > 0);
}

function addTask(text) {
  tasks.unshift({
    id: createTaskId(),
    text,
    completed: false
  });
  saveTasks();
  renderTasks();
}

function toggleTask(id) {
  tasks = tasks.map((task) =>
    task.id === id ? { ...task, completed: !task.completed } : task
  );
  saveTasks();
  renderTasks();
}

function deleteTask(id) {
  tasks = tasks.filter((task) => task.id !== id);
  saveTasks();
  renderTasks();
}

function restoreNotes() {
  notesInput.value = localStorage.getItem(STORAGE_KEYS.notes) || "";
}

function saveNotes() {
  localStorage.setItem(STORAGE_KEYS.notes, notesInput.value);
  notesStatus.textContent = "Saved locally";
}

function updateTimerDisplay() {
  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;

  timerMinutes.textContent = String(minutes).padStart(2, "0");
  timerSeconds.textContent = String(seconds).padStart(2, "0");
}

function setTimerState(isRunning) {
  timerToggle.textContent = isRunning ? "Pause" : "Start";
  timerStatus.textContent = isRunning ? "Focusing" : "Ready";
  timerStatus.classList.toggle("active", isRunning);
}

function tickTimer() {
  secondsRemaining = Math.max(0, Math.ceil((timerEndTime - Date.now()) / 1000));
  updateTimerDisplay();

  if (secondsRemaining === 0) {
    clearInterval(timerInterval);
    timerInterval = null;
    timerEndTime = null;
    timerToggle.textContent = "Start";
    timerStatus.textContent = "Complete";
    timerStatus.classList.remove("active");
  }
}

function startTimer() {
  if (secondsRemaining === 0) {
    secondsRemaining = POMODORO_SECONDS;
    updateTimerDisplay();
  }

  timerEndTime = Date.now() + secondsRemaining * 1000;
  timerInterval = window.setInterval(tickTimer, 250);
  setTimerState(true);
}

function pauseTimer() {
  tickTimer();
  clearInterval(timerInterval);
  timerInterval = null;
  timerEndTime = null;
  setTimerState(false);
}

function resetTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  timerEndTime = null;
  secondsRemaining = POMODORO_SECONDS;
  updateTimerDisplay();
  setTimerState(false);
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

notesInput.addEventListener("input", () => {
  notesStatus.textContent = "Saving…";
  clearTimeout(notesSaveTimeout);
  notesSaveTimeout = window.setTimeout(saveNotes, 350);
});

timerToggle.addEventListener("click", () => {
  if (timerInterval) {
    pauseTimer();
  } else {
    startTimer();
  }
});

timerReset.addEventListener("click", resetTimer);

window.addEventListener("beforeunload", () => {
  if (notesSaveTimeout) {
    saveNotes();
  }
});

updateClock();
window.setInterval(updateClock, 1000);
restoreNotes();
renderTasks();
updateTimerDisplay();
