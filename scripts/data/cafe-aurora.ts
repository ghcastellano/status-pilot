/**
 * Café Lavra — dataset fictício canônico (fonte única de verdade).
 *
 * FLUXO DUAL-TRACK de 10 estágios, com nomes específicos por método:
 *
 *   SCRUM (Espresso / LS)                 KANBAN (Cold Brew / LK)
 *   1  Opportunity Backlog                1  Opportunity Backlog
 *   2  Discovery in Progress             2  Discovery in Progress
 *   3  Ready for Refinement              3  Prototype & Test
 *   4  Refining / Slicing                4  Validated / Ready for Refinement
 *   5  Product Backlog (Ready for Sprint)5  Backlog Refinement
 *   6  Sprint Backlog                    6  Ready for Dev
 *   7  In Development                    7  In Progress
 *   8  Code Review / QA                  8  Code Review / QA
 *   9  Ready for Release                 9  Ready for Release
 *   10 Live / Done                       10 Live / Done
 *
 * Cada estágio tem um PAPEL (role) e um TIPO (active/wait). As métricas são
 * calculadas a partir dos papéis — independentes dos nomes —, o que destrava:
 * Discovery / Delivery / Release Cycle Time, Lead Time, Time in Review e
 * Flow Efficiency (tempo ativo vs. espera).
 *
 * Tudo determinístico (PRNG com seed fixa) a partir de um "hoje" âncora.
 */

export const ANCHOR = new Date("2026-06-03T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// PRNG re-seedável: cada time usa sua própria semente, para que ajustes em um
// time NÃO desloquem a sequência aleatória do outro (determinismo isolado).
let rng = mulberry32(20260603);
const reseed = (s: number) => { rng = mulberry32(s); };
const pick = <T,>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
const randInt = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1));
const randRange = (min: number, max: number) => min + rng() * (max - min);

export type BoardType = "scrum" | "kanban";
export type IssueType = "story" | "bug" | "task";
export type IssueStatus = "To Do" | "In Progress" | "Done";
export type StageKind = "wait" | "active" | "done";

/** Papéis usados pelas métricas (estáveis entre os dois métodos). */
export type StageRole =
  | "created"
  | "discovery_start"
  | "discovery_done"
  | "committed"
  | "dev_start"
  | "review_start"
  | "work_done"
  | "released";

export interface StageDef {
  key: string;
  jira: string; // nome exato do status no Jira
  kind: StageKind;
  role?: StageRole;
}

// Duração típica (dias) gasta em cada posição antes de avançar.
const STAGE_DUR: [number, number][] = [
  [1, 14], // 0
  [1, 4], // 1
  [1, 5], // 2
  [0.5, 3], // 3
  [0.5, 2], // 4
  [0.5, 5], // 5
  [1, 6], // 6
  [0.5, 3], // 7
  [0.5, 4], // 8
  [0, 0], // 9
];

export const SCRUM_STAGES: StageDef[] = [
  { key: "opportunity", jira: "Opportunity Backlog", kind: "wait", role: "created" },
  { key: "discovery", jira: "Discovery in Progress", kind: "active", role: "discovery_start" },
  { key: "ready_refinement", jira: "Ready for Refinement", kind: "wait", role: "discovery_done" },
  { key: "refining", jira: "Refining / Slicing", kind: "active" },
  { key: "product_backlog", jira: "Product Backlog (Ready for Sprint)", kind: "wait" },
  { key: "sprint_backlog", jira: "Sprint Backlog", kind: "wait", role: "committed" },
  { key: "in_development", jira: "In Development", kind: "active", role: "dev_start" },
  { key: "review", jira: "Code Review / QA", kind: "active", role: "review_start" },
  { key: "ready_release", jira: "Ready for Release", kind: "wait", role: "work_done" },
  { key: "live", jira: "Live / Done", kind: "done", role: "released" },
];

