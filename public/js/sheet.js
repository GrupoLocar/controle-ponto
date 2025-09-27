// public/js/sheet.js

window.addEventListener('DOMContentLoaded', async () => {
  const out = document.getElementById('main');
  const res = await fetch('/api/sheet', { credentials: 'include' });
  if (!res.ok) return out.textContent = 'Erro ao carregar folha';

  const { date, total, punches } = await res.json();
  const [y, m, d] = date.split('-');
  const formattedDate = `${d.padStart(2,'0')}/${m.padStart(2,'0')}/${y}`;

  const mapType = {
    IN:          'ENTRADA',
    LUNCH_START: 'SAÍDA PARA O ALMOÇO',
    LUNCH_END:   'RETORNO DO ALMOÇO',
    OUT:         'SAÍDA'
  };

  let html = `<p>Data: ${formattedDate}</p>`;

  if (punches.length < 1) {
    html += `<p style="color:red">Registro não efetuado</p><p>Horas trabalhadas: 0:00</p>`;
  } else {
    html += `<p>Horas trabalhadas: ${total}</p><ul>`;
    punches.forEach(p => {
      const ts = new Date(p.timestamp);
      html += `<li>${ts.toLocaleTimeString('pt-BR',{ timeZone:'America/Sao_Paulo' })} – ${mapType[p.type] || p.type}</li>`;
    });
    html += '</ul>';
  }

  out.innerHTML = html;
});
