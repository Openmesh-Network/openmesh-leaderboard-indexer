import { Address } from "viem";

import { UsersStorage } from "../types/storage.js";

export function createUserIfNotExists(users: UsersStorage, userAddress: Address): void {
  if (!users[userAddress]) {
    users[userAddress] = {
      metadata: {},
      metadataUpdateRequests: [],
      completedTasks: [],
    };
  }
}
