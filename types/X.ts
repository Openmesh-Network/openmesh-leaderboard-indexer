import { Address } from "viem";

export interface XRequest {
  address: Address;
  codeVerifier: string;
}
