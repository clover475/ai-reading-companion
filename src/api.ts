import { requestUrl } from "obsidian";
import { AIReadingCompanionSettings } from "./settings";

export type CompanionAction =
  | "free"
  | "explain"
  | "simplify"
  | "stuck"
  | "respond"
  | "card";

export interface CompanionRequest {
  action: CompanionAction;
  fileName: string;
  noteContext: string;
  selectedText: string;
  userInput: string;
  conversationMarkdown: string;
}

const ACTION_INSTRUCTIONS: Record<CompanionAction, string> = {
  free: "回应用户的自由提问。请结合选中文本在全文中的位置和作用，不要只做机械翻译。",
  explain: "解释这段内容。先说核心意思，再说它在当前文章里的作用。保持清晰、温柔、不过量。",
  simplify: "把这段讲简单一点。使用更短的句子、生活化比喻或一个小例子，不要损失关键含义。",
  stuck: "用户读不进去了。不要继续输出大量知识。先安抚，再把任务拆到很小：一句话、一个关键词或一个小问题。目标是帮用户重新进入阅读状态。",
  respond: "回应用户的想法、困惑、评论或标注。像学习搭子一样认真回应，肯定合理直觉，帮用户说清楚它为什么重要，并连接回文章内容。",
  card: "生成一张 Markdown 阅读卡片。必须使用用户指定的卡片结构，内容具体，适合插入当前笔记。"
};

export function buildSystemPrompt(settings: AIReadingCompanionSettings): string {
  const lengthGuide = {
    short: "默认回答控制在 3-5 句，必要时使用极短 bullet。",
    medium: "默认回答控制在 2-4 个短段落，避免长篇讲义。",
    long: "可以更完整，但仍要分段清楚，不要堆砌。"
  }[settings.replyLength];

  return [
    "你是 Obsidian 里的 AI 陪读搭子，不是冷冰冰的总结器，也不是说教的老师。",
    `请默认使用${settings.defaultLanguage}回复。`,
    "你的语气温柔、稳定、清晰，不催促用户高效，不批评用户读得慢，不输出鸡汤。",
    "你的目标是帮助用户读懂一点点，并愿意继续读下去。",
    "解释时要结合选中文本和当前笔记上下文，说明这段在文章中的作用。",
    "用户读不进去时，请降低任务难度，让任务小到可以马上开始。",
    "用户提出想法时，请认真回应这个想法，而不是只给标准答案。",
    "可以适当反问一个很小的问题，引导用户自己继续思考。",
    lengthGuide
  ].join("\n");
}

export function buildUserPrompt(request: CompanionRequest): string {
  if (request.action === "card") {
    return [
      "请基于当前笔记、选中文本和本次对话，生成一张 Markdown 阅读卡片。",
      "",
      "格式必须是：",
      "# 今日陪读卡片",
      "",
      "## 阅读材料",
      request.fileName || "当前文件",
      "",
      "## 我读到的位置",
      "根据选中文本或当前段落描述",
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
      "当前文件名：",
      request.fileName,
      "",
      "当前笔记上下文：",
      request.noteContext,
      "",
      "选中文本：",
      request.selectedText,
      "",
      "本次对话：",
      request.conversationMarkdown || "暂无对话"
    ].join("\n");
  }

  return [
    `任务类型：${request.action}`,
    `任务说明：${ACTION_INSTRUCTIONS[request.action]}`,
    "",
    "当前文件名：",
    request.fileName,
    "",
    "当前笔记上下文：",
    request.noteContext,
    "",
    "用户选中的文本：",
    request.selectedText,
    "",
    "用户输入：",
    request.userInput || "无额外输入",
    "",
    "请直接给出陪读式回复。"
  ].join("\n");
}

export async function callCompanionApi(settings: AIReadingCompanionSettings, request: CompanionRequest): Promise<string> {
  if (!settings.apiKey) {
    throw new Error("请先在插件设置中填写 API Key。");
  }

  const baseUrl = settings.baseUrl.replace(/\/+$/, "");
  const response = await requestUrl({
    url: `${baseUrl}/chat/completions`,
    method: "POST",
    headers: {
      "Authorization": `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: settings.model,
      messages: [
        { role: "system", content: buildSystemPrompt(settings) },
        { role: "user", content: buildUserPrompt(request) }
      ],
      temperature: 0.7
    }),
    throw: false
  });

  if (response.status < 200 || response.status >= 300) {
    const detail = typeof response.text === "string" ? response.text.slice(0, 500) : "";
    throw new Error(`AI 请求失败（HTTP ${response.status}）。${detail}`);
  }

  const data = response.json;
  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("AI 返回内容为空，请检查模型名称或 API 兼容性。");
  }

  return content.trim();
}
