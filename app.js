(() => {
  "use strict";
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const KEYS = { links: "studentHub.links.v1", theme: "studentHub.theme.v1", admin: "studentHub.adminSession.v3" };
  // Demo-only code. Never use a client-side passcode as production authentication.
  // Replace this with a server-side login/session before deploying with private data.
  const DEMO_PASSCODE = "m4B8vN3tQ";
  const defaults = [
    { id: makeId(), category: "zoom", name: "Математика", url: "https://zoom.us/" },
    { id: makeId(), category: "zoom", name: "Английский язык", url: "https://zoom.us/" },
    { id: makeId(), category: "zoom", name: "Информатика", url: "https://zoom.us/" },
    { id: makeId(), category: "classroom", name: "Математика", url: "https://classroom.google.com/" },
    { id: makeId(), category: "classroom", name: "Английский язык", url: "https://classroom.google.com/" },
    { id: makeId(), category: "classroom", name: "Информатика", url: "https://classroom.google.com/" }
  ];
  let links = loadLinks();
  let currentView = "schedule";
  let adminCategory = "zoom";
  let docZoom = 1;
  let toastTimer;

  function makeId() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
  function loadLinks() {
    try {
      const raw = localStorage.getItem(KEYS.links);
      if (raw === null) { localStorage.setItem(KEYS.links, JSON.stringify(defaults)); return defaults; }
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(x => x && typeof x.name === "string" && typeof x.url === "string" && ["zoom", "classroom"].includes(x.category)) : defaults;
    } catch { return defaults; }
  }
  function saveLinks() { localStorage.setItem(KEYS.links, JSON.stringify(links)); renderLinks(); renderAdminLinks(); }
  function safeUrl(value) {
    try { const u = new URL(value); return ["http:", "https:"].includes(u.protocol) ? u.href : null; }
    catch { return null; }
  }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
  }
  function showToast(message) {
    const toast = $("#toast"); toast.textContent = message; toast.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
  }
  function setView(view) {
    if (!["schedule", "zoom", "classroom"].includes(view)) return;
    currentView = view;
    $$(".nav-item[data-view]").forEach(b => b.classList.toggle("active", b.dataset.view === view));
    ["schedule", "zoom", "classroom"].forEach(v => $("#view-" + v).hidden = v !== view);
    const names = { schedule: "Расписание", zoom: "Занятия Zoom", classroom: "Google Classroom" };
    $("#crumbCurrent").textContent = names[view];
    const titles = {
      schedule: ["Ваш учебный дашборд", ""],
      zoom: ["Занятия в Zoom", "Подключайтесь к виртуальным занятиям в один клик."],
      classroom: ["Ваши учебные курсы", "Предметы, материалы и задания собраны в одном месте."]
    };
    $("#pageTitle").textContent = titles[view][0];
    $("#pageSubtitle").textContent = titles[view][1];
    $("#pageSubtitle").hidden = !titles[view][1];
  }
  function pluralize(count, forms) {
    const mod10 = count % 10, mod100 = count % 100;
    if (mod100 >= 11 && mod100 <= 14) return forms[2];
    if (mod10 === 1) return forms[0];
    if (mod10 >= 2 && mod10 <= 4) return forms[1];
    return forms[2];
  }
  function renderCategory(category, listId, emptyId, countId) {
    const items = links.filter(x => x.category === category);
    const list = $("#" + listId); list.innerHTML = "";
    items.forEach((item, index) => {
      const url = safeUrl(item.url);
      const symbol = category === "zoom" ? "◉" : "◧";
      const kind = category === "zoom" ? "ОНЛАЙН-ЗАНЯТИЕ" : "УЧЕБНЫЙ КУРС";
      const actionTitle = category === "zoom" ? "Подключиться к занятию" : "Открыть курс";
      const card = document.createElement(url ? "a" : "article");
      card.className = url ? "subject-card subject-card-link" : "subject-card";
      if (url) {
        card.href = url;
        card.target = "_blank";
        card.rel = "noopener noreferrer";
        card.setAttribute("aria-label", `${actionTitle}: ${item.name}`);
        card.title = actionTitle;
      }
      card.innerHTML = `<span class="subject-symbol">${symbol}</span><div class="subject-details"><small>${kind} · № ${(index + 1).toString().padStart(2,"0")}</small><h3>${escapeHtml(item.name)}</h3></div>${url ? "" : `<span class="subject-action" title="Некорректная ссылка">!</span>`}`;
      list.appendChild(card);
    });
    $("#" + emptyId).hidden = items.length !== 0;
    const forms = category === "zoom" ? ["занятие", "занятия", "занятий"] : ["курс", "курса", "курсов"];
    $("#" + countId).textContent = `${items.length} ${pluralize(items.length, forms)}`;
  }
  function renderLinks() {
    renderCategory("zoom", "zoomList", "zoomEmpty", "zoomCount");
    renderCategory("classroom", "classroomList", "classroomEmpty", "classroomCount");
    $("#adminZoomCount").textContent = links.filter(x => x.category === "zoom").length;
    $("#adminClassroomCount").textContent = links.filter(x => x.category === "classroom").length;
  }
  function setTheme(theme) {
    const next = theme === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    $("#themeToggle").setAttribute("aria-label", next === "dark" ? "Переключить на светлую тему" : "Переключить на тёмную тему");
    try { localStorage.setItem(KEYS.theme, next); } catch {}
  }
  function openModal(id) { $("#" + id).hidden = false; document.body.style.overflow = "hidden"; }
  function closeModal(id) {
    $("#" + id).hidden = true;
    if ($("#authModal").hidden && $("#adminModal").hidden) document.body.style.overflow = "";
  }
  function isAdmin() {
    try {
      if (localStorage.getItem(KEYS.admin) === "true") return true;
      // Preserve an already-unlocked session once when upgrading from the previous version.
      if (sessionStorage.getItem("studentHub.adminSession.v2") === "true") {
        localStorage.setItem(KEYS.admin, "true");
        sessionStorage.removeItem("studentHub.adminSession.v2");
        return true;
      }
    } catch {}
    try { return sessionStorage.getItem(KEYS.admin) === "true"; } catch { return false; }
  }
  function syncAdminControls() { $$(".admin-only").forEach(control => { control.hidden = !isAdmin(); }); }
  function requestAdmin() {
    if (isAdmin()) { openModal("adminModal"); renderAdminLinks(); }
    else { $("#passcode").value = ""; $("#authError").textContent = ""; openModal("authModal"); setTimeout(() => $("#passcode").focus(), 40); }
  }
  function renderAdminLinks() {
    const items = links.filter(x => x.category === adminCategory);
    $("#adminListTitle").textContent = adminCategory === "zoom" ? "Ссылки Zoom" : "Ссылки Classroom";
    $("#adminListSubtitle").textContent = adminCategory === "zoom" ? "Управление ссылками на онлайн-занятия" : "Управление курсами Google Classroom";
    const list = $("#adminLinks"); list.innerHTML = "";
    if (!items.length) { list.innerHTML = '<div class="admin-empty">Ссылок пока нет. Добавьте первую ссылку.</div>'; return; }
    items.forEach(item => {
      const row = document.createElement("div"); row.className = "admin-link-row";
      row.innerHTML = `<span class="admin-link-mark">${adminCategory === "zoom" ? "◉" : "◧"}</span><div class="admin-link-info"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.url)}</small></div><div class="row-actions"><button type="button" data-edit="${escapeHtml(item.id)}" aria-label="Изменить: ${escapeHtml(item.name)}" title="Изменить">✎</button><button type="button" data-delete="${escapeHtml(item.id)}" aria-label="Удалить: ${escapeHtml(item.name)}" title="Удалить">×</button></div>`;
      list.appendChild(row);
    });
  }
  function resetLinkForm() {
    $("#linkForm").hidden = true; $("#editId").value = ""; $("#linkName").value = ""; $("#linkUrl").value = "";
    $("#linkFormTitle").textContent = "Добавить ссылку"; $("#saveLinkBtn").textContent = "Сохранить ссылку";
  }
  function startEdit(id) {
    const item = links.find(x => x.id === id); if (!item) return;
    $("#editId").value = item.id; $("#linkName").value = item.name; $("#linkUrl").value = item.url;
    $("#linkFormTitle").textContent = "Изменить ссылку"; $("#saveLinkBtn").textContent = "Обновить ссылку";
    $("#linkForm").hidden = false; $("#linkName").focus();
  }

  function updateZoom() {
    $("#zoomLevel").textContent = `${Math.round(docZoom * 100)}%`;
    $("#docxPreview").style.zoom = String(docZoom);
  }
  async function renderScheduleFile(file, fileName) {
    $("#scheduleFileName").textContent = fileName;
    $("#scheduleFileStatus").textContent = "Чтение документа…";
    $("#emptyDocument").hidden = true; $("#docxPreview").hidden = false; $("#docxPreview").innerHTML = "";
    try {
      if (!window.JSZip || !window.docx || typeof window.docx.renderAsync !== "function") throw new Error("renderer");
      await window.docx.renderAsync(file, $("#docxPreview"), null, { inWrapper: false, ignoreWidth: false, ignoreHeight: false, breakPages: true });
      $("#scheduleFileStatus").textContent = "Расписание открыто · обработка в браузере";
      docZoom = 1; updateZoom();
      return true;
    } catch {
      $("#docxPreview").hidden = true; $("#emptyDocument").hidden = false;
      $("#scheduleFileStatus").textContent = "Не удалось открыть расписание";
      $("#scheduleErrorMessage").textContent = !window.JSZip || !window.docx
        ? "Не загрузились компоненты для чтения DOCX. Проверьте подключение к интернету и обновите страницу."
        : "Не удалось отобразить DOCX. Проверьте файл и попробуйте ещё раз.";
      return false;
    }
  }
  async function loadDefaultSchedule() {
    $("#scheduleFileName").textContent = "schedule.docx";
    if (!["http:", "https:"].includes(location.protocol)) {
      $("#scheduleFileStatus").textContent = "Откройте приложение через веб-сервер";
      $("#scheduleErrorMessage").textContent = "Для автоматической загрузки schedule.docx откройте приложение через локальный веб-сервер.";
      $("#emptyDocument").hidden = false;
      return;
    }
    try {
      const response = await fetch(new URL("schedule.docx", document.baseURI), { cache: "no-cache" });
      if (!response.ok) throw new Error("missing schedule");
      const loaded = await renderScheduleFile(await response.blob(), "schedule.docx");
      if (!loaded) $("#scheduleErrorMessage").textContent = "Не удалось отобразить schedule.docx. Проверьте файл и обновите страницу.";
    } catch {
      $("#scheduleFileStatus").textContent = "Не удалось загрузить schedule.docx";
      $("#scheduleErrorMessage").textContent = "Убедитесь, что schedule.docx находится рядом с приложением, затем обновите страницу.";
      $("#emptyDocument").hidden = false;
    }
  }
  function updateCurrentDate() {
    const formatted = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
    $("#currentDate").textContent = formatted.charAt(0).toLocaleUpperCase("ru-RU") + formatted.slice(1);
  }
  function updateDeviceClass() {
    const width = window.innerWidth;
    const device = width <= 620 ? "phone" : width <= 1024 ? "tablet" : "computer";
    document.documentElement.dataset.device = device;
  }

  $$(".nav-item[data-view]").forEach(button => button.addEventListener("click", () => setView(button.dataset.view)));
  $("#themeToggle").addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
  $("#adminOpen").addEventListener("click", requestAdmin); $("#topAdmin").addEventListener("click", requestAdmin);
  $$("[data-close]").forEach(button => button.addEventListener("click", () => closeModal(button.dataset.close)));
  $$(".modal-backdrop").forEach(backdrop => backdrop.addEventListener("click", e => { if (e.target === backdrop) closeModal(backdrop.id); }));
  document.addEventListener("keydown", e => { if (e.key === "Escape") { closeModal("authModal"); closeModal("adminModal"); } });
  $("#authForm").addEventListener("submit", e => {
    e.preventDefault(); const code = $("#passcode").value;
    if (!/^[A-Za-z0-9]{9}$/.test(code)) { $("#authError").textContent = "Введите ровно 9 букв или цифр."; return; }
    if (code !== DEMO_PASSCODE) { $("#authError").textContent = "Неверный код. Проверьте регистр букв и попробуйте ещё раз."; $("#passcode").select(); return; }
    try { localStorage.setItem(KEYS.admin, "true"); }
    catch { try { sessionStorage.setItem(KEYS.admin, "true"); } catch {} }
    syncAdminControls();
    closeModal("authModal"); openModal("adminModal"); renderAdminLinks(); showToast("Доступ администратора открыт.");
  });
  $$(".admin-tab").forEach(tab => tab.addEventListener("click", () => {
    adminCategory = tab.dataset.adminCategory;
    $$(".admin-tab").forEach(t => t.classList.toggle("active", t === tab));
    resetLinkForm(); renderAdminLinks();
  }));
  $("#addLinkBtn").addEventListener("click", () => {
    resetLinkForm(); $("#linkForm").hidden = false; $("#linkName").focus();
  });
  $("#cancelLink").addEventListener("click", resetLinkForm);
  $("#adminLinks").addEventListener("click", e => {
    const edit = e.target.closest("[data-edit]"); const del = e.target.closest("[data-delete]");
    if (edit) startEdit(edit.dataset.edit);
    if (del) {
      const item = links.find(x => x.id === del.dataset.delete); if (!item) return;
      if (confirm(`Удалить «${item.name}»? Это действие нельзя отменить.`)) {
        links = links.filter(x => x.id !== item.id); saveLinks(); showToast("Ссылка удалена.");
      }
    }
  });
  $("#linkForm").addEventListener("submit", e => {
    e.preventDefault();
    const name = $("#linkName").value.trim(), url = safeUrl($("#linkUrl").value.trim()), editId = $("#editId").value;
    if (!name) { showToast("Введите название предмета."); return; }
    if (!url) { showToast("Введите корректный адрес http:// или https://."); return; }
    if (editId) {
      links = links.map(x => x.id === editId ? { ...x, name, url, category: adminCategory } : x);
      showToast("Ссылка обновлена.");
    } else {
      links.push({ id: makeId(), category: adminCategory, name, url }); showToast("Ссылка добавлена.");
    }
    saveLinks(); resetLinkForm();
  });
  $("#logoutBtn").addEventListener("click", () => {
    try { localStorage.removeItem(KEYS.admin); } catch {}
    try {
      sessionStorage.removeItem(KEYS.admin);
      sessionStorage.removeItem("studentHub.adminSession.v2");
    } catch {}
    syncAdminControls();
    closeModal("adminModal"); resetLinkForm(); showToast("Вы вышли из панели администратора.");
  });

  $("#zoomIn").addEventListener("click", () => { docZoom = Math.min(2, +(docZoom + .1).toFixed(2)); updateZoom(); });
  $("#zoomOut").addEventListener("click", () => { docZoom = Math.max(.5, +(docZoom - .1).toFixed(2)); updateZoom(); });
  $("#fitDoc").addEventListener("click", () => { docZoom = 1; updateZoom(); $("#documentCanvas").scrollTop = 0; });
  $("#docxInput").addEventListener("change", async e => {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    if (!isAdmin()) { e.target.value = ""; return; }
    if (!file.name.toLowerCase().endsWith(".docx")) { showToast("Выберите файл в формате .docx."); e.target.value = ""; return; }
    const loaded = await renderScheduleFile(file, file.name);
    if (loaded) showToast("Расписание загружено.");
    else showToast("Не удалось открыть файл расписания.");
    e.target.value = "";
  });

  try { setTheme(localStorage.getItem(KEYS.theme) || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")); }
  catch { setTheme("dark"); }
  syncAdminControls();
  updateDeviceClass();
  window.addEventListener("resize", updateDeviceClass, { passive: true });
  window.addEventListener("orientationchange", updateDeviceClass, { passive: true });
  updateCurrentDate();
  window.setInterval(updateCurrentDate, 60 * 1000);
  renderLinks();
  setView("schedule");
  loadDefaultSchedule();
})();
