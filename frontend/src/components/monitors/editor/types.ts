import type { Monitor } from "../../../types";

export type MonitorPatch = <K extends keyof Monitor>(key: K, value: Monitor[K]) => void;
