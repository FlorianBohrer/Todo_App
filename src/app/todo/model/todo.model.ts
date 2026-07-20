export interface Todo {
  id: string;
  title: string;
  completed: boolean;
  isFavorite: boolean;
  labelId: string | null;
  createdAt: Date;

  /** Zeitpunkt, an dem der Timer gestartet wurde. */
  timerStartedAt: Date | null;

  /** Eingestellte Dauer des Timers in Sekunden. */
  timerDurationSeconds: number | null;
}