export const KANBAN_STAGES: StageDef[] = [
  { key: "opportunity", jira: "Opportunity Backlog", kind: "wait", role: "created" },
  { key: "discovery", jira: "Discovery in Progress", kind: "active", role: "discovery_start" },
  { key: "prototype", jira: "Prototype & Test", kind: "active" },
  { key: "validated", jira: "Validated / Ready for Refinement", kind: "wait", role: "discovery_done" },
  { key: "refinement", jira: "Backlog Refinement", kind: "active" },
  { key: "ready_dev", jira: "Ready for Dev", kind: "wait", role: "committed" },
  { key: "in_progress", jira: "In Progress", kind: "active", role: "dev_start" },
  { key: "review", jira: "Code Review / QA", kind: "active", role: "review_start" },
  { key: "ready_release", jira: "Ready for Release", kind: "wait", role: "work_done" },
  { key: "live", jira: "Live / Done", kind: "done", role: "released" },
];

export const stagesFor = (board: BoardType): StageDef[] =>
  board === "scrum" ? SCRUM_STAGES : KANBAN_STAGES;

// índices de papel (iguais nos dois fluxos por construção)
const ROLE_IDX = {
  discovery_start: 1,
  discovery_done: 3, // kanban=3 (validated). Scrum usa 2 (ready_refinement) → resolvido via role lookup
  committed: 5,
  dev_start: 6,
  review_start: 7,
  work_done: 8,
  released: 9,
} as const;

export interface TeamSeed {
  id: string;
  name: string;
  board_type: BoardType;
  description: string;
  jira_label: string;
}

export interface SprintSeed {
  id: string;
  team_id: string;
  name: string;
  goal: string;
  start_date: string;
  end_date: string;
  committed_points: number;
  state: "active" | "closed" | "future";
}

export interface StageStamp {
  key: string;
  jira: string;
  kind: StageKind;
  at: string; // ISO
}

export interface IssueSeed {
  id: string;
  team_id: string;
  sprint_id: string | null;
  issue_key: string;
  title: string;
  type: IssueType;
  status: IssueStatus; // normalizado p/ métricas clássicas
  current_stage: string; // nome do estágio atual (= status no Jira)
  epic: string; // chave do épico (feature) — ver EPICS
  story_points: number | null;
  stages: StageStamp[]; // carimbos de cada estágio alcançado
  // atalhos por papel (derivados de stages) p/ colunas no banco e métricas:
  created_at: string;
  discovery_started_at: string | null;
  discovery_done_at: string | null;
  committed_at: string | null;
  started_at: string | null; // dev_start
  review_started_at: string | null;
  done_at: string | null; // work_done (Ready for Release)
  released_at: string | null;
}

export const TEAMS: TeamSeed[] = [
  {
    id: "espresso",
    name: "Espresso",
    board_type: "scrum",
    description: "Time de produto do app de pedidos — Scrum, sprints de 2 semanas, com discovery contínuo.",
    jira_label: "team-espresso",
  },
  {
    id: "coldbrew",
    name: "Cold Brew",
    board_type: "kanban",
    description: "Time de plataforma e fidelidade — fluxo contínuo Kanban dual-track.",
    jira_label: "team-coldbrew",
  },
];

const STORY_TITLES = [
  "Checkout no app de pedidos", "Programa de fidelidade — acúmulo de pontos",
  "Integração com gateway de pagamento", "Cardápio digital por loja",
  "Notificações push de promoções", "Cadastro e login de clientes",
  "Histórico de pedidos", "Aplicação de cupom de desconto",
  "Avaliação pós-pedido", "Pagamento via Pix", "Recomendação de bebidas",
  "Cardápio sazonal de inverno", "Agendamento de retirada na loja",
  "Carteira digital Café Lavra", "Resgate de pontos por brindes",
  "Pedido recorrente (assinatura)", "Status do pedido em tempo real",
  "Personalização de bebida", "Mapa de lojas próximas", "Indique um amigo",
];
const BUG_TITLES = [
  "App trava ao aplicar cupom", "Pontos de fidelidade não somam",
  "Pix não confirma pagamento", "Cardápio carrega lento no 3G",
  "Push duplicado em promoções", "Total do carrinho incorreto com brinde",
  "Login social falha no iOS", "Imagem do produto quebrada",
];
const TASK_TITLES = [
  "Atualizar SDK de pagamento", "Migrar imagens para CDN",
  "Configurar monitoramento de erros", "Refatorar módulo de carrinho",
  "Cobertura de testes do checkout", "Documentar API de fidelidade",
];
const SPRINT_GOALS = [
  "Reduzir abandono no checkout", "Lançar acúmulo de pontos de fidelidade",
  "Habilitar Pix de ponta a ponta", "Melhorar performance do cardápio",
  "Preparar campanha sazonal de inverno",
];

