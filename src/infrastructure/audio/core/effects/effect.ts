export interface StereoFrame {
  left: number;
  right: number;
}

export interface CoreEffect {
  process(frame: StereoFrame): void;
  setParam?(param: string, value: number): void;
  reset(): void;
}
