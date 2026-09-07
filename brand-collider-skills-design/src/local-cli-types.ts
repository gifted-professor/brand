export type SelectableCli = 'codex' | 'grok';
export type LocalCliEntry = {
  id: SelectableCli | 'claude' | 'gemini'; name: string; installed: boolean; supported: boolean;
  version?: string; login: 'logged_in' | 'not_logged_in' | 'unknown'; model?: string;
};
export type LocalCliInventory = { entries: LocalCliEntry[]; selected?: SelectableCli; model: string; busy: boolean };
