/**
 * dashboard/feature-posts.js
 * --------------------------
 * "What we're building" roadmap feed: post cards, emoji reactions, comments,
 * admin create/edit/delete, and image preview.
 *
 * Depends on: state.js, modals.js, api.js, avatar-utils.js,
 *             rich-text-editor.js (RichTextEditor global)
 */

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let featurePostsList = [];
let featurePostsAdmin = false;
let featurePostCommentsCache = new Map(); // postId → Comment[]
let featurePostOpenComments = new Set(); // postId set
let featurePostSaving = false;
let featurePostReactionPicker = null; // { postId, anchor }

// ---------------------------------------------------------------------------
// Reaction emoji map
// ---------------------------------------------------------------------------

const FEATURE_POST_REACTION_EMOJIS = {
  love: "❤️",
  money: "🤑",
  ok: "👍",
  haha: "😂",
  sad: "😢",
  angry: "😠",
  fire: "🔥",
  clap: "👏",
  think: "🤔",
  party: "🎉",
  eyes: "👀",
  hundred: "💯",
};

function featurePostReactionSymbol(emoji) {
  return FEATURE_POST_REACTION_EMOJIS[emoji] || emoji;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatFeaturePostDate(iso) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function featurePostTypeBadge(postType) {
  if (postType === "completed") {
    return '<span class="inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">Shipped</span>';
  }
  return '<span class="inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full bg-brand-500/15 text-brand-200 border border-brand-500/25">In progress</span>';
}

// ---------------------------------------------------------------------------
// Reaction picker
// ---------------------------------------------------------------------------

function closeFeaturePostReactionPicker() {
  featurePostReactionPicker = null;
  const layer = document.getElementById("featurePostReactionLayer");
  if (layer) layer.innerHTML = "";
}

function openFeaturePostReactionPicker(postId, anchorEl) {
  if (window.currentUser?.is_guest) return;

  if (featurePostReactionPicker?.postId === postId) {
    closeFeaturePostReactionPicker();
    return;
  }

  featurePostReactionPicker = { postId, anchor: anchorEl };
  const layer = document.getElementById("featurePostReactionLayer");
  if (!layer) return;

  const picker = document.createElement("div");
  picker.className =
    "reaction-picker pointer-events-auto absolute flex flex-wrap gap-0.5 p-2 rounded-xl bg-ink-700 border border-white/15 max-w-[240px]";
  picker.onclick = (e) => e.stopPropagation();
  picker.innerHTML = Object.entries(FEATURE_POST_REACTION_EMOJIS)
    .map(
      ([key, sym]) =>
        `<button type="button" data-fp-reaction="${key}" class="text-lg hover:scale-110 transition p-1 rounded-lg hover:bg-white/10" title="${key}">${sym}</button>`,
    )
    .join("");

  picker.querySelectorAll("[data-fp-reaction]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFeaturePostReaction(postId, btn.dataset.fpReaction);
    });
  });

  layer.innerHTML = "";
  layer.appendChild(picker);

  const rect = anchorEl.getBoundingClientRect();
  picker.style.left = `${Math.min(rect.left, window.innerWidth - 260)}px`;
  picker.style.top = `${rect.bottom + 6}px`;
}

// Close picker on outside click
document.addEventListener("click", (e) => {
  if (
    featurePostReactionPicker &&
    !e.target.closest("#featurePostReactionLayer") &&
    !e.target.closest("[data-fp-add]")
  ) {
    closeFeaturePostReactionPicker();
  }
});

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderFeaturePostReactions(post) {
  const pills = (post.reactions || [])
    .map((r) => {
      const mine = (r.users || []).some(
        (u) => String(u.id) === String(window.currentUser?.id),
      );
      return `<button type="button" data-fp-pill data-post-id="${post.id}" data-emoji="${r.emoji}"
        class="reaction-pill inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 ${mine ? "reaction-pill-active" : ""}">
        <span>${featurePostReactionSymbol(r.emoji)}</span>
        <span class="text-gray-400">${r.count}</span>
      </button>`;
    })
    .join("");

  const addBtn = window.currentUser?.is_guest
    ? ""
    : `<button type="button" data-fp-add data-post-id="${post.id}"
        class="text-xs text-gray-500 hover:text-white px-1.5 py-0.5 rounded-full hover:bg-white/10 transition" title="Add reaction">+</button>`;

  return `<div class="flex flex-wrap items-center gap-1.5 mt-3">${pills}${addBtn}</div>`;
}

