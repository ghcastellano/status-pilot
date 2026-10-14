import test from 'node:test';
import assert from 'node:assert/strict';
import { translate, formatNumber, formatMetricDisplay } from '../lib/locales/translate';
import { signalDefs, RUBRIC, STATUS_META, READINESS_META, experimentTemplates } from '../lib/coaching';
import { maturityReference, TIER_META, SUPPORT_MODEL, PILLAR_INFO } from '../lib/maturity';

test('English covers domain metadata for Scrum and Kanban, including coaching guidance', () => {
  const copy = [
    ...Object.values(TIER_META).map(v => v.desc), ...Object.values(SUPPORT_MODEL),
    ...Object.values(PILLAR_INFO).map(v => v.question),
    ...Object.values(RUBRIC).map(v => v.label), ...Object.values(STATUS_META).map(v => v.label),
    ...Object.values(READINESS_META).map(v => v.label),
    ...(['scrum','kanban'] as const).flatMap(method => [
      ...signalDefs(method).map(v => v.label),
      ...experimentTemplates(method).flatMap(v => [v.behavior,v.hypothesis]),
    ]),
  ];
  for (const value of copy) assert.notEqual(translate(value, 'en'), value, value);
  for (const method of ['scrum','kanban'] as const) {
    for (const row of maturityReference(method)) {
      for (const level of ['silver','gold','platinum'] as const) assert.doesNotMatch(translate(row[level], 'en'), /dias/);
    }
  }
});
test('menus, metric names and dynamic captions translate without rewriting custom data', () => {
  assert.equal(translate('Configurar Jira','en'),'Configure Jira');
  assert.equal(translate('Perguntar','en'),'Ask');
  assert.equal(translate('Eficiência de fluxo','en'),'Flow efficiency');
  assert.equal(translate('média das últimas 6 sprints fechadas','en'),'average of the last 6 closed sprints');
  assert.equal(translate('Poucos itens entregues (4) — leitura de baixa confiança','en'),'Few delivered items (4) — low-confidence assessment');
  assert.equal(translate('Customer-authored note: ação 42','en'),'Customer-authored note: ação 42');
  assert.equal(translate('Configurar Jira','pt'),'Configurar Jira');
});
test('metric numbers follow the selected locale', () => {
  assert.equal(formatNumber(3.75,'en'),'3.75');
  assert.equal(formatNumber(3.75,'pt'),'3,75');
  assert.equal(formatMetricDisplay('3.75 d','pt'),'3,75 d');
});
