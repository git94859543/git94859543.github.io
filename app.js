(() => {
  "use strict";
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const KEYS = { links: "studentHub.links.v1", theme: "studentHub.theme.v1", admin: "studentHub.adminSession.v3" };
  const SCHEDULE_DB = "studentHub.schedule.v1";
  const SCHEDULE_STORE = "documents";
  const SCHEDULE_KEY = "schedule.docx";
  const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  // Client-side verification only hides the passcode text; it is not secure authentication.
  // Use a server-side login/session before deploying with private data.
  const PASSCODE_SALT_HEX = "9b8d26f788c4913ab8ee655591933106";
  const PASSCODE_HASH_HEX = "cdbc64734d2fc3e0dcdf7678655bbd736f3bdeafc5acd44937a09ea0e77569f7";
  const PASSCODE_ITERATIONS = 310000;
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
  async function verifyPasscode(value) {
    if (!globalThis.crypto?.subtle) throw new Error("Web Crypto is unavailable");
    const salt = Uint8Array.from(PASSCODE_SALT_HEX.match(/.{2}/g), byte => Number.parseInt(byte, 16));
    const key = await globalThis.crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(value),
      "PBKDF2",
      false,
      ["deriveBits"]
    );
    const bits = await globalThis.crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: PASSCODE_ITERATIONS, hash: "SHA-256" },
      key,
      256
    );
    const candidate = [...new Uint8Array(bits)].map(byte => byte.toString(16).padStart(2, "0")).join("");
    if (candidate.length !== PASSCODE_HASH_HEX.length) return false;
    let difference = 0;
    for (let i = 0; i < candidate.length; i++) difference |= candidate.charCodeAt(i) ^ PASSCODE_HASH_HEX.charCodeAt(i);
    return difference === 0;
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
    const schedule = $("#view-schedule");
    const active = document.fullscreenElement === schedule || schedule.classList.contains("schedule-fullscreen-fallback");
    const button = $("#scheduleFullscreen");
    $("#scheduleFullscreenIcon").src = active ? "assets/fullscreen-exit.svg" : "assets/fullscreen.svg";
    button.title = active ? "Свернуть расписание" : "На весь экран";
    button.setAttribute("aria-pressed", String(active));
    button.setAttribute("aria-label", active ? "Выйти из полноэкранного режима расписания" : "Открыть расписание на весь экран");
  }
  async function toggleScheduleFullscreen() {
    const schedule = $("#view-schedule");
    if (schedule.classList.contains("schedule-fullscreen-fallback")) {
      schedule.classList.remove("schedule-fullscreen-fallback");
      document.body.classList.remove("schedule-fullscreen-lock");
      syncScheduleFullscreenButton();
      return;
    }
    if (document.fullscreenElement === schedule) {
      try { await document.exitFullscreen(); } catch {}
      return;
    }
    if (typeof schedule.requestFullscreen === "function") {
      try {
        await schedule.requestFullscreen();
        return;
      } catch {}
    }
    schedule.classList.add("schedule-fullscreen-fallback");
    document.body.classList.add("schedule-fullscreen-lock");
    syncScheduleFullscreenButton();
  }
  async function renderScheduleFile(file, fileName) {
    $("#scheduleFileName").textContent = fileName;
    $("#scheduleFileStatus").textContent = "Чтение документа…";
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
      $("#scheduleFileStatus").textContent = "Расписание открыто · обработка в браузере";
      docZoom = 1; fitToWidth = false; updateZoom();
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
  function openScheduleDatabase() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("IndexedDB недоступен"));
        return;
      }
      const request = indexedDB.open(SCHEDULE_DB, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(SCHEDULE_STORE)) {
          request.result.createObjectStore(SCHEDULE_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Не удалось открыть хранилище расписания"));
      request.onblocked = () => reject(new Error("Хранилище расписания заблокировано"));
    });
  }
  async function readSavedSchedule() {
    const db = await openScheduleDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SCHEDULE_STORE, "readonly");
      const request = transaction.objectStore(SCHEDULE_STORE).get(SCHEDULE_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error("Не удалось прочитать расписание"));
      transaction.oncomplete = () => db.close();
      transaction.onerror = () => { db.close(); reject(transaction.error || new Error("Не удалось прочитать расписание")); };
    });
  }
  async function saveSchedule(file) {
    const db = await openScheduleDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SCHEDULE_STORE, "readwrite");
      transaction.objectStore(SCHEDULE_STORE).put(file.slice(0, file.size, DOCX_MIME), SCHEDULE_KEY);
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => { db.close(); reject(transaction.error || new Error("Не удалось сохранить расписание")); };
      transaction.onabort = () => { db.close(); reject(transaction.error || new Error("Не удалось сохранить расписание")); };
    });
  }
  async function loadDefaultSchedule() {
    $("#scheduleFileName").textContent = SCHEDULE_KEY;
    try {
      const saved = await readSavedSchedule();
      if (saved) {
        const loaded = await renderScheduleFile(saved, SCHEDULE_KEY);
        if (loaded) {
          $("#scheduleFileStatus").textContent = "Расписание открыто";
          return;
        }
      }
    } catch (error) {
      console.warn("Не удалось прочитать сохранённое расписание:", error);
    }
    if (!["http:", "https:"].includes(location.protocol)) {
      $("#scheduleFileStatus").textContent = "";
      $("#scheduleErrorMessage").textContent = "Не удалось загрузить schedule.docx. Проверьте файл и обновите страницу.";
      $("#emptyDocument").hidden = false;
      return;
    }
    try {
      const response = await fetch(new URL(SCHEDULE_KEY, document.baseURI), { cache: "no-cache" });
      if (!response.ok) throw new Error("missing schedule");
      const loaded = await renderScheduleFile(await response.blob(), SCHEDULE_KEY);
      if (!loaded) $("#scheduleErrorMessage").textContent = `Не удалось отобразить ${SCHEDULE_KEY}. Проверьте файл и обновите страницу.`;
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
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      closeModal("authModal"); closeModal("adminModal");
      if ($("#view-schedule").classList.contains("schedule-fullscreen-fallback")) {
        $("#view-schedule").classList.remove("schedule-fullscreen-fallback");
        document.body.classList.remove("schedule-fullscreen-lock");
        syncScheduleFullscreenButton();
      }
    }
  });
  $("#authForm").addEventListener("submit", async e => {
    e.preventDefault(); const code = $("#passcode").value;
    if (!/^[A-Za-z0-9]{9}$/.test(code)) { $("#authError").textContent = "Введите ровно 9 букв или цифр."; return; }
    const submitButton = $("#authForm").querySelector("button[type='submit']");
    submitButton.disabled = true;
    try {
      if (!await verifyPasscode(code)) { $("#authError").textContent = "Неверный код. Проверьте регистр букв и попробуйте ещё раз."; $("#passcode").select(); return; }
    } catch (error) {
      console.error("Не удалось проверить код доступа:", error);
      $("#authError").textContent = "Не удалось проверить код. Обновите страницу и попробуйте ещё раз.";
      return;
    } finally {
      submitButton.disabled = false;
    }
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

  $("#zoomIn").addEventListener("click", () => { fitToWidth = false; docZoom = Math.min(2, +(docZoom + .1).toFixed(2)); updateZoom(); });
  $("#zoomOut").addEventListener("click", () => { fitToWidth = false; docZoom = Math.max(.5, +(docZoom - .1).toFixed(2)); updateZoom(); });
  $("#fitDoc").addEventListener("click", () => { fitToWidth = true; fitDocumentToWidth(); });
  $("#scheduleFullscreen").addEventListener("click", toggleScheduleFullscreen);
  document.addEventListener("fullscreenchange", syncScheduleFullscreenButton);
  $("#docxInput").addEventListener("change", async e => {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    if (!isAdmin()) { e.target.value = ""; return; }
    if (!file.name.toLowerCase().endsWith(".docx")) { showToast("Выберите файл в формате .docx."); e.target.value = ""; return; }
    const loaded = await renderScheduleFile(file, SCHEDULE_KEY);
    if (loaded) {
      try {
        await saveSchedule(file);
        $("#scheduleFileStatus").textContent = "Расписание сохранено";
        showToast("Расписание загружено.");
      } catch (error) {
        console.error("Не удалось сохранить расписание:", error);
        $("#scheduleFileStatus").textContent = "Документ открыт, но не сохранён";
        showToast("Документ открыт, но браузер не смог сохранить его.");
      }
    } else showToast("Не удалось открыть файл расписания.");
    e.target.value = "";
  });

  try { setTheme(localStorage.getItem(KEYS.theme) || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")); }
  catch { setTheme("dark"); }
  syncAdminControls();
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
  loadDefaultSchedule();
})();
