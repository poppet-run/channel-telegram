import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ChannelEnvironment, ChannelInput } from "@poppet/gateway";
import { Effect, Redacted } from "effect";

import { telegram } from "#src/registration";
import { telegramSettings } from "#src/settings";

const token = "123456:telegram-secret";

const setup = (directory: string, args: ReadonlyArray<string>) =>
  Effect.runPromise(
    telegram
      .setup(args)
      .pipe(
        Effect.provideService(ChannelEnvironment, { dataDirectory: directory }),
        Effect.provideService(ChannelInput, { readSecret: Effect.succeed(Redacted.make(token)) }),
      ),
  );

describe.concurrent("settings", () => {
  test("setup saves the policy and token privately and defaults home to the chat", async () => {
    const directory = await mkdtemp(join(tmpdir(), "poppet-telegram-"));

    try {
      expect(await Effect.runPromise(telegramSettings.load(directory))).toBeNull();
      const message = await setup(directory, ["setup", "200", "-100500", "--key-stdin"]);
      expect(message).not.toContain(token);
      const path = join(directory, "channels/telegram.json");
      expect((await stat(path)).mode & 0o777).toBe(0o600);

      expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
        ownerId: "200",
        chatId: "-100500",
        homeConversationId: "-100500",
        token,
      });

      const loaded = await Effect.runPromise(telegramSettings.load(directory));
      expect(loaded && Redacted.value(loaded.token)).toBe(token);
      expect(JSON.stringify(loaded)).not.toContain(token);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test.each([
    ["a private chat that is not the owner's", ["setup", "200", "300", "--key-stdin"]],
    ["a home topic in another chat", ["setup", "200", "-100500", "-100600:7", "--key-stdin"]],
    ["a non-numeric owner", ["setup", "owner", "-100500", "--key-stdin"]],
    ["a missing --key-stdin flag", ["setup", "200", "-100500", "-100500:7"]],
  ])("setup rejects %s without saving", async (_, args) => {
    const directory = await mkdtemp(join(tmpdir(), "poppet-telegram-invalid-"));

    try {
      await expect(setup(directory, args)).rejects.toThrow();
      expect(await Effect.runPromise(telegramSettings.load(directory))).toBeNull();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("setup accepts the owner's private chat and a home forum topic", async () => {
    const directory = await mkdtemp(join(tmpdir(), "poppet-telegram-home-"));

    try {
      await setup(directory, ["setup", "200", "200", "--key-stdin"]);
      await setup(directory, ["setup", "200", "-100500", "-100500:7", "--key-stdin"]);
      const loaded = await Effect.runPromise(telegramSettings.load(directory));
      expect(loaded?.homeConversationId).toBe("-100500:7");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
