// A worked example is followed by four small, checked decisions on a new example.
const PREP_EXAMPLES = {
  numeric: {
    lead: 'Посмотри, почему общий множитель можно вынести за скобки.',
    lines: [
      '0,5 · 12 + 0,5 · 8. Число 0,5 повторяется в обоих произведениях.',
      'По распределительному свойству: 0,5 · (12 + 8). Мы сохранили значение выражения.',
      'В скобках 20, поэтому 0,5 · 20 = 10. Проверка: 6 + 4 = 10.'
    ]
  },
  model: {
    lead: 'Разберём похожую ситуацию: сначала называем величины, потом связываем их.',
    lines: [
      'В первой коробке x карандашей, во второй втрое больше: 3x.',
      'После добавления 2 в первую коробку там x + 2; после удаления 4 из второй там 3x − 4.',
      'Если стало поровну, записываем 3x − 4 = x + 2. Каждая часть равенства обозначает число карандашей в одной коробке.'
    ]
  },
  linear: {
    lead: 'Покажем, как сохранять равенство на каждом действии.',
    lines: [
      '3x + 2 = x + 10. Вычтем x из обеих частей: 2x + 2 = 10.',
      'Вычтем 2 из обеих частей: 2x = 8. Разделим обе части на 2: x = 4.',
      'Проверим в исходном уравнении: 3 · 4 + 2 = 4 + 10, то есть 14 = 14.'
    ]
  }
};

function prepNumber(n) {
  return String(Number(n.toFixed(2))).replace('.', ',');
}

function prepStep(title, question, answers, hints, why, placeholder) {
  return { title: title, question: question, answers: answers, hints: hints, why: why, placeholder: placeholder || 'Введи ответ' };
}

