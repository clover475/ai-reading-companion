const MAX_SELECTION_CHARS = 6000;

function getSelectionPayload() {
  const text = window.getSelection()?.toString().trim() || "";
  return {
    selectedText: text.length > MAX_SELECTION_CHARS ? text.slice(0, MAX_SELECTION_CHARS) : text,
    truncated: text.length > MAX_SELECTION_CHARS,
    title: document.title || "",
    url: location.href,
    origin: location.origin,
    siteName: location.hostname,
    capturedAt: new Date().toISOString()
  };
}

let selectionTimer = null;
document.addEventListener("selectionchange", () => {
  window.clearTimeout(selectionTimer);
  selectionTimer = window.setTimeout(() => {
    const payload = getSelectionPayload();
    if (!payload.selectedText) return;
    chrome.storage.local.set({ latestSelection: payload });
  }, 250);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "GET_SELECTION") return;
  sendResponse(getSelectionPayload());
});

