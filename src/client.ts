import { v4 as uuidv4 } from "uuid";

import type { OutboundSendResult, PeerConfig } from "./types.js";

function buildAuthHeaders(peer: PeerConfig): Record<string, string> {
  const auth = peer.auth;
  if (!auth) {
    return {};
  }

  if (auth.type === "bearer") {
    return {
      authorization: `Bearer ${auth.token}`,
    };
  }

  return {
    "x-api-key": auth.token,
  };
}

function toJsonRpcUrl(cardUrl: string): string {
  // Per A2A spec, the card's `url` field IS the service endpoint.
  // Only fall back to appending /a2a/jsonrpc if the URL looks like a card discovery URL.
  if (cardUrl.includes(".well-known")) {
    const parsed = new URL(cardUrl);
    return `${parsed.origin}/a2a/jsonrpc`;
  }
  return cardUrl;
}

async function parseJsonSafe(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export class A2AClient {
  async discoverAgentCard(peer: PeerConfig): Promise<Record<string, unknown>> {
    const response = await fetch(peer.agentCardUrl, {
      method: "GET",
      headers: buildAuthHeaders(peer),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(`Agent Card lookup failed with status ${response.status}`);
    }

    const payload = await parseJsonSafe(response);
    if (!payload || typeof payload !== "object") {
      throw new Error("Invalid Agent Card payload");
    }

    return payload as Record<string, unknown>;
  }

  async sendMessage(peer: PeerConfig, message: Record<string, unknown>): Promise<OutboundSendResult> {
    const card = await this.discoverAgentCard(peer);
    const cardUrl = typeof card.url === "string" ? card.url : peer.agentCardUrl;

    const jsonRpcRequest = {
      jsonrpc: "2.0",
      id: uuidv4(),
      method: "message/send",
      params: {
        message,
      },
    };

    const response = await fetch(toJsonRpcUrl(cardUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...buildAuthHeaders(peer),
      },
      body: JSON.stringify(jsonRpcRequest),
      signal: AbortSignal.timeout(30_000),
    });

    return {
      ok: response.ok,
      statusCode: response.status,
      response: await parseJsonSafe(response),
    };
  }
}