function generatePractice() {
  if (state.topic === 'numeric') {
    const k = rnd([0.2, 0.3, 0.4, 0.5]);
    const a = rnd([12.4, 14.6, 18.2]);
    const b = rnd([2.4, 3.6, 5.2]);
    const plus = Math.random() > .5;
    const sign = plus ? '+' : '−';
    const inner = Number((plus ? a + b : a - b).toFixed(2));
    const result = Number((k * inner).toFixed(2));
    const ks = prepNumber(k), as = prepNumber(a), bs = prepNumber(b), inside = prepNumber(inner);
    return {
      type: 'НАВЫК · РАЦИОНАЛЬНЫЙ СПОСОБ',
      title: 'Разбираем выражение по шагам',
      text: ks + ' · ' + as + ' ' + sign + ' ' + ks + ' · ' + bs,
      steps: [
        prepStep('Заметь повтор', 'Какой множитель повторяется в обоих произведениях?', [ks], ['Посмотри на числа перед знаком умножения.', 'Один и тот же множитель стоит перед ' + as + ' и ' + bs + '.', 'Это число ' + ks + '.'], 'Общий множитель позволяет заменить два умножения одним.', 'Например, 0,5'),
        prepStep('Собери скобки', 'Чему равно ' + as + ' ' + sign + ' ' + bs + '?', [inside], ['Сначала вычисли только действие внутри будущих скобок.', 'Знак между числами остаётся тем же: ' + sign + '.', as + ' ' + sign + ' ' + bs + ' = ' + inside + '.'], 'Теперь выражение равно ' + ks + ' · ' + inside + '.', 'Число в скобках'),
        prepStep('Вычисли', 'Чему равно ' + ks + ' · ' + inside + '?', [prepNumber(result)], ['Умножь общий множитель на результат в скобках.', ks + ' — это ' + Math.round(k * 10) + '/10. Умножь ' + inside + ' на ' + Math.round(k * 10) + ', затем раздели на 10.', ks + ' · ' + inside + ' = ' + prepNumber(result) + '.'], 'Получено значение исходного выражения.', 'Итоговое число'),
        prepStep('Объясни способ', 'Какое свойство позволило вынести общий множитель? Введи его название.', ['распределительное', 'распределительное свойство'], ['Вспомни правило c · a + c · b = c · (a + b).', 'Название связано с распределением умножения по сложению или вычитанию.', 'Это распределительное свойство.'], 'Ты объяснил, почему преобразование сохраняет значение, а не просто угадал ответ.', 'Название свойства')
      ]
    };
  }
  if (state.topic === 'model') {
    const v = rnd([
      { text: 'В первой коробке x карандашей, во второй в 4 раза больше. Из второй взяли 9, в первую добавили 6 — стало поровну.', first: 'x', second: '4x', changedFirst: 'x+6', changedSecond: '4x-9', equation: '4x-9=x+6', clue: 'в 4 раза больше', amount: '6' },
      { text: 'Первое число равно a, второе на 11 больше. Из второго вычли 5, к первому прибавили 6 — результаты равны.', first: 'a', second: 'a+11', changedFirst: 'a+6', changedSecond: 'a+11-5', equation: 'a+11-5=a+6', clue: 'на 11 больше', amount: '6' }
    ]);
    return {
      type: 'НАВЫК · МАТЕМАТИЧЕСКАЯ МОДЕЛЬ',
      title: 'Переводим условие в уравнение',
      text: v.text,
      steps: [
        prepStep('Назови величины', 'Как записать вторую величину до изменений?', [v.second], ['Первая величина уже обозначена буквой.', 'Обрати внимание на слова «' + v.clue + '».', 'Вторая величина записывается так: ' + v.second + '.'], 'Сначала мы перевели слова в математическое выражение.'),
        prepStep('Учти изменение', 'Как записать вторую величину после изменения?', [v.changedSecond], ['Начни с выражения ' + v.second + '.', 'К этой величине применили вычитание.', 'После изменения получается ' + v.changedSecond + '.'], 'Мы изменили именно вторую величину, как сказано в условии.'),
        prepStep('Составь уравнение', 'Запиши равенство величин после изменений.', [v.equation, v.equation.split('=').reverse().join('=')], ['Первая величина после изменения: ' + v.changedFirst + '.', 'Вторая после изменения: ' + v.changedSecond + '. Между ними знак равенства.', 'Уравнение: ' + v.equation + '.'], 'Левая и правая части обозначают результаты для двух величин.'),
        prepStep('Проверь смысл', 'Какой знак передаёт слова «стало поровну» или «результаты равны»?', ['='], ['В условии сравниваются два результата.', 'Результаты должны иметь одно и то же значение.', 'Используй знак =.'], 'Знак равенства связывает две величины после изменений.', 'Введи один знак')
      ]
    };
  }
  const x = rnd([-4, -3, 2, 3, 4, 5]);
  const a = rnd([3, 4, 5]), d = rnd([1, 2]), b = rnd([-7, -3, 4, 8]);
  const e = (a - d) * x + b, coef = a - d, rhs = e - b, check = a * x + b;
  const signed = n => n < 0 ? '− ' + Math.abs(n) : '+ ' + n;
  return {
    type: 'НАВЫК · РАВНОСИЛЬНЫЕ ПРЕОБРАЗОВАНИЯ',
    title: 'Решаем уравнение по действиям',
    text: a + 'x ' + signed(b) + ' = ' + d + 'x ' + signed(e),
    steps: [
      prepStep('Собери x', 'Сколько x останется слева, если вычесть ' + d + 'x из обеих частей? Введи коэффициент.', [String(coef)], ['Вычитаем одно и то же из обеих частей, поэтому равенство сохраняется.', 'Слева будет (' + a + ' − ' + d + ')x.', a + ' − ' + d + ' = ' + coef + '.'], 'Получаем ' + coef + 'x ' + signed(b) + ' = ' + e + '.', 'Коэффициент при x'),
      prepStep('Убери число', 'Чему равна правая часть после вычитания ' + b + ' из обеих частей?', [String(rhs)], ['Нужно убрать свободное число слева.', 'Вычти ' + b + ' из правой части: ' + e + ' − (' + b + ').', e + ' − (' + b + ') = ' + rhs + '.'], 'Теперь уравнение имеет вид ' + coef + 'x = ' + rhs + '.', 'Число справа'),
      prepStep('Найди x', 'Чему равен x?', [String(x)], ['Раздели обе части равенства на коэффициент при x.', 'Вычисли ' + rhs + ' : ' + coef + '.', rhs + ' : ' + coef + ' = ' + x + '.'], 'Получено значение переменной; осталось проверить его в исходном уравнении.', 'Значение x'),
      prepStep('Проверь ответ', 'Подставь x = ' + x + ' в исходное уравнение. Какое число получится в каждой части?', [String(check)], ['В левую часть подставь ' + x + ': ' + a + ' · (' + x + ') + (' + b + ').', 'В правой части получится то же число: ' + d + ' · (' + x + ') + (' + e + ').', 'Обе части равны ' + check + '.'], 'Равные значения слева и справа подтверждают корень.', 'Общее значение')
    ]
  };
}

