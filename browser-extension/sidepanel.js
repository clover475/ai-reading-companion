const DEFAULT_SETTINGS = {
  apiKey: "",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  replyLength: "medium",
  defaultLanguage: "中文"
};

const MAX_HISTORY = 20;

const ACTION_INSTRUCTIONS = {
  free: "回应用户的自由提问。结合网页标题、链接、选中文本和用户问题，不要只做机械翻译。",
  explain: "解释这段内容。先说核心意思，再说它在当前网页或书籍片段里的作用。",
  simplify: "把这段讲简单一点。使用更短的句子、生活化比喻或一个小例子。",
  stuck: "用户读不进去了。不要继续输出大量知识。先安抚，再把任务拆到一句话、一个关键词或一个小问题。",
  respond: "回应用户的想法、困惑、评论或标注。肯定合理直觉，帮用户说清楚它为什么重要，并连接回选中文本。",
  card: "生成一张 Markdown 阅读卡片。必须包含阅读来源、标题、URL、时间、选中文本摘要和用户理解。"
};

const state = {
  selection: null,
  settings: { ...DEFAULT_SETTINGS },
  latestMarkdown: "",
  conversation: []
};

const els = {
  refreshSelection: document.getElementById("refreshSelection"),
  sourceTitle: document.getElementById("sourceTitle"),
  sourceUrl: document.getElementById("sourceUrl"),
  sourceMeta: document.getElementById("sourceMeta"),
  selectionPreview: document.getElementById("selectionPreview"),
  userInput: document.getElementById("userInput"),
  answer: document.getElementById("answer"),
  status: document.getElementById("status"),
  copyMarkdown: document.getElementById("copyMarkdown"),
  downloadMarkdown: document.getElementById("downloadMarkdown"),
  apiKey: document.getElementById("apiKey"),
  baseUrl: document.getElementById("baseUrl"),
  model: document.getElementById("model"),
  replyLength: document.getElementById("replyLength"),
  saveSettings: document.getElementById("saveSettings"),
  historyList: document.getElementById("historyList")
};

init();

async function init() {
  await loadSettings();
  await refreshSelection();
  await renderHistory();

  els.refreshSelection.addEventListener("click", refreshSelection);
  els.saveSettings.addEventListener("click", saveSettings);
  els.copyMarkdown.addEventListener("click", copyLatestMarkdown);
  els.downloadMarkdown.addEventListener("click", downloadLatestMarkdown);
  els.selectionPreview.addEventListener("input", syncSelectionFromPanel);
  els.sourceTitle.addEventListener("input", syncSelectionFromPanel);
  els.sourceUrl.addEventListener("input", syncSelectionFromPanel);

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => runAction(button.dataset.action));
  });
}

async function loadSettings() {
  const stored = await chrome.storage.local.get(["settings"]);
  state.settings = { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
  els.apiKey.value = state.settings.apiKey;
  els.baseUrl.value = state.settings.baseUrl;
  els.model.value = state.settings.model;
  els.replyLength.value = state.settings.replyLength;
}

async function saveSettings() {
  state.settings = {
    ...state.settings,
    apiKey: els.apiKey.value.trim(),
    baseUrl: els.baseUrl.value.trim() || DEFAULT_SETTINGS.baseUrl,
    model: els.model.value.trim() || DEFAULT_SETTINGS.model,
    replyLength: els.replyLength.value || DEFAULT_SETTINGS.replyLength
  };
  await chrome.storage.local.set({ settings: state.settings });
  setStatus("设置已保存");
}

async function refreshSelection() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let payload = null;

  if (tab?.id) {
    try {
      payload = await chrome.tabs.sendMessage(tab.id, { type: "GET_SELECTION" });
    } catch {
      payload = null;
    }

    if (!payload?.selectedText) {
      payload = await captureSelectionWithScripting(tab.id);
    }
  }

  if (!payload?.selectedText) {
    const stored = await chrome.storage.local.get(["latestSelection"]);
    payload = stored.latestSelection || payload;
  }

  state.selection = normalizeSelectionPayload(payload, tab);
  renderSelection();
}

async function captureSelectionWithScripting(tabId) {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({
        selectedText: window.getSelection()?.toString().trim() || "",
        title: document.title || "",
        url: location.href,
        origin: location.origin,
        siteName: location.hostname,
        capturedAt: new Date().toISOString()
      })
    });
    return result?.result || null;
  } catch {
    return null;
  }
}

function normalizeSelectionPayload(payload, tab) {
  const url = payload?.url || tab?.url || "";
  const siteName = payload?.siteName || safeHostname(url);
  const title = payload?.title || tab?.title || "";
  return {
    selectedText: payload?.selectedText || "",
    truncated: Boolean(payload?.truncated),
    title,
    url,
    origin: payload?.origin || safeOrigin(url),
    siteName,
    capturedAt: payload?.capturedAt || new Date().toISOString()
  };
}

