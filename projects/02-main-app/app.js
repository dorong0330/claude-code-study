// 기본 상태는 삭제 불가 (PRD 3장)
const DEFAULT_STATUSES = ["지원", "서류 합격", "면접", "최종 합격", "불합격"];
const STORAGE_KEY = "tracker";

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// type="url"은 javascript: 도 통과시키므로 http(s)만 링크로 허용
const safeUrl = (u) => (/^https?:\/\//i.test(u) ? u : "");
// valueAsDate는 UTC 기준이라 한국 오전 9시 전엔 어제 날짜가 됨 → 로컬 날짜(YYYY-MM-DD) 사용
const today = () => new Date().toLocaleDateString("sv-SE");

// ── 저장소: localStorage를 만지는 곳은 load/save 두 함수뿐 (나중에 fetch로 교체) ──
function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (data && Array.isArray(data.apps) && Array.isArray(data.customStatuses)) return data;
  } catch (e) {
    showBanner("저장된 데이터를 읽지 못해 빈 목록으로 시작합니다.");
  }
  return { apps: [], customStatuses: [] };
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    showBanner("브라우저 저장소를 쓸 수 없어 새로고침하면 변경 내용이 사라집니다.");
  }
}

function showBanner(msg) {
  const el = $("#banner");
  el.textContent = msg;
  el.classList.add("show");
}

// ── 상태 규칙 ──
const allStatuses = () => [...DEFAULT_STATUSES, ...state.customStatuses];
// 사용 중인 상태를 지우면 항목의 상태가 목록에서 사라지므로 막는다
const canDeleteStatus = (name, apps) => !DEFAULT_STATUSES.includes(name) && !apps.some((a) => a.status === name);

// ── 렌더링 ──
function render() {
  renderSummary();
  renderChart();
  renderChips();
  renderList();
}

function counts() {
  return allStatuses().map((s) => state.apps.filter((a) => a.status === s).length);
}

function renderSummary() {
  const c = counts();
  $("#summary").innerHTML =
    `<span class="total">전체 ${state.apps.length}건</span>` +
    allStatuses().map((s, i) => `<span>${esc(s)} <b>${c[i]}</b></span>`).join("");
}

let chart;
function renderChart() {
  if (!window.Chart) {
    $("#chart-box").innerHTML = '<p class="hint error">차트를 불러오지 못했습니다. 인터넷 연결을 확인하세요. (위 숫자 요약은 그대로 사용할 수 있습니다)</p>';
    return;
  }
  const labels = allStatuses();
  // 상태 수에 맞춰 높이를 늘려 막대가 눌리지 않게 함
  $("#chart-box").style.height = `${labels.length * 34 + 24}px`;

  if (chart) {
    // 매번 new Chart를 하면 "Canvas is already in use" 오류 → 데이터만 교체
    chart.data.labels = labels;
    chart.data.datasets[0].data = counts();
    chart.update();
    return;
  }

  const css = getComputedStyle(document.documentElement);
  const color = (name) => css.getPropertyValue(name).trim();
  chart = new Chart($("#chart"), {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "지원 수",
        data: counts(),
        backgroundColor: color("--series"),
        borderRadius: 4,
        borderSkipped: "start",
        maxBarThickness: 18,
      }],
    },
    options: {
      indexAxis: "y", // 가로 막대: 한글 상태명을 눕히지 않고 읽을 수 있음
      maintainAspectRatio: false,
      animation: { duration: 200 },
      plugins: {
        legend: { display: false }, // 계열이 하나라 범례 대신 제목이 이름 역할
        tooltip: { callbacks: { label: (ctx) => ` ${ctx.parsed.x}건` } },
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: { precision: 0, color: color("--muted") },
          grid: { color: color("--border") },
          border: { display: false },
        },
        y: {
          ticks: { color: color("--text") },
          grid: { display: false },
          border: { color: color("--border") },
        },
      },
    },
  });
}

function renderChips() {
  $("#status-chips").innerHTML = allStatuses()
    .map((s) => {
      if (DEFAULT_STATUSES.includes(s)) return `<li class="chip fixed">${esc(s)}</li>`;
      const ok = canDeleteStatus(s, state.apps);
      const title = ok ? `${s} 삭제` : `${s}: 사용 중인 지원이 있어 삭제할 수 없음`;
      return `<li class="chip">${esc(s)}<button type="button" data-status="${esc(s)}" aria-label="${esc(title)}" title="${esc(title)}" ${ok ? "" : "disabled"}>×</button></li>`;
    })
    .join("");
}

