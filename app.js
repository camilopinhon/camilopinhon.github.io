(async function () {
  const data = window.PORTFOLIO_DATA;
  if (!data) {
    return;
  }

  const IMAGE_EXT_REGEX = /\.(avif|jpe?g|png|webp|gif)$/i;
  const isFileProtocol = window.location.protocol === "file:";

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
    loadedProjects: new Set()
  };

  setupStaticFields();
  renderProjectMenu();
  bindGlobalActions();
  showView("home");
  renderHomePreview();

  hydrateHomePhotosFromFolder().finally(() => {
    renderHomePreview();
  });

  if (state.selectedProject) {
    ensureProjectPhotosLoaded(state.selectedProject);
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

  async function hydrateHomePhotosFromFolder() {
    state.homeLoaded = false;
    const repoInfo = resolveGitHubRepoInfo();
    const homeProject = {
      id: "home",
      imageFolder: data?.home?.imageFolder || "home",
      title: "Home",
      photos: []
    };

    try {
      const photos = await detectProjectPhotos(homeProject, repoInfo);
      applyFastLayoutDefaults(homeProject, photos);
      state.homePhotos = photos;
      state.homePhotoIndex = 0;
    } catch (_error) {
      state.homePhotos = [];
      state.homePhotoIndex = 0;
    } finally {
      state.homeLoaded = true;
    }
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
      const repoInfo = resolveGitHubRepoInfo();
      const photos = await detectProjectPhotos(project, repoInfo);
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

  async function detectProjectPhotos(project, repoInfo) {
    const folderFiles = await listImagesFromFolder(project);
    const githubFiles = folderFiles.length ? [] : await listImagesFromGitHub(project, repoInfo);
    const detectedFiles = folderFiles.length ? folderFiles : githubFiles;

    const manualPhotos = Array.isArray(project.photos) ? project.photos : [];
    const manualByFile = new Map(
      manualPhotos
        .filter((photo) => photo && typeof photo.file === "string")
        .map((photo) => [photo.file, photo])
    );

    const mergedDetected = detectedFiles.map((file, index) => {
      const existing = manualByFile.get(file);
      if (existing) {
        return existing;
      }
      return {
        file,
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
      return typeof photo.file === "string" && !detectedFiles.includes(photo.file);
    });

    return [...mergedDetected, ...manualOnly];
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

    const endpoint =
      `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}` +
      `/contents/images/${encodeURIComponent(folder)}?ref=${encodeURIComponent(repoInfo.branch)}`;

    try {
      const response = await fetch(endpoint, {
        headers: { Accept: "application/vnd.github+json" }
      });
      if (!response.ok) {
        return [];
      }

      const entries = await response.json();
      if (!Array.isArray(entries)) {
        return [];
      }

      const files = entries
        .filter((entry) => entry?.type === "file")
        .map((entry) => entry?.name || "")
        .filter((name) => IMAGE_EXT_REGEX.test(name));

      return sortFilesNaturally(files);
    } catch (_error) {
      return [];
    }
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
    setImageSource(img, homeProject, homeImage);
    img.alt = homeImage.alt || "Home";
    img.loading = "eager";
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
    setImageSource(img, project, currentPhoto);
    img.alt = currentPhoto.alt || project.title;
    img.loading = "eager";
    projectFrame.appendChild(img);

    renderAllGrid(photos);
    allBtn.textContent = state.allMode ? "CLOSE" : "ALL";
    allBtn.classList.toggle("is-active", state.allMode);
  }

  function renderAllGrid(photos) {
    allGrid.innerHTML = "";
    if (!state.allMode) {
      return;
    }

    photos.forEach((photo, index) => {
      const fig = document.createElement("figure");
      fig.className = `grid-card ${photo.grid || ""}`.trim();

      const img = document.createElement("img");
      setImageSource(img, state.selectedProject, photo);
      img.alt = photo.alt || `Photo ${index + 1}`;
      img.loading = "lazy";
      img.addEventListener("click", () => {
        state.selectedPhotoIndex = index;
        state.allMode = false;
        renderProject();
      });

      fig.appendChild(img);
      allGrid.appendChild(fig);
    });
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

  function setImageSource(img, project, photo) {
    const candidates = buildPhotoCandidates(project, photo);
    if (!candidates.length) {
      img.removeAttribute("src");
      return;
    }

    let index = 0;
    img.onerror = () => {
      index += 1;
      if (index < candidates.length) {
        img.src = candidates[index];
        return;
      }
      img.onerror = null;
    };
    img.src = candidates[index];
  }

  function buildPhotoCandidates(project, photo) {
    if (photo?.src) {
      return [photo.src];
    }

    const fileName = photo?.file || "";
    const folder = project?.imageFolder || project?.id || "";
    if (!fileName || !folder) {
      return [];
    }

    const encodedFile = encodePathSegment(fileName);
    const encodedFolder = encodePathSegment(folder);
    const localEncoded = `images/${encodedFolder}/${encodedFile}`;
    const localRaw = `images/${folder}/${fileName}`;

    const candidates = [localEncoded];
    if (localRaw !== localEncoded) {
      candidates.push(localRaw);
    }

    const repoInfo = resolveGitHubRepoInfo();
    if (repoInfo) {
      candidates.push(
        `https://raw.githubusercontent.com/${repoInfo.owner}/${repoInfo.repo}/${repoInfo.branch}/images/${encodedFolder}/${encodedFile}`
      );
    }

    return [...new Set(candidates)];
  }

  function encodePathSegment(value) {
    return encodeURIComponent(value).replace(/%2F/g, "/");
  }
})();