function renderSelection() {
  const selection = state.selection;
  if (!selection?.selectedText && !selection?.title && !selection?.url) {
    els.sourceTitle.value = "";
    els.sourceUrl.value = "";
    els.sourceMeta.textContent = "未捕获网页";
    els.selectionPreview.value = "";
    els.selectionPreview.classList.add("empty");
    return;
  }

  els.sourceTitle.value = selection.title || selection.siteName || "";
  els.sourceUrl.value = selection.url || "";
  els.sourceMeta.textContent = selection.siteName ? `来源站点：${selection.siteName}` : "来源站点：未识别";
  els.selectionPreview.value = selection.truncated
    ? `${selection.selectedText}\n\n[选区过长，已截取前 6000 字]`
    : selection.selectedText;
  els.selectionPreview.classList.toggle("empty", !selection.selectedText);
}

function syncSelectionFromPanel() {
  const current = state.selection || {};
  const url = els.sourceUrl.value.trim();
  state.selection = {
    ...current,
    selectedText: els.selectionPreview.value.trim(),
    title: els.sourceTitle.value.trim(),
    url,
    origin: current.origin || safeOrigin(url),
    siteName: current.siteName || safeHostname(url),
    capturedAt: current.capturedAt || new Date().toISOString()
  };
  els.selectionPreview.classList.toggle("empty", !state.selection.selectedText);
  els.sourceMeta.textContent = state.selection.siteName ? `来源站点：${state.selection.siteName}` : "来源站点：未识别";
}

async function runAction(action) {
  syncSelectionFromPanel();
  if (!state.selection?.selectedText) {
    await refreshSelection();
    syncSelectionFromPanel();
  }
  const selection = state.selection;
  const userInput = els.userInput.value.trim();

  if (!selection?.selectedText) {
    setStatus("请先在当前网页中选中一段文字。");
    return;
  }

  if (action === "respond" && !userInput) {
    setStatus("请先在输入框写下你的想法、困惑或评论。");
    return;
  }

  if (!state.settings.apiKey) {
    setStatus("请先在 API 设置里填写 API Key。");
    return;
  }

  setBusy(true, "正在和 AI 陪读搭子沟通...");

  try {
    const userTurn = describeUserTurn(action, userInput);
    state.conversation.push({ role: "user", content: userTurn });

    const answer = await callCompanionApi(action, selection, userInput);
    state.conversation.push({ role: "assistant", content: answer });
    state.latestMarkdown = answer;
    els.answer.textContent = answer;

    const isCard = action === "card" || answer.trim().startsWith("# 今日陪读卡片");
    els.copyMarkdown.disabled = false;
    els.downloadMarkdown.disabled = false;

    if (isCard) {
      await saveCardToHistory(answer, selection);
      await renderHistory();
    }

    setStatus("完成");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error));
  } finally {
    setBusy(false);
  }
}

