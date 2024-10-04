import { Address, Hex } from "viem";

export interface EventBase {
  blockNumber: bigint;
  transactionHash: Hex;
  transactionIndex: number;
}

export interface Reserved extends EventBase {
  account: Address;
  amount: bigint;
}

export interface Waitlisted extends EventBase {
  account: Address;
  amount: bigint;
}
