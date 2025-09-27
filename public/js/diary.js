// public/js/diary.js

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

// util: formata 'YYYY-MM-DD' -> 'DD-MM-YYYY'
function formatDateBR(yyyy_mm_dd) {
  const [y, m, d] = String(yyyy_mm_dd || '').split('-');
  if (!y || !m || !d) return '';
  return `${d}-${m}-${y}`;
}

window.addEventListener('DOMContentLoaded', () => {
  const code         = getQueryParam('code');
  const startI       = document.getElementById('start');
  const endI         = document.getElementById('end');
  const dateI        = document.getElementById('date');
  const out          = document.getElementById('out');

  // novos botões com IDs distintos
  const btnRepPDF    = document.getElementById('btnReportPDF');
  const btnRepExcel  = document.getElementById('btnReportExcel');

  // inicializa datas com hoje
  const today = new Date().toISOString().slice(0,10);
  startI.value = today;
  endI.value   = today;
  dateI.valueAsDate = new Date();

  // função que busca e renderiza o diário de um dia
  async function loadDiary() {
    const d = dateI.value;
    if (!d) return;
    const res = await fetch(`/api/diary/${d}?code=${encodeURIComponent(code)}`, {
      credentials: 'include'
    });
    if (!res.ok) {
      return Swal.fire({
        title: 'Grupo Locar',
        text: 'Erro ao carregar diário',
        icon: 'error',
        confirmButtonText: 'OK'
      });
    }
    const { total, punches } = await res.json();
    const mapType = {
      IN:          'ENTRADA',
      LUNCH_START: 'SAÍDA PARA O ALMOÇO',
      LUNCH_END:   'RETORNO DO ALMOÇO',
      OUT:         'SAÍDA'
    };
    let html = `<p>Total de horas trabalhadas: ${total}</p><ul>`;
    punches.forEach(p => {
      const ts = new Date(p.timestamp)
        .toLocaleTimeString('pt-BR',{ timeZone:'America/Sao_Paulo' });
      html += `<li>${ts} – ${mapType[p.type] || p.type}</li>`;
    });
    html += '</ul>';
    out.innerHTML = html;
  }

  // dispara ao mudar data
  dateI.addEventListener('change', loadDiary);
  // inicial
  loadDiary();

  // --- Relatório PDF ---
  btnRepPDF.addEventListener('click', () => {
    const start = startI.value;
    const end   = endI.value;
    if (!start || !end) {
      return Swal.fire({
        title: 'Grupo Locar',
        text: 'Selecione o período completo',
        icon: 'warning',
        confirmButtonText: 'OK'
      });
    }
    const url = `/api/report?code=${encodeURIComponent(code)}&start=${start}&end=${end}`;
    window.open(url, '_blank');
  });

  // --- Exportar Excel: Punch de todos os funcionários no período ---
  btnRepExcel.addEventListener('click', async () => {
    const start = startI.value;
    const end   = endI.value;
    if (!start || !end) {
      return Swal.fire({
        title: 'Grupo Locar',
        text: 'Selecione o período completo',
        icon: 'warning',
        confirmButtonText: 'OK'
      });
    }

    try {
      const url = `/api/report-excel?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&code=${encodeURIComponent(code || '')}`;
      const resp = await fetch(url, { method: 'GET', credentials: 'include' });

      if (!resp.ok) {
        return Swal.fire({
          title: 'Grupo Locar',
          text: 'Falha ao gerar o Excel. Verifique o período e tente novamente.',
          icon: 'error',
          confirmButtonText: 'OK'
        });
      }

      const blob = await resp.blob();
      const periodo = `Folha de Ponto de ${formatDateBR(start)} a ${formatDateBR(end)}.xlsx`;

      // força download com o nome solicitado
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = periodo;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      console.error(err);
      Swal.fire({
        title: 'Grupo Locar',
        text: 'Ocorreu um erro ao baixar o Excel.',
        icon: 'error',
        confirmButtonText: 'OK'
      });
    }
  });
});
