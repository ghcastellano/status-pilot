/** Application table and column allowlist. Keep aligned with db/schema.sql. */
export const TABLE_COLUMNS = {
  "teams": [
    "id",
    "name",
    "board_type",
    "description",
    "jira_label",
    "jira_project_key",
    "jira_board_id",
    "jira_board_name",
    "active",
    "last_synced_at",
    "created_at",
    "last_sync_source"
  ],
  "epics": [
    "team_id",
    "epic_key",
    "name",
    "summary",
    "jira_key"
  ],
  "sprints": [
    "id",
    "team_id",
    "name",
    "goal",
    "start_date",
    "end_date",
    "committed_points",
    "completed_points",
    "state",
    "created_at"
  ],
  "issues": [
    "id",
    "team_id",
    "sprint_id",
    "epic_key",
    "issue_key",
    "title",
    "type",
    "status",
    "current_stage",
    "story_points",
    "created_at",
    "discovery_started_at",
    "discovery_done_at",
    "committed_at",
    "started_at",
    "review_started_at",
    "done_at",
    "released_at",
    "stages"
  ],
  "qa_cache": [
    "id",
    "team_id",
    "question_norm",
    "question_hash",
    "answer",
    "created_at"
  ],
  "rate_limits": [
    "id",
    "bucket_key",
    "count",
    "window_start"
  ],
  "metrics_history": [
    "team_id",
    "as_of",
    "board_type",
    "tier",
    "metrics",
    "computed_at"
  ],
  "coaching_plans": [
    "team_id",
    "coaching",
    "coach",
    "engaged_at",
    "main_gap",
    "hypothesis",
    "next_step",
    "ask",
    "review_at",
    "updated_at"
  ],
  "coaching_assessments": [
    "team_id",
    "signals",
    "note",
    "updated_at"
  ],
  "coaching_experiments": [
    "id",
    "team_id",
    "pillar",
    "metric",
    "behavior",
    "hypothesis",
    "outcome",
    "status",
    "created_at"
  ],
  "experiment_comments": [
    "id",
    "experiment_id",
    "team_id",
    "author",
    "body",
    "created_at"
  ],
  "coaching_field_history": [
    "id",
    "team_id",
    "section",
    "entity_id",
    "entity_label",
    "field",
    "old_value",
    "new_value",
    "changed_by",
    "changed_at"
  ],
  "jira_connections": [
    "id",
    "auth_type",
    "site_url",
    "basic_email",
    "basic_token",
    "cloud_id",
    "access_token",
    "refresh_token",
    "expires_at",
    "scopes",
    "account_id",
    "account_name",
    "updated_at"
  ]
} as const;
export const PRIMARY_KEYS = {
  "teams": "id",
  "epics": "team_id,epic_key",
  "sprints": "id",
  "issues": "id",
  "qa_cache": "id",
  "rate_limits": "id",
  "metrics_history": "team_id,as_of",
  "coaching_plans": "team_id",
  "coaching_assessments": "team_id",
  "coaching_experiments": "id",
  "experiment_comments": "id",
  "coaching_field_history": "id",
  "jira_connections": "id"
} as const;
