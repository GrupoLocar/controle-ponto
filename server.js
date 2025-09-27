require('dotenv').config();
const express       = require('express');
const path          = require('path');
const fs            = require('fs'); // <- adicionado para checar dist/public
const mongoose      = require('mongoose');
const session       = require('express-session');
const MongoStore    = require('connect-mongo');
const configApp     = require('./config');
const Employee      = require('./models/Employee');
const Punch         = require('./models/Punch');
const PDFDocument   = require('pdfkit');

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('MongoDB conectado'))
.catch(err => console.error('Erro ao conectar MongoDB:', err));

const app = express();

app.use(express.json());

// mantém seus estáticos da pasta public (imagens, etc.)
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI })
}));

// middleware de autenticação
function ensureAuth(req, res, next) {
  if (req.session.employeeId) return next();
  res.status(401).json({ message: 'Não autorizado' });
}

// rota de login
app.post('/api/login', async (req, res) => {
  const { code, password } = req.body;
  const emp = await Employee.findOne({ code, active: true });
  if (!emp || !(await emp.comparePassword(password))) {
    return res.status(401).json({ message: 'Código ou senha inválidos' });
  }
  req.session.employeeId = emp._id;
  res.json({ name: emp.name });
});

// rota de logout
app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.sendStatus(200));
});

const reportRouter = require('./routes/report');

// retorna o usuário logado
app.get('/api/me', ensureAuth, async (req, res) => {
  const emp = await Employee.findById(req.session.employeeId);
  res.json({ name: emp.name });
});

// registrar ponto
app.post('/api/punch', ensureAuth, async (req, res) => {
  const empId = req.session.employeeId;
  const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
  const endOfDay   = new Date(); endOfDay.setHours(23,59,59,999);

  const punches = await Punch.find({
    employee: empId,
    timestamp: { $gte: startOfDay, $lte: endOfDay }
  }).sort('timestamp');

  const seq = configApp.detailed
    ? ['IN','LUNCH_START','LUNCH_END','OUT']
    : ['IN','OUT'];

  const nextType = punches.length < seq.length ? seq[punches.length] : null;
  if (!nextType) {
    return res.status(400).json({ message: 'Todos os registros do dia já foram registrados.' });
  }

  const p = await Punch.create({ employee: empId, type: nextType });
  res.json({ timestamp: p.timestamp, type: nextType });
});

// diário de folha: registros de uma data
app.get('/api/diary/:date', ensureAuth, async (req, res) => {
  const empId = req.session.employeeId;
  const [y,m,d] = req.params.date.split('-').map(Number);
  const start = new Date(y,m-1,d), end = new Date(y,m-1,d,23,59,59,999);

  const punches = await Punch.find({
    employee: empId,
    timestamp: { $gte: start, $lte: end }
  }).sort('timestamp');

  let totalMs = 0;
  if (configApp.detailed) {
    const inTs  = punches.find(p=>p.type==='IN')?.timestamp;
    const lsTs  = punches.find(p=>p.type==='LUNCH_START')?.timestamp;
    const leTs  = punches.find(p=>p.type==='LUNCH_END')?.timestamp;
    const outTs = punches.find(p=>p.type==='OUT')?.timestamp;
    if (inTs && lsTs) totalMs += lsTs - inTs;
    if (leTs && outTs) totalMs += outTs - leTs;
  } else {
    const inTs  = punches[0]?.timestamp;
    const outTs = punches[1]?.timestamp;
    if (inTs && outTs) totalMs = outTs - inTs;
  }

  const hours = Math.floor(totalMs/3600000);
  const mins  = Math.floor((totalMs%3600000)/60000);

  res.json({
    date: req.params.date,
    total: `${hours}:${mins.toString().padStart(2,'0')}`,
    punches: punches.map(p=>({ type: p.type, timestamp: p.timestamp }))
  });
});

