'use strict';
// ============================================================
//  app.js — Exam Platform — Full Logic
// ============================================================

// ── Global state ─────────────────────────────────────────────
var currentExam             = null;
var examTimer               = null;
var timerEndAt              = null;
var studentInfo             = null;
var studentAnswers          = {};
var currentExamForResponses = null;
var ceStep                  = 1;
var ceQuestions             = [];

// ═══════════════════════════════════════════════════════════
// View switching
// ═══════════════════════════════════════════════════════════
function show(viewId) {
  document.querySelectorAll('.view').forEach(function(v) { v.classList.remove('active'); });
  var el = document.getElementById(viewId);
  if (el) el.classList.add('active');
}

function showAdminTab(tabId) {
  document.querySelectorAll('.admin-subview').forEach(function(v) { v.classList.remove('active'); });
  document.querySelectorAll('.nav-link').forEach(function(v) { v.classList.remove('active'); });
  var view = document.getElementById(tabId + '-view');
  var link = document.getElementById(tabId);
  if (view) view.classList.add('active');
  if (link) link.classList.add('active');
}

// ═══════════════════════════════════════════════════════════
// Setup wizard
// ═══════════════════════════════════════════════════════════
function switchSetupTab(tab) {
  document.querySelectorAll('.setup-tab').forEach(function(el, i) {
    el.classList.toggle('active', (i === 0 && tab === 'paste') || (i === 1 && tab === 'manual'));
  });
  document.querySelectorAll('.setup-panel').forEach(function(p) { p.classList.remove('active'); });
  var panel = document.getElementById('tab-' + tab);
  if (panel) panel.classList.add('active');
}

function saveSetup() {
  var alertEl = document.getElementById('setup-alert');
  var cfg;
  var pastePanel = document.getElementById('tab-paste');
  if (pastePanel && pastePanel.classList.contains('active')) {
    var snippet = document.getElementById('paste-snippet').value.trim();
    cfg = parseFirebaseSnippet(snippet);
  } else {
    cfg = {
      apiKey:            document.getElementById('m-apiKey').value.trim(),
      authDomain:        document.getElementById('m-authDomain').value.trim(),
      projectId:         document.getElementById('m-projectId').value.trim(),
      storageBucket:     document.getElementById('m-storageBucket').value.trim(),
      messagingSenderId: document.getElementById('m-messagingSenderId').value.trim(),
      appId:             document.getElementById('m-appId').value.trim(),
      databaseURL:       '',
    };
  }
  if (!cfg || !cfg.apiKey) {
    alertEl.className = 'setup-alert error';
    alertEl.textContent = '❌ الكود غير مكتمل — تأكد من نسخ كامل الكود';
    return;
  }
  if (!cfg.databaseURL) {
    alertEl.className = 'setup-alert error';
    alertEl.textContent = '❌ لم يُعثر على databaseURL — تأكد من تفعيل Realtime Database';
    return;
  }
  if (saveConfig(cfg)) {
    alertEl.className = 'setup-alert success';
    alertEl.textContent = '✅ تم الحفظ — جاري إعادة التحميل...';
    setTimeout(function() { location.reload(); }, 1200);
  }
}

function parseFirebaseSnippet(snippet) {
  try {
    var obj = {};
    var re = /(\w+)\s*:\s*["']([^"']+)["']/g;
    var m;
    while ((m = re.exec(snippet)) !== null) { obj[m[1]] = m[2]; }
    return obj.apiKey ? obj : null;
  } catch(e) { return null; }
}

function resetSetup() {
  if (!confirm('إعادة إعداد Firebase؟ سيتم مسح الإعدادات الحالية.')) return;
  clearConfig();
  location.reload();
}

// ═══════════════════════════════════════════════════════════
// Admin trigger — triple click on dot
// ═══════════════════════════════════════════════════════════
(function() {
  var clicks = 0, timer = null;
  var trigger = document.getElementById('admin-trigger');
  if (!trigger) return;
  trigger.addEventListener('click', function() {
    clicks++;
    clearTimeout(timer);
    timer = setTimeout(function() { clicks = 0; }, 800);
    if (clicks >= 3) { clicks = 0; showAdminLogin(); }
  });
})();

function showAdminLogin() {
  show('view-admin-login');
  var emailEl = document.getElementById('login-email');
  if (emailEl) emailEl.focus();
}

// ═══════════════════════════════════════════════════════════
// Admin auth
// ═══════════════════════════════════════════════════════════
function adminLogin() {
  var email    = document.getElementById('login-email').value.trim();
  var password = document.getElementById('login-pass').value;
  var alertEl  = document.getElementById('login-alert');
  var btn      = document.getElementById('login-btn');

  if (!email || !password) { showErr(alertEl, 'يرجى إدخال البريد وكلمة المرور'); return; }

  btn.disabled    = true;
  btn.textContent = '...جاري الدخول';

  signIn(email, password).then(function() {
    alertEl.classList.add('hidden');
    openAdminDash();
  }).catch(function() {
    showErr(alertEl, '❌ بيانات غير صحيحة — تحقق من البريد وكلمة المرور');
    btn.disabled    = false;
    btn.textContent = 'دخول';
  });
}

function adminLogout() {
  signOut().then(function() { stopTimer(); show('view-home'); });
}

