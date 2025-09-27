// public/js/app.js

function playBeep() {
  const ctx = new (AudioContext || webkitAudioContext)();
  const osc = ctx.createOscillator();
  osc.connect(ctx.destination);
  osc.frequency.setValueAtTime(800, ctx.currentTime);
  osc.start();
  osc.stop(ctx.currentTime + 0.2);
}

window.addEventListener('DOMContentLoaded', async () => {
  const greet = document.getElementById('greet');
  const logoutBtn = document.getElementById('btnLogout');
  const punchBtn = document.getElementById('punchBtn');
  const msgDiv = document.getElementById('msg');
  const infoDate = document.getElementById('infoDate');
  const infoTime = document.getElementById('infoTime');
  const infoType = document.getElementById('infoType');

  // 1️⃣ Obter nome do usuário logado
  try {
    const resMe = await fetch('/api/me', { credentials: 'include' });
    if (resMe.ok) {
      const me = await resMe.json();
      greet.textContent += me.name;
    } else {
      console.error('Falha ao buscar /api/me:', resMe.status);
    }
  } catch (err) {
    console.error('Erro ao chamar /api/me:', err);
  }

  // 2️⃣ Logout
  logoutBtn.onclick = async () => {
    try {
      const res = await fetch('/api/logout', {
        method: 'POST',
        credentials: 'include'
      });
      if (res.ok) {
        // redireciona para o login
        window.location.href = 'login.html';
      } else {
        Swal.fire({
          title: 'Grupo Locar',
          text: 'Falha ao fazer logout.',
          icon: 'error',
          confirmButtonText: 'OK'
        });
      }
    } catch (err) {
      console.error('Erro no logout:', err);
      Swal.fire({
        title: 'Grupo Locar',
        text: 'Erro ao fazer logout.',
        icon: 'error',
        confirmButtonText: 'OK'
      });
    }
  };

  // 3️⃣ Registro de ponto
  punchBtn.onclick = async () => {
    try {
      const res = await fetch('/api/punch', {
        method: 'POST',
        credentials: 'include'
      });
      const data = await res.json();

      if (!res.ok) {
        return Swal.fire({
          title: 'Grupo Locar',
          text: data.message,
          icon: 'info',
          confirmButtonText: 'OK'
        });
      }

      playBeep();
      msgDiv.style.display = 'block';

      const dt = new Date(data.timestamp);
      infoDate.textContent = 'Data Atual: ' +
        dt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      infoTime.textContent = 'Hora: ' +
        dt.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });

      const mapType = {
        IN: 'Entrada',
        LUNCH_START: 'Saída do almoço',
        LUNCH_END: 'Retorno do almoço',
        OUT: 'Saída'
      };
      infoType.textContent = 'Tipo: ' + mapType[data.type];

      setTimeout(() => { msgDiv.style.display = 'none'; }, 2000);

    } catch (err) {
      console.error('Erro ao registrar ponto:', err);
      Swal.fire({
        title: 'Grupo Locar',
        text: 'Erro ao registrar ponto.',
        icon: 'error',
        confirmButtonText: 'OK'
      });
    }
  };

  // 4️⃣ Navegação
  document.getElementById('btnDiary').onclick = () => {
    // const code = document.getElementById('code').value.trim();
    window.location = 'diary.html';
  };
  document.getElementById('btnSheet').onclick = () => {
    // const code = document.getElementById('code').value.trim();
    window.location = 'sheet.html';
  };
});
