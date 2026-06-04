/**
 * lib/llm.ts — integração com OpenAI GPT-4o (SOMENTE backend).
 * Constrói um snapshot compacto das métricas e responde/gera report a partir
 * dele. A IA não toca no banco — recebe só o snapshot determinístico.
 */
import OpenAI from "openai";
import { computeInsightInput, type TeamMetrics } from "./metrics";

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY ausente no ambiente.");
    client = new OpenAI({ apiKey });
  }
  return client;
}

const MODEL = "gpt-4o";

/** snapshot compacto e legível das métricas (entrada do LLM). */
export function buildSnapshot(m: TeamMetrics): string {
  const f = m.flow;
  const snap: Record<string, unknown> = {
    time: m.team.name,
    metodo: m.team.board_type,
    descricao: m.team.description,
    totais: m.totals,
    flow_cycle_times_dias: {
      discovery: f.discoveryCycleTime,
      delivery: f.deliveryCycleTime,
      lead_time: f.leadTime,
    },
    flow_efficiency_pct: Math.round(f.flowEfficiency * 100),
    throughput_por_semana: { media: f.throughput.perWeekAvg, serie: f.throughput.series.map((s) => s.count) },
    wip_atual: f.wip,
    itens_entregues: f.totalReleased,
    wip_por_estagio: f.stageDistribution.map((s) => `${s.stage}: ${s.count}`),
  };
  if (m.scrum) {
    snap.scrum = {
      velocity_media: m.scrum.avgVelocity,
      velocity_desvio: m.scrum.velocityStdev,
      velocity_por_sprint: m.scrum.velocity,
      say_do_ratio_pct: Math.round(m.scrum.sayDoRatioAvg * 100),
      sprint_atual: m.scrum.currentSprint,
    };
  }
  return JSON.stringify(snap, null, 2);
}

const GROUNDING =
  "Você é um analista de fluxo ágil sênior. Responda SOMENTE com base no SNAPSHOT " +
  "fornecido (métricas reais do time, vindas do Jira). Nunca invente números: se a " +
  "informação não estiver no snapshot, diga que não há esse dado. Escreva em português " +
  "do Brasil, mas mantenha os termos técnicos em inglês (cycle time, throughput, lead " +
  "time, WIP, say-do ratio, flow efficiency). Seja direto e conciso.";

export interface MetricInsights {
  cycleTime: string;
  secondary: string; // throughput (kanban) | velocity (scrum)
  flowEfficiency: string;
  predictability: string;
  chart: string; // leitura do cycle time scatterplot
}

/** Insight POR MÉTRICA: uma frase curtíssima por KPI + pelo gráfico (1 chamada JSON). */
export async function generateMetricInsights(m: TeamMetrics): Promise<MetricInsights> {
  const inp = computeInsightInput(m);
  const secondary = inp.method === "scrum" ? "velocity" : "throughput";
  const res = await getClient().chat.completions.create({
    model: MODEL,
    temperature: 0.3,
    max_tokens: 320,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          GROUNDING +
          ` Para CADA métrica, escreva UMA frase curtíssima (máx ~12 palavras) que interpreta ` +
          `o número/tendência e diz se é bom/ruim ou o que observar. Cite o delta quando houver. ` +
          `Responda APENAS um objeto JSON com exatamente estas chaves: "cycleTime", "secondary", ` +
          `"flowEfficiency", "predictability", "chart". A chave "secondary" é sobre ${secondary}. ` +
          `"chart" = leitura do cycle time scatterplot (tendência recente dos pontos).`,
      },
      { role: "user", content: JSON.stringify(inp) },
    ],
  });
  const raw = res.choices[0]?.message?.content ?? "{}";
  try {
    const o = JSON.parse(raw);
    return {
      cycleTime: o.cycleTime ?? "",
      secondary: o.secondary ?? "",
      flowEfficiency: o.flowEfficiency ?? "",
      predictability: o.predictability ?? "",
      chart: o.chart ?? "",
    };
  } catch {
    return { cycleTime: "", secondary: "", flowEfficiency: "", predictability: "", chart: "" };
  }
}

/** Responde considerando TODOS os times (snapshots de cada um). */
export async function answerAcrossTeams(list: TeamMetrics[], question: string): Promise<string> {
  const snaps = list
    .map((m) => `### Time ${m.team.name} (${m.team.board_type})\n${buildSnapshot(m)}`)
    .join("\n\n");
  const res = await getClient().chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    max_tokens: 600,
    messages: [
      {
        role: "system",
        content:
          GROUNDING +
          " Você recebe os SNAPSHOTS de TODOS os times. Considere todos ao responder e " +
          "compare entre eles quando fizer sentido. Se a pergunta for sobre um time específico, " +
          "foque nele.",
      },
      { role: "system", content: `SNAPSHOTS:\n${snaps}` },
      { role: "user", content: question },
    ],
  });
  return res.choices[0]?.message?.content?.trim() ?? "Não consegui responder.";
}

export async function generateReport(m: TeamMetrics): Promise<string> {
  const res = await getClient().chat.completions.create({
    model: MODEL,
    temperature: 0.3,
    max_tokens: 700,
    messages: [
      { role: "system", content: GROUNDING },
      {
        role: "system",
        content:
          "Gere um STATUS REPORT executivo para stakeholders, em português, pronto para " +
          "copiar. Estruture em seções curtas com estes títulos: 'TL;DR', 'Saúde do fluxo', " +
          (m.team.board_type === "scrum" ? "'Sprint atual', " : "'Trabalho em andamento', ") +
          "'Pontos de atenção', 'Próximos passos'. Use os números do snapshot. Tom " +
          "profissional e sóbrio, sem hype. Markdown simples.",
      },
      { role: "user", content: `SNAPSHOT do time ${m.team.name}:\n${buildSnapshot(m)}` },
    ],
  });
  return res.choices[0]?.message?.content?.trim() ?? "Não consegui gerar o report.";
}
