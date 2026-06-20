/* ============================================================
   LATINA — UI layer
   ============================================================ */
const $app = document.getElementById('app');
let STATE = { screen: 'home', lectio: null, typeKey: null, queue: [], idx: 0, correct: 0, xp: 0, current: null, flipped:false };

function getXP(){ return parseInt(localStorage.getItem('xp')||'0',10); }
function addXP(n){ const x = getXP()+n; localStorage.setItem('xp', x); return x; }
function getStreak(){ return parseInt(localStorage.getItem('streak')||'0',10); }
function bumpStreakIfNeeded(){
  const today = new Date().toDateString();
  const last = localStorage.getItem('lastDay');
  if(last !== today){
    const y = new Date(Date.now()-86400000).toDateString();
    const streak = last === y ? getStreak()+1 : 1;
    localStorage.setItem('streak', streak);
    localStorage.setItem('lastDay', today);
  }
}
function lectioProgress(n){
  let total=0, mastered=0;
  for(const t of EXERCISE_TYPES){
    for(let i=0;i<localStorage.length;i++){
      const k = localStorage.key(i);
      if(k && k.startsWith(`mem:${t.key}:${n}:`)){
        total++;
        const m = getMem(k);
        if((m.box||0) >= 3) mastered++;
      }
    }
  }
  return total ? Math.round(100*mastered/total) : 0;
}

function render(){
  if(STATE.screen === 'home') return renderHome();
  if(STATE.screen === 'lesson') return renderLessonSelect();
  if(STATE.screen === 'session') return renderSession();
  if(STATE.screen === 'results') return renderResults();
  if(STATE.screen === 'memory') return renderMemory();
}

function renderHome(){
  bumpStreakIfNeeded();
  const stats = allMemStats();
  let html = `
  <header class="topbar">
    <div class="brand">📜 LATINA</div>
    <div class="hud">
      <span class="hud-item">🔥 ${getStreak()}</span>
      <span class="hud-item">⭐ ${getXP()}</span>
    </div>
  </header>
  <div class="tabbar">
    <button class="tab-btn active" data-tab="home">Μάθημα</button>
    <button class="tab-btn" data-tab="memory">Μνήμη (${stats.dueCount} due)</button>
  </div>
  <div class="path-container">
  `;
  for(const n of LECTIO_NUMS){
    const prog = lectioProgress(n);
    const title = (DATA.titles[n]||'').replace(/^LECTIO\s+[IVXLΧ]+\s*[:\-–]?\s*/i,'');
    html += `
    <div class="lesson-node" data-lectio="${n}">
      <div class="node-circle" style="--prog:${prog}%">
        <span class="node-num">${n}</span>
      </div>
      <div class="node-info">
        <div class="node-title">Lectio ${n}</div>
        <div class="node-sub">${title.slice(0,38)}${title.length>38?'…':''}</div>
        <div class="node-bar"><i style="width:${prog}%"></i></div>
      </div>
    </div>`;
  }
  html += `</div>`;
  $app.innerHTML = html;
  document.querySelectorAll('.lesson-node').forEach(el=>{
    el.onclick = ()=>{ STATE.lectio = parseInt(el.dataset.lectio,10); STATE.screen='lesson'; render(); };
  });
  document.querySelector('[data-tab="memory"]').onclick = ()=>{ STATE.screen='memory'; render(); };
}

function renderLessonSelect(){
  const n = STATE.lectio;
  const title = (DATA.titles[n]||'').replace(/^LECTIO\s+[IVXLΧ]+\s*[:\-–]?\s*/i,'');
  let html = `
  <header class="topbar">
    <button class="back-btn" id="backHome">←</button>
    <div class="brand">Lectio ${n}</div>
  </header>
  <div class="lectio-title">${title}</div>
  <div class="type-grid">
  `;
  for(const t of EXERCISE_TYPES){
    const prog = (()=>{
      let total=0, mastered=0;
      for(let i=0;i<localStorage.length;i++){
        const k = localStorage.key(i);
        if(k && k.startsWith(`mem:${t.key}:${n}:`)){
          total++; if((getMem(k).box||0)>=3) mastered++;
        }
      }
      return total ? Math.round(100*mastered/total) : 0;
    })();
    html += `
    <div class="type-card" data-type="${t.key}">
      <div class="type-icon">${t.icon}</div>
      <div class="type-label">${t.n}. ${t.label}</div>
      <div class="type-bar"><i style="width:${prog}%"></i></div>
    </div>`;
  }
  html += `</div>
  <button class="btn-primary" id="mixBtn" style="margin:14px;">🔀 Μικτή εξάσκηση (όλοι οι τύποι)</button>
  `;
  $app.innerHTML = html;
  document.getElementById('backHome').onclick = ()=>{ STATE.screen='home'; render(); };
  document.querySelectorAll('.type-card').forEach(el=>{
    el.onclick = ()=>{ startSession(el.dataset.type, STATE.lectio); };
  });
  document.getElementById('mixBtn').onclick = ()=>{ startSession('mix', STATE.lectio); };
}

