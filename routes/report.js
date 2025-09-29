// routes/report.js
const express = require('express');
const ExcelJS = require('exceljs');
const Punch = require('../models/Punch'); // caminho a partir de /routes
const router = express.Router();

/** Rótulos de tipo */
const TYPE_LABEL = {
  IN: 'Entrada',
  LUNCH_START: 'Saída p/ Almoço',
  LUNCH_END: 'Retorno do Almoço',
  OUT: 'Saída'
};

/** Ordem dos eventos para exibição */
const TYPE_ORDER = {
  IN: 0,
  LUNCH_START: 1,
  LUNCH_END: 2,
  OUT: 3
};

/** Nomes dos meses em PT-BR */
const MONTH_NAMES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
];

/** Util: valida período YYYY-MM-DD e retorna Date (America/Sao_Paulo) */
function parsePeriod(startStr, endStr) {
  if (!startStr || !endStr) {
    const err = new Error('Parâmetros start e end são obrigatórios (YYYY-MM-DD).');
    err.status = 400;
    throw err;
  }
  const start = new Date(`${startStr}T00:00:00.000-03:00`);
  const end   = new Date(`${endStr}T23:59:59.999-03:00`);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    const err = new Error('Datas inválidas. Use o formato YYYY-MM-DD.');
    err.status = 400;
    throw err;
  }
  return { start, end };
}

/** Util: devolve {year, monthIdx, monthName} no fuso America/Sao_Paulo */
function getMonthPartsSP(date) {
  const d = new Date(date);
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(d);
  const Y = Number(parts.find(p => p.type === 'year').value);
  const M = Number(parts.find(p => p.type === 'month').value);
  return { year: Y, monthIdx: M - 1, monthName: MONTH_NAMES[M - 1] };
}

/** Util: chave de dia YYYY-MM-DD no fuso America/Sao_Paulo */
function getDayKeySP(date) {
  const d = new Date(date);
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(d);
  const Y = parts.find(p => p.type === 'year').value;
  const M = parts.find(p => p.type === 'month').value;
  const D = parts.find(p => p.type === 'day').value;
  return `${Y}-${M}-${D}`; // YYYY-MM-DD
}

/** Util: formata hora HH:MM:SS em America/Sao_Paulo */
function formatTimeSP(date) {
  return new Date(date).toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

/** Util adicional: formata hora HH:MM (sem segundos) em America/Sao_Paulo */
function formatTimeSP_HHMM(date) {
  return new Date(date).toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit', minute: '2-digit'
  });
}

/** Util: formata data DD/MM/AAAA em America/Sao_Paulo */
function formatDateSP_DDMMYYYY(date) {
  return new Date(date).toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo'
  });
}

