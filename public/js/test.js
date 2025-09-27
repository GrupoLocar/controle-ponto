const express = require('express');
const app     = express();
app.use(express.json());
app.post('/api/login', (req, res) => {
  res.json({ ok: true, youSent: req.body });
});
app.listen(3001, () => console.log('Teste rodando na 3001'));