function openAdminDash() {
  show('view-admin');
  showAdminTab('tab-exams');
  loadAdminExams();
}

// ═══════════════════════════════════════════════════════════
// Create exam — Step 1 validation
// ═══════════════════════════════════════════════════════════
function showCreateExam() {
  ceStep = 1; ceQuestions = [];
  var ids = ['ce-title','ce-subject','ce-start'];
  ids.forEach(function(id) { var el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('ce-grade').value         = '';
  document.getElementById('ce-duration').value      = '60';
  document.getElementById('ce-qcount-mcq').value    = '10';
  document.getElementById('ce-qcount-tf').value     = '0';
  document.getElementById('ce-qcount-essay').value  = '0';
  document.getElementById('ce-access-type').value   = 'open';
  if (typeof selectAccessType === 'function') selectAccessType('open');
  ['ce-alert1','ce-alert2','ce-alert3'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) { el.classList.add('hidden'); el.style.display=''; }
  });
  updateStepDots();
  showAdminTab('tab-create');
}

function nextStep() {
  if (ceStep === 1) {
    if (!validateStep1()) return;
    buildQuestionsBuilder();
    ceStep = 2;
  } else if (ceStep === 2) {
    if (!collectQuestions()) return;
    buildPreview();
    if (typeof prepareStep3 === 'function') prepareStep3();
    ceStep = 3;
  }
  updateStepDots();
}

function prevStep() {
  if (ceStep > 1) ceStep--;
  updateStepDots();
}

function updateStepDots() {
  for (var i = 1; i <= 3; i++) {
    var step = document.getElementById('ce-step' + i);
    if (step) step.classList.toggle('active', i === ceStep);
  }
  document.querySelectorAll('.step-dot').forEach(function(dot, i) {
    dot.classList.toggle('active', i + 1 === ceStep);
    dot.classList.toggle('done',   i + 1 <  ceStep);
  });
}

function validateStep1() {
  var alertEl = document.getElementById('ce-alert1');
  var title   = document.getElementById('ce-title').value.trim();
  var subject = document.getElementById('ce-subject').value.trim();
  var mcq     = parseInt(document.getElementById('ce-qcount-mcq').value)   || 0;
  var tf      = parseInt(document.getElementById('ce-qcount-tf').value)    || 0;
  var essay   = parseInt(document.getElementById('ce-qcount-essay').value) || 0;
  if (!title)             { showErr(alertEl, 'يرجى إدخال عنوان الامتحان');         return false; }
  if (!subject)           { showErr(alertEl, 'يرجى إدخال اسم المادة');              return false; }
  if (!mcq && !tf && !essay) { showErr(alertEl, 'يرجى تحديد عدد الأسئلة');        return false; }
  alertEl.classList.add('hidden');
  return true;
}

// ═══════════════════════════════════════════════════════════
// Question builder — Step 2
// ═══════════════════════════════════════════════════════════
function buildQuestionsBuilder() {
  var mcq   = parseInt(document.getElementById('ce-qcount-mcq').value)   || 0;
  var tf    = parseInt(document.getElementById('ce-qcount-tf').value)    || 0;
  var essay = parseInt(document.getElementById('ce-qcount-essay').value) || 0;
  var html  = '';
  var n     = 1;

  if (mcq) {
    html += '<div class="qb-section-header"><strong>📋 اختياري (MCQ)</strong><span class="badge badge-primary">' + mcq + ' سؤال</span></div>';
    for (var i = 0; i < mcq; i++) html += mcqCard(n++, i);
  }
  if (tf) {
    html += '<div class="qb-section-header"><strong>✅ صح / خطأ</strong><span class="badge badge-primary">' + tf + ' سؤال</span></div>';
    for (var j = 0; j < tf; j++) html += tfCard(n++, j);
  }
  if (essay) {
    html += '<div class="qb-section-header"><strong>✏️ مقالي</strong><span class="badge badge-primary">' + essay + ' سؤال</span></div>';
    for (var k = 0; k < essay; k++) html += essayCard(n++, k);
  }
  document.getElementById('questions-builder').innerHTML = html;
}

/* ── حقل رابط الصورة الاختياري ── */
function imageField() {
  return '<div class="form-group" style="margin-top:6px">'
    + '<label style="font-size:.8rem;font-weight:600;color:#94a3b8">🖼️ رابط صورة للسؤال (اختياري)</label>'
    + '<input type="url" data-field="imageUrl" placeholder="https://example.com/image.jpg"'
    + ' style="padding:8px 10px;border:1.5px solid #e2e8f0;border-radius:6px;font-size:.85rem;width:100%;direction:ltr"></div>';
}

function mcqCard(n, idx) {
  var opts = ['أ','ب','ج','د'].map(function(ltr, oi) {
    return '<div class="option-row">'
      + '<input type="radio" name="mcq-ans-' + idx + '" value="' + oi + '">'
      + '<input type="text" placeholder="الخيار ' + ltr + '" data-opt="' + oi + '" data-mcq="' + idx + '">'
      + '</div>';
  }).join('');
  return '<div class="qb-card" data-type="mcq" data-idx="' + idx + '">'
    + '<div class="qb-card-header"><span class="question-num">سؤال ' + n + '</span>'
    + '<input type="number" value="1" min="1" max="100" data-field="marks" style="width:80px;padding:6px 10px;border:1.5px solid #e2e8f0;border-radius:6px;text-align:center" placeholder="درجة"></div>'
    + '<div class="form-group"><textarea data-field="text" placeholder="نص السؤال..." style="min-height:72px"></textarea></div>'
    + imageField()
    + opts + '</div>';
}

