// public/script.js
window.addEventListener('DOMContentLoaded', () => {
    const codeInput  = document.getElementById('code');
    const rememberCh = document.getElementById('remember');
    const punchBtn   = document.getElementById('punch');
    const msgDiv     = document.getElementById('message');
  
    // carrega código salvo
    const saved = localStorage.getItem('employeeCode');
    if (saved) {
      codeInput.value = saved;
      rememberCh.checked = true;
    }
  
    punchBtn.addEventListener('click', async () => {
      const code = codeInput.value.trim();
      if (!code) return alert('Por favor, digite o código do funcionário.');
  
      // gerencia salvar/limpar localStorage
      if (rememberCh.checked) {
        localStorage.setItem('employeeCode', code);
      } else {
        localStorage.removeItem('employeeCode');
      }
  
      try {
        const res = await fetch('/api/punch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ employeeCode: code })
        });
        const data = await res.json();
  
        if (!res.ok) {
          return alert(data.message);
        }
  
        // mostra mensagem e toca alerta
        msgDiv.style.display = 'block';
        // som via Web Audio API
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        osc.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
  
        setTimeout(() => { msgDiv.style.display = 'none'; }, 2000);
  
      } catch (err) {
        console.error(err);
        alert('Erro ao registrar ponto.');
      }
    });
  });
  