const prepProblem = document.querySelector('.problem');
document.querySelectorAll('#work .coachcard p')[0].textContent = 'На каждом шаге проверяется отдельный ответ. После проверки прочитай объяснение и переходи дальше в своём темпе.';
const prepWorked = document.createElement('details');
prepWorked.className = 'worked-example';
prepWorked.innerHTML = '<summary>Сначала посмотри похожий разобранный пример</summary><div class="worked-example__body" id="workedBody"></div>';
prepProblem.insertBefore(prepWorked, prepProblem.querySelector('.stepbox'));
const prepBox = prepProblem.querySelector('.stepbox');
const prepHeader = document.createElement('div');
prepHeader.innerHTML = '<div class="prep-heading"><strong id="prepStepTitle"></strong><span id="prepStepCount"></span></div><div class="prep-steps" id="prepSteps" aria-hidden="true"></div><p class="prep-why" id="prepWhy">Попробуй выполнить действие сам. Если застрял, открывай подсказки по одной.</p>';
prepBox.insertBefore(prepHeader, prepBox.firstChild);
const prepNext = document.createElement('button');
prepNext.type = 'button';
prepNext.className = 'primary prep-next hidden';
prepNext.id = 'prepNext';
prepBox.insertBefore(prepNext, document.querySelector('#hintBtn'));

function prepShowStep() {
  const p = state.current, i = state.prepIndex, s = p.steps[i];
  state.hintStage = 0;
  document.querySelector('#prepStepTitle').textContent = s.title;
  document.querySelector('#prepStepCount').textContent = 'Шаг ' + (i + 1) + ' из ' + p.steps.length;
  document.querySelector('#prepSteps').innerHTML = p.steps.map((_, n) => '<span class="' + (n < i ? 'done' : n === i ? 'current' : '') + '"></span>').join('');
  document.querySelector('#prepWhy').textContent = 'Попробуй выполнить действие сам. Если застрял, открывай подсказки по одной.';
  document.querySelector('#questionLabel').textContent = s.question;
  const answer = document.querySelector('#answer');
  answer.value = '';
  answer.disabled = false;
  answer.placeholder = s.placeholder;
  document.querySelector('#checkAnswer').disabled = false;
  document.querySelector('#feedback').className = 'feedback';
  document.querySelector('#hint').className = 'hint';
  document.querySelector('#hint').innerHTML = '';
  document.querySelector('#hintBtn').disabled = false;
  document.querySelector('#hintBtn').textContent = 'Нужна подсказка? Открыть 1 из 3';
  prepNext.classList.add('hidden');
  document.querySelector('.steptrail').innerHTML = p.steps.map((item, n) => '<div class="trailitem ' + (n < i ? 'done' : n === i ? 'current' : '') + '"><b>' + (n < i ? '✓' : n + 1) + '</b><span>' + esc(item.title) + '</span></div>').join('');
  updateProgress();
}

loadPractice = function () {
  const p = generatePractice();
  state.current = p;
  state.prepIndex = 0;
  state.prepHintsUsed = 0;
  document.querySelector('#problemType').textContent = p.type;
  document.querySelector('#problemTitle').textContent = state.extraActive ? 'Дополнительный пример ' + (state.extraSolved + 1) : p.title;
  document.querySelector('#problemText').textContent = p.text;
  document.querySelector('#problemLevel').textContent = state.level + '.0';
  const example = PREP_EXAMPLES[state.topic];
  document.querySelector('#workedBody').innerHTML = '<p>' + esc(example.lead) + '</p><ol>' + example.lines.map(line => '<li>' + esc(line) + '</li>').join('') + '</ol>';
  prepWorked.open = !state.extraActive;
  document.querySelector('#finishExtra').classList.toggle('hidden', !state.extraActive);
  prepShowStep();
};

updateProgress = function () {
  if (!state.current || !state.current.steps) return;
  const pct = Math.round(100 * state.prepIndex / state.current.steps.length);
  document.querySelector('#progressBar').style.width = pct + '%';
  document.querySelector('#progressLabel').textContent = state.prepIndex + ' из ' + state.current.steps.length + ' шагов выполнено';
  const series = state.extraActive ? ' · пример ' + (state.extraSolved + 1) + ' из ' + state.extraGoal : '';
  document.querySelector('#workEyebrow').textContent = 'Подготовка' + series + ' · шаг ' + Math.min(state.prepIndex + 1, state.current.steps.length) + ' из ' + state.current.steps.length;
};