function tfCard(n, idx) {
  return '<div class="qb-card" data-type="tf" data-idx="' + idx + '">'
    + '<div class="qb-card-header"><span class="question-num">سؤال ' + n + '</span>'
    + '<input type="number" value="1" min="1" max="100" data-field="marks" style="width:80px;padding:6px 10px;border:1.5px solid #e2e8f0;border-radius:6px;text-align:center" placeholder="درجة"></div>'
    + '<div class="form-group"><textarea data-field="text" placeholder="نص السؤال..." style="min-height:72px"></textarea></div>'
    + imageField()
    + '<div style="display:flex;gap:14px;margin-top:8px">'
    + '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:700;color:#16a34a"><input type="radio" name="tf-ans-' + idx + '" value="true"> ✓ صح</label>'
    + '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:700;color:#dc2626"><input type="radio" name="tf-ans-' + idx + '" value="false"> ✗ خطأ</label>'
    + '</div></div>';
}

function essayCard(n, idx) {
  return '<div class="qb-card" data-type="essay" data-idx="' + idx + '">'
    + '<div class="qb-card-header"><span class="question-num">سؤال ' + n + '</span>'
    + '<input type="number" value="5" min="1" max="100" data-field="marks" style="width:80px;padding:6px 10px;border:1.5px solid #e2e8f0;border-radius:6px;text-align:center" placeholder="درجة"></div>'
    + '<div class="form-group"><textarea data-field="text" placeholder="نص السؤال..." style="min-height:72px"></textarea></div>'
    + imageField()
    + '<div class="form-group"><label style="font-size:.82rem;font-weight:600;color:#64748b">نموذج الإجابة (مخفي عن الطالب حتى التصحيح)</label>'
    + '<textarea data-field="answerKey" placeholder="نموذج الإجابة..." style="min-height:60px"></textarea></div>'
    + '</div>';
}

function collectQuestions() {
  var alertEl = document.getElementById('ce-alert2');
  ceQuestions  = [];
  var valid    = true;

  document.querySelectorAll('#questions-builder .qb-card').forEach(function(card) {
    var type  = card.dataset.type;
    var text  = (card.querySelector('[data-field="text"]').value || '').trim();
    var marks = parseInt(card.querySelector('[data-field="marks"]').value) || 1;
    if (!text) { valid = false; return; }

    var imgEl = card.querySelector('[data-field="imageUrl"]');
    var imageUrl = imgEl ? imgEl.value.trim() : '';

    if (type === 'mcq') {
      var opts = [];
      card.querySelectorAll('[data-opt]').forEach(function(inp) { opts.push(inp.value.trim()); });
      var radio = card.querySelector('input[type="radio"]:checked');
      var ans   = radio ? parseInt(radio.value) : -1;
      if (ans < 0 || opts.some(function(o) { return !o; })) { valid = false; return; }
      ceQuestions.push({ type:'mcq', text:text, options:opts, answer:ans, marks:marks, imageUrl:imageUrl });
    } else if (type === 'tf') {
      var tfR = card.querySelector('input[type="radio"]:checked');
      if (!tfR) { valid = false; return; }
      ceQuestions.push({ type:'tf', text:text, answer: tfR.value === 'true', marks:marks, imageUrl:imageUrl });
    } else if (type === 'essay') {
      var key = (card.querySelector('[data-field="answerKey"]').value || '').trim();
      ceQuestions.push({ type:'essay', text:text, answerKey:key, marks:marks, imageUrl:imageUrl });
    }
  });

  if (!valid || !ceQuestions.length) {
    showErr(alertEl, 'يرجى إكمال جميع الأسئلة وتحديد الإجابات الصحيحة');
    return false;
  }
  alertEl.classList.add('hidden');
  return true;
}

// ═══════════════════════════════════════════════════════════
// Step 3 — Preview & publish
// ═══════════════════════════════════════════════════════════
function buildPreview() {
  var total    = ceQuestions.reduce(function(s, q) { return s + q.marks; }, 0);
  var tMap     = { mcq:0, tf:0, essay:0 };
  ceQuestions.forEach(function(q) { tMap[q.type]++; });
  var parts = [];
  if (tMap.mcq)   parts.push(tMap.mcq   + ' اختياري');
  if (tMap.tf)    parts.push(tMap.tf    + ' صح/خطأ');
  if (tMap.essay) parts.push(tMap.essay + ' مقالي');

  document.getElementById('preview-qcount').textContent  = ceQuestions.length;
  document.getElementById('preview-total').textContent   = total;
  document.getElementById('preview-title').textContent   = document.getElementById('ce-title').value;
  document.getElementById('preview-subject').textContent = document.getElementById('ce-subject').value;
  document.getElementById('preview-types').textContent   = parts.join(' — ');
  var pacc = document.getElementById('preview-access');
  if (pacc) pacc.textContent = document.getElementById('ce-access-type').value === 'open' ? '🌐 مفتوح للجميع' : '🔒 طلاب مخصصين';
}

