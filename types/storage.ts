import { User } from "./user.js";
import { Address } from "viem";
import { PersistentJson } from "../utils/persistent-json.js";
import { Task } from "./task.js";
import { XRequest } from "./X.js";

export type TaskStorage = Task[];
export interface UsersStorage {
  [address: Address]: User;
}
export interface XRequestsStorage {
  [state: string]: XRequest;
}

export interface Storage {
  tasks: PersistentJson<TaskStorage>;
  users: PersistentJson<UsersStorage>;
  xRequests: PersistentJson<XRequestsStorage>;
}
