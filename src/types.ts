
export enum GenerationStatus {
  IDLE = 'idle',
  INITIALIZING = 'initializing',
  POLLING = 'polling',
  SUCCESS = 'success',
  ERROR = 'error'
}

export interface VideoGenerationItem {
  id: string;
  prompt: string;
  status: GenerationStatus;
  videoUrl?: string;
  error?: string;
  createdAt: number;
  previewUrl?: string; // For image-to-video source
}

export type AspectRatio = '16:9' | '9:16';
export type Resolution = '720p' | '1080p';