function publishExam() {
  var alertEl    = document.getElementById('ce-alert3');
  var btn        = document.getElementById('publish-btn');
  var accessType = document.getElementById('ce-access-type').value;
  var students   = [];

  if (accessType === 'restricted') {
    var rows = (typeof getEpStudentRows === 'function') ? getEpStudentRows() : [];
    students = rows.filter(function(s) { return s.username.trim() && s.password.trim(); });
    if (!students.length) {
      showErr(alertEl, 'يرجى إضافة بيانات دخول طالب واحد على الأقل');
      return;
    }
  }

  btn.disabled    = true;
  btn.textContent = '...جاري النشر';

  var examData = {
    title:       document.getElementById('ce-title').value.trim(),
    subject:     document.getElementById('ce-subject').value.trim(),
    grade:       document.getElementById('ce-grade').value,
    duration:    parseInt(document.getElementById('ce-duration').value) || 60,
    startAt:     document.getElementById('ce-start').value || null,
    accessType:  accessType,
    students:    students,
    questions:   ceQuestions,
    totalMarks:  ceQuestions.reduce(function(s, q) { return s + q.marks; }, 0),
    published:   true,
  };

  createExam(examData).then(function(examId) {
    var link = location.href.split('?')[0] + '?exam=' + examId;
    alertEl.className     = 'alert alert-success';
    alertEl.style.display = 'block';
    alertEl.innerHTML     = '✅ تم نشر الامتحان!<br>'
      + '<a href="' + link + '" target="_blank" style="color:#166534;font-weight:700;word-break:break-all">' + link + '</a>';
    btn.disabled    = false;
    btn.textContent = '🚀 نشر امتحان جديد';
    loadAdminExams();
  }).catch(function(err) {
    showErr(alertEl, 'خطأ أثناء النشر: ' + err.message);
    btn.disabled    = false;
    btn.textContent = '🚀 نشر الامتحان';
  });
}

// ═══════════════════════════════════════════════════════════
// Admin — Exams list
// ═══════════════════════════════════════════════════════════
function loadAdminExams() {
  var c = document.getElementById('exams-list');
  c.innerHTML = '<div class="loader"><div class="spinner"></div></div>';

  listExams().then(function(exams) {
    if (!exams.length) {
      c.innerHTML = '<div class="card text-center"><p class="text-muted">لا توجد امتحانات.</p>'
        + '<button class="btn btn-primary mt-8" onclick="showCreateExam()">+ إنشاء أول امتحان</button></div>';
      return;
    }
    c.innerHTML = exams.map(function(exam) {
      var link   = location.href.split('?')[0] + '?exam=' + exam.id;
      var badge  = exam.accessType === 'restricted'
        ? '<span class="badge badge-warning">🔒 مخصص</span>'
        : '<span class="badge badge-gray">🌐 مفتوح</span>';
      return '<div class="card-sm"><div class="flex-between" style="flex-wrap:wrap;gap:8px">'
        + '<div><strong>' + (exam.title||'—') + '</strong> ' + badge
        + '<div class="text-muted text-small" style="margin-top:3px">'
        + (exam.subject||'') + ' — ' + (exam.questions ? exam.questions.length : 0)
        + ' سؤال — ' + (exam.totalMarks||0) + ' درجة</div></div>'
        + '<div class="btn-group">'
        + '<button class="btn btn-outline btn-sm" onclick="copyExamLink(\'' + link + '\')">📋 الرابط</button>'
        + '<button class="btn btn-outline btn-sm" onclick="viewResults(\'' + exam.id + '\',\'' + (exam.title||'').replace(/'/g,"\\'") + '\')">📊 النتائج</button>'
        + '<button class="btn btn-danger btn-sm" onclick="delExam(\'' + exam.id + '\')">🗑️</button>'
        + '</div></div></div>';
    }).join('');
  }).catch(function(err) {
    c.innerHTML = '<div class="alert alert-error">خطأ: ' + err.message + '</div>';
  });
}

function copyExamLink(link) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(link).then(function() { alert('✅ تم نسخ الرابط'); }).catch(function() { prompt('الرابط:', link); });
  } else { prompt('الرابط:', link); }
}

function delExam(id) {
  if (!confirm('حذف الامتحان نهائياً؟')) return;
  deleteExam(id).then(function() { loadAdminExams(); });
}

function viewResults(examId, title) {
  currentExamForResponses = examId;
  var t = document.getElementById('responses-exam-title');
  if (t) t.textContent = title;
  showAdminTab('tab-results');
  loadResponses(examId);
  getExam(examId).then(function(exam) {
    var hasEssay = exam && exam.questions && exam.questions.some(function(q) { return q.type === 'essay'; });
    var essayTab = document.getElementById('tab-essay');
    if (essayTab) essayTab.classList.toggle('hidden', !hasEssay);
  });
}