function renderFeaturePostComments(postId) {
  const comments = featurePostCommentsCache.get(postId) || [];

  const list = comments
    .map(
      (
        c,
      ) => `<div class="flex gap-2.5 py-2.5 border-b border-white/5 last:border-0">
        ${userAvatarHtml(c.user, "w-8 h-8 text-xs shrink-0")}
        <div class="min-w-0 flex-1">
          <div class="flex items-baseline gap-2 flex-wrap">
            <span class="text-sm font-medium text-white">${escHtml(c.user?.username || "User")}</span>
            <span class="text-xs text-gray-500">${escHtml(formatFeaturePostDate(c.created_at))}</span>
          </div>
          <p class="text-sm text-gray-300 mt-0.5 whitespace-pre-wrap break-words">${escHtml(c.content)}</p>
        </div>
      </div>`,
    )
    .join("");

  const composer = window.currentUser?.is_guest
    ? `<p class="text-xs text-gray-500 mt-3">Sign in with a registered account to comment.</p>`
    : `<form class="flex gap-2 mt-3" onsubmit="submitFeaturePostComment(event, '${postId}')">
        <input type="text" maxlength="2000" required placeholder="Write a comment…"
          class="flex-1 bg-ink-900 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 transition" />
        <button type="submit" class="text-sm text-white bg-brand-500 hover:bg-brand-600 px-3 py-2 rounded-xl transition shrink-0">Post</button>
      </form>`;

  return `<div class="mt-4 pt-4 border-t border-white/10">
    <div class="space-y-0">${list || '<p class="text-sm text-gray-500 py-2">No comments yet.</p>'}</div>
    ${composer}
  </div>`;
}

function renderFeaturePostCard(post, index) {
  const author = post.author || {};
  const adminActions = featurePostsAdmin
    ? `<div class="flex gap-1 shrink-0">
        <button type="button" onclick="openFeaturePostModal('${post.id}')"
          class="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-white/5 transition"
          aria-label="Edit post" title="Edit post">
          <svg class="w-4 h-4 md:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
          <span class="hidden md:inline text-xs px-0.5">Edit</span>
        </button>
        <button type="button" onclick="deleteFeaturePost('${post.id}')"
          class="text-red-400/80 hover:text-red-300 p-2 rounded-lg hover:bg-red-500/10 transition"
          aria-label="Delete post" title="Delete post">
          <svg class="w-4 h-4 md:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          <span class="hidden md:inline text-xs px-0.5">Delete</span>
        </button>
      </div>`
    : "";

  const image = post.image_url
    ? `<button type="button" class="block w-full mt-4 rounded-xl overflow-hidden border border-white/10 hover:border-white/20 transition focus:outline-none focus:ring-2 focus:ring-brand-500/40" data-fp-image data-image-url="${escHtml(post.image_url)}" data-image-title="${escHtml(post.title)}" aria-label="View image: ${escHtml(post.title)}">
        <img src="${escHtml(post.image_url)}" alt="" class="w-full max-h-80 object-cover pointer-events-none" loading="lazy" ${storageImageOnErrorAttr()} />
      </button>`
    : "";

  const commentsOpen = featurePostOpenComments.has(post.id);
  const commentToggle = `<button type="button" onclick="toggleFeaturePostComments('${post.id}')"
    class="text-sm text-gray-400 hover:text-white mt-3 transition">
    ${commentsOpen ? "Hide" : "View"} comments (${post.comment_count || 0})
  </button>`;
  const commentsBlock = commentsOpen
    ? `<div id="featurePostComments-${post.id}">${renderFeaturePostComments(post.id)}</div>`
    : "";

  return `<article class="bg-ink-800 border border-white/10 rounded-2xl p-5 fade-up" style="animation-delay:${index * 0.05}s" data-post-id="${post.id}">
    <div class="flex items-start justify-between gap-3 mb-3">
      <div class="flex items-center gap-3 min-w-0">
        ${userAvatarHtml(author, "w-10 h-10 text-sm shrink-0")}
        <div class="min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-sm font-medium text-white">${escHtml(author.username || "TaskFlow")}</span>
            ${featurePostTypeBadge(post.post_type)}
          </div>
          <p class="text-xs text-gray-500 mt-0.5">${escHtml(formatFeaturePostDate(post.created_at))}</p>
        </div>
      </div>
      ${adminActions}
    </div>
    <h3 class="text-lg font-semibold text-white">${escHtml(post.title)}</h3>
    ${RichTextEditor.renderCaptionHtml(post.caption)}
    ${image}
    ${renderFeaturePostReactions(post)}
    ${commentToggle}
    ${commentsBlock}
  </article>`;
}

function renderFeaturePostsList() {
  const list = document.getElementById("featurePostsList");
  if (!list) return;

  if (!featurePostsList.length) {
    list.innerHTML =
      '<p class="text-sm text-gray-500">No roadmap posts yet.</p>';
    return;
  }

  list.innerHTML = featurePostsList
    .map((post, i) => renderFeaturePostCard(post, i))
    .join("");
  bindFeaturePostInteractions();
}