// folha de ponto de hoje
app.get('/api/sheet', ensureAuth, async (req, res) => {
  const empId   = req.session.employeeId;
  const today   = new Date(); today.setHours(0,0,0,0);
  const tomorrow= new Date(today); tomorrow.setDate(tomorrow.getDate()+1);

  const punches = await Punch.find({
    employee: empId,
    timestamp: { $gte: today, $lt: tomorrow }
  }).sort('timestamp');

  let totalMs = 0;
  if (punches.length >= 2) {
    totalMs = punches[punches.length-1].timestamp - punches[0].timestamp;
  }
  const hours = Math.floor(totalMs/3600000);
  const mins  = Math.floor((totalMs%3600000)/60000);

  res.json({
    date: today.toISOString().slice(0,10),
    total: punches.length>=2 ? `${hours}:${mins.toString().padStart(2,'0')}` : '0:00',
    punches: punches.map(p=>({ type: p.type, timestamp: p.timestamp }))
  });
});

// utilitário para formatar YYYY-MM-DD em DD-MM-YYYY
function formatDateBR(iso) {
  const [Y,M,D] = iso.split('-');
  return `${D}-${M}-${Y}`;
}

// Rota de relatório PDF
app.get('/api/report', ensureAuth, async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) {
    return res.status(400).send('Parâmetros start e end são obrigatórios');
  }

  // busca nome do funcionário
  const emp = await Employee.findById(req.session.employeeId);
  const empName = emp?.name || '';

  // converte parâmetros para Date
  const [y1,m1,d1] = start.split('-').map(Number);
  const [y2,m2,d2] = end.split('-').map(Number);
  const startDt = new Date(y1, m1 - 1, d1);
  const endDt   = new Date(y2, m2 - 1, d2, 23,59,59,999);

  // busca registros no período
  const punches = await Punch.find({
    employee: req.session.employeeId,
    timestamp: { $gte: startDt, $lte: endDt }
  }).sort('timestamp');

  // configura resposta como PDF inline com nome dinâmico
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="Folha de Ponto - ${empName}.pdf"`
  );

  const doc = new PDFDocument({ margin: 40 });
  // metadata interna do PDF
  doc.info.Title  = `Folha de Ponto de ${empName}`;
  doc.info.Author = empName;
  doc.pipe(res);

  // título principal
  doc.fontSize(18)
     .text(`Folha de Ponto de ${empName}`, { align: 'center' });
  doc.moveDown();
  doc.fontSize(12)
     .text(
       `Período: ${formatDateBR(start)} até ${formatDateBR(end)}`,
       { align: 'center' }
     );
  doc.moveDown();

  const mapType = {
    IN:          'ENTRADA',
    LUNCH_START: 'SAÍDA PARA O ALMOÇO',
    LUNCH_END:   'RETORNO DO ALMOÇO',
    OUT:         'SAÍDA'
  };

  // agrupa por mês
  const monthNames = [
    'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
  ];
  const byMonth = {};
  punches.forEach(p => {
    const dt = new Date(p.timestamp);
    const key = dt.getMonth();
    const dateStr = dt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const line = `• ${dateStr} — ${mapType[p.type]}`;
    (byMonth[key] = byMonth[key] || []).push(line);
  });

  // escreve cada mês com subtítulo e duas colunas
  Object.keys(byMonth).forEach(monthIdx => {
    const lines = byMonth[monthIdx];
    const monthName = monthNames[monthIdx];
    doc.moveDown();
    doc.fontSize(14).text(`Mês: ${monthName}`);
    doc.moveDown(0.5);
    doc.fontSize(10).text(lines.join('\n'), {
      columns: 2,
      columnGap: 20
    });
  });

  doc.end();
});

/* ===========================
   SERVE DO FRONT-END (Vite)
   ===========================

   - Mantém todas as rotas /api acima.
   - Se existir dist/index.html, serve o build do Vite.
   - Caso contrário, cai no public/index.html (modo dev / fallback).
*/
const distPath   = path.join(__dirname, 'dist');
const publicPath = path.join(__dirname, 'public');

if (fs.existsSync(path.join(distPath, 'index.html'))) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  app.get('*', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });
}

// Inicialização do servidor
const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor rodando em http://0.0.0.0:${PORT}`);
});


