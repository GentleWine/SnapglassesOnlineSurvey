const state = {
  products: [],
  cart: new Map(),
  page: 1,
  pageSize: 12,
  query: "",
  token: sessionStorage.getItem("surveyToken") || "",
};

const gate = document.querySelector("#gate");
const app = document.querySelector("#app");
const grid = document.querySelector("#grid");
const catalog = document.querySelector("#catalog");
const cartView = document.querySelector("#cart-view");
const cartList = document.querySelector("#cart-list");
const banner = document.querySelector("#banner");

function apiUrl() {
  const base = (window.SURVEY_CONFIG && window.SURVEY_CONFIG.apiBase) || "";
  return base || "api";
}

async function api(action, payload) {
  const response = await fetch(apiUrl(), {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(Object.assign({ action }, payload || {})),
  });
  const data = await response.json().catch(() => ({ ok: false, error: "The server did not return JSON" }));
  return data;
}

function dataUrl(info) {
  if (!info || !info.data) return "";
  return `data:${info.mime || "image/jpeg"};base64,${info.data}`;
}

const imageCache = new Map();
let preloadGeneration = 0;

function applyCachedImages(root) {
  root.querySelectorAll("img[data-image]").forEach((img) => {
    const url = dataUrl(imageCache.get(img.dataset.image));
    if (!url) return;
    img.src = url;
    const frame = img.closest(".frame");
    if (frame) frame.classList.remove("loading");
  });
}

async function preloadImages(names, generation) {
  for (let index = 0; index < names.length; index += 8) {
    if (generation !== preloadGeneration || !state.token) return;
    const batch = names.slice(index, index + 8).filter((name) => !imageCache.has(name));
    if (!batch.length) continue;
    const data = await api("images", { token: state.token, names: batch });
    if (generation !== preloadGeneration || !state.token) return;
    if (!data.ok) {
      if (/access key|session/i.test(data.error || "")) showGate(data.error);
      return;
    }
    Object.entries(data.images || {}).forEach(([name, info]) => {
      if (info && info.data) imageCache.set(name, info);
    });
    applyCachedImages(document);
  }
}

function startPreload() {
  const generation = ++preloadGeneration;
  const names = [];
  const seen = new Set();
  state.products.forEach((item) => {
    if (!item.image || seen.has(item.image)) return;
    seen.add(item.image);
    names.push(item.image);
  });
  preloadImages(names, generation);
}

function pictureFrame(item, alt) {
  const frame = document.createElement("div");
  frame.className = "frame";
  const image = document.createElement("img");
  image.alt = alt;
  image.dataset.image = item.image;
  const url = dataUrl(imageCache.get(item.image));
  if (url) image.src = url;
  else frame.classList.add("loading");
  frame.appendChild(image);
  return frame;
}

function rememberToken(token) {
  state.token = token || "";
  if (state.token) sessionStorage.setItem("surveyToken", state.token);
  else {
    sessionStorage.removeItem("surveyToken");
    imageCache.clear();
    preloadGeneration += 1;
  }
}

function showBanner(text) {
  banner.hidden = !text;
  banner.textContent = text || "";
}

async function enterApp() {
  const data = await api("products", { token: state.token });
  if (!data.ok) {
    rememberToken("");
    showGate(data.error || "Enter the access key");
    return;
  }
  state.products = data.products || [];
  document.querySelector("#page-size").max = String(Math.max(1, state.products.length));
  gate.hidden = true;
  app.hidden = false;
  catalog.hidden = false;
  cartView.hidden = true;
  renderCatalog();
  startPreload();
}

function showGate(message) {
  app.hidden = true;
  gate.hidden = false;
  cartView.hidden = true;
  catalog.hidden = false;
  const done = document.querySelector("#gate-done");
  done.hidden = !message;
  done.textContent = message || "";
  document.querySelector("#key").value = "";
}

document.querySelector("#gate-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const error = document.querySelector("#gate-error");
  error.hidden = true;
  const key = document.querySelector("#key").value.trim();
  const data = await api("login", { key });
  if (!data.ok) {
    error.hidden = false;
    error.textContent = data.error || "Could not enter";
    return;
  }
  rememberToken(data.token);
  document.querySelector("#gate-done").hidden = true;
  await enterApp();
});

document.querySelector("#logout").addEventListener("click", async () => {
  rememberToken("");
  state.cart.clear();
  showGate();
});

function filtered() {
  const query = state.query.trim().toLowerCase();
  if (!query) return state.products;
  return state.products.filter((item) =>
    `${item.product} ${item.brand}`.toLowerCase().includes(query)
  );
}

