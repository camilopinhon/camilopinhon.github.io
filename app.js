(async function () {
  const data = window.PORTFOLIO_DATA;
  if (!data) {
    return;
  }

  const IMAGE_EXT_REGEX = /\.(avif|jpe?g|png|webp|gif)$/i;
  const isFileProtocol = window.location.protocol === "file:";
  const MAIN_IMAGE_SIZES = "(max-width: 920px) 360px, 1000px";
  const GRID_IMAGE_SIZES = {
    default: "(max-width: 920px) 50vw, 33vw",
    wide: "(max-width: 920px) 50vw, 66vw",
    narrow: "(max-width: 920px) 50vw, 25vw"
  };

  const projectNav = document.getElementById("project-nav");
  const instagramLink = document.getElementById("instagram-link");
  const homeView = document.getElementById("home-view");
  const projectView = document.getElementById("project-view");
  const contactView = document.getElementById("contact-view");
  const projectTitle = document.getElementById("project-title");
  const projectFrame = document.getElementById("project-frame");
  const homePreview = document.getElementById("home-preview");
  const allGrid = document.getElementById("all-grid");
  const prevBtn = document.getElementById("prev-btn");
  const nextBtn = document.getElementById("next-btn");
  const allBtn = document.getElementById("all-btn");

  const contactName = document.getElementById("contact-name");
  const contactEmail = document.getElementById("contact-email");
  const contactLocation = document.getElementById("contact-location");

  const state = {
    selectedProject: null,
    selectedPhotoIndex: 0,
    allMode: false,
    homePhotos: [],
    homePhotoIndex: 0,
    homeLoaded: false,
    projectLoadPromises: new Map(),
    loadedProjects: new Set(),
    imageManifest: null,
    githubImageIndex: null,
    githubImageIndexPromise: null,
    gridImageObserver: null
  };

  setupStaticFields();
  renderProjectMenu();
  bindGlobalActions();
  showView("home");
  renderHomePreview();

  loadImageManifest().finally(() => {
    hydrateHomePhotosFromFolder().finally(() => {
      renderHomePreview();
    });
  });

  if (state.selectedProject) {
    ensureProjectPhotosLoaded(state.selectedProject);
  }

  async function loadImageManifest() {
    try {
      const response = await fetch("images/manifest.json", { cache: "no-store" });
      if (!response.ok) {
        state.imageManifest = null;
        return;
      }
      const manifest = await response.json();
      if (!manifest || typeof manifest !== "object" || typeof manifest.projects !== "object") {
        state.imageManifest = null;
        return;
      }
      state.imageManifest = manifest;
    } catch (_error) {
      state.imageManifest = null;
    }
  }

  function getManifestPhotos(project) {
    const folder = project?.imageFolder || project?.id;
    if (!folder) {
      return [];
    }
    const entries = state.imageManifest?.projects?.[folder];
    if (!Array.isArray(entries)) {
      return [];
    }
    return entries
      .filter((photo) => photo && typeof photo.file === "string")
      .map((photo) => ({
        file: photo.file,
        alt: photo.alt || "",
        width: Number(photo.width) || undefined,
        height: Number(photo.height) || undefined,
        sources: normalizePhotoSources(photo.sources)
      }));
  }

  function normalizePhotoSources(sources) {
    if (!sources || typeof sources !== "object") {
      return undefined;
    }

    const main = sources.main && typeof sources.main === "object"
      ? Object.fromEntries(
          Object.entries(sources.main)
            .filter(([key, value]) => Number(key) > 0 && typeof value === "string")
            .sort((a, b) => Number(a[0]) - Number(b[0]))
        )
      : undefined;

    const thumb = typeof sources.thumb === "string" ? sources.thumb : undefined;
    return main || thumb ? { main, thumb } : undefined;
  }

  function getGridSizes(photo) {
    if (photo?.grid === "wide") {
      return GRID_IMAGE_SIZES.wide;
    }
    if (photo?.grid === "narrow") {
      return GRID_IMAGE_SIZES.narrow;
    }
    return GRID_IMAGE_SIZES.default;
  }

  function setImagePerformanceAttributes(img, options = {}) {
    img.decoding = "async";
    if (options.loading) {
      img.loading = options.loading;
    }
    if (options.fetchpriority) {
      img.fetchPriority = options.fetchpriority;
    }
  }

  function applyResponsiveSources(img, project, photo, options = {}) {
    const srcset = buildSrcSet(project, photo, options.variant);
    if (srcset) {
      img.srcset = srcset;
      img.sizes = options.sizes || MAIN_IMAGE_SIZES;
    } else {
      img.removeAttribute("srcset");
      img.removeAttribute("sizes");
    }
    setImageSource(img, project, photo, options.variant);
  }

  function buildSrcSet(project, photo, variant = "main") {
    const candidates = buildPhotoCandidates(project, photo, { variant });
    if (!candidates.length) {
      return "";
    }
    const uniqueByWidth = new Map();
    candidates.forEach((entry) => {
      if (entry.width > 0 && !uniqueByWidth.has(entry.width)) {
        uniqueByWidth.set(entry.width, entry.src);
      }
    });
    if (uniqueByWidth.size < 2) {
      return "";
    }
    return [...uniqueByWidth.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([width, src]) => `${src} ${width}w`)
      .join(", ");
  }

  function mergePhotoMetadata(primaryPhoto, secondaryPhoto) {
    const merged = { ...primaryPhoto, ...secondaryPhoto };
    if (primaryPhoto?.sources || secondaryPhoto?.sources) {
      merged.sources = {
        ...(primaryPhoto?.sources || {}),
        ...(secondaryPhoto?.sources || {})
      };
    }
    return merged;
  }

  function withSourceFallback(photo, project) {
    const safePhoto = photo || {};
    if (safePhoto.src) {
      return safePhoto;
    }
    return {
      ...safePhoto,
      sources: {
        ...(safePhoto.sources || {}),
        original: resolvePhotoSrc(project, safePhoto)
      }
    };
  }

  function hydrateHomePhotosFromFolder() {
    return (async () => {
      state.homeLoaded = false;
      const homeProject = {
        id: "home",
        imageFolder: data?.home?.imageFolder || "home",
        title: "Home",
        photos: []
      };

      try {
        const photos = await detectProjectPhotos(homeProject);
        applyFastLayoutDefaults(homeProject, photos);
        state.homePhotos = photos;
        state.homePhotoIndex = 0;
      } catch (_error) {
        state.homePhotos = [];
        state.homePhotoIndex = 0;
      } finally {
        state.homeLoaded = true;
      }
    })();
  }

  function setupStaticFields() {
    if (Array.isArray(data.siteTitle) && data.siteTitle.length === 2) {
      const brand = document.querySelector(".brand");
      brand.innerHTML = `<span>${escapeHtml(data.siteTitle[0])}</span><span>${escapeHtml(data.siteTitle[1])}</span>`;
    }

    instagramLink.href = data.instagramUrl || "#";

    contactName.textContent = data.contact?.name || "";
    contactEmail.textContent = data.contact?.email || "";
    contactEmail.href = `mailto:${data.contact?.email || ""}`;
    contactLocation.textContent = data.contact?.location || "";
  }

  function renderProjectMenu() {
    projectNav.innerHTML = "";
    data.projects.forEach((project, idx) => {
      const btn = document.createElement("button");
      btn.className = "menu-link";
      btn.type = "button";
      btn.textContent = project.title;
      btn.dataset.projectId = project.id;
      btn.addEventListener("click", () => {
        state.selectedProject = project;
        state.selectedPhotoIndex = 0;
        state.allMode = false;
        showView("project");
        renderProject();
      });

      projectNav.appendChild(btn);

      if (idx === 0) {
        state.selectedProject = project;
      }
    });
  }

  function bindGlobalActions() {
    document.querySelectorAll("[data-action='home']").forEach((el) => {
      el.addEventListener("click", (event) => {
        event.preventDefault();
        showView("home");
      });
    });

    document.querySelector("[data-action='contact']")?.addEventListener("click", () => {
      showView("contact");
    });

    prevBtn.addEventListener("click", () => {
      goPrev();
    });

    nextBtn.addEventListener("click", () => {
      goNext();
    });

    allBtn.addEventListener("click", () => {
      state.allMode = !state.allMode;
      renderProject();
    });

    document.addEventListener("keydown", (event) => {
      if (shouldIgnoreKeyboardEvent(event)) {
        return;
      }

      if (homeView.classList.contains("is-active") && state.homePhotos.length) {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          rotateHome(-1);
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          rotateHome(1);
        }
        return;
      }

      if (!projectView.classList.contains("is-active")) {
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrev();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
      }
    });

    projectFrame.addEventListener("click", (event) => {
      const image = projectFrame.querySelector("img");
      if (!image) {
        return;
      }

      const rect = image.getBoundingClientRect();
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      ) {
        return;
      }

      const midpoint = rect.left + rect.width / 2;
      if (event.clientX < midpoint) {
        goPrev();
      } else {
        goNext();
      }
    });

    homePreview.addEventListener("click", (event) => {
      if (!homeView.classList.contains("is-active") || !state.homePhotos.length) {
        return;
      }

      const image = homePreview.querySelector("img");
      if (!image) {
        return;
      }

      const rect = image.getBoundingClientRect();
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      ) {
        return;
      }

      const midpoint = rect.left + rect.width / 2;
      rotateHome(event.clientX < midpoint ? -1 : 1);
    });
  }

  async function ensureProjectPhotosLoaded(project) {
    if (!project?.id) {
      return;
    }

    if (state.loadedProjects.has(project.id)) {
      return;
    }

    const inFlight = state.projectLoadPromises.get(project.id);
    if (inFlight) {
      await inFlight;
      return;
    }

    const loadPromise = (async () => {
      const photos = await detectProjectPhotos(project);
      applyFastLayoutDefaults(project, photos);
      project.photos = photos;
      state.loadedProjects.add(project.id);
    })();

    state.projectLoadPromises.set(project.id, loadPromise);

    try {
      await loadPromise;
    } finally {
      state.projectLoadPromises.delete(project.id);
    }
  }

  async function detectProjectPhotos(project) {
    const repoInfo = resolveGitHubRepoInfo();
    const manifestPhotos = getManifestPhotos(project);
    const folderFiles = manifestPhotos.length ? [] : await listImagesFromFolder(project);
    const githubFiles = manifestPhotos.length || folderFiles.length
      ? []
      : await listImagesFromGitHub(project, repoInfo);
    const detectedPhotos = manifestPhotos.length
      ? manifestPhotos
      : (folderFiles.length ? folderFiles : githubFiles).map((file) => ({ file }));

    const manualPhotos = Array.isArray(project.photos) ? project.photos : [];
    const manualByFile = new Map(
      manualPhotos
        .filter((photo) => photo && typeof photo.file === "string")
        .map((photo) => [photo.file, photo])
    );

    const mergedDetected = detectedPhotos.map((detected, index) => {
      const existing = manualByFile.get(detected.file);
      if (existing) {
        return mergePhotoMetadata(detected, existing);
      }
      return {
        ...detected,
        alt: `${project.title} ${index + 1}`
      };
    });

    const manualOnly = manualPhotos.filter((photo) => {
      if (!photo) {
        return false;
      }
      if (photo.src) {
        return true;
      }
      return typeof photo.file === "string" && !detectedPhotos.some((detected) => detected.file === photo.file);
    });

    return [...mergedDetected, ...manualOnly].map((photo) => withSourceFallback(photo, project));
  }

  function applyFastLayoutDefaults(project, photos) {
    photos.forEach((photo, index) => {
      if (!photo.frame) {
        photo.frame = project.defaultFrame || "center";
      }
      if (!photo.grid && index % 7 === 0) {
        photo.grid = "wide";
      }
    });
  }

  async function listImagesFromFolder(project) {
    const folder = project?.imageFolder || project?.id;
    if (!folder) {
      return [];
    }

    const url = `images/${folder}/`;

    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        return [];
      }
      const html = await response.text();
      return sortFilesNaturally(extractImageFileNamesFromDirectoryHtml(html));
    } catch (_error) {
      return [];
    }
  }

  function extractImageFileNamesFromDirectoryHtml(html) {
    const links = [];
    const regex = /href\s*=\s*["']([^"']+)["']/gi;
    let match = regex.exec(html);

    while (match) {
      links.push(match[1]);
      match = regex.exec(html);
    }

    const files = links
      .map((href) => decodeURIComponent(href))
      .map((href) => href.split("?")[0])
      .map((href) => href.replace(/\/$/, ""))
      .map((href) => href.split("/").pop())
      .filter(Boolean)
      .filter((file) => !file.startsWith("."))
      .filter((file) => IMAGE_EXT_REGEX.test(file));

    return [...new Set(files)];
  }

  async function listImagesFromGitHub(project, repoInfo) {
    if (!repoInfo) {
      return [];
    }

    const folder = project?.imageFolder || project?.id;
    if (!folder) {
      return [];
    }

    try {
      const imageIndex = await getGitHubImageIndex(repoInfo);
      const files = imageIndex.get(folder) || [];
      return sortFilesNaturally(files);
    } catch (_error) {
      return [];
    }
  }

  async function getGitHubImageIndex(repoInfo) {
    if (state.githubImageIndex) {
      return state.githubImageIndex;
    }

    if (state.githubImageIndexPromise) {
      return state.githubImageIndexPromise;
    }

    const endpoint =
      `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}` +
      `/git/trees/${encodeURIComponent(repoInfo.branch)}?recursive=1`;

    state.githubImageIndexPromise = fetch(endpoint, {
      headers: { Accept: "application/vnd.github+json" }
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`GitHub tree API ${response.status}`);
        }
        return response.json();
      })
      .then((payload) => {
        const tree = Array.isArray(payload?.tree) ? payload.tree : [];
        const index = new Map();

        tree.forEach((entry) => {
          if (entry?.type !== "blob" || typeof entry.path !== "string") {
            return;
          }
          if (!entry.path.startsWith("images/")) {
            return;
          }
          if (!IMAGE_EXT_REGEX.test(entry.path)) {
            return;
          }

          const pathParts = entry.path.split("/");
          if (pathParts.length < 3) {
            return;
          }
          const folder = pathParts[1];
          const file = pathParts.slice(2).join("/");
          if (!folder || !file) {
            return;
          }

          if (!index.has(folder)) {
            index.set(folder, []);
          }
          index.get(folder).push(file);
        });

        state.githubImageIndex = index;
        return index;
      })
      .finally(() => {
        state.githubImageIndexPromise = null;
      });

    return state.githubImageIndexPromise;
  }

  function resolveGitHubRepoInfo() {
    const configuredRepo = data?.github?.repo;
    const branch = data?.github?.branch || "main";

    if (configuredRepo && configuredRepo.includes("/")) {
      const [owner, repo] = configuredRepo.split("/");
      if (owner && repo) {
        return { owner, repo, branch };
      }
    }

    const hostname = window.location.hostname;
    if (!hostname.endsWith("github.io")) {
      return null;
    }

    const owner = hostname.split(".")[0];
    const pathParts = window.location.pathname.split("/").filter(Boolean);
    const repo = pathParts[0] || `${owner}.github.io`;
    return { owner, repo, branch };
  }

  function renderHomePreview() {
    const homeProject = {
      id: "home",
      imageFolder: data?.home?.imageFolder || "home",
      title: "Home"
    };
    const homeImage = state.homePhotos[state.homePhotoIndex];

    homePreview.innerHTML = "";

    if (!homeImage) {
      if (!state.homeLoaded) {
        homePreview.innerHTML = "<p></p>";
        return;
      }
      homePreview.innerHTML = isFileProtocol
        ? renderLocalWarningMessage()
        : '<p>No hay fotos en <code>images/home</code>.</p>';
      return;
    }

    const img = document.createElement("img");
    applyResponsiveSources(img, homeProject, homeImage, {
      variant: "thumb",
      sizes: "(max-width: 920px) 100vw, 640px"
    });
    img.alt = homeImage.alt || "Home";
    if (homeImage.width) {
      img.width = homeImage.width;
    }
    if (homeImage.height) {
      img.height = homeImage.height;
    }
    setImagePerformanceAttributes(img, { loading: "eager", fetchpriority: "high" });
    homePreview.appendChild(img);
  }

  async function renderProject() {
    if (!state.selectedProject) {
      return;
    }

    const project = state.selectedProject;
    projectTitle.textContent = project.title;
    allGrid.hidden = !state.allMode;
    highlightActiveLinks(project.id);

    if (!state.loadedProjects.has(project.id)) {
      projectFrame.className = `frame frame-${project.defaultFrame || "center"}`;
      projectFrame.innerHTML = "<p></p>";
      allGrid.innerHTML = "";
      await ensureProjectPhotosLoaded(project);
      if (state.selectedProject?.id === project.id) {
        renderProject();
      }
      return;
    }

    const photos = project.photos || [];
    if (!photos.length) {
      projectFrame.innerHTML = isFileProtocol
        ? renderLocalWarningMessage()
        : '<p>Este proyecto no tiene fotos todavia.</p>';
      allGrid.innerHTML = "";
      allBtn.classList.remove("is-active");
      return;
    }

    if (state.selectedPhotoIndex >= photos.length) {
      state.selectedPhotoIndex = 0;
    }

    const currentPhoto = photos[state.selectedPhotoIndex];
    projectFrame.className = `frame frame-${currentPhoto.frame || project.defaultFrame || "center"}`;
    projectFrame.innerHTML = "";

    const img = document.createElement("img");
    applyResponsiveSources(img, project, currentPhoto, {
      variant: "main",
      sizes: MAIN_IMAGE_SIZES
    });
    img.alt = currentPhoto.alt || project.title;
    if (currentPhoto.width) {
      img.width = currentPhoto.width;
    }
    if (currentPhoto.height) {
      img.height = currentPhoto.height;
    }
    setImagePerformanceAttributes(img, {
      loading: "eager",
      fetchpriority: state.selectedPhotoIndex === 0 ? "high" : "auto"
    });
    projectFrame.appendChild(img);

    renderAllGrid(photos);
    allBtn.textContent = state.allMode ? "CLOSE" : "ALL";
    allBtn.classList.toggle("is-active", state.allMode);
  }

  function renderAllGrid(photos) {
    allGrid.innerHTML = "";
    if (!state.allMode) {
      if (state.gridImageObserver) {
        state.gridImageObserver.disconnect();
        state.gridImageObserver = null;
      }
      return;
    }

    if (state.gridImageObserver) {
      state.gridImageObserver.disconnect();
      state.gridImageObserver = null;
    }

    if ("IntersectionObserver" in window) {
      state.gridImageObserver = new IntersectionObserver(
        (entries, observer) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) {
              return;
            }
            const img = entry.target;
            const loader = img.__lazyLoad;
            if (typeof loader === "function") {
              loader();
            }
            observer.unobserve(img);
          });
        },
        {
          root: null,
          rootMargin: "220px 0px",
          threshold: 0.01
        }
      );
    }

    const BATCH_SIZE = 18;
    let offset = 0;

    const renderBatch = () => {
      if (!state.allMode) {
        return;
      }

      const fragment = document.createDocumentFragment();
      const limit = Math.min(offset + BATCH_SIZE, photos.length);

      for (let index = offset; index < limit; index += 1) {
        const photo = photos[index];
        const fig = document.createElement("figure");
        fig.className = `grid-card ${photo.grid || ""}`.trim();

        const img = document.createElement("img");
        img.classList.add("grid-img-pending");
        img.__lazyLoad = () => {
          applyResponsiveSources(img, state.selectedProject, photo, {
            variant: "thumb",
            sizes: getGridSizes(photo)
          });
          img.classList.remove("grid-img-pending");
          img.__lazyLoad = null;
        };
        img.alt = photo.alt || `Photo ${index + 1}`;
        setImagePerformanceAttributes(img, { loading: "lazy" });
        if (state.gridImageObserver) {
          state.gridImageObserver.observe(img);
        } else {
          img.__lazyLoad();
        }
        img.addEventListener("click", () => {
          state.selectedPhotoIndex = index;
          state.allMode = false;
          renderProject();
        });

        fig.appendChild(img);
        fragment.appendChild(fig);
      }

      allGrid.appendChild(fragment);
      offset = limit;

      if (offset < photos.length) {
        requestAnimationFrame(renderBatch);
      }
    };

    requestAnimationFrame(renderBatch);
  }

  function showView(viewName) {
    homeView.classList.remove("is-active");
    projectView.classList.remove("is-active");
    contactView.classList.remove("is-active");

    document.querySelectorAll(".menu-link").forEach((el) => el.classList.remove("is-active"));

    if (viewName === "project") {
      projectView.classList.add("is-active");
      renderProject();
      return;
    }

    if (viewName === "contact") {
      contactView.classList.add("is-active");
      document.querySelector("[data-action='contact']")?.classList.add("is-active");
      return;
    }

    homeView.classList.add("is-active");
    document.querySelectorAll("[data-action='home']").forEach((el) => el.classList.add("is-active"));
  }

  function highlightActiveLinks(projectId) {
    document.querySelectorAll("[data-project-id]").forEach((el) => {
      el.classList.toggle("is-active", el.dataset.projectId === projectId);
    });
  }

  async function goPrev() {
    if (!state.selectedProject) {
      return;
    }

    await ensureProjectPhotosLoaded(state.selectedProject);

    const photos = state.selectedProject.photos || [];
    if (!photos.length) {
      return;
    }

    state.allMode = false;
    state.selectedPhotoIndex =
      (state.selectedPhotoIndex - 1 + photos.length) % photos.length;
    renderProject();
  }

  async function goNext() {
    if (!state.selectedProject) {
      return;
    }

    await ensureProjectPhotosLoaded(state.selectedProject);

    const photos = state.selectedProject.photos || [];
    if (!photos.length) {
      return;
    }

    state.allMode = false;
    state.selectedPhotoIndex = (state.selectedPhotoIndex + 1) % photos.length;
    renderProject();
  }

  function rotateHome(direction) {
    if (!state.homePhotos.length) {
      return;
    }
    state.homePhotoIndex =
      (state.homePhotoIndex + direction + state.homePhotos.length) % state.homePhotos.length;
    renderHomePreview();
  }

  function shouldIgnoreKeyboardEvent(event) {
    const active = document.activeElement;
    if (!active) {
      return false;
    }
    const tag = active.tagName;
    return (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      active.isContentEditable
    );
  }

  function sortFilesNaturally(files) {
    return [...files].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderLocalWarningMessage() {
    return [
      "<p>No se pueden detectar fotos al abrir este archivo directamente.</p>",
      "<p>Inicia un servidor local con <code>python3 -m http.server 4173</code> y abre <code>http://localhost:4173/</code>.</p>"
    ].join("");
  }

  function resolvePhotoSrc(project, photo) {
    if (photo?.src) {
      return photo.src;
    }

    const fileName = photo?.file || "";
    const folder = project?.imageFolder || project?.id || "";
    return `images/${folder}/${encodePathSegment(fileName)}`;
  }

  function setImageSource(img, project, photo, variant = "main") {
    const candidates = buildPhotoCandidates(project, photo, { variant });
    if (!candidates.length) {
      img.removeAttribute("src");
      return;
    }

    let index = 0;
    img.onerror = () => {
      index += 1;
      if (index < candidates.length) {
        img.src = candidates[index].src;
        return;
      }
      img.onerror = null;
    };
    img.src = candidates[index].src;
  }

  function buildPhotoCandidates(project, photo, options = {}) {
    const variant = options.variant || "main";
    if (photo?.src) {
      return [{ src: photo.src, width: Number(photo.width) || 0 }];
    }

    const fileName = photo?.file || "";
    const folder = project?.imageFolder || project?.id || "";
    if (!fileName || !folder) {
      return [];
    }

    const manifestSources = photo?.sources;
    const candidates = [];
    if (variant === "thumb" && typeof manifestSources?.thumb === "string") {
      candidates.push({ src: manifestSources.thumb, width: 640 });
    }
    if (manifestSources?.main && typeof manifestSources.main === "object") {
      Object.entries(manifestSources.main).forEach(([width, src]) => {
        if (typeof src === "string") {
          candidates.push({ src, width: Number(width) || 0 });
        }
      });
    }

    const encodedFile = encodePathSegment(fileName);
    const encodedFolder = encodePathSegment(folder);
    const localEncoded = `images/${encodedFolder}/${encodedFile}`;
    const localRaw = `images/${folder}/${fileName}`;
    const maxDeclaredWidth = Number(photo?.width) || 0;
    candidates.push({ src: localEncoded, width: maxDeclaredWidth });
    if (localRaw !== localEncoded) {
      candidates.push({ src: localRaw, width: maxDeclaredWidth });
    }

    const repoInfo = resolveGitHubRepoInfo();
    if (repoInfo) {
      candidates.push(
        {
          src: `https://raw.githubusercontent.com/${repoInfo.owner}/${repoInfo.repo}/${repoInfo.branch}/images/${encodedFolder}/${encodedFile}`,
          width: maxDeclaredWidth
        }
      );
    }

    const deduped = [];
    const seen = new Set();
    candidates.forEach((candidate) => {
      if (!candidate?.src || seen.has(candidate.src)) {
        return;
      }
      seen.add(candidate.src);
      deduped.push(candidate);
    });
    return deduped;
  }

  function encodePathSegment(value) {
    return encodeURIComponent(value).replace(/%2F/g, "/");
  }
})();
