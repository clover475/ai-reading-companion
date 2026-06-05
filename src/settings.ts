import { App, PluginSettingTab, Setting } from "obsidian";
import AIReadingCompanionPlugin from "./main";

export type ReplyLength = "short" | "medium" | "long";

export interface AIReadingCompanionSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
  defaultLanguage: string;
  replyLength: ReplyLength;
  maxContextChars: number;
}

export const DEFAULT_SETTINGS: AIReadingCompanionSettings = {
  apiKey: "",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  defaultLanguage: "中文",
  replyLength: "medium",
  maxContextChars: 12000
};

export class AIReadingCompanionSettingTab extends PluginSettingTab {
  plugin: AIReadingCompanionPlugin;

  constructor(app: App, plugin: AIReadingCompanionPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "AI 陪读搭子设置" });

    new Setting(containerEl)
      .setName("API Key")
      .setDesc("用于 OpenAI-compatible Chat Completions API。不会写入代码，只保存在 Obsidian 插件数据里。")
      .addText((text) => {
        text.inputEl.type = "password";
        text
          .setPlaceholder("sk-...")
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Base URL")
      .setDesc("例如 https://api.openai.com/v1，或其他兼容 OpenAI 格式的服务地址。")
      .addText((text) =>
        text
          .setPlaceholder("https://api.openai.com/v1")
          .setValue(this.plugin.settings.baseUrl)
          .onChange(async (value) => {
            this.plugin.settings.baseUrl = value.trim() || DEFAULT_SETTINGS.baseUrl;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Model Name")
      .setDesc("例如 gpt-4o-mini、gpt-4.1-mini，或你的兼容服务提供的模型名。")
      .addText((text) =>
        text
          .setPlaceholder("gpt-4o-mini")
          .setValue(this.plugin.settings.model)
          .onChange(async (value) => {
            this.plugin.settings.model = value.trim() || DEFAULT_SETTINGS.model;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("默认语言")
      .setDesc("AI 回复优先使用的语言。")
      .addText((text) =>
        text
          .setPlaceholder("中文")
          .setValue(this.plugin.settings.defaultLanguage)
          .onChange(async (value) => {
            this.plugin.settings.defaultLanguage = value.trim() || DEFAULT_SETTINGS.defaultLanguage;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("回复长度")
      .setDesc("控制默认回复的详细程度。")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("short", "短")
          .addOption("medium", "中")
          .addOption("long", "长")
          .setValue(this.plugin.settings.replyLength)
          .onChange(async (value: ReplyLength) => {
            this.plugin.settings.replyLength = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("上下文最大字符数")
      .setDesc("当前笔记太长时，会围绕选中文本截取上下文。默认 12000。")
      .addText((text) =>
        text
          .setPlaceholder("12000")
          .setValue(String(this.plugin.settings.maxContextChars))
          .onChange(async (value) => {
            const parsed = Number.parseInt(value, 10);
            this.plugin.settings.maxContextChars = Number.isFinite(parsed) && parsed > 1000 ? parsed : DEFAULT_SETTINGS.maxContextChars;
            await this.plugin.saveSettings();
          })
      );
  }
}
