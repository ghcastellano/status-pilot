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

### Pendências / próximos passos
- [ ] Deploy no Vercel (push + env vars).
- [ ] Colar o plano em `PLANO-SEMANA-1.md`.
- [ ] (Opcional) Leitor do changelog real do Jira como demonstração da mecânica.
- [ ] (Opcional) Reposicionar 4 itens do Kanban presos em "Opportunity Backlog" no board.
- [ ] Gravar o build para o LinkedIn.
