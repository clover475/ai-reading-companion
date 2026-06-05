const DEFAULT_SETTINGS = {
  apiKey: "",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-chat",
  replyLength: "medium",
  defaultLanguage: "中文"
};

const MAX_HISTORY = 20;
const MAX_CONVERSATION_MESSAGES = 12;

const ACTION_INSTRUCTIONS = {
  free: "回应用户的自由追问。结合阅读来源、选中文本和前面对话，不要只做机械翻译。",
  explain: "解释这段内容。先说核心意思，再说它在当前网页或书籍片段里的作用。",
  simplify: "把这段讲简单一点。使用更短的句子、生活化比喻或一个小例子。",
  stuck: "用户读不进去了。不要继续输出大量知识。先安抚，再把任务拆到一句话、一个关键词或一个小问题。",
  respond: "回应用户的想法、困惑、评论或标注。肯定合理直觉，帮用户说清楚它为什么重要，并连接回选中文本。"
};

const state = {
  selection: null,
  settings: { ...DEFAULT_SETTINGS },
  latestMarkdown: "",
  conversation: []
};

const els = {
  refreshSelection: document.getElementById("refreshSelection"),
  clearConversation: document.getElementById("clearConversation"),
  sourceTitle: document.getElementById("sourceTitle"),
  sourceUrl: document.getElementById("sourceUrl"),
  sourceMeta: document.getElementById("sourceMeta"),
  selectionPreview: document.getElementById("selectionPreview"),
  conversationList: document.getElementById("conversationList"),
  userInput: document.getElementById("userInput"),
  status: document.getElementById("status"),
  generateCard: document.getElementById("generateCard"),
  cardPreview: document.getElementById("cardPreview"),
  copyMarkdown: document.getElementById("copyMarkdown"),
  downloadMarkdown: document.getElementById("downloadMarkdown"),
  apiKey: document.getElementById("apiKey"),
  baseUrl: document.getElementById("baseUrl"),
  model: document.getElementById("model"),
  replyLength: document.getElementById("replyLength"),
  saveSettings: document.getElementById("saveSettings"),
  settingsStatus: document.getElementById("settingsStatus"),
  historyList: document.getElementById("historyList")
};

init();

async function init() {
  await loadSettings();
  await refreshSelection();
  await renderHistory();
  renderConversation();

  els.refreshSelection.addEventListener("click", refreshSelection);
  els.clearConversation.addEventListener("click", clearConversation);
  els.generateCard.addEventListener("click", generateReadingCard);
  els.saveSettings.addEventListener("click", saveSettings);
  els.copyMarkdown.addEventListener("click", copyLatestMarkdown);
  els.downloadMarkdown.addEventListener("click", downloadLatestMarkdown);
  els.selectionPreview.addEventListener("input", syncSelectionFromPanel);
  els.sourceTitle.addEventListener("input", syncSelectionFromPanel);
  els.sourceUrl.addEventListener("input", syncSelectionFromPanel);
  els.apiKey.addEventListener("input", debounce(saveSettings, 350));
  els.baseUrl.addEventListener("input", debounce(saveSettings, 350));
  els.model.addEventListener("input", debounce(saveSettings, 350));
  els.replyLength.addEventListener("change", saveSettings);

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => runAction(button.dataset.action));
  });
}

async function loadSettings() {
  const stored = await chrome.storage.local.get(["settings"]);
  const localSettings = await loadLocalSettings();
  const storedSettings = stored.settings || {};
  state.settings = { ...DEFAULT_SETTINGS, ...localSettings, ...storedSettings };

  const hasOldOpenAIDefaults =
    storedSettings.baseUrl === "https://api.openai.com/v1" &&
    (!storedSettings.model || storedSettings.model === "gpt-4o-mini");
  if (hasOldOpenAIDefaults) {
    state.settings.baseUrl = localSettings.baseUrl || DEFAULT_SETTINGS.baseUrl;
    state.settings.model = localSettings.model || DEFAULT_SETTINGS.model;
  }

  if ((!storedSettings.apiKey && localSettings.apiKey) || hasOldOpenAIDefaults) {
    await chrome.storage.local.set({ settings: state.settings });
  }
  els.apiKey.value = state.settings.apiKey;
  els.baseUrl.value = state.settings.baseUrl;
  els.model.value = state.settings.model;
  els.replyLength.value = state.settings.replyLength;
  renderSettingsStatus();
}

async function loadLocalSettings() {
  try {
    const response = await fetch(chrome.runtime.getURL("local-settings.json"), { cache: "no-store" });
    if (!response.ok) return {};
    return await response.json();
  } catch {
    return {};
  }
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
  renderSettingsStatus();
  setStatus("设置已保存");
}

function renderSettingsStatus() {
  els.settingsStatus.textContent = state.settings.apiKey
    ? `API 已配置 · ${state.settings.model} · ${state.settings.baseUrl}`
    : "API 未配置：请填写 API Key。";
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
  const ok = await ensureSessionReady();
  if (!ok) return;

  const userInput = els.userInput.value.trim();
  if (action === "respond" && !userInput) {
    setStatus("请先在输入框写下你的想法、困惑或评论。");
    return;
  }
  if (action === "free" && !userInput) {
    setStatus("「发送」适合自由提问；如果不想输入问题，可以直接点「解释这段」。");
    return;
  }
  if (!state.settings.apiKey) {
    setStatus("请先在 API 设置里填写 API Key。");
    return;
  }

  const userMessage = describeUserTurn(action, userInput);
  state.conversation.push({ role: "user", content: userMessage });
  els.userInput.value = "";
  renderConversation("AI 正在陪你读这段，稍等一下。");
  setBusy(true, "正在和 AI 陪读搭子沟通...");

  try {
    const answer = await callCompanionApi(action, state.selection, userInput);
    state.conversation.push({ role: "assistant", content: answer });
    renderConversation();
    setStatus("完成");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    state.conversation.push({ role: "assistant", content: `请求失败：${message}` });
    renderConversation();
    setStatus(message);
  } finally {
    setBusy(false);
  }
}

