(function () {
  const MOCK_ITEMS = [
    {
      id: "intro",
      path: "/content/00_вводная_часть.md",
      type: "course",
      status: "missing-required",
      defaults: {
        title: "Вводная часть курса по умной уборке | Слишком Умная Уборка",
        description: "",
        h1: "Вводная часть",
        slug: "/",
        robots: "index,follow",
        canonical: "https://example.com/",
        pageType: "course",
        ogTitle: "Вводная часть курса по умной уборке | Слишком Умная Уборка",
        ogDescription: "Как пользоваться курсом, чтобы выстроить системную и безопасную уборку.",
        ogImage: "/assets/og/intro.jpg",
        twitterCard: "summary_large_image",
        ogType: "article",
        imageAlt: "",
        imageCaption: ""
      }
    },
    {
      id: "section-3",
      path: "/content/03_раздел_3_химия.md",
      type: "course",
      status: "missing-og",
      defaults: {
        title: "Раздел 3. Химия уборки: средства и их применение | Слишком Умная Уборка",
        description: "Основы химии уборки: типы загрязнений, pH и выбор эффективных средств.",
        h1: "РАЗДЕЛ 3: ХИМИЯ — СРЕДСТВА И ИХ ЦЕЛЕВОЕ ПРИМЕНЕНИЕ",
        slug: "/course/chemistry.html",
        robots: "index,follow",
        canonical: "https://example.com/course/chemistry.html",
        pageType: "course",
        ogTitle: "",
        ogDescription: "",
        ogImage: "",
        twitterCard: "summary_large_image",
        ogType: "article",
        imageAlt: "",
        imageCaption: ""
      }
    },
    {
      id: "recommend-eco",
      path: "/content/recommendations/eco-cleaning.md",
      type: "recommendation",
      status: "complete",
      defaults: {
        title: "Эко-уборка без мифов: что реально важно | Слишком Умная Уборка",
        description: "Какие компоненты в средствах влияют на экологичность и безопасность, а где маркетинг.",
        h1: "Эко-уборка без мифов",
        slug: "/recommendations/eco-cleaning.html",
        robots: "index,follow",
        canonical: "https://example.com/recommendations/eco-cleaning.html",
        pageType: "recommendation",
        ogTitle: "Эко-уборка без мифов | Слишком Умная Уборка",
        ogDescription: "Практичный взгляд на эко-средства и реальное снижение нагрузки на дом и природу.",
        ogImage: "/assets/og/eco-cleaning.jpg",
        twitterCard: "summary_large_image",
        ogType: "article",
        imageAlt: "",
        imageCaption: ""
      }
    },
    {
      id: "image-logo",
      path: "/assets/CleanLogo.svg",
      type: "image",
      status: "complete",
      defaults: {
        title: "",
        description: "",
        h1: "",
        slug: "/assets/CleanLogo.svg",
        robots: "noindex,follow",
        canonical: "",
        pageType: "image",
        ogTitle: "",
        ogDescription: "",
        ogImage: "/assets/CleanLogo.svg",
        twitterCard: "",
        ogType: "",
        imageAlt: "Логотип «Слишком Умная Уборка»",
        imageCaption: "Логотип бренда для шапки сайта и карточек."
      }
    },
    {
      id: "image-hero-kitchen",
      path: "/assets/hero/kitchen-hero.jpg",
      type: "image",
      status: "missing-required",
      defaults: {
        title: "",
        description: "",
        h1: "",
        slug: "/assets/hero/kitchen-hero.jpg",
        robots: "noindex,follow",
        canonical: "",
        pageType: "image",
        ogTitle: "",
        ogDescription: "",
        ogImage: "/assets/hero/kitchen-hero.jpg",
        twitterCard: "",
        ogType: "",
        imageAlt: "",
        imageCaption: "Используется как обложка раздела «Кухня»."
      }
    },
    {
      id: "misc-about",
      path: "/content/misc/about-project.md",
      type: "other",
      status: "missing-required",
      defaults: {
        title: "О проекте «Слишком Умная Уборка»",
        description: "",
        h1: "О проекте",
        slug: "/about.html",
        robots: "index,follow",
        canonical: "https://example.com/about.html",
        pageType: "other",
        ogTitle: "О проекте «Слишком Умная Уборка»",
        ogDescription: "Философия курса и подход к системной уборке.",
        ogImage: "/assets/og/about.jpg",
        twitterCard: "summary_large_image",
        ogType: "website",
        imageAlt: "",
        imageCaption: ""
      }
    }
  ];

  const STORAGE_KEY = "seoAdminMetaDrafts_v1";

  const elCardsContainer = document.getElementById("cardsContainer");
  const elTemplate = document.getElementById("cardTemplate");
  const elSearch = document.getElementById("searchInput");
  const elTypeFilters = document.getElementById("typeFilters");
  const elStatusFilters = document.getElementById("statusFilters");
  const elStatTotal = document.getElementById("statTotal");
  const elStatMissing = document.getElementById("statMissing");
  const elStatComplete = document.getElementById("statComplete");
  const elBtnCollapseAll = document.getElementById("btnCollapseAll");
  const elBtnExpandAll = document.getElementById("btnExpandAll");
  const elBtnSaveAll = document.getElementById("btnSaveAll");
  const elToast = document.getElementById("toast");
  const elToastMessage = document.getElementById("toastMessage");

  let activeType = "all";
  let activeStatus = "all";
  let drafts = loadDrafts();

  const cardsRegistry = new Map();

  function loadDrafts() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      return JSON.parse(raw);
    } catch (e) {
      console.warn("Failed to parse drafts", e);
      return {};
    }
  }

  function saveDrafts() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
    } catch (e) {
      console.warn("Failed to save drafts", e);
    }
  }

  function showToast(message) {
    elToastMessage.textContent = message;
    elToast.classList.add("toast--visible");
    setTimeout(() => {
      elToast.classList.remove("toast--visible");
    }, 1800);
  }

  function applyTypeVisibility(type, node) {
    const isImage = type === "image";

    // Строки, отмеченные как page-only
    node.querySelectorAll(".field-row--page-only").forEach((row) => {
      row.style.display = isImage ? "none" : "";
    });

    // Секция OG — только для страниц
    const ogSection = node.querySelector(".card-section-og");
    if (ogSection) {
      ogSection.style.display = isImage ? "none" : "";
    }

    // Секция изображения — только для type=image
    const imageSection = node.querySelector(".card-section-image");
    if (imageSection) {
      imageSection.style.display = isImage ? "" : "none";
    }
  }

  function createCard(item) {
    const node = elTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.id = item.id;

    const pathEl = node.querySelector(".card-path");
    const titleEl = node.querySelector(".card-title");
    const badgeTypeEl = node.querySelector(".badge-type");
    const badgeStatusEl = node.querySelector(".badge-status");
    const toggleBtn = node.querySelector(".card-toggle");
    const bodyEl = node.querySelector(".card-body");

    const fieldTitle = node.querySelector(".field-title");
    const fieldDescription = node.querySelector(".field-description");
    const fieldH1 = node.querySelector(".field-h1");
    const fieldSlug = node.querySelector(".field-slug");
    const fieldRobots = node.querySelector(".field-robots");
    const fieldCanonical = node.querySelector(".field-canonical");
    const fieldPageType = node.querySelector(".field-page-type");
    const fieldOgTitle = node.querySelector(".field-og-title");
    const fieldOgDescription = node.querySelector(".field-og-description");
    const fieldOgImage = node.querySelector(".field-og-image");
    const fieldTwitterCard = node.querySelector(".field-twitter-card");
    const fieldOgType = node.querySelector(".field-og-type");
    const fieldCompleteFlag = node.querySelector(".field-complete-flag");
    const fieldImageAlt = node.querySelector(".field-image-alt");
    const fieldImageCaption = node.querySelector(".field-image-caption");

    const counterTitle = node.querySelector(".counter-title");
    const counterDescription = node.querySelector(".counter-description");
    const imagePreviewPlaceholder = node.querySelector(".image-preview-placeholder");
    const imagePreviewImg = node.querySelector(".image-preview-img");

    const btnReset = node.querySelector(".btn-reset");
    const btnSaveOne = node.querySelector(".btn-save-one");

    const persisted = drafts[item.id] || {};
    const values = Object.assign({}, item.defaults, persisted.values || {});

    pathEl.textContent = item.path;
    // Заголовок карточки (в списке) — это title для страниц, alt или slug для изображений
    if (item.type === "image") {
      titleEl.textContent = values.imageAlt || values.slug || "Изображение";
    } else {
      titleEl.textContent = values.title || "Без title";
    }

    const typeLabelMap = {
      course: "курс",
      recommendation: "рекомендация",
      image: "изображение",
      other: "другое"
    };
    const typeLabel = typeLabelMap[item.type] || item.type || "другое";
    badgeTypeEl.textContent = typeLabel;

    applyTypeVisibility(item.type, node);
    updateStatusBadge(badgeStatusEl, item.status, persisted.complete);

    // Заполнение значений
    if (fieldTitle) fieldTitle.value = values.title || "";
    if (fieldDescription) fieldDescription.value = values.description || "";
    if (fieldH1) fieldH1.value = values.h1 || "";
    if (fieldSlug) fieldSlug.value = values.slug || "";
    if (fieldRobots) fieldRobots.value = values.robots || "index,follow";
    if (fieldCanonical) fieldCanonical.value = values.canonical || "";
    if (fieldPageType) fieldPageType.value = values.pageType || item.type || "other";
    if (fieldOgTitle) fieldOgTitle.value = values.ogTitle || "";
    if (fieldOgDescription) fieldOgDescription.value = values.ogDescription || "";
    if (fieldOgImage) fieldOgImage.value = values.ogImage || "";
    if (fieldTwitterCard) fieldTwitterCard.value = values.twitterCard || "summary_large_image";
    if (fieldOgType) fieldOgType.value = values.ogType || (item.type === "course" || item.type === "recommendation" ? "article" : "website");
    if (fieldCompleteFlag) fieldCompleteFlag.checked = Boolean(persisted.complete);

    if (fieldImageAlt) fieldImageAlt.value = values.imageAlt || "";
    if (fieldImageCaption) fieldImageCaption.value = values.imageCaption || "";

    updateCounters();
    updateImagePreview();

    function updateCounters() {
      if (fieldTitle && counterTitle) {
        counterTitle.textContent = fieldTitle.value.length + " / 60";
      }
      if (fieldDescription && counterDescription) {
        counterDescription.textContent = fieldDescription.value.length + " / 160";
      }
    }

    function updateImagePreview() {
      // Превью привязываем к og-image; для изображений можно вбить путь руками при необходимости
      if (!fieldOgImage || !imagePreviewImg || !imagePreviewPlaceholder) return;
      const src = fieldOgImage.value.trim();
      if (src) {
        imagePreviewImg.src = src;
        imagePreviewImg.hidden = false;
        imagePreviewPlaceholder.style.display = "none";
      } else {
        imagePreviewImg.hidden = true;
        imagePreviewPlaceholder.style.display = "inline";
      }
    }

    if (fieldTitle) {
      fieldTitle.addEventListener("input", () => {
        updateCounters();
        if (item.type !== "image") {
          titleEl.textContent = fieldTitle.value || "Без title";
        }
        markDirty();
      });
    }

    if (fieldDescription) {
      fieldDescription.addEventListener("input", () => {
        updateCounters();
        markDirty();
      });
    }

    [
      fieldH1,
      fieldSlug,
      fieldRobots,
      fieldCanonical,
      fieldPageType,
      fieldOgTitle,
      fieldOgDescription,
      fieldTwitterCard,
      fieldOgType
    ].forEach((el) => {
      if (!el) return;
      el.addEventListener("input", markDirty);
      el.addEventListener("change", markDirty);
    });

    if (fieldOgImage) {
      fieldOgImage.addEventListener("input", () => {
        updateImagePreview();
        markDirty();
      });
    }

    if (fieldImageAlt) {
      fieldImageAlt.addEventListener("input", () => {
        if (item.type === "image") {
          titleEl.textContent = fieldImageAlt.value || values.slug || "Изображение";
        }
        markDirty();
      });
    }
    if (fieldImageCaption) {
      fieldImageCaption.addEventListener("input", markDirty);
    }

    if (fieldCompleteFlag) {
      fieldCompleteFlag.addEventListener("change", () => {
        markDirty();
        const itemStatus = inferStatus();
        updateStatusBadge(badgeStatusEl, itemStatus, fieldCompleteFlag.checked);
      });
    }

    toggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleBody();
    });

    node.querySelector(".card-header").addEventListener("click", (e) => {
      if (e.target === toggleBtn) return;
      toggleBody();
    });

    function toggleBody() {
      const isOpen = bodyEl.classList.toggle("open");
      toggleBtn.classList.toggle("open", isOpen);
    }

    btnReset.addEventListener("click", (e) => {
      e.preventDefault();
      resetToDefaults();
    });

    btnSaveOne.addEventListener("click", (e) => {
      e.preventDefault();
      saveOne();
      showToast("Карточка сохранена");
    });

    function markDirty() {
      node.classList.add("card--dirty");
    }

    function resetToDefaults() {
      if (fieldTitle) fieldTitle.value = item.defaults.title || "";
      if (fieldDescription) fieldDescription.value = item.defaults.description || "";
      if (fieldH1) fieldH1.value = item.defaults.h1 || "";
      if (fieldSlug) fieldSlug.value = item.defaults.slug || "";
      if (fieldRobots) fieldRobots.value = item.defaults.robots || "index,follow";
      if (fieldCanonical) fieldCanonical.value = item.defaults.canonical || "";
      if (fieldPageType) fieldPageType.value = item.defaults.pageType || item.type || "other";
      if (fieldOgTitle) fieldOgTitle.value = item.defaults.ogTitle || "";
      if (fieldOgDescription) fieldOgDescription.value = item.defaults.ogDescription || "";
      if (fieldOgImage) fieldOgImage.value = item.defaults.ogImage || "";
      if (fieldTwitterCard) fieldTwitterCard.value = item.defaults.twitterCard || "summary_large_image";
      if (fieldOgType) fieldOgType.value = item.defaults.ogType || (item.type === "course" || item.type === "recommendation" ? "article" : "website");
      if (fieldImageAlt) fieldImageAlt.value = item.defaults.imageAlt || "";
      if (fieldImageCaption) fieldImageCaption.value = item.defaults.imageCaption || "";
      if (fieldCompleteFlag) fieldCompleteFlag.checked = false;

      updateCounters();
      updateImagePreview();

      if (item.type === "image") {
        titleEl.textContent = fieldImageAlt && fieldImageAlt.value
          ? fieldImageAlt.value
          : (fieldSlug && fieldSlug.value) || "Изображение";
      } else {
        titleEl.textContent = fieldTitle && fieldTitle.value ? fieldTitle.value : "Без title";
      }

      const itemStatus = inferStatus();
      updateStatusBadge(badgeStatusEl, itemStatus, fieldCompleteFlag && fieldCompleteFlag.checked);
      node.classList.remove("card--dirty");
      delete drafts[item.id];
      saveDrafts();
    }

    function inferStatus() {
      const isImage = item.type === "image";

      const hasTitle = fieldTitle ? Boolean(fieldTitle.value.trim()) : false;
      const hasDescription = fieldDescription ? Boolean(fieldDescription.value.trim()) : false;
      const hasOgTitle = fieldOgTitle ? Boolean(fieldOgTitle.value.trim()) : false;
      const hasOgImage = fieldOgImage ? Boolean(fieldOgImage.value.trim()) : false;
      const hasAlt = fieldImageAlt ? Boolean(fieldImageAlt.value.trim()) : false;

      if (isImage) {
        if (!hasAlt) return "missing-required";
        return "complete";
      }

      if (!hasTitle || !hasDescription) return "missing-required";
      if (!hasOgTitle || !hasOgImage) return "missing-og";
      return "complete";
    }

    function saveOne() {
      const values = {
        title: fieldTitle ? fieldTitle.value : "",
        description: fieldDescription ? fieldDescription.value : "",
        h1: fieldH1 ? fieldH1.value : "",
        slug: fieldSlug ? fieldSlug.value : "",
        robots: fieldRobots ? fieldRobots.value : "",
        canonical: fieldCanonical ? fieldCanonical.value : "",
        pageType: fieldPageType ? fieldPageType.value : item.type || "other",
        ogTitle: fieldOgTitle ? fieldOgTitle.value : "",
        ogDescription: fieldOgDescription ? fieldOgDescription.value : "",
        ogImage: fieldOgImage ? fieldOgImage.value : "",
        twitterCard: fieldTwitterCard ? fieldTwitterCard.value : "",
        ogType: fieldOgType ? fieldOgType.value : "",
        imageAlt: fieldImageAlt ? fieldImageAlt.value : "",
        imageCaption: fieldImageCaption ? fieldImageCaption.value : ""
      };
      const status = inferStatus();
      drafts[item.id] = {
        values,
        complete: fieldCompleteFlag ? fieldCompleteFlag.checked : false,
        status
      };
      saveDrafts();
      node.classList.remove("card--dirty");
      updateStatusBadge(badgeStatusEl, status, fieldCompleteFlag ? fieldCompleteFlag.checked : false);
      item.status = status;
      refreshStats();
    }

    cardsRegistry.set(item.id, {
      node,
      item,
      saveOne,
      inferStatus,
      updateStatusBadgeRef: () => {
        const status = inferStatus();
        updateStatusBadge(badgeStatusEl, status, fieldCompleteFlag ? fieldCompleteFlag.checked : false);
      }
    });

    return node;
  }

  function updateStatusBadge(el, status, completeFlag) {
    let label = "";
    el.classList.remove("badge-status--warning", "badge-status--ok");
    if (completeFlag) {
      label = "отмечено как заполнено";
      el.classList.add("badge-status--ok");
    } else if (status === "missing-required") {
      label = "нет обязательных полей";
      el.classList.add("badge-status--warning");
    } else if (status === "missing-og") {
      label = "нет Open Graph";
      el.classList.add("badge-status--warning");
    } else {
      label = "заполнено";
      el.classList.add("badge-status--ok");
    }
    el.textContent = label;
  }

  function renderAll() {
    elCardsContainer.innerHTML = "";
    const searchValue = (elSearch.value || "").toLowerCase().trim();

    const activeItems = MOCK_ITEMS.filter((item) => {
      const persisted = drafts[item.id];
      const status = persisted?.status || item.status || "missing-required";

      if (activeType !== "all" && item.type !== activeType) return false;
      if (activeStatus !== "all" && activeStatus !== status) return false;

      if (searchValue) {
        const defaults = item.defaults || {};
        const haystack = [
          item.path,
          defaults.title,
          defaults.h1,
          defaults.slug,
          defaults.imageAlt
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(searchValue)) return false;
      }

      return true;
    });

    activeItems.forEach((item) => {
      const card = createCard(item);
      elCardsContainer.appendChild(card);
    });

    refreshStats();
  }

  function refreshStats() {
    const total = MOCK_ITEMS.length;
    let missing = 0;
    let complete = 0;

    MOCK_ITEMS.forEach((item) => {
      const persisted = drafts[item.id];
      const status = persisted?.status || item.status || "missing-required";
      if (status === "missing-required" || status === "missing-og") missing++;
      if (status === "complete" || persisted?.complete) complete++;
    });

    elStatTotal.textContent = total;
    elStatMissing.textContent = missing;
    elStatComplete.textContent = complete;
  }

  function bindFilters() {
    elTypeFilters.addEventListener("click", (e) => {
      const btn = e.target.closest(".chip");
      if (!btn) return;
      elTypeFilters.querySelectorAll(".chip").forEach((chip) => chip.classList.remove("chip-active"));
      btn.classList.add("chip-active");
      activeType = btn.dataset.type || "all";
      renderAll();
    });

    elStatusFilters.addEventListener("click", (e) => {
      const btn = e.target.closest(".chip");
      if (!btn) return;
      elStatusFilters.querySelectorAll(".chip").forEach((chip) => chip.classList.remove("chip-active"));
      btn.classList.add("chip-active");
      activeStatus = btn.dataset.status || "all";
      renderAll();
    });

    elSearch.addEventListener("input", () => {
      renderAll();
    });
  }

  function bindBulkControls() {
    elBtnCollapseAll.addEventListener("click", () => {
      document.querySelectorAll(".card-body.open").forEach((el) => el.classList.remove("open"));
      document.querySelectorAll(".card-toggle.open").forEach((el) => el.classList.remove("open"));
    });

    elBtnExpandAll.addEventListener("click", () => {
      document.querySelectorAll(".card-body").forEach((el) => el.classList.add("open"));
      document.querySelectorAll(".card-toggle").forEach((el) => el.classList.add("open"));
    });

    elBtnSaveAll.addEventListener("click", () => {
      cardsRegistry.forEach((entry) => {
        entry.saveOne();
      });
      showToast("Все карточки сохранены (черновики в localStorage)");
    });
  }

  function init() {
    bindFilters();
    bindBulkControls();
    renderAll();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();