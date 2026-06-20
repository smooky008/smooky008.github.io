/* ============================================================
   LATINA — exercise generators + memory engine
   All content sourced from DATA (real lectio extraction). No invented Latin/Greek.
   ============================================================ */

const LECTIO_NUMS = Object.keys(DATA.titles).map(Number).sort((a,b)=>a-b);

function pick(arr, n){
  const copy = arr.slice();
  const out = [];
  while(copy.length && out.length < n){
    const i = Math.floor(Math.random()*copy.length);
    out.push(copy.splice(i,1)[0]);
  }
  return out;
}
function sample(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function shuffle(arr){ return pick(arr, arr.length); }

/* ---------------- LEITNER MEMORY ENGINE ---------------- */
const BOX_INTERVAL_MIN = [0, 15, 60, 240, 1440]; // minutes: immediate, 15m, 1h, 4h, 1 day
function memKey(type, lectio, id){ return `mem:${type}:${lectio}:${id}`; }
function getMem(key){
  try{ const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : {box:0, due:0, seen:0, correct:0}; }
  catch(e){ return {box:0, due:0, seen:0, correct:0}; }
}
function setMem(key, m){ try{ localStorage.setItem(key, JSON.stringify(m)); }catch(e){} }
function recordAnswer(type, lectio, id, isCorrect){
  const key = memKey(type, lectio, id);
  const m = getMem(key);
  m.seen = (m.seen||0) + 1;
  if(isCorrect){
    m.correct = (m.correct||0)+1;
    m.box = Math.min(4, (m.box||0)+1);
  } else {
    m.box = 0;
  }
  m.due = Date.now() + BOX_INTERVAL_MIN[m.box]*60000;
  setMem(key, m);
  return m;
}
function isDue(type, lectio, id){
  const m = getMem(memKey(type, lectio, id));
  return Date.now() >= (m.due||0);
}
function allMemStats(){
  let total=0, boxes=[0,0,0,0,0], dueCount=0;
  for(let i=0;i<localStorage.length;i++){
    const k = localStorage.key(i);
    if(k && k.startsWith('mem:')){
      total++;
      const m = getMem(k);
      boxes[m.box||0]++;
      if(Date.now() >= (m.due||0)) dueCount++;
    }
  }
  return {total, boxes, dueCount};
}

/* ---------------- TYPE 1: ΤΟΝΙΣΜΟΣ (stress) — algorithmic ---------------- */
const VOWELS = 'aeiouAEIOUāēīōūăĕĭŏŭ';
const LONG_VOWELS = 'āēīōūĀĒĪŌŪ';
const DIPHTHONGS = ['ae','au','oe','ei','eu','ui'];
function syllabify(word){
  // crude syllable splitter on vowel nuclei groups
  const w = word.toLowerCase();
  const syll = [];
  let cur = '';
  let i = 0;
  while(i < w.length){
    cur += w[i];
    let isVowel = VOWELS.includes(w[i]);
    if(isVowel){
      // check diphthong
      if(i+1 < w.length && DIPHTHONGS.includes(w[i]+w[i+1])){
        cur += w[i+1]; i++;
      }
      // consume following consonants up to next vowel (keep with this syllable per Latin rule: V.CV or VC.CV)
      let j = i+1;
      let consonants = '';
      while(j < w.length && !VOWELS.includes(w[j])){ consonants += w[j]; j++; }
      if(consonants.length <= 1){
        // single consonant goes to NEXT syllable
        syll.push(cur); cur = '';
      } else {
        // split: first consonant stays, rest go to next syllable
        cur += consonants[0];
        syll.push(cur); cur = '';
        i = i + consonants.length - 1; // we'll add rest via main loop continuing
        i++;
        continue;
      }
      i++;
    } else {
      i++;
    }
  }
  if(cur) syll.push(cur);
  return syll.filter(s=>s.length>0);
}
function stressRule(word){
  const syll = syllabify(word);
  const n = syll.length;
  if(n <= 1) return {syllables:syll, stressIndex:0, reason:"Μονοσύλλαβη λέξη — τονίζεται στη μόνη συλλαβή."};
  if(n === 2) return {syllables:syll, stressIndex:0, reason:"Δισύλλαβη λέξη — τονίζεται πάντα στην παραλήγουσα."};
  const penult = syll[n-2];
  // heuristic: penult is "long" if it contains a long-marked vowel, a diphthong, or is followed by 2+ consonants (closed by position)
  const hasLongMark = [...penult].some(ch=>LONG_VOWELS.includes(ch));
  const hasDiphthong = DIPHTHONGS.some(d=>penult.includes(d));
  const closedByPosition = /[^aeiouAEIOUāēīōūăĕĭŏŭ]{2,}$/.test(penult) || (syll[n-1] && /^[^aeiouAEIOUāēīōūăĕĭŏŭ]/.test(syll[n-1]) && /[^aeiouAEIOUāēīōūăĕĭŏŭ]$/.test(penult));
  const longPenult = hasLongMark || hasDiphthong || closedByPosition;
  if(longPenult){
    return {syllables:syll, stressIndex:n-2, reason:"Η παραλήγουσα είναι μακρά (θέσει ή φύσει) → τονίζεται εκεί."};
  }
  return {syllables:syll, stressIndex:n-3, reason:"Η παραλήγουσα είναι βραχεία → ο τόνος ανεβαίνει στην προπαραλήγουσα."};
}
function genStressExercise(lectioNum){
  const pool = (DATA.case_bank[lectioNum]||[]).map(x=>x.word).filter(w=>w.length>3);
  if(!pool.length) return null;
  const word = sample(pool);
  const r = stressRule(word);
  return {
    kind: 'stress',
    lectio: lectioNum,
    id: word,
    prompt: `Πού τονίζεται η λέξη;`,
    word: word,
    syllables: r.syllables,
    answerIndex: r.stressIndex,
    reason: r.reason,
  };
}

/* ---------------- TYPE 2: ΠΤΩΣΗ / ΑΡΙΘΜΟΣ (case identification, MCQ) ---------------- */
function genCaseExercise(lectioNum){
  const pool = DATA.case_bank[lectioNum]||[];
  if(pool.length < 4) return null;
  const target = sample(pool);
  const correct = `${target.case} ${target.number}`;
  let distractorPool = pool.filter(p => `${p.case} ${p.number}` !== correct);
  let distractors = shuffle([...new Set(distractorPool.map(p=>`${p.case} ${p.number}`))]).slice(0,3);
  while(distractors.length < 3){
    const cases = ["ονομαστική","γενική","δοτική","αιτιατική","αφαιρετική"];
    const nums = ["ενικού","πληθυντικού"];
    const fake = `${sample(cases)} ${sample(nums)}`;
    if(fake !== correct && !distractors.includes(fake)) distractors.push(fake);
  }
  const options = shuffle([correct, ...distractors]);
  return {
    kind: 'case_mcq',
    lectio: lectioNum,
    id: target.word,
    prompt: `Σε ποια πτώση/αριθμό βρίσκεται η λέξη;`,
    word: target.word,
    options,
    answer: correct,
  };
}

/* ---------------- TYPE 3: ΠΑΡΑΘΕΤΙΚΑ (comparison degrees) ---------------- */
function genComparisonExercise(){
  const pool = DATA.comparisons||[];
  const nodeg = DATA.no_degree||[];
  if(Math.random() < 0.35 && nodeg.length){
    const item = sample(nodeg);
    const decoy = sample(pool);
    const options = shuffle([
      {label:"Δεν σχηματίζει παραθετικά", correct:true},
      {label:`Συγκριτικός: ${decoy?decoy.comparative:'—'}`, correct:false},
    ]);
    return {kind:'comp_nodeg', lectio:item.lectio, id:item.word,
      prompt:`Ποια είναι η αλήθεια για τον συγκριτικό/υπερθετικό βαθμό της λέξης;`,
      word:item.word, options, answer:"Δεν σχηματίζει παραθετικά"};
  }
  if(!pool.length) return null;
  const item = sample(pool);
  return {kind:'comp_fill', lectio:item.lectio, id:item.word,
    prompt:`Γράψε τον συγκριτικό και υπερθετικό βαθμό:`,
    word:item.word, answerComp:item.comparative, answerSup:item.superlative};
}

/* ---------------- TYPE 4a: ΣΥΝΤΑΚΤΙΚΟ ΛΑΘΟΣ (error spotting) ---------------- */
const CASE_SWAPS = {
  "ονομαστική":"αιτιατική", "αιτιατική":"γενική", "γενική":"αφαιρετική",
  "δοτική":"αιτιατική", "αφαιρετική":"γενική"
};
function genErrorSpotExercise(lectioNum){
  // Build a short real clause from syntax/role bank, present it as-is (CORRECT), ask user to confirm it's correct
  // OR present a case-tag mismatch flashcard: show word + a WRONG case label, ask to identify it's wrong + give right one.
  const pool = DATA.case_bank[lectioNum]||[];
  if(pool.length < 2) return null;
  const item = sample(pool);
  const wrongCase = CASE_SWAPS[item.case] || sample(["ονομαστική","γενική","δοτική","αιτιατική","αφαιρετική"].filter(c=>c!==item.case));
  const showWrong = Math.random() < 0.6;
  const shownLabel = showWrong ? `${wrongCase} ${item.number}` : `${item.case} ${item.number}`;
  return {
    kind: 'error_spot',
    lectio: lectioNum,
    id: item.word,
    prompt: `Η λέξη "${item.word}" αναγνωρίζεται ως «${shownLabel}». Είναι σωστό;`,
    word: item.word,
    shown: shownLabel,
    isCorrect: !showWrong,
    correctLabel: `${item.case} ${item.number}`,
  };
}

/* ---------------- TYPE 5: ΣΥΝΤΑΚΤΙΚΗ ΑΝΑΓΝΩΡΙΣΗ (syntactic role) ---------------- */
function genRoleExercise(lectioNum){
  const pool = DATA.role_bank[lectioNum]||[];
  if(pool.length < 4) return null;
  const target = sample(pool);
  const others = pool.filter(p=>p.role !== target.role);
  const distractors = shuffle([...new Set(others.map(p=>p.role))]).slice(0,3);
  const options = shuffle([target.role, ...distractors]);
  if(options.length < 2) return null;
  return {
    kind: 'role_mcq',
    lectio: lectioNum,
    id: target.word,
    prompt: `Ποιος είναι ο συντακτικός ρόλος της λέξης;`,
    word: target.word,
    options,
    answer: target.role,
  };
}

/* ---------------- TYPE 6: ΔΕΥΤΕΡΕΥΟΥΣΑ ΠΡΟΤΑΣΗ (clause identification) ---------------- */
function genClauseExercise(lectioNum){
  const pool = DATA.clause_bank[lectioNum]||[];
  if(!pool.length) return null;
  const item = sample(pool);
  const allTypes = ["χρονική","αιτιολογική","τελική","βουλητική","εναντιωματική","υποθετική","αναφορική","πλάγια ερωτηματική","συμπερασματική","αποτελεσματική"];
  const distractors = shuffle(allTypes.filter(t=>t!==item.type_guess)).slice(0,3);
  const options = shuffle([item.type_guess, ...distractors]);
  return {
    kind: 'clause_mcq',
    lectio: lectioNum,
    id: item.latin.slice(0,30),
    prompt: `Τι είδους δευτερεύουσα πρόταση είναι;`,
    latin: item.latin,
    options,
    answer: item.type_guess,
    intro: item.intro_guess,
    mood: item.mood_guess,
  };
}

/* ---------------- TYPE 7: ΡΗΜΑΤΙΚΟΙ ΤΥΠΟΙ / ΑΡΧΙΚΟΙ ΧΡΟΝΟΙ ---------------- */
function genPrincipalPartsExercise(){
  const pool = DATA.principal_parts||[];
  if(!pool.length) return null;
  const item = sample(pool);
  const mode = Math.random() < 0.5 ? 'pp2' : 'pp3';
  return {
    kind: 'pp_fill',
    lectio: item.lectio,
    id: item.word+item.pp1,
    prompt: mode === 'pp2'
      ? `Δίνεται το ρήμα «${item.pp1}» (ενεστώτας). Γράψε τον παρακείμενο:`
      : `Δίνεται το ρήμα «${item.pp1}» (ενεστώτας). Γράψε το supine/σουπίνο:`,
    answer: mode === 'pp2' ? item.pp2 : item.pp3,
    full: `${item.pp1}, ${item.pp2}, ${item.pp3}, ${item.pp4}`,
  };
}

/* Helper: lectios with usable sentence-pair data (alignment succeeded) */
const LECTIOS_WITH_PAIRS = LECTIO_NUMS.filter(n => (DATA.pairs_bank[n]||[]).length >= 2);
function pairsForLectioOrFallback(lectioNum){
  const direct = DATA.pairs_bank[lectioNum]||[];
  if(direct.length >= 2) return {pairs: direct, lectio: lectioNum, fallback:false};
  if(LECTIOS_WITH_PAIRS.length){
    const fb = sample(LECTIOS_WITH_PAIRS);
    return {pairs: DATA.pairs_bank[fb], lectio: fb, fallback:true};
  }
  return {pairs: [], lectio: lectioNum, fallback:false};
}

/* ---------------- TYPE 8: ΚΑΤΑΝΟΗΣΗ (comprehension, from real translation only) ---------------- */
function genComprehensionExercise(lectioNum){
  const r = pairsForLectioOrFallback(lectioNum);
  const pairs = r.pairs; lectioNum = r.lectio;
  if(pairs.length < 2) return null;
  const target = sample(pairs);
  const others = pairs.filter(p=>p!==target);
  const distractor = sample(others.length?others:pairs);
  const options = shuffle([target.greek, distractor.greek]);
  return {
    kind: 'comp_match',
    lectio: lectioNum,
    id: target.latin.slice(0,30),
    prompt: `Ποια είναι η σωστή μετάφραση αυτής της πρότασης;`,
    latin: target.latin,
    options,
    answer: target.greek,
  };
}

/* ---------------- TYPE 9: ΘΕΜΑΤΟΓΡΑΦΙΑ (Greek→Latin recall, flashcard) ---------------- */
function genGreekToLatinExercise(lectioNum){
  const r = pairsForLectioOrFallback(lectioNum);
  const pairs = r.pairs; lectioNum = r.lectio;
  if(!pairs.length) return null;
  const item = sample(pairs);
  return {
    kind: 'flash_g2l',
    lectio: lectioNum,
    id: item.latin.slice(0,30),
    prompt: `Μετάφερε στα Λατινικά:`,
    front: item.greek,
    back: item.latin,
  };
}

/* ---------------- TYPE 10: ΑΝΤΙΣΤΡΟΦΟ (Latin→Greek recall, flashcard) ---------------- */
function genLatinToGreekExercise(lectioNum){
  const r = pairsForLectioOrFallback(lectioNum);
  const pairs = r.pairs; lectioNum = r.lectio;
  if(!pairs.length) return null;
  const item = sample(pairs);
  return {
    kind: 'flash_l2g',
    lectio: lectioNum,
    id: item.latin.slice(0,30)+'_rev',
    prompt: `Μετάφερε στα Ελληνικά:`,
    front: item.latin,
    back: item.greek,
  };
}

const EXERCISE_TYPES = [
  {n:1, key:'stress', label:'Τονισμός', icon:'🎯', gen: (lec)=>genStressExercise(lec)},
  {n:2, key:'case', label:'Πτώση & Αριθμός', icon:'🔤', gen: (lec)=>genCaseExercise(lec)},
  {n:3, key:'comp', label:'Παραθετικά', icon:'📈', gen: (lec)=>genComparisonExercise()},
  {n:4, key:'error', label:'Συντακτικό Λάθος', icon:'🚩', gen: (lec)=>genErrorSpotExercise(lec)},
  {n:5, key:'role', label:'Συντακτική Αναγνώριση', icon:'🧩', gen: (lec)=>genRoleExercise(lec)},
  {n:6, key:'clause', label:'Δευτερεύουσα Πρόταση', icon:'🌿', gen: (lec)=>genClauseExercise(lec)},
  {n:7, key:'verb', label:'Αρχικοί Χρόνοι', icon:'⚙️', gen: (lec)=>genPrincipalPartsExercise()},
  {n:8, key:'comprehend', label:'Κατανόηση', icon:'📖', gen: (lec)=>genComprehensionExercise(lec)},
  {n:9, key:'g2l', label:'Θεματογραφία (Ελλ→Λατ)', icon:'✍️', gen: (lec)=>genGreekToLatinExercise(lec)},
  {n:10, key:'l2g', label:'Αντίστροφο (Λατ→Ελλ)', icon:'🔄', gen: (lec)=>genLatinToGreekExercise(lec)},
];

function generateExercise(typeKey, lectioNum, attempts=8){
  const t = EXERCISE_TYPES.find(x=>x.key===typeKey);
  if(!t) return null;
  for(let i=0;i<attempts;i++){
    const ex = t.gen(lectioNum);
    if(ex) return ex;
  }
  return null;
}
