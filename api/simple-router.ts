import { Express, Response, json } from "express";
import { Address, createPublicClient, http, isAddress, isHex } from "viem";

import { Storage } from "../types/storage.js";
import { replacer } from "../utils/json.js";
import { normalizeAddress } from "../utils/normalize-address.js";
import { TwitterApi } from "twitter-api-v2";
import { createUserIfNotExists } from "../utils/userUtils.js";
import { MetadataUpdateRequest, User } from "../types/user.js";

const publicClients = [
  createPublicClient({
    transport: http("https://eth.llamarpc.com"),
  }),
  createPublicClient({
    transport: http("https://polygon.llamarpc.com"),
  }),
];

function malformedRequest(res: Response, error: string): void {
  res.statusCode = 400;
  res.end(error);
}

export function registerRoutes(app: Express, storage: Storage) {
  const basePath = "/leaderboard-indexer/";
  const websiteName = "https://openrd.openmesh.network";
  app.use(json());

  // Get leaderboard of a certain user
  app.get(basePath + "leaderboard/:address", async function (req, res) {
    const address = req.params.address;
    if (!isAddress(address)) {
      return malformedRequest(res, "address is not a valid address");
    }

    const users = await storage.users.get();
    const leaderboard = Object.keys(users)
      .map((a) => {
        const userAddress = a as Address;
        return {
          address: userAddress,
          score: users[userAddress].completedTasks.reduce((acc, t) => acc + t.points, 0),
        };
      })
      .sort((u1, u2) => u2.score - u1.score)
      .map((u, i) => {
        return { position: i + 1, ...u };
      });

    const top = 5;
    const shownUsers = leaderboard.slice(0, top);
    const user = leaderboard.find((u) => normalizeAddress(u.address) === normalizeAddress(address));
    if (user) {
      shownUsers.push(user);
    }

    res.end(JSON.stringify(shownUsers, replacer));
  });

  // Get all pending metadata requests for a given address
  app.get(basePath + "metadataRequests/:address", async function (req, res) {
    const address = req.params.address;
    if (!isAddress(address)) {
      return malformedRequest(res, "address is not a valid address");
    }

    const normalizedAddress = normalizeAddress(address);
    const user = (await storage.users.get())[normalizedAddress];
    if (!user) {
      res.statusCode = 404;
      return res.end(JSON.stringify({ error: "User not found" }));
    }

    return res.end(JSON.stringify(user.metadataUpdateRequests, replacer));
  });

  // Confirm requested metadata update with account signature
  app.post(basePath + "acceptMetadataRequest", async function (req, res) {
    try {
      const { address, request, signature } = req.query;
      if (!address || !request || !signature || typeof address !== "string" || typeof request !== "string" || typeof signature !== "string") {
        res.statusCode = 403;
        return res.end(JSON.stringify({ error: "Query params not set" }));
      }
      if (!isAddress(address)) {
        return malformedRequest(res, "address is not a valid address");
      }
      if (!isHex(signature)) {
        return malformedRequest(res, "signature is not valid hex");
      }

      const valid = await Promise.all(
        Object.values(publicClients).map((publicClient) =>
          publicClient.verifyMessage({ address: address, message: `Accept Openmesh Leaderboard metadata request: ${request}`, signature: signature })
        )
      );
      if (!valid.some((b) => b)) {
        // No single chain that approved this signature
        return malformedRequest(res, "signature is not valid");
      }

      const normalizedAddress = normalizeAddress(address);
      const parsedRequest = JSON.parse(request) as MetadataUpdateRequest;

      const oldUsers = await storage.users.get();
      if (
        Object.values(oldUsers)
          .map((u) => u as User)
          .some((u) => u.metadata[parsedRequest.metadataField] === parsedRequest.value)
      ) {
        res.statusCode = 403;
        return res.end(JSON.stringify({ error: "Account already linked to other address" }));
      }

      const user = (await storage.users.get())[normalizedAddress];
      if (!user) {
        res.statusCode = 404;
        return res.end(JSON.stringify({ error: "User not found" }));
      }
      if (!user.metadataUpdateRequests.some((r) => r.metadataField === parsedRequest.metadataField && r.value === parsedRequest.value)) {
        res.statusCode = 404;
        return res.end(JSON.stringify({ error: "Pending request not found" }));
      }

      await storage.users.update((users) => {
        createUserIfNotExists(users, normalizedAddress);
        const user = users[normalizedAddress];
        user.metadata[parsedRequest.metadataField] = parsedRequest.value;
        user.metadataUpdateRequests = user.metadataUpdateRequests.filter(
          (r) => r.metadataField !== parsedRequest.metadataField || r.value !== parsedRequest.value
        );
      });
      res.end(JSON.stringify({ success: true }));
    } catch (error: any) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: error?.message ?? "Unknown error" }));
    }
  });

  // Proof ownership of X account
  app.post(basePath + "loginWithX", async function (req, res) {
    const clientId = process.env.X_CLIENT_ID;
    const clientSecret = process.env.X_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: "X secrets not set up on this server" }));
    }

    const address = req.query.address;
    if (!address || typeof address !== "string" || !isAddress(address)) {
      return malformedRequest(res, "address is not a valid address");
    }

    const client = new TwitterApi({ clientId, clientSecret });
    const { url, codeVerifier, state } = client.generateOAuth2AuthLink(`${websiteName}${basePath}callbackX`, {
      scope: ["users.read", "tweet.read"], // https://developer.x.com/en/docs/x-api/users/lookup/api-reference/get-users-me
    });
    await storage.xRequests.update(
      (xRequests) =>
        (xRequests[state] = {
          codeVerifier,
          address,
        })
    );

    res.end(JSON.stringify({ url }, replacer));
  });

  app.get(basePath + "callbackX", async function (req, res) {
    const clientId = process.env.X_CLIENT_ID;
    const clientSecret = process.env.X_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: "X secrets not set up on this server" }));
    }

    const { state, code } = req.query;
    if (!state || !code || typeof state !== "string" || typeof code !== "string") {
      res.statusCode = 403;
      return res.redirect(`${websiteName}/genesis`);
      return res.end(JSON.stringify({ error: "Callback query params not set" }));
    }

    const initialRequest = (await storage.xRequests.get())[state];
    if (!initialRequest) {
      res.statusCode = 403;
      return res.end(JSON.stringify({ error: "State query param is invalid. (Expired?)" }));
    }

    const client = new TwitterApi({ clientId, clientSecret });
    const success = await client
      .loginWithOAuth2({ code, codeVerifier: initialRequest.codeVerifier, redirectUri: `${websiteName}${basePath}callbackX` })
      .then(async ({ client: authenticatedClient }) => {
        const { data: user } = await authenticatedClient.v2.me({ "user.fields": ["username"] });
        await storage.users.update((users) => {
          const normalizedAddress = normalizeAddress(initialRequest.address);
          createUserIfNotExists(users, normalizedAddress);
          users[normalizedAddress].metadataUpdateRequests.push({
            metadataField: "x",
            value: user.username,
          });
        });
        return true;
      })
      .catch(() => false);

    if (!success) {
      return res.status(403).send("Invalid verifier or access tokens!");
    }

    res.redirect(`${websiteName}/genesis`);
  });

  app.get(basePath + "droplist", async function (req, res) {
    const droplist = await storage.droplist.get();
    const users = await storage.users.get();
    const extendedDroplist = droplist.map((a) => {
      return { ...a, x: users[normalizeAddress(a.address)].metadata.x };
    });

    res.end(JSON.stringify(extendedDroplist, replacer));
  });

  app.post(basePath + "registerDroplist", async function (req, res) {
    if (Date.now() > Date.UTC(2024, 10 - 1, 11, 23, 59, 59, 999) - 11 * 60 * 60 * 1000) {
      res.statusCode = 403;
      return res.end(JSON.stringify({ error: "Whitelist closed" }));
    }

    const address = req.query.address;
    if (!address || typeof address !== "string" || !isAddress(address)) {
      return malformedRequest(res, "address is not a valid address");
    }

    const normalizedAddress = normalizeAddress(address);
    const user = (await storage.users.get())[normalizedAddress];
    if (!user) {
      res.statusCode = 404;
      return res.end(JSON.stringify({ error: "User not found" }));
    }

    if (!user.metadata.x) {
      res.statusCode = 403;
      return res.end(JSON.stringify({ error: "User X not verified" }));
    }

    const oldDroplist = await storage.droplist.get();
    if (oldDroplist.some((d) => d.address === normalizedAddress)) {
      res.statusCode = 403;
      return res.end(JSON.stringify({ error: "Address already on droplist" }));
    }

    let position = 0;
    await storage.droplist.update((droplist) => {
      position = droplist.push({ address: normalizedAddress, time: Date.now() });
    });

    res.end(JSON.stringify({ position }, replacer));
  });
}