async function generateReadingCard() {
  const ok = await ensureSessionReady();
  if (!ok) return;
  if (!state.settings.apiKey) {
    setStatus("请先在 API 设置里填写 API Key。");
    return;
  }

  setBusy(true, "正在生成阅读卡片...");
  els.cardPreview.textContent = "正在把这次陪读整理成 Markdown 阅读卡片。";
  els.cardPreview.classList.remove("empty");

  try {
    const markdown = await callCompanionApi("card", state.selection, "");
    state.latestMarkdown = markdown;
    els.cardPreview.textContent = markdown;
    els.copyMarkdown.disabled = false;
    els.downloadMarkdown.disabled = false;
    await saveCardToHistory(markdown, state.selection);
    await renderHistory();
    setStatus("阅读卡片已生成，可以复制回 Obsidian。");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    els.cardPreview.textContent = `生成失败：${message}`;
    setStatus(message);
  } finally {
    setBusy(false);
  }
}

async function ensureSessionReady() {
  syncSelectionFromPanel();
  if (!state.selection?.selectedText) {
    await refreshSelection();
    syncSelectionFromPanel();
  }
  if (!state.selection?.selectedText) {
    setStatus("请先选中或粘贴一段想一起读的文字。");
    return false;
  }
  return true;
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
      messages: buildApiMessages(action, selection, userInput),
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

function buildApiMessages(action, selection, userInput) {
  const messages = [{ role: "system", content: buildSystemPrompt() }];
  messages.push({ role: "user", content: buildReadingContext(selection) });

  const history = state.conversation.slice(-MAX_CONVERSATION_MESSAGES);
  for (const turn of history) {
    messages.push({ role: turn.role, content: turn.content });
  }

  if (action === "card") {
    messages.push({ role: "user", content: buildCardPrompt(selection) });
  } else {
    messages.push({
      role: "user",
      content: [
        `当前任务：${ACTION_INSTRUCTIONS[action]}`,
        "",
        "用户补充输入：",
        userInput || "无额外输入",
        "",
        "请延续前面的陪读对话，直接回复用户。"
      ].join("\n")
    });
  }

  return messages;
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
    "多轮对话时，请记住前面的追问和你的回答，避免重复解释。",
    "如果上下文不足，请温和提示用户多选一点前后文。",
    "用户读不进去时，请降低任务难度，让任务小到可以马上开始。",
    "生成阅读卡片时，必须保留网页标题、来源站点、URL、时间和对话中出现的理解/困惑。",
    lengthGuide
  ].join("\n");
}

function buildReadingContext(selection) {
  return [
    "阅读来源：",
    `- 标题：${selection.title || "未命名网页"}`,
    `- 来源：${selection.siteName || selection.origin || "未知来源"}`,
    `- URL：${selection.url || "无"}`,
    `- 捕获时间：${formatDateTime(selection.capturedAt)}`,
    "",
    "用户当前选中的阅读材料：",
    selection.selectedText
  ].join("\n");
}

function buildCardPrompt(selection) {
  return [
    "请基于阅读来源、选中文本和完整陪读对话，生成一张可直接复制到 Obsidian 的 Markdown 阅读卡片。",
    "卡片要体现用户这次对话里的追问、已经理解的内容，以及还没理解的点。",
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
    "## 本次陪读我问过",
    "- ...",
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
    "..."
  ].join("\n");
}

function describeUserTurn(action, userInput) {
  const labels = {
    free: userInput || "继续追问",
    explain: "请解释这段",
    simplify: "请讲简单一点",
    stuck: "我读不进去了",
    respond: `回应我的想法：${userInput}`
  };
  return labels[action] || userInput || action;
}

function renderConversation(pendingText = "") {
  els.conversationList.innerHTML = "";

  if (state.conversation.length === 0 && !pendingText) {
    const empty = document.createElement("div");
    empty.className = "message message--system";
    empty.innerHTML = '<div class="message__role">AI 陪读搭子</div><div class="message__content">选中或粘贴一段文字后，可以先点「解释这段」。后面你可以继续追问，我会记住这次陪读里的上下文。</div>';
    els.conversationList.appendChild(empty);
    return;
  }

  for (const turn of state.conversation) {
    els.conversationList.appendChild(createMessageEl(turn.role, turn.content));
  }

  if (pendingText) {
    els.conversationList.appendChild(createMessageEl("assistant", pendingText));
  }

  els.conversationList.scrollTop = els.conversationList.scrollHeight;
}

function createMessageEl(role, content) {
  const wrapper = document.createElement("div");
  wrapper.className = `message message--${role}`;

  const label = document.createElement("div");
  label.className = "message__role";
  label.textContent = role === "user" ? "你" : "AI 陪读搭子";

  const body = document.createElement("div");
  body.className = "message__content";
  body.textContent = content;

  wrapper.append(label, body);
  return wrapper;
}

function clearConversation() {
  state.conversation = [];
  state.latestMarkdown = "";
  els.cardPreview.textContent = "还没有生成阅读卡片。";
  els.cardPreview.classList.add("empty");
  els.copyMarkdown.disabled = true;
  els.downloadMarkdown.disabled = true;
  renderConversation();
  setStatus("已开始新的陪读对话。");
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
      els.cardPreview.textContent = item.markdown;
      els.cardPreview.classList.remove("empty");
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
  if (statusText) setStatus(statusText);
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

function debounce(fn, delay) {
  let timer = null;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), delay);
  };
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
