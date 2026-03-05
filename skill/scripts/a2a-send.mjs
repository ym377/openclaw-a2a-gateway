#!/usr/bin/env node
/**
 * Send a message to an A2A peer using the official @a2a-js/sdk.
 *
 * Usage:
 *   node a2a-send.mjs --peer-url <PEER_BASE_URL> --token <TOKEN> --message "Hello!"
 *   node a2a-send.mjs --peer-url http://100.76.43.74:18800 --token abc123 --message "What is your name?"
 *
 * Requires: npm install @a2a-js/sdk
 */

import { ClientFactory, ClientFactoryOptions, DefaultAgentCardResolver, JsonRpcTransportFactory, RestTransportFactory, createAuthenticatingFetchWithRetry } from "@a2a-js/sdk/client";
import { randomUUID } from "node:crypto";

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, "");
    opts[key] = args[i + 1];
  }
  if (!opts["peer-url"] || !opts.message) {
    console.error("Usage: node a2a-send.mjs --peer-url <URL> --token <TOKEN> --message <TEXT>");
    process.exit(1);
  }
  return opts;
}

async function main() {
  const opts = parseArgs();
  const peerUrl = opts["peer-url"];
  const token = opts.token;
  const message = opts.message;

  // Build auth handler
  const authHandler = token
    ? {
        headers: async () => ({ authorization: `Bearer ${token}` }),
        shouldRetryWithHeaders: async () => undefined,
      }
    : undefined;

  const authFetch = authHandler
    ? createAuthenticatingFetchWithRetry(fetch, authHandler)
    : fetch;

  const factory = new ClientFactory(
    ClientFactoryOptions.createFrom(ClientFactoryOptions.default, {
      cardResolver: new DefaultAgentCardResolver({ fetchImpl: authFetch }),
      transports: [
        new JsonRpcTransportFactory({ fetchImpl: authFetch }),
        new RestTransportFactory({ fetchImpl: authFetch }),
      ],
    })
  );

  // Discover agent card and create client
  const client = await factory.createFromUrl(peerUrl);

  // Send message
  const result = await client.sendMessage({
    message: {
      kind: "message",
      messageId: randomUUID(),
      role: "user",
      parts: [{ kind: "text", text: message }],
    },
  });

  // Extract response text
  const response = result;
  if (response?.kind === "message") {
    const text = response.parts?.find((p) => p.kind === "text")?.text;
    console.log(text || JSON.stringify(response, null, 2));
  } else if (response?.kind === "task") {
    const text = response.status?.message?.parts?.find((p) => p.kind === "text")?.text;
    console.log(text || JSON.stringify(response, null, 2));
  } else {
    console.log(JSON.stringify(response, null, 2));
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
