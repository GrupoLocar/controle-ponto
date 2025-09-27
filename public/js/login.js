window.addEventListener('DOMContentLoaded', () => {
  const codeI = document.getElementById('code');
  const passI = document.getElementById('password');
  const rem = document.getElementById('remember');
  const err = document.getElementById('error');

  const saved = localStorage.getItem('empCode');
  if (saved) { codeI.value = saved; rem.checked = true; }

  document.getElementById('btnLogin').onclick = async () => {
    const code = codeI.value.trim(), pwd = passI.value;
    if (!code || !pwd) return err.textContent = 'Preencha código e senha';

    if (rem.checked) localStorage.setItem('empCode', code);
    else localStorage.removeItem('empCode');

    const res = await fetch('/api/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, password: pwd })
    });
    if (!res.ok) {
      const { message } = await res.json();
      return err.textContent = message;
    }
    window.location = '/app.html';
  };
});