function buildQueue(typeKey, lectio, count=8){
  const queue = [];
  const keys = typeKey === 'mix' ? EXERCISE_TYPES.map(t=>t.key) : [typeKey];
  let attempts = 0;
  while(queue.length < count && attempts < count*10){
    attempts++;
    const k = sample(keys);
    const ex = generateExercise(k, lectio);
    if(ex) queue.push(ex);
  }
  return queue;
}

function startSession(typeKey, lectio){
  const queue = buildQueue(typeKey, lectio, 8);
  if(!queue.length){
    alert('Δεν υπάρχουν ακόμη αρκετά δεδομένα για αυτόν τον τύπο σε αυτή την ενότητα.');
    return;
  }
  STATE.screen = 'session';
  STATE.typeKey = typeKey;
  STATE.queue = queue;
  STATE.idx = 0;
  STATE.correct = 0;
  STATE.flipped = false;
  render();
}

function progressBarHTML(){
  const pct = Math.round(100*STATE.idx/STATE.queue.length);
  return `<div class="session-progress"><i style="width:${pct}%"></i></div>`;
}

function renderSession(){
  const ex = STATE.queue[STATE.idx];
  STATE.current = ex;
  let body = '';

  if(ex.kind === 'stress'){
    body = `
    <div class="q-prompt">${ex.prompt}</div>
    <div class="syll-row">
      ${ex.syllables.map((s,i)=>`<span class="syll-chip" data-i="${i}">${s}</span>`).join('')}
    </div>
    <div class="feedback" id="fb"></div>`;
  } else if(ex.kind === 'case_mcq' || ex.kind === 'role_mcq' || ex.kind === 'clause_mcq' || ex.kind === 'comp_match' || ex.kind === 'comp_nodeg'){
    const stimulus = ex.word ? `<div class="q-word">${ex.word}</div>` : (ex.latin ? `<div class="q-latin">${ex.latin}</div>` : '');
    body = `
    <div class="q-prompt">${ex.prompt}</div>
    ${stimulus}
    <div class="opt-list">
      ${ex.options.map((o,i)=>`<button class="opt-btn" data-opt="${i}">${o}</button>`).join('')}
    </div>
    <div class="feedback" id="fb"></div>`;
  } else if(ex.kind === 'error_spot'){
    body = `
    <div class="q-prompt">${ex.prompt}</div>
    <div class="opt-list">
      <button class="opt-btn" data-opt="true">✅ Σωστό</button>
      <button class="opt-btn" data-opt="false">❌ Λάθος</button>
    </div>
    <div class="feedback" id="fb"></div>`;
  } else if(ex.kind === 'comp_fill' || ex.kind === 'pp_fill'){
    body = `
    <div class="q-prompt">${ex.prompt}</div>
    <div class="q-word">${ex.word || ''}</div>
    <input type="text" id="fillInput" class="fill-input" placeholder="γράψε εδώ..." autocomplete="off" autocapitalize="off">
    <button class="btn-primary" id="checkFill">Έλεγχος</button>
    <div class="feedback" id="fb"></div>`;
  } else if(ex.kind === 'flash_g2l' || ex.kind === 'flash_l2g'){
    body = `
    <div class="q-prompt">${ex.prompt}</div>
    <div class="flashcard" id="flashcard">
      <div class="flash-front">${ex.front}</div>
      <div class="flash-back" style="display:none">${ex.back}</div>
    </div>
    <button class="btn-secondary" id="flipBtn">🔄 Αποκάλυψη</button>
    <div class="self-rate" id="selfRate" style="display:none">
      <button class="rate-btn bad" data-good="false">😖 Δεν το ήξερα</button>
      <button class="rate-btn good" data-good="true">😎 Το ήξερα</button>
    </div>`;
  }

  $app.innerHTML = `
  <header class="topbar session-top">
    <button class="back-btn" id="exitSession">✕</button>
    ${progressBarHTML()}
  </header>
  <div class="session-body">${body}</div>
  `;

  wireSessionHandlers(ex);
}