function titleFor(type: IssueType): string {
  if (type === "bug") return pick(BUG_TITLES);
  if (type === "task") return pick(TASK_TITLES);
  return pick(STORY_TITLES);
}

// Épicos (features) — agrupam tickets por tema. Criados nos 2 projetos.
export interface EpicDef {
  key: string;
  name: string;
  summary: string;
  match: RegExp;
}
export const EPICS: EpicDef[] = [
  { key: "loyalty", name: "Fidelidade & Recompensas", summary: "Programa de fidelidade, pontos, carteira e brindes", match: /fidelidade|pontos|brinde|carteira|resgate|indique/i },
  { key: "checkout", name: "Checkout & Pagamentos", summary: "Fluxo de checkout, gateway, Pix, cupons e carrinho", match: /checkout|pagamento|pix|gateway|cupom|carrinho|sdk de pagamento/i },
  { key: "menu", name: "Cardápio & Pedidos", summary: "Cardápio digital, pedidos, personalização e retirada", match: /cardápio|pedido|personaliza|bebida|retirada|recorrente|status do pedido|avalia/i },
  { key: "growth", name: "Crescimento & Descoberta", summary: "Recomendações, notificações, campanhas e mapa de lojas", match: /recomenda|mapa|sazonal|promoç|notific/i },
  { key: "platform", name: "Plataforma & Confiabilidade", summary: "Performance, monitoramento, refatorações e correções", match: /sdk|cdn|monitor|refator|testes|documentar|imagem|lento|trava|login|push/i },
];
function epicFor(title: string): string {
  for (const e of EPICS) if (e.match.test(title)) return e.key;
  return "platform";
}

// títulos agrupados por épico — p/ enviesar o épico-gargalo nos dados sintéticos
const TITLES_BY_EPIC: Record<string, string[]> = {};
for (const t of [...STORY_TITLES, ...BUG_TITLES, ...TASK_TITLES]) {
  (TITLES_BY_EPIC[epicFor(t)] ??= []).push(t);
}
function titleForEpic(epicKey: string): string {
  const pool = TITLES_BY_EPIC[epicKey];
  return pool && pool.length ? pick(pool) : pick(STORY_TITLES);
}
const POINTS_POOL = [1, 2, 2, 3, 3, 3, 5, 5, 8];
const iso = (msVal: number) => new Date(msVal).toISOString();
const ymd = (msVal: number) => new Date(msVal).toISOString().slice(0, 10);
const offMs = (offsetDays: number) => ANCHOR.getTime() + offsetDays * DAY;

/**
 * PADRÕES PLANTADOS (sintético/demo) para a IA descobrir:
 *  - cada time tem UM épico-gargalo DIFERENTE (não óbvio: varia entre times);
 *  - o estágio Code Review/QA PIORA nas últimas ~4 semanas, concentrado nesse épico
 *    (cycle time e time-in-review sobem; outliers caem nesse épico).
 */
const BOTTLENECK_EPIC: Record<string, string> = { espresso: "loyalty", coldbrew: "checkout" };

function reviewFactor(workDoneOffsetDays: number, isBottleneck: boolean): number {
  const W = 28; // janela de 4 semanas
  const t = Math.min(1, Math.max(0, (workDoneOffsetDays + W) / W)); // 0 (4 sem atrás) → 1 (hoje)
  const base = isBottleneck ? 1.5 : 1.0; // épico-gargalo já um pouco mais lento
  const slope = isBottleneck ? 2.5 : 0.4; // e piora MUITO mais no período recente
  return base * (1 + t * slope);
}