async function callCompanionApi(action, selection, userInput) {
  const baseUrl = state.settings.baseUrl.replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${state.settings.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: state.settings.model,
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: buildUserPrompt(action, selection, userInput) }
      ],
      temperature: 0.7
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`AI 请求失败（HTTP ${response.status}）。${detail.slice(0, 400)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI 返回内容为空，请检查模型名称或 API 兼容性。");
  return content.trim();
}

function buildSystemPrompt() {
  const lengthGuide = {
    short: "默认回答控制在 3-5 句，必要时使用极短 bullet。",
    medium: "默认回答控制在 2-4 个短段落，避免长篇讲义。",
    long: "可以更完整，但仍要分段清楚，不要堆砌。"
  }[state.settings.replyLength];

  return [
    "你是浏览器里的 AI 陪读搭子，不是冷冰冰的总结器，也不是说教的老师。",
    `请默认使用${state.settings.defaultLanguage}回复。`,
    "你的语气温柔、稳定、清晰，不催促用户高效，不批评用户读得慢，不输出鸡汤。",
    "你的目标是帮助用户读懂一点点，并愿意继续读下去。",
    "你只能看到用户主动选中的文字、网页标题、链接和本次对话。不要假装看过整个网页或整本书。",
    "如果上下文不足，请温和提示用户多选一点前后文。",
    "用户读不进去时，请降低任务难度，让任务小到可以马上开始。",
    "生成阅读卡片时，必须保留网页标题、来源站点、URL、时间和选中文本摘要。",
    lengthGuide
  ].join("\n");
}

function buildUserPrompt(action, selection, userInput) {
  if (action === "card") {
    return [
      "请生成一张可直接复制到 Obsidian 的 Markdown 阅读卡片。",
      "",
      "格式必须是：",
      "# 今日陪读卡片",
      "",
      "## 阅读来源",
      `- 标题：${selection.title || "未命名网页"}`,
      `- 来源：${selection.siteName || selection.origin || "未知来源"}`,
      `- URL：${selection.url || "无"}`,
      `- 时间：${formatDateTime(selection.capturedAt)}`,
      "",
      "## 我读到的位置",
      "根据选中文本描述，不要编造章节。",
      "",
      "## 我划线的内容",
      "> 用不超过 250 字摘录或概括选中文本。",
      "",
      "## 我关注的重点",
      "- ...",
      "",
      "## 我今天理解到",
      "- ...",
      "",
      "## 我还没理解",
      "- ...",
      "",
      "## AI 给我的一句提醒",
      "...",
      "",
      "网页信息：",
      JSON.stringify(selection, null, 2),
      "",
      "用户输入：",
      userInput || "无额外输入",
      "",
      "本次对话：",
      conversationAsMarkdown()
    ].join("\n");
  }

  return [
    `任务类型：${action}`,
    `任务说明：${ACTION_INSTRUCTIONS[action]}`,
    "",
    "网页标题：",
    selection.title || "未命名网页",
    "",
    "来源站点：",
    selection.siteName || selection.origin || "未知来源",
    "",
    "URL：",
    selection.url || "无",
    "",
    "捕获时间：",
    formatDateTime(selection.capturedAt),
    "",
    "用户选中的文本：",
    selection.selectedText,
    "",
    "用户输入：",
    userInput || "无额外输入",
    "",
    "请直接给出陪读式回复。"
  ].join("\n");
}

function describeUserTurn(action, userInput) {
  const labels = {
    free: "自由提问",
    explain: "解释这段",
    simplify: "讲简单一点",
    stuck: "我读不进去了",
    respond: "回应我的想法",
    card: "生成阅读卡片"
  };
  return userInput ? `${labels[action]}：${userInput}` : labels[action];
}

function conversationAsMarkdown() {
  return state.conversation
    .slice(-8)
    .map((turn) => `**${turn.role === "user" ? "我" : "AI"}**：\n${turn.content}`)
    .join("\n\n");
}

async function saveCardToHistory(markdown, selection) {
  const stored = await chrome.storage.local.get(["cardHistory"]);
  const history = Array.isArray(stored.cardHistory) ? stored.cardHistory : [];
  history.unshift({
    id: crypto.randomUUID(),
    title: selection.title || "未命名网页",
    url: selection.url || "",
    siteName: selection.siteName || "",
    savedAt: new Date().toISOString(),
    markdown
  });
  await chrome.storage.local.set({ cardHistory: history.slice(0, MAX_HISTORY) });
}

async function renderHistory() {
  const stored = await chrome.storage.local.get(["cardHistory"]);
  const history = Array.isArray(stored.cardHistory) ? stored.cardHistory : [];
  els.historyList.innerHTML = "";

  if (history.length === 0) {
    const empty = document.createElement("div");
    empty.className = "history-item-meta";
    empty.textContent = "还没有阅读卡片。";
    els.historyList.appendChild(empty);
    return;
  }

  for (const item of history) {
    const wrapper = document.createElement("div");
    wrapper.className = "history-item";

    const title = document.createElement("div");
    title.className = "history-item-title";
    title.textContent = item.title;

    const meta = document.createElement("div");
    meta.className = "history-item-meta";
    meta.textContent = `${formatDateTime(item.savedAt)} · ${item.siteName || item.url || "未知来源"}`;

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.textContent = "复制这张卡片";
    copyButton.addEventListener("click", async () => {
      state.latestMarkdown = item.markdown;
      await copyLatestMarkdown();
    });

    wrapper.append(title, meta, copyButton);
    els.historyList.appendChild(wrapper);
  }
}

async function copyLatestMarkdown() {
  if (!state.latestMarkdown) return;
  await navigator.clipboard.writeText(state.latestMarkdown);
  setStatus("已复制 Markdown，可以回 Obsidian 粘贴。");
}

function downloadLatestMarkdown() {
  if (!state.latestMarkdown) return;
  const selection = state.selection || {};
  const fileName = `${formatDateSlug(new Date())} - ${sanitizeFileName(selection.title || "AI Reading Card")}.md`;
  const blob = new Blob([`${state.latestMarkdown.trim()}\n`], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function setBusy(isBusy, statusText = "") {
  document.querySelectorAll("button").forEach((button) => {
    if (button.id === "copyMarkdown" || button.id === "downloadMarkdown") {
      button.disabled = isBusy || !state.latestMarkdown;
      return;
    }
    button.disabled = isBusy;
  });
  setStatus(statusText);
}

function setStatus(text) {
  els.status.textContent = text || "";
}

function formatDateTime(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function formatDateSlug(value) {
  const date = value instanceof Date ? value : new Date(value);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function sanitizeFileName(name) {
  return name.replace(/[\\/:*?"<>|]/g, "-").slice(0, 80);
}

function safeHostname(url) {
  try {
    return url ? new URL(url).hostname : "";
  } catch {
    return "";
  }
}

function safeOrigin(url) {
  try {
    return url ? new URL(url).origin : "";
  } catch {
    return "";
  }
}
