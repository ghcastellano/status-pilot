/**
 * scripts/jira-desc.ts — descrição ADF da issue (limpa) + extração do SPMETA.
 *
 * A descrição mostra só o texto humano; a timeline sintética fica num bloco
 * RECOLHÍVEL (expand) rotulado como dado de demo. O sync lê o SPMETA de volta
 * (busca recursiva), mantendo "os dados vêm do Jira".
 */
import type { IssueSeed } from "./data/cafe-aurora";

export function buildDescription(issue: IssueSeed, sprintName: string | null): object {
  const meta = {
    v: 3,
    internalKey: issue.id,
    team_id: issue.team_id,
    sprint_id: issue.sprint_id,
    epic: issue.epic,
    type: issue.type,
    status: issue.status,
    current_stage: issue.current_stage,
    story_points: issue.story_points,
    created_at: issue.created_at,
    discovery_started_at: issue.discovery_started_at,
    discovery_done_at: issue.discovery_done_at,
    committed_at: issue.committed_at,
    started_at: issue.started_at,
    review_started_at: issue.review_started_at,
    done_at: issue.done_at,
    released_at: issue.released_at,
    stages: issue.stages,
  };
  const human =
    `${issue.title}.` +
    (sprintName ? ` Planejado na ${sprintName}.` : " Fluxo contínuo (Kanban).") +
    " (Dados fictícios — demonstração Status Pilot.)";
  return {
    type: "doc",
    version: 1,
    content: [
      { type: "paragraph", content: [{ type: "text", text: human }] },
      {
        type: "expand",
        attrs: { title: "Status Pilot · timeline de estágios (dados sintéticos da demo)" },
        content: [
          { type: "paragraph", content: [{ type: "text", text: `SPMETA:${JSON.stringify(meta)}` }] },
        ],
      },
    ],
  };
}

/** Busca recursiva pelo bloco SPMETA em qualquer nó da descrição ADF. */
export function extractSpmeta(node: any): any | null {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = extractSpmeta(n);
      if (r) return r;
    }
    return null;
  }
  if (node.type === "text" && typeof node.text === "string" && node.text.startsWith("SPMETA:")) {
    try {
      return JSON.parse(node.text.slice("SPMETA:".length));
    } catch {
      return null;
    }
  }
  if (node.content) return extractSpmeta(node.content);
  return null;
}