// ═══════════════════════════════════════════════════════════
// Admin — Results
// ═══════════════════════════════════════════════════════════
function loadResponses(examId) {
  var c = document.getElementById('responses-container');
  c.innerHTML = '<div class="loader"><div class="spinner"></div></div>';
  var sort = document.getElementById('sort-select') ? document.getElementById('sort-select').value : 'name';

  getResponses(examId).then(function(responses) {
    var st = document.getElementById('stat-total');
    var ss = document.getElementById('stat-submitted');
    var sa = document.getElementById('stat-avg');
    if (st) st.textContent = responses.length;
    if (ss) ss.textContent = responses.filter(function(r) { return r.submittedOnTime !== false; }).length;
    var scored = responses.filter(function(r) { return typeof r.score === 'number'; });
    if (sa) sa.textContent = scored.length ? (scored.reduce(function(s,r) { return s+r.score; }, 0) / scored.length).toFixed(1) : '—';
    var expBtn = document.getElementById('export-btn');
    if (expBtn) expBtn.classList.toggle('hidden', !responses.length);

    responses.sort(function(a, b) {
      if (sort === 'score')   return (b.score||0) - (a.score||0);
      if (sort === 'name')    return (a.studentName||'').localeCompare(b.studentName||'');
      if (sort === 'grade')   return (a.studentGrade||'').localeCompare(b.studentGrade||'');
      if (sort === 'section') return (a.studentSection||'').localeCompare(b.studentSection||'');
      return 0;
    });

    if (!responses.length) {
      c.innerHTML = '<div class="card text-center"><p class="text-muted">لا توجد نتائج بعد.</p></div>';
      return;
    }
    c.innerHTML = '<div class="table-wrap"><table><thead><tr>'
      + '<th>الاسم</th><th>الفرقة</th><th>الشعبة</th><th>الدرجة</th><th>الحالة</th>'
      + '</tr></thead><tbody>'
      + responses.map(function(r) {
          var sc = typeof r.score === 'number' ? r.score + ' / ' + (r.totalMarks||'?') : '—';
          var ep = r.hasEssay && !r.essayGraded ? ' <span class="badge badge-warning">مقالي</span>' : '';
          var st2 = r.submittedOnTime !== false
            ? '<span class="badge badge-success">في الوقت</span>'
            : '<span class="badge badge-danger">متأخر</span>';
          return '<tr><td>' + (r.studentName||'—') + '</td><td>' + (r.studentGrade||'—')
            + '</td><td>' + (r.studentSection||'—') + '</td>'
            + '<td><strong>' + sc + '</strong>' + ep + '</td><td>' + st2 + '</td></tr>';
        }).join('')
      + '</tbody></table></div>';
  }).catch(function(err) {
    c.innerHTML = '<div class="alert alert-error">خطأ: ' + err.message + '</div>';
  });
}

function exportExcel() {
  if (!currentExamForResponses) return;
  getResponses(currentExamForResponses).then(function(responses) {
    var data = [['الاسم','الفرقة','الشعبة','رقم الجلوس','الدرجة','الإجمالي','الحالة']];
    responses.forEach(function(r) {
      data.push([r.studentName||'', r.studentGrade||'', r.studentSection||'',
        r.seatNumber||'', typeof r.score==='number'?r.score:'', r.totalMarks||'',
        r.submittedOnTime!==false?'في الوقت':'متأخر']);
    });
    if (typeof XLSX === 'undefined') { alert('مكتبة Excel غير محملة'); return; }
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), 'النتائج');
    XLSX.writeFile(wb, 'results.xlsx');
  });
}

// ═══════════════════════════════════════════════════════════
// Admin — Essay grading
// ═══════════════════════════════════════════════════════════
(function() {
  var essayTab = document.getElementById('tab-essay');
  if (essayTab) {
    essayTab.addEventListener('click', function() {
      if (currentExamForResponses) loadEssayGrading(currentExamForResponses);
    });
  }
})();

function loadEssayGrading(examId) {
  var c = document.getElementById('essay-grading-container');
  c.innerHTML = '<div class="loader"><div class="spinner"></div></div>';

  Promise.all([getExam(examId), getResponses(examId)]).then(function(res) {
    var exam = res[0], responses = res[1];
    if (!exam || !exam.questions) { c.innerHTML = '<p>لا توجد بيانات</p>'; return; }
    var essayQs = [];
    exam.questions.forEach(function(q, i) { if (q.type === 'essay') essayQs.push(Object.assign({}, q, {index:i})); });
    if (!essayQs.length) { c.innerHTML = '<p class="text-muted">لا توجد أسئلة مقالية</p>'; return; }

    var html = '';
    responses.forEach(function(r) {
      var allGraded = essayQs.every(function(q) {
        return r.essayScores && r.essayScores[q.index] !== undefined && r.essayScores[q.index] !== null;
      });
      html += '<div class="essay-grade-card">'
        + '<strong>' + (r.studentName||'طالب') + '</strong>'
        + (r.studentGrade ? ' — '+r.studentGrade : '')
        + (allGraded ? ' <span class="badge badge-success">✅ تم</span>' : ' <span class="badge badge-warning">⏳ منتظر</span>')
        + '<hr style="margin:10px 0;border-color:#e2e8f0">';

      essayQs.forEach(function(q) {
        var ans   = r.answers ? (r.answers[q.index] || '') : '';
        var score = r.essayScores ? r.essayScores[q.index] : null;
        html += '<div style="margin-bottom:14px">'
          + '<div class="text-small text-muted" style="margin-bottom:4px">📝 ' + q.text + ' (' + q.marks + ' درجة)</div>'
          + '<div class="essay-answer-text">' + (ans || '<em style="color:#94a3b8">لم يجب</em>') + '</div>'
          + (q.answerKey ? '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:8px 10px;margin-bottom:8px;font-size:.84rem">'
            + '<strong style="color:#166534">نموذج الإجابة:</strong><br>' + q.answerKey + '</div>' : '')
          + '<div class="grade-input-row">'
          + '<label style="font-size:.9rem;font-weight:600">الدرجة:</label>'
          + '<input type="number" id="es-' + r.id + '-' + q.index + '" min="0" max="' + q.marks + '"'
          + ' value="' + (score!==null&&score!==undefined?score:'') + '" placeholder="0-'+q.marks+'"'
          + ' style="width:90px;padding:8px;border:1.5px solid #e2e8f0;border-radius:6px;text-align:center">'
          + '<span class="text-muted text-small">/ '+q.marks+'</span>'
          + '<button class="btn btn-primary btn-sm" onclick="saveEssayScore(\''+r.id+'\','+q.index+','+q.marks+',\''+examId+'\')">حفظ</button>'
          + '</div></div>';
      });
      html += '</div>';
    });
    c.innerHTML = html || '<p class="text-muted">لا توجد إجابات</p>';
  }).catch(function(err) {
    c.innerHTML = '<div class="alert alert-error">خطأ: ' + err.message + '</div>';
  });
}

