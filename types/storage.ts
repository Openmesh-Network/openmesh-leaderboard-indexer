import { User } from "./user.js";
import { Address } from "viem";
import { PersistentJson } from "../utils/persistent-json.js";
import { Task } from "./task.js";
import { XRequest } from "./X.js";
import { Droplist } from "./droplist.js";

export type TasksStorage = Task[];
export interface UsersStorage {
  [address: Address]: User;
}
export interface XRequestsStorage {
  [state: string]: XRequest;
}
export type DroplistStorage = Droplist[];

export interface Storage {
  tasks: PersistentJson<TasksStorage>;
  users: PersistentJson<UsersStorage>;
  xRequests: PersistentJson<XRequestsStorage>;

  droplist: PersistentJson<DroplistStorage>;
}
