interface UserMetadata {
  email?: string;
  x?: string;
}

export interface MetadataUpdateRequest {
  metadataField: keyof UserMetadata;
  value: string;
}

export interface User {
  metadata: UserMetadata;
  metadataUpdateRequests: MetadataUpdateRequest[];
  completedTasks: { taskIndex: number; points: number }[];
}