function saveEssayScore(responseId, qIdx, maxMarks, examId) {
  var inp   = document.getElementById('es-' + responseId + '-' + qIdx);
  var score = parseFloat(inp.value);
  if (isNaN(score) || score < 0 || score > maxMarks) {
    alert('يرجى إدخال درجة بين 0 و ' + maxMarks);
    return;
  }
  getResponses(examId).then(function(responses) {
    var r = responses.find(function(x) { return x.id === responseId; });
    if (!r) return;
    var es = Object.assign({}, r.essayScores || {});
    es[qIdx] = score;
    var essayTotal = Object.keys(es).reduce(function(s, k) { return s + (es[k]||0); }, 0);
    var total = (r.objectiveScore || 0) + essayTotal;

    getExam(examId).then(function(exam) {
      var essayQIdxs = [];
      exam.questions.forEach(function(q, i) { if (q.type==='essay') essayQIdxs.push(i); });
      var allGraded = essayQIdxs.every(function(i) { return es[i]!==undefined && es[i]!==null; });

      updateResponse(responseId, { essayScores:es, score:total, essayGraded:allGraded })
        .then(function() {
          inp.style.border = '2px solid #16a34a';
          setTimeout(function() { inp.style.border = ''; }, 1500);
        });
    });
  });
}

// ═══════════════════════════════════════════════════════════
// Student — Init from URL
// ═══════════════════════════════════════════════════════════
function initStudentMode(examId) {
  show('view-loading');
  getExam(examId).then(function(exam) {
    if (!exam) { show('view-not-found'); return; }
    currentExam = exam;

    if (exam.startAt) {
      var startMs = new Date(exam.startAt).getTime();
      if (Date.now() < startMs) { waitForExam(exam, startMs); return; }
    }
    showStudentLogin(exam);
  }).catch(function(err) {
    var d = document.getElementById('error-detail');
    if (d) { d.textContent = err.message; d.style.display = 'block'; }
    show('view-error');
  });
}

function waitForExam(exam, startMs) {
  show('view-waiting');
  var st = document.getElementById('wait-start-time');
  if (st) st.textContent = new Date(startMs).toLocaleTimeString('ar-EG');
  var iv = setInterval(function() {
    var rem = startMs - Date.now();
    if (rem <= 0) { clearInterval(iv); showStudentLogin(exam); return; }
    var h = Math.floor(rem/3600000), m = Math.floor((rem%3600000)/60000), s = Math.floor((rem%60000)/1000);
    var cd = document.getElementById('wait-countdown');
    if (cd) cd.textContent = pad(h)+':'+pad(m)+':'+pad(s);
  }, 1000);
}

function showStudentLogin(exam) {
  document.getElementById('exam-title-info').textContent    = exam.title    || 'الامتحان';
  document.getElementById('exam-subject-info').textContent  = exam.subject  || '';
  document.getElementById('exam-qcount-info').textContent   = (exam.questions||[]).length;
  document.getElementById('exam-duration-info').textContent = (exam.duration||60) + ' د';

  var access  = exam.accessType || 'open';
  var openEl  = document.getElementById('login-open');
  var restEl  = document.getElementById('login-restricted');
  if (openEl)  openEl.classList.toggle('hidden',  access === 'restricted');
  if (restEl)  restEl.classList.toggle('hidden',  access !== 'restricted');

  show('view-student-info');
}