/** carimbos de tempo de uma issue atualmente no estágio currentIdx. */
function buildStamps(stages: StageDef[], currentIdx: number, entryOffsetDays: number, isBottleneck = false): StageStamp[] {
  const times: number[] = new Array(stages.length).fill(0);
  times[currentIdx] = offMs(entryOffsetDays);
  for (let i = currentIdx - 1; i >= 0; i--) {
    const [a, b] = STAGE_DUR[i];
    let dur = randRange(a, b) * DAY;
    if (i === 7) {
      // index 7 = Code Review / QA (igual em Scrum e Kanban)
      const workDoneOffset = (times[i + 1] - ANCHOR.getTime()) / DAY;
      dur *= reviewFactor(workDoneOffset, isBottleneck);
    }
    times[i] = times[i + 1] - dur;
  }
  const out: StageStamp[] = [];
  for (let i = 0; i <= currentIdx; i++) {
    out.push({ key: stages[i].key, jira: stages[i].jira, kind: stages[i].kind, at: iso(times[i]) });
  }
  return out;
}

function roleAt(stages: StageDef[], stamps: StageStamp[], role: StageRole): string | null {
  const def = stages.find((s) => s.role === role);
  if (!def) return null;
  return stamps.find((s) => s.key === def.key)?.at ?? null;
}

function assembleIssue(
  base: Pick<IssueSeed, "id" | "team_id" | "sprint_id" | "issue_key" | "title" | "type" | "story_points">,
  stages: StageDef[],
  currentIdx: number,
  stamps: StageStamp[]
): IssueSeed {
  const status: IssueStatus =
    currentIdx === 9 ? "Done" : currentIdx >= 6 ? "In Progress" : "To Do";
  return {
    ...base,
    status,
    current_stage: stages[currentIdx].jira,
    epic: epicFor(base.title),
    stages: stamps,
    created_at: stamps[0].at,
    discovery_started_at: roleAt(stages, stamps, "discovery_start"),
    discovery_done_at: roleAt(stages, stamps, "discovery_done"),
    committed_at: roleAt(stages, stamps, "committed"),
    started_at: roleAt(stages, stamps, "dev_start"),
    review_started_at: roleAt(stages, stamps, "review_start"),
    done_at: roleAt(stages, stamps, "work_done"),
    released_at: roleAt(stages, stamps, "released"),
  };
}

interface BuildResult {
  teams: TeamSeed[];
  sprints: SprintSeed[];
  issues: IssueSeed[];
}