function renderCatalog() {
  const items = filtered();
  const size = state.pageSize;
  const pages = Math.max(1, Math.ceil(items.length / size));
  state.page = Math.min(state.page, pages);
  const start = (state.page - 1) * size;
  const slice = items.slice(start, start + size);
  document.querySelector("#count-label").textContent = `${items.length} frames`;
  document.querySelector("#page-label").textContent = `${state.page} / ${pages}`;
  document.querySelector("#prev").disabled = state.page <= 1;
  document.querySelector("#next").disabled = state.page >= pages;
  document.querySelector("#cart-count").textContent = String(state.cart.size);
  grid.replaceChildren();
  slice.forEach((item) => grid.appendChild(productCard(item)));
}

function productCard(item) {
  const card = document.createElement("article");
  card.className = "product";
  const frame = pictureFrame(item, item.product);
  frame.classList.add("zoom");
  frame.addEventListener("click", () => openDetail(item));
  const body = document.createElement("div");
  body.className = "product-body";
  const brand = document.createElement("p");
  brand.className = "brand";
  brand.textContent = item.brand;
  const title = document.createElement("h2");
  title.textContent = item.product;
  const meta = document.createElement("p");
  meta.className = "meta";
  meta.textContent = `Lens ${item.lens_width} mm · Bridge ${item.bridge_width} mm`;
  const styles = document.createElement("div");
  styles.className = "styles";
  [item.style_age, item.style_fashion, item.style_approachable].forEach((label) => {
    if (!label) return;
    const chip = document.createElement("span");
    chip.textContent = label;
    styles.appendChild(chip);
  });
  const actions = document.createElement("div");
  actions.className = "product-actions";
  const add = document.createElement("button");
  add.type = "button";
  const selected = state.cart.has(item.id);
  add.textContent = selected ? "Remove" : "Add to cart";
  add.className = selected ? "in-cart" : "";
  add.addEventListener("click", () => toggleCart(item.id));
  const more = document.createElement("button");
  more.type = "button";
  more.textContent = "Details";
  more.addEventListener("click", () => openDetail(item));
  actions.append(add, more);
  body.append(brand, title, meta, styles, actions);
  card.append(frame, body);
  return card;
}

function toggleCart(id) {
  if (state.cart.has(id)) state.cart.delete(id);
  else state.cart.set(id, { rank: 0, score: 0 });
  renderCatalog();
  if (!cartView.hidden) renderCart();
}

function openDetail(item) {
  const dialog = document.querySelector("#detail");
  const image = document.querySelector("#detail-image");
  const frame = image.closest(".frame");
  image.removeAttribute("src");
  image.alt = item.product;
  image.dataset.image = item.image;
  const cachedUrl = dataUrl(imageCache.get(item.image));
  if (cachedUrl) {
    image.src = cachedUrl;
    frame.classList.remove("loading");
  } else {
    frame.classList.add("loading");
  }
  const body = document.querySelector("#detail-body");
  body.replaceChildren();
  const rows = [
    ["Id", item.id],
    ["Name", item.product],
    ["Brand", item.brand],
    ["Lens width", `${item.lens_width} mm`],
    ["Bridge width", `${item.bridge_width} mm`],
    ["Age impression", item.style_age],
    ["Fashion", item.style_fashion],
    ["Approachability", item.style_approachable],
    ["Image", item.image],
  ];
  rows.forEach(([label, value]) => {
    const line = document.createElement("p");
    line.className = "meta";
    const strong = document.createElement("strong");
    strong.textContent = `${label}: `;
    line.append(strong, document.createTextNode(value || "—"));
    body.appendChild(line);
  });
  if (!dialog.open) dialog.showModal();
}

document.querySelector("#detail-close").addEventListener("click", () => {
  document.querySelector("#detail").close();
});

document.querySelector("#page-size").addEventListener("change", (event) => {
  const max = state.products.length || 1;
  let size = Number(event.target.value);
  if (!Number.isFinite(size)) size = 12;
  size = Math.min(max, Math.max(1, Math.round(size)));
  event.target.value = String(size);
  state.pageSize = size;
  state.page = 1;
  renderCatalog();
});

document.querySelector("#query").addEventListener("input", (event) => {
  state.query = event.target.value;
  state.page = 1;
  renderCatalog();
});

document.querySelector("#prev").addEventListener("click", () => {
  state.page -= 1;
  renderCatalog();
});

document.querySelector("#next").addEventListener("click", () => {
  state.page += 1;
  renderCatalog();
});

document.querySelector("#open-cart").addEventListener("click", () => {
  catalog.hidden = true;
  cartView.hidden = false;
  showBanner("");
  renderCart();
});

document.querySelector("#back").addEventListener("click", () => {
  cartView.hidden = true;
  catalog.hidden = false;
  renderCatalog();
});

