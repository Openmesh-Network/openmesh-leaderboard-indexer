export interface Task {
  description: string;
  points: string;
  deadline: number; // Unix time stamp
  type: string;
}
