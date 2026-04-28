/**
 * Dashboard — компонент вкладки "Statistics Dashboard".
 * Управляет Plotly-графиками, таблицей и авто-обновлением.
 */

import * as api from '../api/client.js';

let _refreshInterval = null;
let _countdown       = 5;
const REFRESH_SEC    = 5;

// ─── Public ──────────────────────────────────────────────────────────────────

export function init() {
  document.getElementById('refreshNowBtn').addEventListener('click', refresh);
  document.getElementById('clearStatsBtn').addEventListener('click', clearStatistics);
  // Остановка интервала при переходе на другую вкладку
  document.getElementById('counting-tab').addEventListener('click', stopAutoRefresh);
  document.getElementById('dashboard-tab').addEventListener('click', load);
}

export async function load() {
  await refresh();
  _startAutoRefresh();
}

export async function refresh() {
  const data = await api.getDashboardStats();
  if (data.success && data.stats) {
    _render(data.stats, data.all_stats ?? []);
  }
  _countdown = REFRESH_SEC;
}

export function stopAutoRefresh() {
  clearInterval(_refreshInterval);
  _refreshInterval = null;
}

export function resetUI() {
  ['totalInDash','totalOutDash','netCountDash','avgFpsDash'].forEach((id) => {
    document.getElementById(id).textContent = '0';
  });
  document.getElementById('statsTableDash').innerHTML =
    '<tr><td colspan="5" class="text-center text-muted">Нет данных</td></tr>';
  document.getElementById('modelInfoDash').style.display = 'none';
  document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();

  _emptyPlot('classwiseChartDash');
  _emptyPlot('pieChartDash');
  _emptyPlot('timelineChartDash');
}

// ─── Private ─────────────────────────────────────────────────────────────────

function _render(stats, allStats) {
  document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();

  // Model info
  const modelInfo = stats.model_info ?? {};
  if (modelInfo.class_names) {
    document.getElementById('modelInfoDash').style.display = 'block';
    document.getElementById('modelPathDash').textContent   = modelInfo.model_path ?? '--';
    document.getElementById('totalClassesDash').textContent = Object.keys(modelInfo.class_names).length;
  }

  // KPI cards
  const tc = stats.total_counts ?? { in: 0, out: 0 };
  document.getElementById('totalInDash').textContent  = tc.in.toLocaleString();
  document.getElementById('totalOutDash').textContent = tc.out.toLocaleString();
  document.getElementById('netCountDash').textContent = (tc.in - tc.out).toLocaleString();
  document.getElementById('avgFpsDash').textContent   = (stats.session_stats?.avg_fps ?? 0).toFixed(1);

  // Charts
  const classwise = stats.classwise_count ?? {};
  if (Object.keys(classwise).length > 0) {
    _renderBarChart(classwise);
    _renderPieChart(classwise);
    _renderTable(classwise);
  }

  if (allStats.length > 1) {
    _renderTimeline(allStats);
  }
}

function _renderBarChart(classwise) {
  const classes   = Object.keys(classwise);
  const inCounts  = classes.map((c) => classwise[c].IN);
  const outCounts = classes.map((c) => classwise[c].OUT);

  Plotly.newPlot('classwiseChartDash', [
    { x: classes, y: inCounts,  name: 'IN',  type: 'bar', marker: { color: '#90EE90' } },
    { x: classes, y: outCounts, name: 'OUT', type: 'bar', marker: { color: '#FFA07A' } },
  ], { barmode: 'group', height: 350, paper_bgcolor: 'transparent', plot_bgcolor: 'transparent' });
}

function _renderPieChart(classwise) {
  const classes = Object.keys(classwise);
  const totals  = classes.map((c) => classwise[c].IN + classwise[c].OUT);

  Plotly.newPlot('pieChartDash', [{
    labels: classes, values: totals, type: 'pie', hole: 0.4,
  }], { height: 350, paper_bgcolor: 'transparent' });
}

function _renderTable(classwise) {
  document.getElementById('statsTableDash').innerHTML =
    Object.entries(classwise).map(([cls, counts]) => `
      <tr>
        <td>${cls}</td>
        <td>${counts.IN}</td>
        <td>${counts.OUT}</td>
        <td>${counts.IN + counts.OUT}</td>
        <td>${counts.IN - counts.OUT}</td>
      </tr>`).join('');
}

function _renderTimeline(allStats) {
  const indices  = allStats.map((_, i) => i);
  const inCounts = allStats.map((s) => s.total_counts?.in  ?? 0);
  const outCounts= allStats.map((s) => s.total_counts?.out ?? 0);

  Plotly.newPlot('timelineChartDash', [
    { x: indices, y: inCounts,  mode: 'lines+markers', name: 'IN',  line: { color: '#4CAF50' } },
    { x: indices, y: outCounts, mode: 'lines+markers', name: 'OUT', line: { color: '#FF5722' } },
  ], { height: 350, paper_bgcolor: 'transparent', plot_bgcolor: 'transparent' });
}

function _emptyPlot(id) {
  Plotly.newPlot(id, [], { height: 350, paper_bgcolor: 'transparent', plot_bgcolor: 'transparent' });
}

function _startAutoRefresh() {
  stopAutoRefresh();
  _refreshInterval = setInterval(() => {
    _countdown--;
    document.getElementById('countdown').textContent = _countdown;
    if (_countdown <= 0) refresh();
  }, 1000);
}

async function clearStatistics() {
  if (!confirm('Очистить всю статистику? Текущие данные будут сохранены в backup.')) return;

  const data = await api.clearStats();
  if (data.success) {
    alert('Статистика очищена!\n\n' + data.message);
    resetUI();

    // Сбросить live counters
    ['inCount','outCount','netCount'].forEach((id) => {
      document.getElementById(id).textContent = '0';
    });
    document.getElementById('classwiseStats').innerHTML = '';
  } else {
    alert('Ошибка: ' + data.error);
  }
}