function bindFeaturePostInteractions() {
  document.querySelectorAll("[data-fp-pill]").forEach((pill) => {
    pill.onclick = () =>
      toggleFeaturePostReaction(pill.dataset.postId, pill.dataset.emoji);
  });
  document.querySelectorAll("[data-fp-add]").forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      openFeaturePostReactionPicker(btn.dataset.postId, btn);
    };
  });
  document.querySelectorAll("[data-fp-image]").forEach((btn) => {
    btn.onclick = () =>
      openFeaturePostImagePreview(btn.dataset.imageUrl, btn.dataset.imageTitle);
  });
}

// ---------------------------------------------------------------------------
// Image preview modal
// ---------------------------------------------------------------------------

window.openFeaturePostImagePreview = function openFeaturePostImagePreview(
  url,
  title,
) {
  const modal = document.getElementById("featurePostImageModal");
  const img = document.getElementById("featurePostImageModalImg");
  const titleEl = document.getElementById("featurePostImageModalTitle");
  const link = document.getElementById("featurePostImageModalOpenLink");
  if (!modal || !img || !url) return;

  img.src = url;
  img.alt = title || "Roadmap post image";
  if (titleEl) titleEl.textContent = title || "Image";
  if (link) link.href = url;

  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  pushDashboardOverlay("featurePostImage");
};

window.closeFeaturePostImagePreview = function closeFeaturePostImagePreview() {
  const modal = document.getElementById("featurePostImageModal");
  const img = document.getElementById("featurePostImageModalImg");
  modal?.classList.add("hidden");
  if (img) {
    img.removeAttribute("src");
    img.alt = "";
  }
  document.body.style.overflow = "";
};

// ---------------------------------------------------------------------------
// API: load, react, comment
// ---------------------------------------------------------------------------

window.loadFeaturePosts = async function loadFeaturePosts() {
  const r = await apiFetch("/api/feature-posts");
  if (!r.ok) return;
  const data = await parseJsonResponse(r);
  if (!data?.posts) return;

  featurePostsList = data.posts;
  featurePostsAdmin = !!data.is_admin;
  document
    .getElementById("featurePostNewBtn")
    ?.classList.toggle("hidden", !featurePostsAdmin);

  renderFeaturePostsList();
};

window.toggleFeaturePostReaction = async function toggleFeaturePostReaction(
  postId,
  emoji,
) {
  if (window.currentUser?.is_guest) return;
  closeFeaturePostReactionPicker();

  const r = await apiFetch("/api/reactions/toggle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messageType: "feature_post",
      messageId: postId,
      emoji,
    }),
  });
  const data = await parseJsonResponse(r);
  if (!r.ok) return showAlert(data.error || "Failed to react");

  const idx = featurePostsList.findIndex((p) => p.id === postId);
  if (idx !== -1) {
    featurePostsList[idx] = {
      ...featurePostsList[idx],
      reactions: data.reactions || [],
    };
    renderFeaturePostsList();
  }
};

window.toggleFeaturePostComments = async function toggleFeaturePostComments(
  postId,
) {
  if (featurePostOpenComments.has(postId)) {
    featurePostOpenComments.delete(postId);
  } else {
    featurePostOpenComments.add(postId);
    if (!featurePostCommentsCache.has(postId)) {
      const r = await apiFetch(`/api/feature-posts/${postId}/comments`);
      if (r.ok) {
        const comments = await parseJsonResponse(r);
        featurePostCommentsCache.set(
          postId,
          Array.isArray(comments) ? comments : [],
        );
      }
    }
  }
  renderFeaturePostsList();
};