// ═══════════════════════════════════════════════════════════
// Student — Start exam
// ═══════════════════════════════════════════════════════════
function startExam() {
  var alertEl    = document.getElementById('student-alert');
  var accessType = (currentExam && currentExam.accessType) || 'open';

  if (accessType === 'restricted') {
    var uEl = document.getElementById('student-username');
    var pEl = document.getElementById('student-password');
    var username = uEl ? uEl.value.trim() : '';
    var password = pEl ? pEl.value.trim() : '';
    if (!username || !password) { showErr(alertEl, 'يرجى إدخال اسم المستخدم وكلمة المرور'); return; }

    var students = (currentExam && currentExam.students) || [];
    var matched  = null;
    students.forEach(function(s) {
      if (s.username === username && s.password === password) matched = s;
    });
    if (!matched) { showErr(alertEl, '❌ اسم المستخدم أو كلمة المرور غير صحيحة'); return; }

    checkAlreadySubmitted(currentExam.id, username).then(function(done) {
      if (done) { show('view-already-submitted'); return; }
      alertEl.classList.add('hidden');
      studentInfo = { name: matched.name||username, seatNumber: matched.seatNumber||'', username:username, grade:'', section:'' };
      beginExam();
    });
  } else {
    var nameEl    = document.getElementById('student-name');
    var gradeEl   = document.getElementById('student-grade');
    var sectionEl = document.getElementById('student-section');
    var name      = nameEl ? nameEl.value.trim() : '';
    if (!name) { showErr(alertEl, 'يرجى إدخال اسمك الكامل'); return; }

    // منع التكرار للامتحان المفتوح عبر localStorage
    var openKey = 'ep_done_' + currentExam.id + '_' + name;
    try {
      if (localStorage.getItem(openKey)) { show('view-already-submitted'); return; }
    } catch(_) {}

    alertEl.classList.add('hidden');
    studentInfo = {
      name:       name,
      grade:      gradeEl   ? gradeEl.value    : '',
      section:    sectionEl ? sectionEl.value.trim() : '',
      username:   'open_' + name.replace(/\s+/g,'_'),
      seatNumber: '',
      _openKey:   openKey,
    };
    beginExam();
  }
}

function beginExam() {
  if (!currentExam || !currentExam.questions) return;
  studentAnswers = {};
  document.getElementById('exam-view-title').textContent   = currentExam.title   || 'الامتحان';
  document.getElementById('exam-view-subject').textContent = currentExam.subject || '';
  document.getElementById('exam-view-qcount').textContent  = currentExam.questions.length + ' سؤال';
  renderExamQuestions();
  show('view-exam');
  startTimer(parseInt(currentExam.duration) || 60);
}

// ═══════════════════════════════════════════════════════════
// Exam rendering
// ═══════════════════════════════════════════════════════════
function renderExamQuestions() {
  var c = document.getElementById('exam-questions-container');
  c.innerHTML = '';
  currentExam.questions.forEach(function(q, i) {
    var div  = document.createElement('div');
    div.className = 'question-card';
    var html = '<div class="question-header">'
      + '<span class="question-num">سؤال ' + (i+1) + '</span>'
      + '<span class="question-marks">' + q.marks + ' درجة</span></div>'
      + '<div class="question-text">' + escHtml(q.text) + '</div>';

    if (q.imageUrl) {
      html += '<div style="text-align:center;margin:10px 0 14px">'
        + '<img src="' + escHtml(q.imageUrl) + '" alt="صورة السؤال"'
        + ' style="max-width:100%;max-height:320px;border-radius:10px;border:1px solid #e2e8f0;box-shadow:0 2px 8px rgba(0,0,0,.08)"'
        + ' onerror="this.parentElement.style.display=\'none\'">'
        + '</div>';
    }

    if (q.type === 'mcq') {
      html += '<ul class="options-list">' + q.options.map(function(opt, oi) {
        return '<li class="option-item" onclick="pickMcq(' + i + ',' + oi + ',this.closest(\'ul\'))">'
          + '<input type="radio" name="q'+i+'" value="'+oi+'" id="q'+i+'o'+oi+'">'
          + '<label for="q'+i+'o'+oi+'">' + escHtml(opt) + '</label></li>';
      }).join('') + '</ul>';
    } else if (q.type === 'tf') {
      html += '<div class="tf-options">'
        + '<button class="tf-btn" onclick="pickTf('+i+',true,this)">✓ صح</button>'
        + '<button class="tf-btn" onclick="pickTf('+i+',false,this)">✗ خطأ</button>'
        + '</div>';
    } else if (q.type === 'essay') {
      html += '<textarea class="essay-input" placeholder="اكتب إجابتك هنا..." '
        + 'oninput="studentAnswers['+i+']=this.value"></textarea>';
    }
    div.innerHTML = html;
    c.appendChild(div);
  });
}

function pickMcq(qIdx, optIdx, ul) {
  studentAnswers[qIdx] = optIdx;
  ul.querySelectorAll('.option-item').forEach(function(li) { li.classList.remove('selected'); });
  var items = ul.querySelectorAll('.option-item');
  if (items[optIdx]) items[optIdx].classList.add('selected');
  var radios = ul.querySelectorAll('input[type="radio"]');
  if (radios[optIdx]) radios[optIdx].checked = true;
}

function pickTf(qIdx, val, btn) {
  studentAnswers[qIdx] = val;
  var wrap = btn.closest('.tf-options');
  wrap.querySelectorAll('.tf-btn').forEach(function(b) { b.classList.remove('selected-true','selected-false'); });
  btn.classList.add(val ? 'selected-true' : 'selected-false');
}

function confirmSubmit() {
  var unanswered = currentExam.questions.filter(function(q, i) {
    return studentAnswers[i] === undefined || studentAnswers[i] === null || studentAnswers[i] === '';
  }).length;
  var msg = unanswered
    ? 'لم تجب على ' + unanswered + ' سؤال. هل تريد التسليم؟'
    : 'هل أنت متأكد من التسليم؟';
  if (confirm(msg)) submitExam();
}