function renderCart() {
  document.querySelector("#cart-count").textContent = String(state.cart.size);
  cartList.replaceChildren();
  if (state.cart.size === 0) {
    const empty = document.createElement("p");
    empty.className = "rule";
    empty.textContent = "The cart is empty. Go back and add frames you like. Frames you leave out count as low value and are not saved.";
    cartList.appendChild(empty);
    return;
  }
  state.cart.forEach((score, id) => {
    const item = state.products.find((product) => product.id === id);
    if (!item) return;
    cartList.appendChild(cartRow(item, score));
  });
}

function cartRow(item, score) {
  const row = document.createElement("article");
  row.className = "cart-item";
  row.dataset.id = item.id;
  const frame = pictureFrame(item, "");
  const body = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = item.product;
  const meta = document.createElement("p");
  meta.className = "meta";
  meta.textContent = `${item.brand} · Lens ${item.lens_width} mm · Bridge ${item.bridge_width} mm`;
  body.append(title, meta, choiceGroup(item.id, "rank", "Rank", [1, 2, 3], score.rank), choiceGroup(item.id, "score", "Score", [1, 2, 3, 4, 5, 6, 7], score.score));
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "remove";
  remove.textContent = "Remove";
  remove.addEventListener("click", () => {
    state.cart.delete(item.id);
    renderCart();
  });
  body.appendChild(remove);
  row.append(frame, body);
  return row;
}

function choiceGroup(id, field, label, values, current) {
  const wrap = document.createElement("div");
  const caption = document.createElement("p");
  caption.className = "meta";
  caption.textContent = label;
  const choices = document.createElement("div");
  choices.className = "choices";
  values.forEach((value) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice" + (current === value ? " selected" : "");
    button.textContent = field === "rank" ? `Rank ${value}` : String(value);
    button.addEventListener("click", () => {
      const saved = state.cart.get(id);
      if (!saved) return;
      saved[field] = value;
      choices.querySelectorAll(".choice").forEach((node) => node.classList.remove("selected"));
      button.classList.add("selected");
    });
    choices.appendChild(button);
  });
  wrap.append(caption, choices);
  return wrap;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      resolve(text.slice(text.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

document.querySelector("#profile").addEventListener("submit", async (event) => {
  event.preventDefault();
  const error = document.querySelector("#form-error");
  error.hidden = true;
  const missing = [...state.cart.entries()].filter(([, score]) => !score.rank || !score.score);
  document.querySelectorAll(".cart-item").forEach((row) => row.classList.remove("missing"));
  if (state.cart.size === 0 || missing.length) {
    error.hidden = false;
    error.textContent = state.cart.size === 0
      ? "Add at least one frame and score both levels."
      : "Every frame in the cart still needs a rank and a score.";
    missing.forEach(([id]) => {
      const row = cartList.querySelector(`[data-id="${id}"]`);
      if (row) row.classList.add("missing");
    });
    return;
  }
  const form = event.currentTarget;
  const photo = form.avatar.files && form.avatar.files[0];
  if (!photo) {
    error.hidden = false;
    error.textContent = "Upload a photo";
    return;
  }
  const finish = document.querySelector("#finish");
  finish.disabled = true;
  try {
    const cart = [...state.cart.entries()].map(([id, score]) => {
      const item = state.products.find((product) => product.id === id);
      return {
        id,
        rank: score.rank,
        score: score.score,
        product: item.product,
        brand: item.brand,
        image: item.image,
      };
    });
    const data = await api("submit", {
      token: state.token,
      name: form.name.value,
      gender: form.gender.value,
      age: form.age.value,
      contact: form.contact.value,
      avatar: { data: await fileToBase64(photo), type: photo.type },
      cart,
    });
    if (!data.ok) {
      error.hidden = false;
      error.textContent = data.error || "Could not save";
      if (/access key|session/i.test(data.error || "")) showGate(data.error);
      return;
    }
    state.cart.clear();
    form.reset();
    document.querySelector("#avatar-preview").hidden = true;
    cartView.hidden = true;
    catalog.hidden = false;
    state.page = 1;
    renderCatalog();
    showBanner(`Saved record ${data.record_id}. Keep browsing, or end the session for the next guest.`);
    window.scrollTo(0, 0);
  } finally {
    finish.disabled = false;
  }
});

document.querySelector('input[name="avatar"]').addEventListener("change", (event) => {
  const file = event.target.files && event.target.files[0];
  const preview = document.querySelector("#avatar-preview");
  if (!file) {
    preview.hidden = true;
    return;
  }
  preview.src = URL.createObjectURL(file);
  preview.hidden = false;
});

if (state.token) {
  api("session", { token: state.token }).then(async (data) => {
    if (data.ok) await enterApp();
    else rememberToken("");
  });
}