/** Util: ms -> "HH:MM" */
function msToHHMM(ms) {
  if (!ms || ms < 0) ms = 0;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

/**
 * Calcula as horas trabalhadas de um conjunto de batidas de UM DIA.
 * Regras:
 * - Se existir a sequência detalhada: (IN -> LUNCH_START) + (LUNCH_END -> OUT)
 * - Caso contrário, se houver apenas (IN -> OUT), usa OUT - IN.
 * - Demais combinações incompletas são ignoradas no cômputo.
 */
function computeWorkedMsForDay(dayPunches) {
  if (!dayPunches || dayPunches.length === 0) return 0;

  // Ordena por timestamp asc
  const list = [...dayPunches].sort((a,b) =>
    new Date(a.timestamp) - new Date(b.timestamp)
  );

  // Tenta sequência detalhada
  const firstIN         = list.find(p => p.type === 'IN');
  const firstLunchStart = firstIN ? list.find(p => p.type === 'LUNCH_START' && new Date(p.timestamp) > new Date(firstIN.timestamp)) : null;
  const firstLunchEnd   = firstLunchStart ? list.find(p => p.type === 'LUNCH_END' && new Date(p.timestamp) > new Date(firstLunchStart.timestamp)) : null;
  const firstOUT        = firstLunchEnd ? list.find(p => p.type === 'OUT' && new Date(p.timestamp) > new Date(firstLunchEnd.timestamp)) : null;

  if (firstIN && firstLunchStart && firstLunchEnd && firstOUT) {
    const seg1 = new Date(firstLunchStart.timestamp) - new Date(firstIN.timestamp);
    const seg2 = new Date(firstOUT.timestamp) - new Date(firstLunchEnd.timestamp);
    const total = (seg1 > 0 ? seg1 : 0) + (seg2 > 0 ? seg2 : 0);
    if (total > 0) return total;
  }

  // Fallback IN -> OUT
  const inTs  = firstIN?.timestamp;
  const out   = list.find(p => p.type === 'OUT' && (!inTs || new Date(p.timestamp) > new Date(inTs)));
  if (inTs && out) {
    const diff = new Date(out.timestamp) - new Date(inTs);
    return diff > 0 ? diff : 0;
  }
  return 0;
}

/** GET /api/report-excel?start=YYYY-MM-DD&end=YYYY-MM-DD */
router.get('/report-excel', async (req, res) => {
  try {
    const { start: startStr, end: endStr } = req.query;
    const { start, end } = parsePeriod(startStr, endStr);

    // Busca todos os funcionários no período selecionado
    const punches = await Punch.find({
      timestamp: { $gte: start, $lte: end }
    })
      .populate({ path: 'employee', select: 'code name' }) // se Punch referencia employee
      .sort({ timestamp: 1 })
      .lean();

    // Agrupa por mês -> funcionário -> dia
    const byMonth = new Map();
    for (const p of punches) {
      const { year, monthIdx, monthName } = getMonthPartsSP(p.timestamp);
      const monthKey = `${year}-${String(monthIdx+1).padStart(2,'0')}`;
      if (!byMonth.has(monthKey)) {
        byMonth.set(monthKey, { year, monthIdx, monthName, employees: new Map() });
      }
      const monthObj = byMonth.get(monthKey);

      // normaliza dados de funcionário
      const empCode = p.employeeCode || p.employee?.code || '';
      const empName = p.employeeName || p.employee?.name || '';
      const empKey  = `${empName}||${empCode}`; // para ordenação estável

      if (!monthObj.employees.has(empKey)) {
        monthObj.employees.set(empKey, {
          name: empName,
          code: empCode,
          days: new Map() // YYYY-MM-DD -> punches[]
        });
      }
      const empObj = monthObj.employees.get(empKey);

      const dayKey = getDayKeySP(p.timestamp); // YYYY-MM-DD
      if (!empObj.days.has(dayKey)) empObj.days.set(dayKey, []);
      empObj.days.get(dayKey).push(p);
    }

    // Cria workbook
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Grupo Locar';
    wb.created = new Date();

    // Para cada mês (planilha)
    const monthKeysSorted = Array.from(byMonth.keys()).sort((a,b) => a.localeCompare(b));
    if (monthKeysSorted.length === 0) {
      // Sem registros: cria uma planilha informativa
      const wsEmpty = wb.addWorksheet('Sem Registros');
      wsEmpty.addRow(['Não há registros de ponto no período informado.']);
    } else {
      for (const monthKey of monthKeysSorted) {
        const m = byMonth.get(monthKey);
        const sheetName = `${m.monthName} ${m.year}`.slice(0, 31); // limite Excel
        const ws = wb.addWorksheet(sheetName);

        // Larguras para o layout solicitado (6 colunas)
        ws.columns = [
          { width: 14 }, // Data
          { width: 12 }, // Entrada
          { width: 16 }, // Saída p/ Almoço
          { width: 20 }, // Retorno do Almoço
          { width: 12 }, // Saída
          { width: 16 }  // Total
        ];

        // Funcionários em ordem alfabética (por nome)
        const employeesSorted = Array.from(m.employees.entries())
          .sort((a,b) => {
            const [nameA] = a[0].split('||');
            const [nameB] = b[0].split('||');
            return String(nameA).localeCompare(String(nameB), 'pt-BR');
          });

        for (const [, empObj] of employeesSorted) {
          // Cabeçalho do bloco por funcionário
          const rowStart = ws.lastRow ? ws.lastRow.number + 1 : 1;

          const r1 = ws.addRow([`Funcionário (Código): ${empObj.code}`]);
          ws.mergeCells(r1.number, 1, r1.number, 6);
          r1.font = { bold: true };

          const r2 = ws.addRow([`Funcionário (Nome): ${empObj.name}`]);
          ws.mergeCells(r2.number, 1, r2.number, 6);
          r2.font = { bold: true };

          // Linha em branco
          ws.addRow(['','','','','','']);

          // Títulos da tabela do funcionário
          const header = ws.addRow([
            'Data',
            'Entrada',
            'Saída p/ Almoço',
            'Retorno do Almoço',
            'Saída',
            'Total'
          ]);
          header.font = { bold: true };

          // Dias em ordem crescente
          const daysSorted = Array.from(empObj.days.keys()).sort((a,b) => a.localeCompare(b));

          // Total do funcionário no mês
          let employeeTotalMs = 0;

          for (const dayKey of daysSorted) {
            const dayPunches = empObj.days.get(dayKey);

            // Ordena eventos do dia: primeiro por timestamp, depois por ordem de tipo
            dayPunches.sort((a,b) => {
              const ta = new Date(a.timestamp) - new Date(b.timestamp);
              if (ta !== 0) return ta;
              return (TYPE_ORDER[a.type] ?? 99) - (TYPE_ORDER[b.type] ?? 99);
            });

            // Pega horários (se existirem)
            const firstIN         = dayPunches.find(p => p.type === 'IN');
            const firstLunchStart = dayPunches.find(p => p.type === 'LUNCH_START');
            const firstLunchEnd   = dayPunches.find(p => p.type === 'LUNCH_END');
            const firstOUT        = dayPunches.find(p => p.type === 'OUT');

            const inTime    = firstIN ? formatTimeSP_HHMM(firstIN.timestamp) : '';
            const lunchOut  = firstLunchStart ? formatTimeSP_HHMM(firstLunchStart.timestamp) : '';
            const lunchIn   = firstLunchEnd ? formatTimeSP_HHMM(firstLunchEnd.timestamp) : '';
            const outTime   = firstOUT ? formatTimeSP_HHMM(firstOUT.timestamp) : '';

            const workedMs  = computeWorkedMsForDay(dayPunches);
            const workedHHMM = msToHHMM(workedMs);
            employeeTotalMs += workedMs;

            ws.addRow([
              formatDateSP_DDMMYYYY(dayKey),
              inTime,
              lunchOut,
              lunchIn,
              outTime,
              workedHHMM
            ]);
          }

          // Linha de resumo "Total de Horas: HH:MM hs"
          const totalHHMM = msToHHMM(employeeTotalMs);
          const totalRow = ws.addRow(['','','','','', `Total de Horas: ${totalHHMM} hs`]);
          totalRow.font = { bold: true };
          totalRow.getCell(6).alignment = { horizontal: 'right' };

          // Linha em branco entre funcionários
          ws.addRow(['','','','','','']);
        }
      }
    }

    // Gera buffer .xlsx REAL e envia binário
    const arrayBuffer = await wb.xlsx.writeBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Folha_de_Ponto_${startStr}_a_${endStr}.xlsx"`);
    res.status(200).send(buffer);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || 'Erro ao gerar Excel' });
  }
});

module.exports = router;
