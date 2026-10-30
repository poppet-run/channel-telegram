import { parseArgs } from "node:util";

import { ChannelEnvironment, ChannelError, type ChannelRegistration } from "@poppet/gateway";
import { Effect, Schema } from "effect";

import { TelegramSettings, telegramSettings } from "#src/settings";

const setupHelp =
  "setup --owner-id <id> --chat-id <id> [--home-conversation-id <id>] --bot-token <token>";

const parseSetup = (args: ReadonlyArray<string>) =>
  Effect.try({
    try: () => {
      if (args[0] !== "setup") throw new Error("Expected setup");

      // Telegram group IDs start with "-", which parseArgs treats as another option.
      const normalized: string[] = [];
      for (let index = 1; index < args.length; index++) {
        const arg = args[index]!;
        const next = args[index + 1];
        if (
          (arg === "--chat-id" || arg === "--home-conversation-id") &&
          next !== undefined &&
          /^-[1-9][0-9]*(?::[1-9][0-9]*)?$/.test(next)
        ) {
          normalized.push(`${arg}=${next}`);
          index++;
        } else {
          normalized.push(arg);
        }
      }

      const { values, tokens } = parseArgs({
        args: normalized,
        options: {
          "owner-id": { type: "string" },
          "chat-id": { type: "string" },
          "home-conversation-id": { type: "string" },
          "bot-token": { type: "string" },
        },
        strict: true,
        allowPositionals: false,
        tokens: true,
      });

      const names = tokens.filter((token) => token.kind === "option").map((token) => token.name);

      const required = ["owner-id", "chat-id", "bot-token"] as const;

      if (new Set(names).size !== names.length || !required.every((name) => names.includes(name)))
        throw new Error("Expected each required setup flag exactly once");

      return values;
    },
    catch: () =>
      new ChannelError({ reason: "configuration", message: `Use gateway telegram ${setupHelp}.` }),
  });

export const telegram = {
  id: "telegram",
  name: "Telegram",
  setupHelp,
  setup: (args) =>
    Effect.gen(function* () {
      const values = yield* parseSetup(args);
      const environment = yield* ChannelEnvironment;

      const settings = yield* Schema.decodeUnknownEffect(TelegramSettings)({
        ownerId: values["owner-id"],
        chatId: values["chat-id"],
        homeConversationId: values["home-conversation-id"] ?? values["chat-id"],
        token: values["bot-token"],
      }).pipe(
        Effect.mapError(
          () =>
            new ChannelError({
              reason: "configuration",
              message:
                "Use numeric Telegram IDs, the owner's ID as a private chat ID, a home conversation in that chat, and a bot token from BotFather.",
            }),
        ),
      );

      yield* telegramSettings.save(environment.dataDirectory, settings);

      return "Telegram settings saved. Restart the worker to apply them. Only the configured owner can invoke Poppet; chat members can read its replies.";
    }),
  load: telegramSettings.loader((settings) =>
    import("#src/channel").then(({ telegramChannelLayer }) => telegramChannelLayer(settings)),
  ),
} satisfies ChannelRegistration;

export default telegram;
