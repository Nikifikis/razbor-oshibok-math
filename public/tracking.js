(() => {
  const api = async (url, options = {}) => {
    const response = await fetch(url, { credentials: 'same-origin', headers: { 'content-type': 'application/json', ...(options.headers || {}) }, ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Не удалось выполнить действие');
    return data;
  };

  const style = document.createElement('style');
  style.textContent = `
    .track-modal{position:fixed;inset:0;background:rgba(18,27,45,.62);backdrop-filter:blur(5px);z-index:100;display:grid;place-items:center;padding:18px}.track-login{width:min(100%,460px);background:#fff;border-radius:24px;padding:28px;box-shadow:0 24px 80px rgba(0,0,0,.25)}.track-login h2{font-size:28px;margin:6px 0 8px}.track-login p{margin:0 0 20px;color:#667085}.track-fields{display:grid;gap:12px}.track-fields label{font-size:14px;font-weight:800}.track-fields input{width:100%;margin-top:6px;border:2px solid #e1e5ed;border-radius:11px;padding:12px;font:inherit}.track-error{color:#b42338;font-size:14px;min-height:20px;margin-top:8px}.track-login-actions{display:flex;gap:9px;margin-top:12px}.track-login-actions button{flex:1}.assignment-panel{background:#172033;color:white;border-radius:20px;padding:18px 20px;margin-bottom:20px}.assignment-panel h3{margin:0 0 4px}.assignment-panel p{color:#cbd3e1;margin:0}.assignment-list{display:flex;gap:9px;flex-wrap:wrap;margin-top:14px}.assignment-chip{border:1px solid #44506a;background:#25304a;color:#fff;border-radius:12px;padding:10px 12px;font:inherit;text-align:left;cursor:pointer}.assignment-chip.active{border-color:#c8ff42;color:#c8ff42}.student-account{border:0;border-radius:999px;background:#eef1f6;color:#384254;padding:9px 13px;font:inherit;font-weight:800;cursor:pointer}@media(max-width:620px){.track-login-actions{flex-direction:column}.assignment-list{display:grid}.assignment-chip{width:100%}}
  `;
  document.head.append(style);

  let profile = null;
  let currentAssignment = null;
  let taskIndex = 0;
  const topics = { numeric: 'Числовые выражения', model: 'Математический язык и модель', linear: 'Линейные уравнения', fractions: 'А1 · Алгебраические дроби', fraction_sum: 'А2 · Сложение и вычитание дробей' };

  function loginModal() {
    if (document.querySelector('.track-modal')) return;
    const modal = document.createElement('div');
    modal.className = 'track-modal';
    modal.innerHTML = `<form class="track-login"><div class="eyebrow">Вход ученика</div><h2>Открой свою работу</h2><p>Код класса и PIN выдаёт учитель.</p><div class="track-fields"><label>Код класса<input name="classCode" maxlength="6" autocomplete="off" required placeholder="Например, 7A4K2M"></label><label>Имя ученика<input name="name" autocomplete="name" required placeholder="Как в списке учителя"></label><label>PIN<input name="pin" inputmode="numeric" pattern="[0-9]{4,8}" required placeholder="4 цифры"></label></div><div class="track-error"></div><div class="track-login-actions"><button type="button" class="secondary" data-skip>Без сохранения</button><button class="primary">Войти</button></div></form>`;
    document.body.append(modal);
    modal.querySelector('[data-skip]').onclick = () => modal.remove();
    modal.querySelector('form').onsubmit = async event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget), error = modal.querySelector('.track-error');
      error.textContent = '';
      try {
        await api('api/student/login', { method:'POST', body:JSON.stringify(Object.fromEntries(form)) });
        modal.remove(); await loadProfile();
      } catch (e) { error.textContent = e.message; }
    };
  }

  function renderAssignments() {
    const old = document.querySelector('.assignment-panel'); if (old) old.remove();
    if (!profile) return;
    const panel = document.createElement('section'); panel.className = 'assignment-panel';
    const open = profile.assignments.filter(a => a.status !== 'completed');
    panel.innerHTML = `<h3>${profile.student.display_name} · ${profile.student.class_name}</h3><p>${open.length ? 'Выбери назначенную работу. Прогресс сохранится автоматически.' : 'Все назначенные работы завершены.'}</p><div class="assignment-list">${open.map(a => `<button class="assignment-chip" data-id="${a.id}"><b>${a.title}</b><br><small>${topics[a.topic]} · ${a.level}.0 · ${a.correct_count}/${a.task_count}</small></button>`).join('')}</div>`;
    document.querySelector('.main').prepend(panel);
    panel.querySelectorAll('.assignment-chip').forEach(button => button.onclick = () => selectAssignment(Number(button.dataset.id)));
  }

  function selectAssignment(id) {
    currentAssignment = profile.assignments.find(a => a.id === id); taskIndex = currentAssignment.correct_count || 0;
    document.querySelectorAll('.assignment-chip').forEach(b => b.classList.toggle('active', Number(b.dataset.id) === id));
    const topic = document.querySelector('#topicSelect'); topic.value = currentAssignment.topic; topic.dispatchEvent(new Event('change', { bubbles:true }));
    const level = document.querySelector(`.level-card[data-level="${currentAssignment.level}"]`); if (level) level.click();
    sendProgress('start');
    document.querySelector('#setup')?.scrollIntoView({ behavior:'smooth' });
  }

  async function sendProgress(event, details = {}) {
    if (!currentAssignment) return;
    try { await api('api/student/progress', { method:'POST', body:JSON.stringify({ assignmentId:currentAssignment.id, event, taskIndex, ...details }) }); } catch {}
  }

  async function loadProfile() {
    try {
      profile = await api('api/student/me'); renderAssignments();
      let account = document.querySelector('.student-account');
      if (!account) { account = document.createElement('button'); account.className='student-account'; document.querySelector('.topmeta')?.prepend(account); }
      account.textContent = profile.student.display_name;
      account.onclick = async () => { await api('api/logout',{method:'POST',body:'{}'}); location.reload(); };
    } catch { loginModal(); }
  }

  document.addEventListener('click', event => {
    if (event.target.id === 'hintBtn' && currentAssignment) setTimeout(() => {
      const stage = document.querySelectorAll('.prep-hint-label, .hint-step').length;
      const skill = document.querySelector('#problemType')?.textContent || '';
      if (stage) sendProgress('hint', { hintStage:stage, skill });
    }, 30);
    if (event.target.id === 'checkAnswer' && currentAssignment) setTimeout(() => {
      const feedback = document.querySelector('#feedback');
      const correct = feedback?.classList.contains('good');
      const wrong = feedback?.classList.contains('bad');
      if (!correct && !wrong) return;
      if (correct && document.querySelector('#work')?.dataset.learningPhase === 'guided') return;
      const nextStep = document.querySelector('#prepNext');
      if (correct && nextStep && nextStep.textContent !== 'Завершить пример') return;
      const hintStage = document.querySelectorAll('.prep-hint-label, .hint-step').length;
      const skill = document.querySelector('#problemType')?.textContent || '';
      sendProgress('answer', { correct, hintStage, skill });
      if (correct) { taskIndex += 1; currentAssignment.correct_count = taskIndex; }
    }, 80);
  });

  loadProfile();
})();