document.querySelector('#hintBtn').onclick = function () {
  const s = state.current.steps[state.prepIndex];
  if (state.hintStage >= s.hints.length) return;
  state.hintStage++;
  state.prepHintsUsed++;
  document.querySelector('#hint').className = 'hint open';
  document.querySelector('#hint').innerHTML = s.hints.slice(0, state.hintStage).map((h, i) => '<div class="prep-hint-label">Подсказка ' + (i + 1) + '</div><p class="prep-hint-copy">' + esc(h) + '</p>').join('');
  this.disabled = state.hintStage >= s.hints.length;
  this.textContent = this.disabled ? 'Все подсказки к этому шагу открыты' : 'Открыть подсказку ' + (state.hintStage + 1) + ' из ' + s.hints.length;
};

function prepNormalize(value) {
  return String(value).trim().toLowerCase().replace(/,/g, '.').replace(/[−–]/g, '-').replace(/[·×]/g, '*').replace(/\s+/g, '').replace(/(\d)\*([a-z])/g, '$1$2');
}

document.querySelector('#checkAnswer').onclick = function () {
  const s = state.current.steps[state.prepIndex];
  const value = prepNormalize(document.querySelector('#answer').value);
  const feedback = document.querySelector('#feedback');
  if (!value) {
    feedback.className = 'feedback bad';
    feedback.textContent = 'Сначала запиши свой ответ на этот шаг.';
    return;
  }
  if (!s.answers.some(a => { const expected = prepNormalize(a); return expected === value || (Number.isFinite(Number(value)) && Number.isFinite(Number(expected)) && Math.abs(Number(value) - Number(expected)) < 1e-9); })) {
    state.tries++;
    feedback.className = 'feedback bad';
    feedback.textContent = state.hintStage ? 'Пока не совпало. Перечитай последний шаг подсказки и попробуй ещё раз.' : 'Пока не совпало. Проверь действие и знак; если нужно, открой первую подсказку.';
    return;
  }
  feedback.className = 'feedback good';
  feedback.textContent = 'Верно. ' + s.why;
  document.querySelector('#prepWhy').textContent = s.why;
  document.querySelector('#answer').disabled = true;
  this.disabled = true;
  document.querySelector('#hintBtn').disabled = true;
  prepNext.textContent = state.prepIndex === state.current.steps.length - 1 ? 'Завершить пример' : 'Перейти к следующему шагу';
  prepNext.classList.remove('hidden');
};