function build(): BuildResult {
  const sprints: SprintSeed[] = [];
  const issues: IssueSeed[] = [];
  const counters: Record<string, number> = { LS: 0, LK: 0 };
  const nextKey = (p: "LS" | "LK") => `${p}-${++counters[p]}`;

  const mkBase = (
    p: "LS" | "LK",
    team_id: string,
    type: IssueType,
    points: number | null,
    sprint_id: string | null
  ) => {
    const key = nextKey(p);
    return { id: key, team_id, sprint_id, issue_key: key, title: titleFor(type), type, story_points: points };
  };
  const randType = (storyW = 0.65): IssueType => {
    const r = rng();
    return r < storyW ? "story" : r < storyW + 0.2 ? "bug" : "task";
  };

  // ── ESPRESSO (Scrum, LS) ────────────────────────────────────
  reseed(700101); // semente própria do time
  const ST = SCRUM_STAGES;
  const SPRINT_LEN = 14;
  const sprintDefs = [
    { id: "S-12", startOffset: -63, state: "closed" as const, committed: 38, completion: 0.87 },
    { id: "S-13", startOffset: -49, state: "closed" as const, committed: 34, completion: 0.91 },
    { id: "S-14", startOffset: -35, state: "closed" as const, committed: 40, completion: 0.85 },
    { id: "S-15", startOffset: -21, state: "closed" as const, committed: 36, completion: 0.94 },
    { id: "S-16", startOffset: -7, state: "active" as const, committed: 37, completion: 0.5 },
  ];

  sprintDefs.forEach((sd, idx) => {
    const items: { points: number; type: IssueType }[] = [];
    let committed = 0;
    while (committed < sd.committed) {
      const remaining = sd.committed - committed;
      const cand = POINTS_POOL.filter((p) => p <= remaining + 2);
      const points = cand.length ? pick(cand) : remaining;
      committed += points;
      items.push({ points, type: randType() });
    }
    const targetDone = Math.round(committed * sd.completion);
    let doneSoFar = 0;

    for (const it of items) {
      const base = mkBase("LS", "espresso", it.type, it.points, sd.id);
      // viés: concluídos das sprints recentes concentram no épico-gargalo (Fidelidade)
      if (doneSoFar < targetDone && (sd.id === "S-15" || sd.id === "S-16") && rng() < 0.6) {
        base.title = titleForEpic(BOTTLENECK_EPIC.espresso);
      }
      let currentIdx: number;
      let entryOffset: number;
      if (doneSoFar < targetDone) {
        const rrOffset =
          sd.state === "active"
            ? sd.startOffset + randRange(1, Math.min(SPRINT_LEN - 1, -sd.startOffset - 1))
            : sd.startOffset + randRange(1, SPRINT_LEN - 2);
        currentIdx = 9;
        entryOffset = Math.min(rrOffset + randRange(0.5, 3), -0.4);
        doneSoFar += it.points;
      } else if (sd.state === "closed") {
        currentIdx = 9;
        entryOffset = sd.startOffset + SPRINT_LEN + randRange(1, 4);
      } else {
        const r = rng();
        if (r < 0.55) {
          currentIdx = rng() < 0.5 ? 6 : 7; // In Development / Code Review
          entryOffset = -randRange(0.5, 4);
        } else {
          currentIdx = 5; // Sprint Backlog (comprometido, não iniciado)
          entryOffset = -randRange(0.5, 3);
        }
      }
      issues.push(assembleIssue(base, ST, currentIdx, buildStamps(ST, currentIdx, entryOffset, BOTTLENECK_EPIC.espresso === epicFor(base.title))));
    }

    sprints.push({
      id: sd.id,
      team_id: "espresso",
      name: `Sprint ${sd.id.replace("S-", "")}`,
      goal: SPRINT_GOALS[idx % SPRINT_GOALS.length],
      start_date: ymd(offMs(sd.startOffset)),
      end_date: ymd(offMs(sd.startOffset + SPRINT_LEN)),
      committed_points: committed,
      state: sd.state,
    });
  });

  // discovery track do Espresso (fora de sprint)
  for (const ci of [0, 0, 1, 1, 2, 3, 3]) {
    const base = mkBase("LS", "espresso", randType(0.85), null, null);
    issues.push(assembleIssue(base, ST, ci, buildStamps(ST, ci, -randRange(0.5, 8), BOTTLENECK_EPIC.espresso === epicFor(base.title))));
  }

  // ── COLD BREW (Kanban, LK) ──────────────────────────────────
  reseed(700202); // semente própria do time
  // Concluídos espalhados em 12 semanas (throughput) — volume moderado, pois o
  // board esconde "done" antigo (cutoff). WIP forte e variado em todos os estágios.
  const KB = KANBAN_STAGES;
  for (let w = 12; w >= 1; w--) {
    // ~4/semana p/ p50 estável; dip leve nas 2 últimas semanas (gargalo)
    const n = w <= 2 ? 3 : 4;
    for (let i = 0; i < n; i++) {
      const base = mkBase("LK", "coldbrew", randType(0.6), null, null);
      // viés: nas últimas 4 semanas, parte dos concluídos é do épico-gargalo (concentra o problema)
      if (w <= 4 && rng() < 0.55) base.title = titleForEpic(BOTTLENECK_EPIC.coldbrew);
      const releaseOffset = Math.min(-(w * 7) + randRange(0, 6), -0.4);
      issues.push(assembleIssue(base, KB, 9, buildStamps(KB, 9, releaseOffset, BOTTLENECK_EPIC.coldbrew === epicFor(base.title))));
    }
  }
  const wipPlan: [number, number][] = [
    [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2],
  ];
  for (const [ci, count] of wipPlan) {
    for (let i = 0; i < count; i++) {
      const base = mkBase("LK", "coldbrew", randType(0.6), null, null);
      const maxAge = Math.min(7, STAGE_DUR[ci][1] + 2);
      issues.push(assembleIssue(base, KB, ci, buildStamps(KB, ci, -randRange(0.4, maxAge), BOTTLENECK_EPIC.coldbrew === epicFor(base.title))));
    }
  }

  return { teams: TEAMS, sprints, issues };
}

export const dataset = build();
