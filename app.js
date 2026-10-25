(() => {
  "use strict";
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const KEYS = { theme: "studentHub.theme.v1", adminToken: "studentHub.adminToken.v1" };
  const SCHEDULE_KEY = "schedule.docx";
  const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const API_BASE = String(window.STUDENT_HUB_API_BASE || "").replace(/\/+$/, "");
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
  let fitToWidth = false;
  let toastTimer;

  function makeId() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
  function loadLinks() { return defaults; }
  function getAdminToken() {
    try { return localStorage.getItem(KEYS.adminToken) || ""; } catch { return ""; }
  }
  async function apiRequest(path, options = {}) {
    if (!API_BASE) throw new Error("Общий сервер API ещё не настроен.");
    const headers = new Headers(options.headers || {});
    const token = getAdminToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(`${API_BASE}${path}`, { ...options, headers, cache: "no-store" });
    if (!response.ok) {
      const error = new Error(`API request failed (${response.status})`);
      error.status = response.status;
      if (response.status === 401 && token) {
        try { localStorage.removeItem(KEYS.adminToken); } catch {}
        syncAdminControls();
      }
      throw error;
    }
    return response;
  }
  async function saveLinks() {
    await apiRequest("/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ links })
    });
    renderLinks();
    renderAdminLinks();
  }
  async function loadSharedLinks() {
    if (!API_BASE) { renderLinks(); return; }
    try {
      const response = await apiRequest("/api/state");
      const state = await response.json();
      if (state.initialized && Array.isArray(state.links)) links = state.links;
      renderLinks();
      renderAdminLinks();
    } catch (error) {
      console.error("Не удалось загрузить общие ссылки:", error);
      links = defaults;
      renderLinks();
      showToast("Не удалось загрузить общие данные. Проверьте подключение.");
    }
  }
  async function validateSavedAdminSession() {
    if (!API_BASE || !getAdminToken()) return;
    try {
      await apiRequest("/api/session");
    } catch (error) {
      if (error.status === 401) showToast("Срок действия входа истёк. Войдите снова.");
    }
  }
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
  }
  function renderCategory(category, listId, emptyId) {
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
  }
  function renderLinks() {
    renderCategory("zoom", "zoomList", "zoomEmpty");
    renderCategory("classroom", "classroomList", "classroomEmpty");
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
    return Boolean(getAdminToken());
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
  function fitDocumentToWidth() {
    const canvas = $("#documentCanvas");
    const preview = $("#docxPreview");
    const zoomFactor = docZoom || 1;
    const page = preview.querySelector(".docx");
    const previewStyle = getComputedStyle(preview);
    const previewPadding = parseFloat(previewStyle.paddingLeft) + parseFloat(previewStyle.paddingRight);
    const pageWidth = page ? page.getBoundingClientRect().width / zoomFactor : 0;
    const contentWidth = Math.max(preview.getBoundingClientRect().width / zoomFactor, pageWidth + previewPadding);
    const styles = getComputedStyle(canvas);
    const horizontalPadding = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
    const availableWidth = canvas.clientWidth - horizontalPadding;
    if (contentWidth > 0 && availableWidth > 0) {
      docZoom = Math.max(.3, Math.min(1, +(availableWidth / contentWidth).toFixed(3)));
    } else {
      docZoom = 1;
    }
    updateZoom();
    canvas.scrollLeft = 0;
    canvas.scrollTop = 0;
  }
  function syncScheduleFullscreenButton() {
    const overlay = $("#scheduleFullscreenOverlay");
    const active = !overlay.hidden;
    const button = $("#scheduleFullscreen");
    $("#scheduleFullscreenIcon").src = active ? "assets/fullscreen-exit.svg" : "assets/fullscreen.svg";
    button.title = active ? "Свернуть расписание" : "На весь экран";
    button.setAttribute("aria-pressed", String(active));
    button.setAttribute("aria-label", active ? "Выйти из полноэкранного режима расписания" : "Открыть расписание на весь экран");
  }
  function openScheduleFullscreen() {
    const overlay = $("#scheduleFullscreenOverlay");
    const preview = $("#docxPreview");
    const docContent = preview.innerHTML;
    const fullscreenDoc = $("#fullscreenDocument");

    // Clone the document content to the fullscreen overlay
    fullscreenDoc.innerHTML = docContent;

    // Show the overlay
    overlay.hidden = false;
    document.body.style.overflow = "hidden";

    // Focus the close button for accessibility
    setTimeout(() => $("#scheduleFullscreenClose").focus(), 50);

    syncScheduleFullscreenButton();
  }
  function closeScheduleFullscreen() {
    const overlay = $("#scheduleFullscreenOverlay");
    overlay.hidden = true;
    document.body.style.overflow = "";
    $("#fullscreenDocument").innerHTML = "";
    syncScheduleFullscreenButton();
  }
  function toggleScheduleFullscreen() {
    const overlay = $("#scheduleFullscreenOverlay");
    if (overlay.hidden) {
      openScheduleFullscreen();
    } else {
      closeScheduleFullscreen();
    }
  }
  async function renderScheduleFile(file, fileName) {
    $("#scheduleFileName").textContent = fileName;
    $("#emptyDocument").hidden = true; $("#docxPreview").hidden = false; $("#docxPreview").innerHTML = "";
    try {
      if (!window.JSZip || !window.docx || typeof window.docx.renderAsync !== "function") throw new Error("renderer");
      await window.docx.renderAsync(file, $("#docxPreview"), null, {
        inWrapper: false,
        ignoreWidth: false,
        ignoreHeight: false,
        ignoreFonts: false,
        breakPages: true,
        ignoreLastRenderedPageBreak: false,
        renderHeaders: true,
        renderFooters: true,
        renderFootnotes: true,
        renderEndnotes: true,
        renderAltChunks: true
      });
      docZoom = 1; fitToWidth = false; updateZoom();
      return true;
    } catch {
      $("#docxPreview").hidden = true; $("#emptyDocument").hidden = false;
      $("#scheduleErrorMessage").textContent = !window.JSZip || !window.docx
        ? "Не загрузились компоненты для чтения DOCX. Проверьте подключение к интернету и обновите страницу."
        : "Не удалось отобразить DOCX. Проверьте файл и попробуйте ещё раз.";
      return false;
    }
  }
  async function loadDefaultSchedule() {
    $("#scheduleFileName").textContent = SCHEDULE_KEY;
    if (!["http:", "https:"].includes(location.protocol)) {
      $("#scheduleErrorMessage").textContent = "Не удалось загрузить schedule.docx. Проверьте файл и обновите страницу.";
      $("#emptyDocument").hidden = false;
      return;
    }
    try {
      const response = API_BASE
        ? await apiRequest("/api/schedule")
        : await fetch(new URL(SCHEDULE_KEY, document.baseURI), { cache: "no-cache" });
      if (!response.ok) throw new Error("missing schedule");
      const loaded = await renderScheduleFile(await response.blob(), SCHEDULE_KEY);
      if (!loaded) $("#scheduleErrorMessage").textContent = `Не удалось отобразить ${SCHEDULE_KEY}. Проверьте файл и обновите страницу.`;
    } catch {
      $("#scheduleErrorMessage").textContent = API_BASE
        ? "Не удалось получить расписание. Проверьте серверное API и обновите страницу."
        : "Убедитесь, что schedule.docx находится рядом с приложением, затем обновите страницу.";
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

  // Fullscreen overlay close button
  $("#scheduleFullscreenClose").addEventListener("click", closeScheduleFullscreen);
  $("#scheduleFullscreenOverlay").addEventListener("click", e => { if (e.target === $("#scheduleFullscreenOverlay")) closeScheduleFullscreen(); });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      closeModal("authModal"); closeModal("adminModal");
      if (!$("#scheduleFullscreenOverlay").hidden) {
        closeScheduleFullscreen();
      }
    }
  });
  $("#authForm").addEventListener("submit", async e => {
    e.preventDefault(); const code = $("#passcode").value;
    if (!/^[A-Za-z0-9]{9}$/.test(code)) { $("#authError").textContent = "Введите ровно 9 букв или цифр."; return; }
    const submitButton = $("#authForm").querySelector("button[type='submit']");
    submitButton.disabled = true;
    try {
      const response = await apiRequest("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code })
      });
      const result = await response.json();
      if (!result.token) throw new Error("Сервер не вернул сессию администратора.");
      localStorage.setItem(KEYS.adminToken, result.token);
      syncAdminControls();
      closeModal("authModal"); openModal("adminModal"); renderAdminLinks();
      showToast("Доступ администратора открыт.");
    } catch (error) {
      console.error("Не удалось выполнить вход администратора:", error);
      $("#authError").textContent = error.status === 401
        ? "Неверный код. Проверьте регистр букв и попробуйте ещё раз."
        : "Не удалось связаться с сервером. Проверьте настройку API и попробуйте снова.";
      if (error.status === 401) $("#passcode").select();
    } finally {
      submitButton.disabled = false;
    }
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
  $("#adminLinks").addEventListener("click", async e => {
    const edit = e.target.closest("[data-edit]"); const del = e.target.closest("[data-delete]");
    if (edit) startEdit(edit.dataset.edit);
    if (del) {
      const item = links.find(x => x.id === del.dataset.delete); if (!item) return;
      if (confirm(`Удалить «${item.name}»? Это действие нельзя отменить.`)) {
        const previous = links.slice();
        links = links.filter(x => x.id !== item.id);
        try { await saveLinks(); showToast("Ссылка удалена для всех посетителей."); }
        catch (error) {
          links = previous; renderLinks(); renderAdminLinks();
          showToast(error.status === 401 ? "Сессия истекла. Войдите снова." : "Не удалось сохранить ссылку на сервере.");
        }
      }
    }
  });
  $("#linkForm").addEventListener("submit", async e => {
    e.preventDefault();
    const name = $("#linkName").value.trim(), url = safeUrl($("#linkUrl").value.trim()), editId = $("#editId").value;
    if (!name) { showToast("Введите название предмета."); return; }
    if (!url) { showToast("Введите корректный адрес http:// или https://."); return; }
    const previous = links.slice();
    if (editId) {
      links = links.map(x => x.id === editId ? { ...x, name, url, category: adminCategory } : x);
    } else {
      links.push({ id: makeId(), category: adminCategory, name, url });
    }
    try {
      await saveLinks();
      resetLinkForm();
      showToast(editId ? "Ссылка обновлена для всех посетителей." : "Ссылка добавлена для всех посетителей.");
    } catch (error) {
      links = previous; renderLinks(); renderAdminLinks();
      showToast(error.status === 401 ? "Сессия истекла. Войдите снова." : "Не удалось сохранить ссылку на сервере.");
    }
  });
  $("#logoutBtn").addEventListener("click", () => {
    try { localStorage.removeItem(KEYS.adminToken); } catch {}
    syncAdminControls();
    closeModal("adminModal"); resetLinkForm(); showToast("Вы вышли из панели администратора.");
  });

  $("#zoomIn").addEventListener("click", () => { fitToWidth = false; docZoom = Math.min(2, +(docZoom + .1).toFixed(2)); updateZoom(); });
  $("#zoomOut").addEventListener("click", () => { fitToWidth = false; docZoom = Math.max(.5, +(docZoom - .1).toFixed(2)); updateZoom(); });
  $("#fitDoc").addEventListener("click", () => { fitToWidth = true; fitDocumentToWidth(); });
  $("#scheduleFullscreen").addEventListener("click", toggleScheduleFullscreen);
  $("#docxInput").addEventListener("change", async e => {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    if (!isAdmin()) { e.target.value = ""; return; }
    if (!file.name.toLowerCase().endsWith(".docx")) { showToast("Выберите файл в формате .docx."); e.target.value = ""; return; }
    const loaded = await renderScheduleFile(file, SCHEDULE_KEY);
    if (loaded) {
      try {
        await apiRequest("/api/schedule", {
          method: "PUT",
          headers: { "Content-Type": DOCX_MIME },
          body: file
        });
        showToast("Расписание опубликовано на сайте.");
      } catch (error) {
        console.error("Не удалось сохранить расписание:", error);
        showToast(error.status === 401 ? "Сессия истекла. Войдите снова." : "Документ открыт, но не опубликован на сайте.");
      }
    } else showToast("Не удалось открыть файл расписания.");
    e.target.value = "";
  });

  try { setTheme(localStorage.getItem(KEYS.theme) || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")); }
  catch { setTheme("dark"); }
  syncAdminControls();
  validateSavedAdminSession();
  updateDeviceClass();
  window.addEventListener("resize", () => {
    updateDeviceClass();
    if (fitToWidth) fitDocumentToWidth();
  }, { passive: true });
  window.addEventListener("orientationchange", () => {
    updateDeviceClass();
    if (fitToWidth) fitDocumentToWidth();
  }, { passive: true });
  updateCurrentDate();
  window.setInterval(updateCurrentDate, 60 * 1000);
  renderLinks();
  setView("schedule");
  loadSharedLinks();
  loadDefaultSchedule();
})();
