import {
  ChannelEnvironment,
  ChannelError,
  ChannelInput,
  type ChannelRegistration,
} from "@poppet/gateway";
import { Effect, Redacted, Schema } from "effect";

import { TelegramSettings, telegramSettings } from "#src/settings";

const usage =
  "Use gateway telegram setup <owner-id> <chat-id> [<home-conversation-id>] --key-stdin.";

export const telegram: ChannelRegistration = {
  id: "telegram",
  name: "Telegram",
  setupHelp: "setup <owner-id> <chat-id> [<home-conversation-id>] --key-stdin",
  setup: (args) =>
    Effect.gen(function* () {
      if (
        (args.length !== 4 && args.length !== 5) ||
        args[0] !== "setup" ||
        args.at(-1) !== "--key-stdin"
      )
        return yield* Effect.fail(new ChannelError({ reason: "configuration", message: usage }));
      const environment = yield* ChannelEnvironment;
      const input = yield* (yield* ChannelInput).readSecret;

      const settings = yield* Schema.decodeUnknownEffect(TelegramSettings)({
        ownerId: args[1],
        chatId: args[2],
        homeConversationId: args.length === 5 ? args[3] : args[2],
        token: Redacted.value(input),
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
};

export default telegram;
