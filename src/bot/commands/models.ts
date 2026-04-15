import { CommandContext, Context, InlineKeyboard } from "grammy";
import { opencodeClient } from "../../opencode/client.js";
import { logger } from "../../utils/logger.js";
import { t } from "../../i18n/index.js";

const CALLBACK_PREFIX = "models";

export async function modelsCommand(ctx: CommandContext<Context>) {
  try {
    const { data: providersData, error } = await opencodeClient.config.providers();

    if (error || !providersData) {
      await ctx.reply(t("legacy.models.fetch_error"));
      return;
    }

    const providers = providersData.providers;

    if (!providers || providers.length === 0) {
      await ctx.reply(t("legacy.models.empty"));
      return;
    }

    await showProvidersMenu(ctx, providers);
  } catch (error) {
    logger.error("[ModelsCommand] Error listing models:", error);
    await ctx.reply(t("legacy.models.error"));
  }
}

async function showProvidersMenu(ctx: Context, providers: Array<{ id: string; name: string }>) {
  const keyboard = new InlineKeyboard();

  for (const provider of providers) {
    keyboard.text(provider.id, `${CALLBACK_PREFIX}:provider:${provider.id}`).row();
  }

  await ctx.reply(t("legacy.models.provider_select"), {
    reply_markup: keyboard,
  });
}

export async function handleModelsCallback(ctx: Context): Promise<boolean> {
  const callbackQuery = ctx.callbackQuery;

  if (!callbackQuery?.data || !callbackQuery.data.startsWith(`${CALLBACK_PREFIX}:`)) {
    return false;
  }

  const parts = callbackQuery.data.split(":");
  const kind = parts[1]; // "provider" or "model"
  const data = parts[2];

  if (!kind || !data) {
    return false;
  }

  try {
    const { data: providersData, error } = await opencodeClient.config.providers();

    if (error || !providersData?.providers) {
      await ctx.answerCallbackQuery({ text: t("legacy.models.fetch_error") });
      return true;
    }

    if (data === "back") {
      await showProvidersMenu(ctx, providersData.providers);
      await ctx.answerCallbackQuery();
      return true;
    }

    if (kind === "model") {
      const modelId = parts[3];
      if (!modelId) {
        await ctx.answerCallbackQuery({ text: t("legacy.models.error") });
        return true;
      }
      // Model selection: data = providerId, modelId = parts[3]
      await ctx.answerCallbackQuery({ text: `Selected ${data}/${modelId}` });
      return true;
    }

    const provider = providersData.providers.find((p) => p.id === data);

    if (!provider) {
      await ctx.answerCallbackQuery({ text: t("legacy.models.provider_not_found") });
      return true;
    }

    await showModelsMenu(ctx, provider);
  } catch (err) {
    logger.error("[ModelsCommand] Callback error:", err);
    await ctx.answerCallbackQuery({ text: t("legacy.models.error") });
  }

  return true;
}

async function showModelsMenu(
  ctx: Context,
  provider: { id: string; name: string; models: Record<string, { id: string; name?: string }> },
) {
  const keyboard = new InlineKeyboard();
  const models = Object.values(provider.models);

  for (const model of models) {
    keyboard.text(model.id, `${CALLBACK_PREFIX}:model:${provider.id}:${model.id}`).row();
  }

  keyboard.row();
  keyboard.text(t("common.back"), `${CALLBACK_PREFIX}:provider:back`);

  const message = `🔹 ${provider.id}\n${t("legacy.models.model_select")}`;
  await ctx.editMessageText(message, {
    reply_markup: keyboard,
  });

  await ctx.answerCallbackQuery();
}
