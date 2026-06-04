# Diário de construção — Status Pilot

> No início de cada sessão eu leio este diário e te lembro do que ficou pendente.
> O **tempo** você informa; eu registro o que você disser.

---

## 2026-06-03 — Sessão 1

**Tempo:** _(informe início/fim)_

### O que foi feito
- Scaffold Next.js 14 + Tailwind + shadcn/ui + tema claro/dark (acento `#2f8f7a`, fonte Inter).
- Dataset fictício canônico **Café Lavra** (determinístico): fluxo dual-track de 10 estágios, 2 times, 5 sprints, 5 épicos por projeto, ~121 issues com timeline por estágio.
- **Jira configurado 100% via REST API** (projetos company-managed `LS`/`LK`):
  - Workflows de 10 estágios + status + schemes, associados aos projetos.
  - Colunas dos boards mapeadas na ordem do fluxo (API interna greenhopper).
  - 121 issues + 10 épicos criados e ligados (parent); 5 sprints reais (4 fechados + 1 ativo) com issues distribuídas.
  - Cutoff de "done antigo" no board; status renomeado p/ inglês.
- **Pipeline de dados:** schema aplicado no Supabase + `sync-jira-to-supabase` (issues lidas DA API do Jira via bloco `SPMETA`, agora num painel recolhível).
- **App (Status Pilot):**
  - Dashboard com flow cycle times (discovery/delivery/release), lead time, flow efficiency, throughput, WIP por estágio, velocity e burndown (Scrum).
  - Tela **Perguntar** (NL → GPT-4o grounded no snapshot) com cache e rate-limit.
  - **Status Report** de 1 clique (stakeholder-ready, copiar).
- **Segurança:** chave do LLM só no backend, rate limit (10/sessão), cache no banco, validação/sanitização de input, auditoria sem leaks. `.env.local` gitignored.

### Verificado
- Métricas batendo (Espresso: velocity 36.3 σ1.5, say-do 97%; Cold Brew: cycle 4.6d, throughput 2.4/sem, flow eff. 41%).
- `/api/ask` (grounded + cache hit), `/api/report` (report completo), tsc limpo, dashboard HTTP 200.

### Sessão 1 — adições posteriores
- Campos de data REAIS no Jira (7 marcos), filtráveis por JQL; sync lê deles.
- Reconciliação Jira↔Supabase↔dashboard: **10/10** (`npm run test:reconcile`).
- WIP redefinido (em fluxo + delivery); 4 itens presos no Kanban reposicionados.
- Gráficos estilo eazyBI/Actionable Agile **construídos por nós**: CFD, Work Item Aging, Cycle Time Histogram (p50/85/95), Throughput, Trends (evolução). Filtros por épico/tipo/período.
- Botão "Sincronizar agora" (/api/sync).
- **Deploy no Vercel:** https://status-pilot-omega.vercel.app · Repo: https://github.com/ghcastellano/status-pilot

### Pendências / próximos passos
- [ ] Colar o plano em `PLANO-SEMANA-1.md`.
- [ ] Tornar o repo público (build-in-public), se quiser.
- [ ] (Opcional) Cron que avança cards no tempo → changelog REAL crescente.
- [ ] (Opcional) Revogar/rotacionar o VERCEL_TOKEN se não for mais usar.
- [ ] Gravar o build para o LinkedIn.
