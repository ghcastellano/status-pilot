/**
 * lib/llm.ts — integração com OpenAI GPT-4o (SOMENTE backend).
 * Constrói um snapshot compacto das métricas e responde/gera report a partir
 * dele. A IA não toca no banco — recebe só o snapshot determinístico.
 */
import OpenAI from "openai";
import type { TeamMetrics, AnalysisBundle, ScrumMetrics } from "./metrics";

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

const EMPTY_INSIGHTS: MetricInsights = { cycleTime: "", secondary: "", flowEfficiency: "", predictability: "", chart: "" };

function investigativePrompt(secondary: string): string {
  return (
    "Você é um analista de fluxo ágil que INVESTIGA dados — não traduz métricas. Você recebe um pacote " +
    "com: série temporal semanal, quebra POR ÉPICO, quebra POR ESTÁGIO (tempo recente vs anterior) e os " +
    "OUTLIERS (itens acima do p85, com épico e estágio mais lento).\n\n" +
    "Para CADA métrica, escreva UMA frase (máx ~35 palavras) que: (1) aponte ONDE está o fenômeno — qual " +
    "ÉPICO e qual ESTÁGIO —, cruzando pelo menos DUAS dimensões; (2) cite um DADO específico (épico nomeado, " +
    "estágio, número) que comprove — a frase só pode fazer sentido sobre ESTES dados.\n\n" +
    "Se houver PROBLEMA (tendência ruim ou gargalo): TERMINE com uma hipótese de CAUSA plausível + uma AÇÃO " +
    "concreta. Ex.: 'Cycle time do épico Pagamentos chegou a 6.9d — o Code Review desse épico dobrou; provável " +
    "falta de revisor ou PRs grandes, vale revisar o tamanho das entregas de Pagamentos.' " +
    "Se a métrica estiver SAUDÁVEL: NÃO invente problema nem ação — apenas confirme com o dado específico " +
    "(ex.: 'previsibilidade boa: 85% dos itens em ≤7.7d, sem outliers relevantes').\n\n" +
    "PROIBIDO: frases genéricas que serviriam para qualquer número ('há espaço para melhorias', 'sugere boa " +
    "previsibilidade' sem o número, 'indica possível gargalo' sem dizer onde). Não repita a definição + o número.\n\n" +
    "Português do Brasil; termos técnicos em inglês (cycle time, throughput, WIP, flow efficiency). " +
    `Responda APENAS um objeto JSON com as chaves: "cycleTime", "secondary" (sobre ${secondary}), ` +
    `"flowEfficiency", "predictability", "chart" (leitura do cycle time scatterplot — tendência recente).`
  );
}

/** parse robusto: tolera code fences / texto extra; nunca lança. */
function parseInsights(raw: string): MetricInsights {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    const o = JSON.parse(match ? match[0] : raw);
    const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    return {
      cycleTime: s(o.cycleTime),
      secondary: s(o.secondary),
      flowEfficiency: s(o.flowEfficiency),
      predictability: s(o.predictability),
      chart: s(o.chart),
    };
  } catch {
    console.error("parseInsights: JSON inválido do LLM:", raw?.slice(0, 200));
    return EMPTY_INSIGHTS;
  }
}

/** Insight POR MÉTRICA, INVESTIGATIVO (a IA cruza épico × estágio × outliers). */
export async function generateMetricInsights(bundle: AnalysisBundle): Promise<MetricInsights> {
  const secondary = bundle.method === "scrum" ? "velocity" : "throughput";
  try {
    const res = await getClient().chat.completions.create({
      model: MODEL,
      temperature: 0.4,
      max_tokens: 500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: investigativePrompt(secondary) },
        { role: "user", content: JSON.stringify(bundle) },
      ],
    });
    return parseInsights(res.choices[0]?.message?.content ?? "{}");
  } catch (e) {
    console.error("generateMetricInsights falhou:", (e as Error).message);
    return EMPTY_INSIGHTS; // nunca quebra a UI
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

export async function generateReport(
  bundle: AnalysisBundle,
  scrum: ScrumMetrics | null,
): Promise<string> {
  const isScrumMethod = bundle.method === "scrum";
  const sprintSection = isScrumMethod ? "'## Sprint atual'" : "'## Trabalho em andamento'";

  const systemPrompt =
    "Você é um analista de fluxo ágil sênior. Gere um STATUS REPORT executivo em português do Brasil, " +
    "pronto para copiar e enviar a stakeholders. Use SOMENTE os dados do bundle fornecido — nunca invente números. " +
    "Tom profissional, sóbrio, sem hype. Termos técnicos em inglês (cycle time, throughput, WIP, lead time, etc.). " +
    "Markdown simples (## para seções, **negrito** para números-chave, listas com -).\n\n" +
    "Estruture EXATAMENTE nas seções abaixo (use ## como cabeçalho):\n" +
    "## TL;DR — 2-3 frases executivas com os 2-3 números mais importantes do período.\n" +
    "## Saúde do fluxo — cycle time (mediana + p85), throughput/velocity, flow efficiency, WIP atual e tendência.\n" +
    `${sprintSection} — ` +
    (isScrumMethod
      ? "sprint em andamento: committed, completed até agora, say-do ratio histórico."
      : "distribuição de itens por estágio, gargalo aparente.") + "\n" +
    "## Análise por épico — top épicos em cycle time: nome, mediana, p85; destaque qual é o mais lento e por quê.\n" +
    "## Itens em risco — aging: liste até 5 itens com mais dias no estágio (nome, estágio, dias); marque os acima do p85.\n" +
    "## Pontos de atenção — outliers de cycle time, estágios com tempo crescente (compare recentDays vs priorDays), gargalos.\n" +
    "## Próximos passos — 2-3 ações concretas, específicas e baseadas nos dados acima (não genéricas).";

  const res = await getClient().chat.completions.create({
    model: MODEL,
    temperature: 0.3,
    max_tokens: 1400,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content:
          `BUNDLE de análise — time: ${bundle.team} (${bundle.method})\n` +
          JSON.stringify(
            {
              cycleTime: bundle.cycleTime,
              throughput: bundle.throughput,
              flowEfficiencyPct: bundle.flowEfficiencyPct,
              predictability: bundle.predictability,
              byEpic: bundle.byEpic,
              byStage: bundle.byStage,
              outliers: bundle.outliers.slice(0, 6),
              agingHotspot: bundle.agingHotspot,
              scrum: scrum
                ? {
                    avgVelocity: scrum.avgVelocity,
                    velocityStdev: scrum.velocityStdev,
                    sayDoRatioPct: Math.round(scrum.sayDoRatioAvg * 100),
                    currentSprint: scrum.currentSprint,
                    recentVelocity: scrum.velocity.slice(-4),
                  }
                : null,
            },
            null,
            2,
          ),
      },
    ],
  });
  return res.choices[0]?.message?.content?.trim() ?? "Não consegui gerar o report.";
}