prepNext.onclick = function () {
  if (state.prepIndex < state.current.steps.length - 1) {
    state.prepIndex++;
    prepShowStep();
    document.querySelector('#answer').focus();
    return;
  }
  state.prepIndex = state.current.steps.length;
  updateProgress();
  if (state.extraActive) {
    state.extraSolved++;
    save();
    if (state.extraSolved < state.extraGoal) {
      loadPractice();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    state.extraActive = false;
    document.querySelector('#extraResult').classList.remove('hidden');
    document.querySelector('#extraResult').textContent = 'Выполнено ' + state.extraGoal + ' дополнительных примеров. Можно выбрать ещё одну серию.';
  }
  save();
  renderReport();
  showScreen('report');
};

renderReport = function () {
  document.querySelector('#mastery').innerHTML = '<div class="next"><b>✓</b><span>Один пример по теме «' + esc(TOPICS[state.topic].name) + '» разобран по шагам. Подсказок открыто: ' + (state.prepHintsUsed || 0) + '.</span></div>';
  document.querySelector('#teacherNote').innerHTML = '<strong>Учителю:</strong> это результат одного разобранного примера. Для вывода об освоении темы нужны самостоятельные задания без подсказок.';
};
document.querySelector('#report .bigcheck h2').textContent = 'Пример разобран';
document.querySelector('#report .bigcheck p').textContent = 'Теперь попробуй решить новый пример самостоятельно, чтобы проверить понимание.';
document.querySelector('#report .hero h1').textContent = 'Ты разобрал пример по шагам.';
document.querySelector('#report .hero p').textContent = 'Посмотри, какие действия получились, и закрепи их на новом примере.';
document.querySelector('#report .reportgrid .card h2').textContent = 'Что получилось';
document.querySelector('#report .reportgrid .card > p').textContent = 'Итог текущего примера';
const prepNextItems = document.querySelectorAll('#report .nextlist .next');
prepNextItems[0].querySelector('strong').textContent = 'Вспомнить трудный шаг.';
prepNextItems[0].querySelector('span span').textContent = 'Открой разобранный пример и объясни себе, почему выполнено каждое действие.';
prepNextItems[1].querySelector('strong').textContent = 'Решить другой пример.';
prepNextItems[1].querySelector('span span').textContent = 'В дополнительной тренировке пример будет новым; подсказки открываются по желанию.';
prepNextItems[2].querySelector('strong').textContent = 'Проверить себя без подсказок.';
prepNextItems[2].querySelector('span span').textContent = 'Попробуй выполнить новый пример самостоятельно, затем сверяй каждое действие.';
document.querySelector('#report .extra-card p').textContent = 'Выбери серию новых примеров. Разобранный образец будет свёрнут, а подсказки можно открыть по желанию.';
document.querySelector('#teacher .teacher-actions span').textContent = 'Подробные подсказки печатаются после заданий.';

// Each printable task gains an entry question and a final check around its task-specific hints.
const prepWorksheetGuides = {
  numeric: [
    ['Определи, что повторяется в двух произведениях. Зачем может пригодиться общий множитель?', 'Проверь результат вторым способом: вычисли оба произведения отдельно и сравни.'],
    ['Назови главное действие по слову «частное». Какие две части нужно сначала построить?', 'Проверь, что скобки отделяют всю сумму и всю разность, а знаменатель не равен нулю.'],
    ['Посмотри, какое число подставляется вместо x, и отметь его знак.', 'Подставь найденный результат обратно в запись и проверь порядок действий.'],
    ['Найди внутренние скобки и перечисли порядок действий до вычисления.', 'Проверь, что умножение выполнено до вычитания из 18.'],
    ['Найди повторяющуюся часть выражения до применения свойства.', 'Раскрой полученные скобки обратно и убедись, что оба исходных слагаемых восстановились.']
  ],
  model: [
    ['Раздели фразу на числитель и знаменатель. Какое действие связывает эти части?', 'Прочитай полученную запись словами и проверь, что смысл совпал с условием; учти a + b ≠ 0.'],
    ['Обозначь первое число и найди второе до изменений.', 'Проверь по условию, какая величина увеличилась, какая уменьшилась и почему стоит знак равенства.'],
    ['Определи главное действие всей дроби, затем прочитай числитель и знаменатель отдельно.', 'Прочитай фразу в обратном направлении и восстанови исходную формулу.'],
    ['Сначала выпиши количество и цену каждого вида билетов.', 'Проверь смысл: каждое слагаемое обозначает рубли, а количество детских билетов на 3 больше.'],
    ['Вспомни, что модель связывает реальную ситуацию и математическую запись.', 'Проверь, что заключительный этап включает ответ в контексте задачи и его смысловую проверку.']
  ],
  linear: [
    ['Назови, какие слагаемые содержат x, а какие являются числами.', 'Подставь найденный x в обе части исходного уравнения и сравни результаты.'],
    ['Запиши, что означают первое и второе числа в паре координат.', 'Сравни вычисленную левую часть с 8 и сформулируй вывод словами.'],
    ['Укажи, какая переменная известна, а какую нужно найти.', 'Подставь оба значения в исходное уравнение и проверь равенство.'],
    ['Вспомни: для прямой достаточно двух разных точек.', 'Подставь координаты обеих точек в уравнение перед построением.'],
    ['Определи, какое слагаемое нужно оставить одно в левой части.', 'Подставь полученное выражение для y в исходное уравнение и проверь равенство.']
  ]
};
const prepOriginalWorksheetTask = worksheetTask;
worksheetTask = function (topic, level, i) {
  const task = prepOriginalWorksheetTask(topic, level, i);
  const guide = prepWorksheetGuides[topic][i % 5];
  task.h = [guide[0], ...task.h, guide[1]];
  return task;
};
const prepOriginalGenerateWorksheet = generateWorksheet;
document.querySelector('#generateSheet').onclick = function () {
  prepOriginalGenerateWorksheet();
  const preview = document.querySelector('#teacherPreview');
  const heading = preview.querySelector('.hint-page h3');
  const intro = preview.querySelector('.hint-page .sub');
  if (heading) heading.textContent = 'Разбор каждого задания по шагам';
  if (intro) intro.textContent = 'Сначала попробуй самостоятельно. Если трудно, читай только следующий этап, снова пробуй и в конце проверь решение.';
};
renderReport();
