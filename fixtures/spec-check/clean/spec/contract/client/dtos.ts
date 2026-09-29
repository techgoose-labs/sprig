export interface TaskDto {
  id: string;
  title: string;
  done: boolean;
}
export interface TaskCountsDto {
  open: number;
  done: number;
}
export interface MarkDoneInput {
  id: string;
}