function submitExam() {
  var btn = document.getElementById('submit-btn');
  btn.disabled    = true;
  btn.textContent = '...جاري التسليم';
  stopTimer();

  var objScore = 0, hasEssay = false;
  var objMarks = 0;
  currentExam.questions.forEach(function(q, i) {
    if (q.type === 'mcq') {
      objMarks += q.marks;
      if (studentAnswers[i] === q.answer) objScore += q.marks;
    } else if (q.type === 'tf') {
      objMarks += q.marks;
      if (studentAnswers[i] === q.answer || String(studentAnswers[i]) === String(q.answer)) objScore += q.marks;
    } else if (q.type === 'essay') {
      hasEssay = true;
    }
  });

  var data = {
    examId:          currentExam.id,
    studentName:     studentInfo.name,
    studentGrade:    studentInfo.grade    || '',
    studentSection:  studentInfo.section  || '',
    studentUsername: studentInfo.username || '',
    seatNumber:      studentInfo.seatNumber || '',
    answers:         studentAnswers,
    score:           objScore,
    objectiveScore:  objScore,
    totalMarks:      currentExam.totalMarks || 0,
    totalObjectiveMarks: objMarks,
    hasEssay:        hasEssay,
    essayGraded:     false,
    essayScores:     {},
    submittedOnTime: true,
  };

  submitResponse(data).then(function() {
    // حفظ حالة التسليم في localStorage للامتحانات المفتوحة
    if (studentInfo._openKey) {
      try { localStorage.setItem(studentInfo._openKey, '1'); } catch(_) {}
    }
    document.getElementById('result-name').textContent = studentInfo.name;
    var lbl = document.getElementById('result-score-label');
    if (hasEssay) {
      document.getElementById('result-score').textContent = objScore + ' / ' + objMarks;
      if (lbl) lbl.textContent = 'درجتك في الأسئلة الموضوعية:';
      var pen = document.getElementById('essay-pending-notice');
      if (pen) pen.classList.remove('hidden');
    } else {
      document.getElementById('result-score').textContent = objScore + ' / ' + (currentExam.totalMarks||objMarks);
      if (lbl) lbl.textContent = 'درجتك:';
    }

    var pct    = objMarks > 0 ? objScore / objMarks : 0;
    var stEl   = document.getElementById('result-status');
    var grade  = pct>=0.85?['badge-success','🌟 ممتاز']:pct>=0.75?['badge-success','✅ جيد جداً']:pct>=0.65?['badge-primary','👍 جيد']:pct>=0.5?['badge-warning','⚠️ مقبول']:['badge-danger','❌ راسب'];
    if (stEl) { stEl.className = 'badge ' + grade[0]; stEl.textContent = grade[1]; }

    show('view-submitted');
  }).catch(function(err) {
    btn.disabled    = false;
    btn.textContent = '✅ تسليم الامتحان';
    showErr(document.getElementById('exam-alert'), 'خطأ في التسليم: ' + err.message);
  });
}

// ═══════════════════════════════════════════════════════════
// Timer
// ═══════════════════════════════════════════════════════════
function startTimer(minutes) {
  stopTimer();
  timerEndAt = Date.now() + minutes * 60000;
  var bar = document.getElementById('timer-bar');
  var nm  = document.getElementById('timer-exam-name');
  if (bar) { bar.classList.remove('hidden','warning','danger'); }
  if (nm && currentExam)  nm.textContent = currentExam.title || 'الامتحان';

  examTimer = setInterval(function() {
    var rem = timerEndAt - Date.now();
    if (rem <= 0) { stopTimer(); submitExam(); return; }
    var m = Math.floor(rem/60000), s = Math.floor((rem%60000)/1000);
    var disp = document.getElementById('timer-display');
    if (disp) disp.textContent = pad(m)+':'+pad(s);
    if (bar) {
      bar.classList.remove('warning','danger');
      if (rem < 300000) bar.classList.add('danger');
      else if (rem < 600000) bar.classList.add('warning');
    }
  }, 1000);
}

function stopTimer() {
  if (examTimer) { clearInterval(examTimer); examTimer = null; }
  var bar = document.getElementById('timer-bar');
  if (bar) bar.classList.add('hidden');
}

// ═══════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════
function showErr(el, msg) { if (!el) return; el.textContent = msg; el.classList.remove('hidden'); }
function pad(n) { return String(n).padStart(2,'0'); }
function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ═══════════════════════════════════════════════════════════
// Startup
// ═══════════════════════════════════════════════════════════
(function startup() {
  if (!isSiteConfigReady() && !loadConfig()) {
    document.getElementById('setup-overlay').classList.add('show');
    return;
  }
  if (!db) { show('view-error'); return; }

  var params  = new URLSearchParams(location.search);
  var examId  = params.get('exam');
  var isAdmin = params.get('admin') === '1' || params.get('admin') === 'true';

  if (examId) { initStudentMode(examId); return; }

  onAuthChange(function(user) {
    if (isAdmin || user) {
      if (user) { openAdminDash(); }
      else       { showAdminLogin(); }
    } else {
      show('view-home');
    }
  });
})();