function renderList() {
  if (state.apps.length === 0) {
    $("#list").innerHTML = '<li class="empty">아직 지원 기록이 없습니다. "지원 추가" 폼에서 첫 지원을 추가하세요.</li>';
    return;
  }
  const options = (cur) => allStatuses().map((s) => `<option${s === cur ? " selected" : ""}>${esc(s)}</option>`).join("");
  $("#list").innerHTML = state.apps
    .map((a) => {
      const url = safeUrl(a.url);
      return `
      <li class="item" data-id="${esc(a.id)}">
        <div class="item-head">
          <div class="item-title"><strong>${esc(a.company)}</strong>${a.role ? `<span>${esc(a.role)}</span>` : ""}</div>
          <div class="item-actions">
            <select class="status" aria-label="${esc(a.company)} 상태">${options(a.status)}</select>
            <button type="button" class="delete" aria-label="${esc(a.company)} 삭제">삭제</button>
          </div>
        </div>
        <p class="meta">${a.appliedAt ? esc(a.appliedAt) : "지원일 없음"}${url ? ` · <a href="${esc(url)}" target="_blank" rel="noopener noreferrer">공고 보기</a>` : ""}</p>
        <textarea class="memo" aria-label="${esc(a.company)} 메모" placeholder="메모" maxlength="1000">${esc(a.memo)}</textarea>
      </li>`;
    })
    .join("");
}

// ── 이벤트 ──
const findApp = (el) => state.apps.find((a) => a.id === el.closest(".item")?.dataset.id);

$("#add-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const company = f.get("company").trim();
  if (!company) return $("#company").focus();
  state.apps.unshift({
    id: crypto.randomUUID(),
    company,
    role: f.get("role").trim(),
    appliedAt: f.get("appliedAt"),
    url: f.get("url").trim(),
    memo: f.get("memo"),
    status: DEFAULT_STATUSES[0],
  });
  save();
  render();
  e.target.reset();
  $("#appliedAt").value = today();
  $("#company").focus();
});

$("#list").addEventListener("change", (e) => {
  if (!e.target.matches(".status")) return;
  findApp(e.target).status = e.target.value;
  save();
  renderSummary();
  renderChart();
  renderChips(); // 사용 여부가 바뀌면 상태 삭제 가능 여부도 바뀜
});

// 메모는 입력할 때마다 저장 (blur 전에 새로고침해도 유실되지 않게), 다시 그리지 않아 커서 유지
$("#list").addEventListener("input", (e) => {
  if (!e.target.matches(".memo")) return;
  findApp(e.target).memo = e.target.value;
  save();
});

$("#list").addEventListener("click", (e) => {
  if (!e.target.matches(".delete")) return;
  const app = findApp(e.target);
  if (!confirm(`'${app.company}' 지원 기록을 삭제할까요?`)) return;
  state.apps = state.apps.filter((a) => a !== app);
  save();
  render();
});

$("#status-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("#new-status");
  const hint = $("#status-hint");
  const name = input.value.trim();
  const error = !name ? "상태 이름을 입력하세요." : allStatuses().includes(name) ? `'${name}'은(는) 이미 있는 상태입니다.` : "";
  hint.classList.toggle("error", !!error);
  if (error) {
    hint.textContent = error;
    return input.focus();
  }
  state.customStatuses.push(name);
  save();
  render();
  input.value = "";
  hint.textContent = `'${name}' 상태를 추가했습니다.`;
});

$("#status-chips").addEventListener("click", (e) => {
  const name = e.target.dataset?.status;
  if (!name || !canDeleteStatus(name, state.apps)) return;
  state.customStatuses = state.customStatuses.filter((s) => s !== name);
  save();
  render();
  $("#status-hint").classList.remove("error");
  $("#status-hint").textContent = `'${name}' 상태를 삭제했습니다.`;
});

// ── 시작 ──
const state = load();
$("#appliedAt").value = today();
render();

// 자체 점검: 상태 삭제 규칙
console.assert(!canDeleteStatus("지원", []), "기본 상태는 삭제 불가");
console.assert(canDeleteStatus("코테", []), "안 쓰는 사용자 상태는 삭제 가능");
console.assert(!canDeleteStatus("코테", [{ status: "코테" }]), "사용 중인 상태는 삭제 불가");
