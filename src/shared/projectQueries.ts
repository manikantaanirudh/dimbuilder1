/** Sample questions shown in the Project queries UI and unknown-query fallback. */
export const PROJECT_QUERY_SAMPLES = [
  "Summarize my project",
  "What is wrong with my project?",
  "Is my project ready to export?",
  "How many leaf members in Account?",
  "What is the max hierarchy depth in Account?",
  "Show shared members in Account",
  "Which dimensions are empty?",
  "What is the metadata coverage?",
  "Show orphan members",
  "How many members in Account?",
  "Find Revenue",
  "Show members under Revenue"
] as const;

export const PROJECT_QUERY_INTENT_LABELS: Record<string, string> = {
  summary: "Project summary",
  issues: "Validation issues",
  export_ready: "Export readiness",
  leaf_count: "Leaf members",
  list_leaves: "Leaf members",
  hierarchy_depth: "Hierarchy depth",
  hierarchy_summary: "Hierarchy health",
  shared_members: "Shared members",
  orphans: "Orphan members",
  empty_dimensions: "Empty dimensions",
  dimension_issues: "Issues by dimension",
  coverage: "Metadata coverage",
  find: "Member search",
  count: "Member count",
  children: "Hierarchy children",
  missing_property: "Missing properties",
  property_filter: "Property filter",
  check_exists: "Member lookup",
  unknown: "Unsupported query"
};