function wireSessionHandlers(ex){
  document.getElementById('exitSession').onclick = ()=>{ STATE.screen='lesson'; render(); };

  if(ex.kind === 'stress'){
    let chosen = null;
    document.querySelectorAll('.syll-chip').forEach(chip=>{
      chip.onclick = ()=>{
        if(chosen !== null) return;
        chosen = parseInt(chip.dataset.i,10);
        const isCorrect = chosen === ex.answerIndex;
        document.querySelectorAll('.syll-chip')[ex.answerIndex].classList.add('correct-chip');
        if(!isCorrect) chip.classList.add('wrong-chip');
        showFeedback(isCorrect, ex.reason);
        finishAnswer(ex, isCorrect);
      };
    });
  }

  if(['case_mcq','role_mcq','clause_mcq','comp_match','comp_nodeg'].includes(ex.kind)){
    document.querySelectorAll('.opt-btn').forEach(btn=>{
      btn.onclick = ()=>{
        if(btn.disabled) return;
        document.querySelectorAll('.opt-btn').forEach(b=>b.disabled=true);
        const chosen = ex.options[parseInt(btn.dataset.opt,10)];
        const isCorrect = chosen === ex.answer;
        btn.classList.add(isCorrect ? 'correct-opt' : 'wrong-opt');
        if(!isCorrect){
          document.querySelectorAll('.opt-btn').forEach(b=>{ if(b.textContent===ex.answer) b.classList.add('correct-opt'); });
        }
        let extra = '';
        if(ex.kind === 'clause_mcq'){
          extra = `Σωστό: ${ex.answer}. ` + (ex.intro?`Εισαγωγή: ${ex.intro}. `:'') + (ex.mood?`Έγκλιση: ${ex.mood}.`:'');
        } else if(ex.kind === 'case_mcq'){
          extra = `Σωστό: «${ex.word}» = ${ex.answer}. `;
          const roleHit = (DATA.role_bank[ex.lectio]||[]).find(r=>r.word===ex.word);
          if(roleHit) extra += `Ρόλος στην πρόταση: ${roleHit.role}.`;
        } else if(ex.kind === 'role_mcq'){
          extra = `Ο σωστός ρόλος εξηγείται από τη σύνταξη της πρότασης: «${ex.answer}».`;
        } else if(ex.kind === 'comp_match'){
          extra = `Αυτή είναι η ακριβής μετάφραση από το ίδιο το κείμενο του lectio.`;
        } else if(ex.kind === 'comp_nodeg'){
          extra = `Κανόνας: επίθετα/μετοχές με σημασία ήδη "ακραία" ή μόνιμη ιδιότητα συχνά δεν σχηματίζουν παραθετικά — το επισημαίνει ρητά η Γραμματική.`;
        }
        showFeedback(isCorrect, extra);
        finishAnswer(ex, isCorrect);
      };
    });
  }

  if(ex.kind === 'error_spot'){
    document.querySelectorAll('.opt-btn').forEach(btn=>{
      btn.onclick = ()=>{
        if(btn.disabled) return;
        document.querySelectorAll('.opt-btn').forEach(b=>b.disabled=true);
        const said = btn.dataset.opt === 'true';
        const isCorrect = said === ex.isCorrect;
        btn.classList.add(isCorrect ? 'correct-opt':'wrong-opt');
        const explain = ex.isCorrect
          ? `Η ετικέτα ήταν ήδη ορθή: «${ex.word}» = ${ex.correctLabel}.`
          : `Λάθος ετικέτα. Η λέξη «${ex.word}» στο πραγματικό κείμενο είναι ${ex.correctLabel}, όχι «${ex.shown}». Πάντα έλεγξε την κατάληξη της λέξης προσεκτικά πριν αποφασίσεις.`;
        showFeedback(isCorrect, explain);
        finishAnswer(ex, isCorrect);
      };
    });
  }

  if(ex.kind === 'comp_fill' || ex.kind === 'pp_fill'){
    document.getElementById('checkFill').onclick = ()=>{
      const val = document.getElementById('fillInput').value.trim().toLowerCase();
      let isCorrect = false, msg = '';
      if(ex.kind === 'comp_fill'){
        isCorrect = val.includes(ex.answerComp.toLowerCase().split(/[,\-]/)[0].trim());
        msg = `Συγκριτικός: ${ex.answerComp} · Υπερθετικός: ${ex.answerSup}`;
      } else {
        isCorrect = val === ex.answer.toLowerCase();
        msg = `Σωστό: ${ex.answer} (πλήρης τύπος: ${ex.full})`;
      }
      document.getElementById('checkFill').disabled = true;
      document.getElementById('fillInput').disabled = true;
      showFeedback(isCorrect, msg);
      finishAnswer(ex, isCorrect);
    };
    document.getElementById('fillInput').addEventListener('keydown', e=>{
      if(e.key === 'Enter') document.getElementById('checkFill').click();
    });
  }

  if(ex.kind === 'flash_g2l' || ex.kind === 'flash_l2g'){
    document.getElementById('flipBtn').onclick = ()=>{
      document.querySelector('.flash-back').style.display='block';
      document.getElementById('flipBtn').style.display='none';
      document.getElementById('selfRate').style.display='flex';
    };
    document.querySelectorAll('.rate-btn').forEach(btn=>{
      btn.onclick = ()=>{
        const good = btn.dataset.good === 'true';
        finishAnswer(ex, good);
        nextQuestion();
      };
    });
  }
}

