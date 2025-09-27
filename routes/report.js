// routes/report.js
const express = require('express');
const ExcelJS = require('exceljs');
const Punch = require('../models/Punch'); // caminho a partir de /routes
const router = express.Router();

// rótulos opcionais
const TYPE_LABEL = {
  IN: 'Entrada',
  LUNCH_START: 'Saída p/ Almoço',
  LUNCH_END: 'Retorno do Almoço',
  OUT: 'Saída'
};

// util: normaliza período YYYY-MM-DD -> Date (início/fim do dia em America/Sao_Paulo)
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

// GET /api/report-excel?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/report-excel', async (req, res) => {
  try {
    const { start: startStr, end: endStr } = req.query;
    const { start, end } = parsePeriod(startStr, endStr);

    // busca TODOS os funcionários no período
    const punches = await Punch.find({
      timestamp: { $gte: start, $lte: end }
    })
      .sort({ employeeName: 1, employeeCode: 1, timestamp: 1 })
      .lean();

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Grupo Locar';
    wb.created = new Date();
    const ws = wb.addWorksheet('Folha de Ponto');

    ws.columns = [
      { header: 'Funcionário (Código)', key: 'employeeCode', width: 20 },
      { header: 'Funcionário (Nome)',   key: 'employeeName', width: 32 },
      { header: 'Data',                 key: 'date',         width: 12 },
      { header: 'Hora',                 key: 'time',         width: 10 },
      { header: 'Tipo',                 key: 'type',         width: 18 },
      { header: 'Origem',               key: 'source',       width: 12 },
      { header: 'Latitude',             key: 'lat',          width: 12 },
      { header: 'Longitude',            key: 'lng',          width: 12 }
    ];

    for (const p of punches) {
      const dt = new Date(p.timestamp);
      const dateBR = dt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      const timeBR = dt.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' });
      ws.addRow({
        employeeCode: p.employeeCode || '',
        employeeName: p.employeeName || '',
        date: dateBR,
        time: timeBR,
        type: TYPE_LABEL[p.type] || p.type || '',
        source: p.source || '',
        lat: p?.geo?.lat ?? '',
        lng: p?.geo?.lng ?? ''
      });
    }

    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.getRow(1).font = { bold: true };

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
