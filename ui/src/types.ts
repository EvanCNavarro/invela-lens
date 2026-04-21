// ── Run list API response types ───────────────────────────────────────

export type RunStatus = 'running' | 'completed' | 'failed';

export interface RunListScorecardSummary {
  persona_name: string;
  overall_score: number;
  relevance: string;
  finding_count: number;
}

export interface RunListItem {
  id: string;
  input_type: string;
  input_url: string | null;
  persona_ids: number[];
  status: RunStatus;
  started_at: number;
  completed_at: number | null;
  total_duration_ms: number | null;
  error: string | null;
  created_by: string;
  scorecards: RunListScorecardSummary[];
}

export interface RunListResponse {
  runs: RunListItem[];
  total: number;
}

// ── Run detail API response types ─────────────────────────────────────

export interface RunDetail {
  id: string;
  input_type: string;
  input_url: string | null;
  input_word_count: number | null;
  persona_ids: number[];
  status: RunStatus;
  started_at: number;
  completed_at: number | null;
  total_duration_ms: number | null;
  error: string | null;
  created_by: string;
  scorecards: Scorecard[];
}

export interface Scorecard {
  id: number;
  persona_name: string;
  persona_archetype: string;
  overall_score: number;
  relevance: string;
  summary: string;
  findings: Finding[];
}

export interface Finding {
  id: number;
  category_id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  evidence: string;
  recommendation: string;
  reasoning: string;
}