function showFeedback(isCorrect, extra){
  const fb = document.getElementById('fb');
  if(!fb) return;
  fb.innerHTML = `<div class="fb-box ${isCorrect?'fb-good':'fb-bad'}">${isCorrect?'✅ Σωστό!':'❌ Λάθος.'} ${extra||''}</div>
  <button class="btn-primary" id="nextBtn">Συνέχεια →</button>`;
  document.getElementById('nextBtn').onclick = nextQuestion;
}

function finishAnswer(ex, isCorrect){
  if(isCorrect) STATE.correct++;
  recordAnswer(ex.kind, ex.lectio, ex.id, isCorrect);
  STATE.xp = addXP(isCorrect ? 10 : 2);
}

function nextQuestion(){
  STATE.idx++;
  if(STATE.idx >= STATE.queue.length){
    STATE.screen = 'results';
  }
  render();
}

function renderResults(){
  const total = STATE.queue.length;
  const pct = Math.round(100*STATE.correct/total);
  $app.innerHTML = `
  <div class="results-screen">
    <div class="results-emoji">${pct>=80?'🏆':pct>=50?'👍':'💪'}</div>
    <h2>${pct}% σωστές</h2>
    <p>${STATE.correct} / ${total} σωστές απαντήσεις</p>
    <p class="xp-gain">⭐ +${STATE.correct*10 + (total-STATE.correct)*2} XP</p>
    <button class="btn-primary" id="continueBtn">Συνέχεια</button>
  </div>`;
  document.getElementById('continueBtn').onclick = ()=>{ STATE.screen='lesson'; render(); };
}

function renderMemory(){
  const stats = allMemStats();
  let html = `
  <header class="topbar">
    <button class="back-btn" id="backHome2">←</button>
    <div class="brand">🧠 Μνήμη</div>
  </header>
  <div class="memory-stats">
    <div class="mem-stat"><div class="mem-num">${stats.total}</div><div class="mem-lbl">Συνολικά στοιχεία</div></div>
    <div class="mem-stat"><div class="mem-num">${stats.dueCount}</div><div class="mem-lbl">Προς επανάληψη τώρα</div></div>
  </div>
  <div class="boxes-row">
    ${stats.boxes.map((c,i)=>`<div class="box-pill box-${i}">Κουτί ${i}<br><b>${c}</b></div>`).join('')}
  </div>
  <p class="mem-explain">Σύστημα Leitner: κάθε σωστή απάντηση προωθεί το στοιχείο σε επόμενο κουτί (μεγαλύτερο διάστημα επανάληψης). Κάθε λάθος το γυρίζει στο Κουτί 0 (άμεση επανάληψη).</p>
  <button class="btn-primary" id="reviewDueBtn">🔁 Επανάληψη όλων όσων εκκρεμούν</button>
  `;
  $app.innerHTML = html;
  document.getElementById('backHome2').onclick = ()=>{ STATE.screen='home'; render(); };
  document.getElementById('reviewDueBtn').onclick = ()=>{
    // build a mixed queue across all lectios, prioritizing variety
    const queue = [];
    let attempts = 0;
    while(queue.length < 12 && attempts < 200){
      attempts++;
      const lec = sample(LECTIO_NUMS);
      const t = sample(EXERCISE_TYPES);
      const ex = generateExercise(t.key, lec);
      if(ex) queue.push(ex);
    }
    if(!queue.length){ alert('Δεν υπάρχουν ακόμη στοιχεία.'); return; }
    STATE.screen='session'; STATE.queue=queue; STATE.idx=0; STATE.correct=0; STATE.lectio='mixed'; STATE.typeKey='mix';
    render();
  };
}

render();
