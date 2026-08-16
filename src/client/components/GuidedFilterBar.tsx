import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { Filter, X } from "lucide-react";
import {
  fetchFieldValues,
  searchMembers,
  structuredSearch,
} from "../api/client";
import {
  OPERATOR_LABELS,
  operatorsForValueType,
  SPECIAL_FIELDS,
  type FilterCondition,
  type FilterOp,
  type FilterTarget,
} from "../../shared/structuredSearch";
import type {
  MemberSearchResult,
  RelationshipSearchResult,
  StructuredSearchResponse,
} from "../../shared/types";
import type { FieldCatalogEntry } from "../ui/fieldCatalog";

type Stage = "subject" | "operator" | "value";

type SubjectSuggestion =
  | { kind: "member"; member: MemberSearchResult }
  | { kind: "field"; entry: FieldCatalogEntry };

const OPS_WITHOUT_VALUE: ReadonlySet<FilterOp> = new Set(["isTrue", "isFalse"]);

export function GuidedFilterBar({
  projectId,
  fieldCatalog,
  onOpenEntity,
}: {
  projectId: string;
  fieldCatalog: FieldCatalogEntry[];
  onOpenEntity: (dimensionId: string, entityId: string, kind: "member" | "relationship") => void;
}) {
  const [conditions, setConditions] = useState<FilterCondition[]>([]);
  const [target, setTarget] = useState<FilterTarget | null>(null);
  const [stage, setStage] = useState<Stage>("subject");
  const [draftField, setDraftField] = useState<FieldCatalogEntry | null>(null);
  const [draftOp, setDraftOp] = useState<FilterOp | null>(null);
  const [inputText, setInputText] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const [memberSuggestions, setMemberSuggestions] = useState<MemberSearchResult[]>([]);
  const [valueSuggestions, setValueSuggestions] = useState<string[]>([]);

  const [results, setResults] = useState<StructuredSearchResponse | null>(null);
  const [resultTab, setResultTab] = useState<"all" | "members" | "relationships">("all");
  const [running, setRunning] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const valueCacheRef = useRef<Map<string, string[]>>(new Map());

  // Close the suggestions dropdown when clicking outside the bar.
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Field suggestions for the subject stage, scoped to the locked target.
  const fieldSuggestions = useMemo(() => {
    const q = inputText.trim().toLowerCase();
    return fieldCatalog
      .filter((entry) => (target ? entry.target === target : true))
      .filter((entry) => (q ? entry.label.toLowerCase().includes(q) : true))
      .slice(0, 8);
  }, [fieldCatalog, inputText, target]);

  const subjectSuggestions: SubjectSuggestion[] = useMemo(() => {
    const members: SubjectSuggestion[] = memberSuggestions
      .slice(0, 5)
      .map((member) => ({ kind: "member", member }));
    const fields: SubjectSuggestion[] = fieldSuggestions.map((entry) => ({ kind: "field", entry }));
    return [...members, ...fields];
  }, [memberSuggestions, fieldSuggestions]);

  const operatorSuggestions: FilterOp[] = useMemo(
    () => (draftField ? operatorsForValueType(draftField.valueType) : []),
    [draftField],
  );

  const valueOptions: string[] = useMemo(() => {
    if (!draftField) return [];
    if (draftField.valueType === "boolean") return ["true", "false"];
    if (draftField.valueType === "enum" && draftField.enumValues?.length) {
      const q = inputText.trim().toLowerCase();
      return draftField.enumValues.filter((v) => (q ? v.toLowerCase().includes(q) : true));
    }
    return valueSuggestions;
  }, [draftField, valueSuggestions, inputText]);

  const currentCount =
    stage === "subject"
      ? subjectSuggestions.length
      : stage === "operator"
        ? operatorSuggestions.length
        : valueOptions.length;

  useEffect(() => {
    setActiveIndex(0);
  }, [stage, currentCount]);

  // Subject stage: fetch member-name suggestions as the user types.
  useEffect(() => {
    if (stage !== "subject" || (target && target !== "member")) {
      setMemberSuggestions([]);
      return;
    }
    const q = inputText.trim();
    if (q.length < 2) {
      setMemberSuggestions([]);
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(() => {
      void searchMembers(projectId, q, 5)
        .then((data) => {
          if (!cancelled) setMemberSuggestions(data.results);
        })
        .catch(() => {
          if (!cancelled) setMemberSuggestions([]);
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [stage, inputText, projectId, target]);

  // Value stage: fetch live distinct values (column fields) or member names (member-key field).
  useEffect(() => {
    if (stage !== "value" || !draftField) {
      setValueSuggestions([]);
      return;
    }
    if (draftField.valueType === "boolean" || draftField.valueType === "enum") {
      setValueSuggestions([]);
      return;
    }
    let cancelled = false;
    const prefix = inputText.trim();
    const cacheKey = `${draftField.target}|${draftField.fieldKey}|${prefix.toLowerCase()}`;
    const cached = valueCacheRef.current.get(cacheKey);
    if (cached) {
      setValueSuggestions(cached);
      return;
    }
    const handle = window.setTimeout(() => {
      const request =
        draftField.fieldKey === SPECIAL_FIELDS.memberKey
          ? searchMembers(projectId, prefix || "", 8).then((d) => d.results.map((m) => m.memberKey))
          : fetchFieldValues(projectId, draftField.target, draftField.fieldKey, prefix, 12).then(
              (d) => d.values,
            );
      void request
        .then((values) => {
          if (cancelled) return;
          valueCacheRef.current.set(cacheKey, values);
          setValueSuggestions(values);
        })
        .catch(() => {
          if (!cancelled) setValueSuggestions([]);
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [stage, draftField, inputText, projectId]);

  // Run the structured search whenever committed conditions change.
  useEffect(() => {
    if (conditions.length === 0) {
      setResults(null);
      setRunning(false);
      return;
    }
    setRunning(true);
    let cancelled = false;
    const handle = window.setTimeout(() => {
      void structuredSearch(projectId, conditions)
        .then((data) => {
          if (cancelled) return;
          setResults(data);
          setRunning(false);
        })
        .catch(() => {
          if (cancelled) return;
          setResults(null);
          setRunning(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [conditions, projectId]);

  function resetDraft() {
    setDraftField(null);
    setDraftOp(null);
    setInputText("");
    setStage("subject");
  }

  function commitCondition(value: string) {
    if (!draftField || !draftOp) return;
    const condition: FilterCondition = {
      target: draftField.target,
      fieldKey: draftField.fieldKey,
      op: draftOp,
      value,
    };
    setConditions((prev) => [...prev, condition]);
    setTarget((prev) => prev ?? draftField.target);
    resetDraft();
    setOpen(false);
  }

  function selectSubject(suggestion: SubjectSuggestion) {
    if (suggestion.kind === "member") {
      onOpenEntity(suggestion.member.dimensionId, suggestion.member.memberId, "member");
      setOpen(false);
      return;
    }
    setDraftField(suggestion.entry);
    setStage("operator");
    setInputText("");
  }

  function selectOperator(op: FilterOp) {
    setDraftOp(op);
    if (OPS_WITHOUT_VALUE.has(op)) {
      // No value needed; commit immediately (value encoded in op).
      const field = draftField;
      if (field) {
        setConditions((prev) => [...prev, { target: field.target, fieldKey: field.fieldKey, op, value: "" }]);
        setTarget((prev) => prev ?? field.target);
        resetDraft();
        setOpen(false);
      }
      return;
    }
    setStage("value");
    setInputText("");
  }

  function selectValue(value: string) {
    commitCondition(value);
  }

  function removeCondition(index: number) {
    setConditions((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) setTarget(null);
      return next;
    });
  }

  function handleKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown" && currentCount) {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, currentCount - 1));
      return;
    }
    if (e.key === "ArrowUp" && currentCount) {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Backspace" && inputText === "") {
      e.preventDefault();
      if (stage === "value") {
        setStage("operator");
        setDraftOp(null);
      } else if (stage === "operator") {
        setStage("subject");
        setDraftField(null);
      } else if (conditions.length) {
        removeCondition(conditions.length - 1);
      }
      return;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      if (stage === "subject" && subjectSuggestions[activeIndex]) {
        e.preventDefault();
        selectSubject(subjectSuggestions[activeIndex]);
      } else if (stage === "operator" && operatorSuggestions[activeIndex]) {
        e.preventDefault();
        selectOperator(operatorSuggestions[activeIndex]);
      } else if (stage === "value") {
        e.preventDefault();
        const highlighted = valueOptions[activeIndex];
        if (e.key === "Enter" && inputText.trim() && !highlighted) {
          commitCondition(inputText.trim());
        } else if (highlighted) {
          selectValue(highlighted);
        } else if (inputText.trim()) {
          commitCondition(inputText.trim());
        }
      }
    }
  }

  const placeholder =
    stage === "subject"
      ? conditions.length
        ? "Add another condition (AND)"
        : "Filter by member or field"
      : stage === "operator"
        ? "Choose a condition"
        : draftField?.valueType === "enum" || draftField?.valueType === "boolean"
          ? "Pick a value"
          : "Type or pick a value";

  const memberResults = results?.members ?? [];
  const relationshipResults = results?.relationships ?? [];
  const showMembers = resultTab === "all" || resultTab === "members";
  const showRelationships = resultTab === "all" || resultTab === "relationships";

  return (
    <div className="guided-filter-bar" ref={containerRef}>
      <div className="guided-filter-compose">
      <div className="guided-filter-input" onClick={() => inputRef.current?.focus()}>
        <Filter size={14} />
        {target && <span className="scope-pill">{target === "member" ? "Members" : "Relationships"}</span>}
        {conditions.map((condition, index) => (
          <span className="filter-chip" key={`${condition.fieldKey}-${index}`}>
            <span className="filter-chip-text">
              {chipLabel(condition, fieldCatalog)}
            </span>
            <button
              type="button"
              className="filter-chip-remove"
              aria-label="Remove condition"
              onClick={(e) => {
                e.stopPropagation();
                removeCondition(index);
              }}
            >
              <X size={11} />
            </button>
          </span>
        ))}
        {draftField && (
          <span className="filter-chip draft">
            <span className="filter-chip-text">
              {draftField.label}
              {draftOp ? ` ${OPERATOR_LABELS[draftOp]}` : ""}
            </span>
          </span>
        )}
        <input
          ref={inputRef}
          value={inputText}
          onChange={(e) => {
            setInputText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label="Guided filter"
          role="combobox"
          aria-expanded={open}
          aria-controls="guided-filter-suggestions"
        />
      </div>

      {open && (
        <div className="guided-dropdown" id="guided-filter-suggestions" role="listbox">
          {stage === "subject" &&
            (subjectSuggestions.length ? (
              subjectSuggestions.map((suggestion, index) =>
                suggestion.kind === "member" ? (
                  <button
                    key={`m-${suggestion.member.memberId}`}
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    className={`guided-suggestion${index === activeIndex ? " active" : ""}`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectSubject(suggestion)}
                  >
                    <span className="guided-suggestion-text">
                      <b>{suggestion.member.memberKey}</b>
                      <small>Member</small>
                    </span>
                    <span className="guided-suggestion-badge">
                      {suggestion.member.dimensionType} - {suggestion.member.dimensionName}
                    </span>
                  </button>
                ) : (
                  <button
                    key={`f-${suggestion.entry.target}-${suggestion.entry.fieldKey}`}
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    className={`guided-suggestion${index === activeIndex ? " active" : ""}`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectSubject(suggestion)}
                  >
                    <span className="guided-suggestion-text">
                      <b>{suggestion.entry.label}</b>
                      <small>{suggestion.entry.target === "member" ? "Member field" : "Relationship field"}</small>
                    </span>
                  </button>
                ),
              )
            ) : (
              <div className="guided-empty">Type to search members or fields</div>
            ))}

          {stage === "operator" &&
            operatorSuggestions.map((op, index) => (
              <button
                key={op}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={`guided-suggestion${index === activeIndex ? " active" : ""}`}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectOperator(op)}
              >
                <span className="guided-suggestion-text">
                  <b>{OPERATOR_LABELS[op]}</b>
                </span>
              </button>
            ))}

          {stage === "value" &&
            (valueOptions.length ? (
              valueOptions.map((value, index) => (
                <button
                  key={value}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  className={`guided-suggestion${index === activeIndex ? " active" : ""}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectValue(value)}
                >
                  <span className="guided-suggestion-text">
                    <b>{value}</b>
                  </span>
                </button>
              ))
            ) : (
              <div className="guided-empty">Type a value, then press Enter</div>
            ))}
        </div>
      )}
      </div>

      {conditions.length > 0 && !open && (
        <div className="guided-results">
          <div className="overview-search-tabs" role="tablist">
            {(["all", "members", "relationships"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={resultTab === tab}
                className={`overview-search-tab${resultTab === tab ? " active" : ""}`}
                onClick={() => setResultTab(tab)}
              >
                {tab === "all"
                  ? `All (${memberResults.length + relationshipResults.length})`
                  : tab === "members"
                    ? `Members (${memberResults.length})`
                    : `Relationships (${relationshipResults.length})`}
              </button>
            ))}
          </div>

          <div className="overview-member-results" role="listbox">
            {running && !results ? (
              <div className="overview-member-empty">Searching…</div>
            ) : memberResults.length + relationshipResults.length === 0 ? (
              <div className="overview-member-empty">No matches for this filter.</div>
            ) : (
              <>
                {showMembers &&
                  memberResults.map((member) => (
                    <button
                      key={`mr-${member.memberId}`}
                      type="button"
                      role="option"
                      className="overview-member-result"
                      onClick={() => onOpenEntity(member.dimensionId, member.memberId, "member")}
                    >
                      <span className="overview-member-text">
                        <b>{member.memberKey}</b>
                        {member.description ? <small>{member.description}</small> : null}
                      </span>
                      <span className="overview-member-dim">
                        {member.dimensionType} - {member.dimensionName}
                      </span>
                    </button>
                  ))}
                {showRelationships &&
                  relationshipResults.map((rel) => (
                    <button
                      key={`rr-${rel.relationshipId}`}
                      type="button"
                      role="option"
                      className="overview-member-result"
                      onClick={() => onOpenEntity(rel.dimensionId, rel.relationshipId, "relationship")}
                    >
                      <span className="overview-member-text">
                        <b>
                          {rel.parentKey} &rarr; {rel.childKey}
                        </b>
                        <small>Relationship</small>
                      </span>
                      <span className="overview-member-dim">
                        {rel.dimensionType} - {rel.dimensionName}
                      </span>
                    </button>
                  ))}
                {(results?.membersHasMore || results?.relationshipsHasMore) && (
                  <div className="overview-member-hint">Showing first matches — refine your filter.</div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function chipLabel(condition: FilterCondition, catalog: FieldCatalogEntry[]): string {
  const entry = catalog.find((c) => c.fieldKey === condition.fieldKey && c.target === condition.target);
  const label = entry?.label ?? condition.fieldKey.replace(/^@/, "");
  const opLabel = OPERATOR_LABELS[condition.op];
  if (condition.op === "isTrue" || condition.op === "isFalse") return `${label} ${opLabel}`;
  return `${label} ${opLabel} ${condition.value}`;
}