window.submitFeaturePostComment = async function submitFeaturePostComment(
  e,
  postId,
) {
  e.preventDefault();
  if (window.currentUser?.is_guest) return;

  const input = e.target.querySelector("input");
  const content = input?.value?.trim();
  if (!content) return;

  const r = await apiFetch(`/api/feature-posts/${postId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  const data = await parseJsonResponse(r);
  if (!r.ok) return showAlert(data.error || "Failed to comment");

  const cached = featurePostCommentsCache.get(postId) || [];
  cached.push(data);
  featurePostCommentsCache.set(postId, cached);

  const idx = featurePostsList.findIndex((p) => p.id === postId);
  if (idx !== -1) {
    featurePostsList[idx] = {
      ...featurePostsList[idx],
      comment_count: (featurePostsList[idx].comment_count || 0) + 1,
    };
  }

  input.value = "";
  renderFeaturePostsList();
};

// ---------------------------------------------------------------------------
// Admin: create / edit / delete modal
// ---------------------------------------------------------------------------

function showFeaturePostModalError(msg) {
  const el = document.getElementById("featurePostModalError");
  if (!msg) {
    el.classList.add("hidden");
    el.textContent = "";
    return;
  }
  el.textContent = msg;
  el.classList.remove("hidden");
}

window.closeFeaturePostModal = function closeFeaturePostModal() {
  document.getElementById("featurePostModal")?.classList.add("hidden");
  showFeaturePostModalError("");
  featurePostSaving = false;
  RichTextEditor.clear("featurePostCaptionEditor");
};

window.openFeaturePostModal = function openFeaturePostModal(editId) {
  if (!featurePostsAdmin) return;

  const post = editId ? featurePostsList.find((p) => p.id === editId) : null;
  document.getElementById("featurePostEditId").value = post?.id || "";
  document.getElementById("featurePostTitle").value = post?.title || "";
  RichTextEditor.setContent("featurePostCaptionEditor", post?.caption || "");
  document.getElementById("featurePostType").value =
    post?.post_type || "in_progress";
  document.getElementById("featurePostImage").value = "";

  const preview = document.getElementById("featurePostImagePreview");
  const hint = document.getElementById("featurePostImageHint");
  if (post?.image_url) {
    preview.src = post.image_url;
    preview.classList.remove("hidden");
    hint.textContent = "Leave empty to keep the current image.";
    hint.classList.remove("hidden");
  } else {
    preview.classList.add("hidden");
    preview.removeAttribute("src");
    hint.classList.add("hidden");
  }

  document.getElementById("featurePostModalTitle").textContent = post
    ? "Edit roadmap post"
    : "New roadmap post";
  document.getElementById("featurePostSubmitBtn").textContent = post
    ? "Save changes"
    : "Publish";

  showFeaturePostModalError("");
  document.getElementById("featurePostModal").classList.remove("hidden");
};

window.submitFeaturePost = async function submitFeaturePost(e) {
  e.preventDefault();
  if (featurePostSaving || !featurePostsAdmin) return;
  featurePostSaving = true;

  const btn = document.getElementById("featurePostSubmitBtn");
  const prevText = btn.textContent;
  btn.textContent = "Saving…";
  btn.classList.add("btn-loading");

  const editId = document.getElementById("featurePostEditId").value;
  const caption = RichTextEditor.syncHidden("featurePostCaptionEditor");

  if (RichTextEditor.getPlainTextLength("featurePostCaptionEditor") < 10) {
    featurePostSaving = false;
    btn.textContent = prevText;
    btn.classList.remove("btn-loading");
    return showFeaturePostModalError("Caption must be at least 10 characters");
  }

  const formData = new FormData();
  formData.append("title", document.getElementById("featurePostTitle").value);
  formData.append("caption", caption);
  formData.append(
    "post_type",
    document.getElementById("featurePostType").value,
  );
  const fileInput = document.getElementById("featurePostImage");
  if (fileInput?.files?.[0]) formData.append("image", fileInput.files[0]);

  const url = editId ? `/api/feature-posts/${editId}` : "/api/feature-posts";
  const method = editId ? "PATCH" : "POST";
  const r = await apiFetch(url, { method, body: formData });
  const data = await parseJsonResponse(r);

  btn.textContent = prevText;
  btn.classList.remove("btn-loading");
  featurePostSaving = false;

  if (!r.ok) return showFeaturePostModalError(data.error || "Failed to save");

  closeFeaturePostModal();
  if (editId) {
    const idx = featurePostsList.findIndex((p) => p.id === editId);
    if (idx !== -1) featurePostsList[idx] = data;
  } else {
    featurePostsList.unshift(data);
  }
  renderFeaturePostsList();
};

window.deleteFeaturePost = async function deleteFeaturePost(postId) {
  if (!featurePostsAdmin) return;

  const post = featurePostsList.find((p) => p.id === postId);
  showConfirm({
    title: "Delete post",
    message: `Delete "${post?.title || "this post"}"? This cannot be undone.`,
    confirmLabel: "Delete",
    danger: true,
    onConfirm: async () => {
      const r = await apiFetch(`/api/feature-posts/${postId}`, {
        method: "DELETE",
      });
      if (!r.ok) {
        const data = await parseJsonResponse(r);
        return showAlert(data.error || "Failed to delete");
      }
      featurePostsList = featurePostsList.filter((p) => p.id !== postId);
      featurePostCommentsCache.delete(postId);
      featurePostOpenComments.delete(postId);
      renderFeaturePostsList();
    },
  });
};

// ---------------------------------------------------------------------------
// Image file input → inline preview
// ---------------------------------------------------------------------------

document.getElementById("featurePostImage")?.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  const preview = document.getElementById("featurePostImagePreview");
  if (!file) {
    preview.classList.add("hidden");
    return;
  }
  preview.src = URL.createObjectURL(file);
  preview.classList.remove("hidden");
});
