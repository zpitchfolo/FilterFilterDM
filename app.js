(() => {
  const seed = window.SAMPLE_INBOX;
  const key = "filter-inbox-state-v1";
  const sidebarKey = "filter-sidebar-collapsed-v1";
  const blockedKey = "filter-blocked-senders-v1";
  const state = loadState();
  const categoryKey = "filter-category-guidance-v1";
  const categoryFields = {types:"messageType", tones:"tone", attention:"priority"};
  const categoryCatalog = loadCategoryCatalog();
  let activeView = "overview";
  let activeFilter = "all";
  let activeSource = "all";
  let activeMessageType = "all";
  let activeTone = "all";
  let activeTag = "all";
  let sortOrder = "newest";
  let selectedId = null;
  let reportTargetId = null;
  let toastTimer;

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "{}");
      let blockedSenders = [];
      try { blockedSenders = JSON.parse(localStorage.getItem(blockedKey) || "[]"); } catch {}
      return {comments: merge(seed.comments, saved.comments), conversations: merge(seed.conversations, saved.conversations), blockedSenders:Array.isArray(blockedSenders) ? blockedSenders : []};
    } catch { return {comments: structuredClone(seed.comments), conversations: structuredClone(seed.conversations), blockedSenders:[]}; }
  }
  function merge(original, changes) {
    const byId = new Map((changes || []).map(item => [item.id, item.priority === "Worth a reply" ? {...item, priority:"Needs a reply"} : item]));
    return original.map(item => {
      const saved = byId.get(item.id) || {};
      const merged = {...item, ...saved};
      merged.messageType = saved.messageType ?? saved.tag ?? item.messageType ?? item.tag ?? "Unclassified";
      merged.reviewed = saved.reviewed ?? (merged.status === "reviewed" || Boolean(item.reviewed));
      if (merged.status === "reviewed") merged.status = "read";
      merged.classificationSource ??= "sample";
      delete merged.tag;
      return merged;
    });
  }
  function save() { localStorage.setItem(key, JSON.stringify(state)); localStorage.setItem(blockedKey, JSON.stringify(state.blockedSenders || [])); }
  function allItems() { return [...state.comments, ...state.conversations]; }
  function categoryId(label) { return String(label).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `category-${Date.now()}`; }
  function defaultGuidance(label, field) {
    const defaults = {
      "Worth a look":"Surface thoughtful comments, useful feedback, recurring themes, and questions that may be valuable to respond to.",
      "Needs a reply":"A direct message includes an unanswered question, request, or follow-up that likely calls for your response.",
      "Question":"The message asks a clear question or requests information."
    };
    return defaults[label] || "";
  }
  function loadCategoryCatalog() {
    let stored = {};
    let hasSavedCatalog = false;
    try { const raw = localStorage.getItem(categoryKey); hasSavedCatalog = raw !== null; stored = JSON.parse(raw || "{}"); } catch {}
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) { stored = {}; hasSavedCatalog = false; }
    const catalog = {};
    for (const [group, field] of Object.entries(categoryFields)) {
      const entries = Array.isArray(stored[group]) ? stored[group].filter(x => x && typeof x.name === "string") : [];
      catalog[group] = entries.map(x => ({id:String(x.id || categoryId(x.name)), name:x.name.trim(), guidance:String(x.guidance || "")})).filter(x => x.name);
      if (!hasSavedCatalog || !Array.isArray(stored[group])) {
        for (const label of new Set(allItems().map(item => item[field]).filter(Boolean))) {
          if (!catalog[group].some(x => x.name.toLowerCase() === label.toLowerCase())) catalog[group].push({id:categoryId(label), name:label, guidance:defaultGuidance(label, field)});
        }
      }
    }
    return catalog;
  }
  function saveCategoryCatalog() { localStorage.setItem(categoryKey, JSON.stringify(categoryCatalog)); }
  function registerCategory(group, label) {
    if (!categoryCatalog[group].some(x => x.name.toLowerCase() === label.toLowerCase())) {
      categoryCatalog[group].push({id:categoryId(label), name:label, guidance:defaultGuidance(label, categoryFields[group])});
      saveCategoryCatalog();
    }
  }
  function categoryChoices(group, field) {
    return [...new Set([...categoryCatalog[group].map(x => x.name), ...allItems().map(x => x[field]).filter(Boolean)])].sort((a,b) => a.localeCompare(b));
  }
  function categoryRowMarkup(entry) {
    return `<div class="category-entry" data-category-id="${escapeHtml(entry.id)}"><label><span>Category name</span><input type="text" class="category-name" maxlength="48" value="${escapeHtml(entry.name)}"></label><label><span>When to use it</span><textarea class="category-guidance" rows="2" maxlength="240" placeholder="Add a short note for future classification">${escapeHtml(entry.guidance || "")}</textarea></label><button type="button" class="category-remove" aria-label="Remove ${escapeHtml(entry.name)} from future guidance" title="Remove from future guidance">Remove</button></div>`;
  }
  function renderCategoryEditor() {
    const titles = {types:"Message types", tones:"Tones", attention:"Attention labels"};
    const help = {types:"What kind of message is this?", tones:"How does it sound?", attention:"What action or attention should it suggest?"};
    document.querySelector("#category-groups").innerHTML = Object.keys(categoryFields).map(group => `<section class="category-group" data-category-group="${group}"><div class="category-group-heading"><div><h3>${titles[group]}</h3><p>${help[group]}</p></div><button type="button" class="action-button" data-add-category="${group}">Add category</button></div><div class="category-entries">${categoryCatalog[group].map(categoryRowMarkup).join("")}</div></section>`).join("");
  }
  function openCategoryEditor() { renderCategoryEditor(); document.querySelector("#category-dialog").showModal(); }
  function saveCategoryEditor() {
    const next = {};
    for (const group of Object.keys(categoryFields)) {
      const entries = [...document.querySelectorAll(`[data-category-group="${group}"] .category-entry`)].map(row => ({id:row.dataset.categoryId, name:row.querySelector(".category-name").value.trim(), guidance:row.querySelector(".category-guidance").value.trim()})).filter(x => x.name);
      const seen = new Set();
      for (const entry of entries) {
        const normalized = entry.name.toLowerCase();
        if (seen.has(normalized)) { showToast(`Use each ${group === "attention" ? "attention label" : group === "types" ? "message type" : "tone"} once`); return; }
        seen.add(normalized);
      }
      next[group] = entries;
    }
    for (const group of Object.keys(categoryFields)) categoryCatalog[group] = next[group];
    saveCategoryCatalog();
    document.querySelector("#category-dialog").close();
    renderFilters(); renderInbox(); showToast("Category guidance saved for future use");
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  function itemById(id) { return allItems().find(x => x.id === id); }
  function senderKey(item) { return `${item.platform || ""}:${(item.handle || item.author || "").trim().toLowerCase()}`; }
  function isBlocked(item) { return (state.blockedSenders || []).includes(senderKey(item)); }
  function isNoise(item) { return item.triage === "noise" || item.triage === "spam"; }
  function isInInbox(item) { return !isNoise(item) && !isBlocked(item); }
  function visibleItems() { return activeView === "comments" ? state.comments : state.conversations; }
  function showToast(message) {
    const el = document.querySelector("#toast"); el.textContent = message; el.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
  }
  function setSidebarCollapsed(collapsed) {
    document.querySelector(".app-shell").classList.toggle("sidebar-collapsed", collapsed);
    const button = document.querySelector("#sidebar-toggle");
    button.setAttribute("aria-expanded", String(!collapsed));
    button.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
    button.title = collapsed ? "Expand sidebar" : "Collapse sidebar";
  }
  function initialsAvatar(item, extra = "") { return `<span class="avatar avatar-${item.color} ${extra}">${escapeHtml(item.initials)}</span>`; }

  function renderOverview() {
    const comments = state.comments, dms = state.conversations;
    const needs = dms.filter(x => isInInbox(x) && x.priority === "Needs a reply" && x.status !== "read").length;
    const commentWorthCount = comments.filter(x => isInInbox(x) && x.priority === "Worth a look").length;
    const dmReplyCount = dms.filter(x => isInInbox(x) && x.priority === "Needs a reply").length;
    document.querySelector("#stat-comments").textContent = comments.length;
    document.querySelector("#stat-dms").textContent = dms.length;
    document.querySelector("#stat-comments-worth").textContent = commentWorthCount;
    document.querySelector("#stat-dms-worth").textContent = dmReplyCount;
    document.querySelector('.stat-link[data-view="comments"]').setAttribute("aria-label", `${comments.length} comments collected, ${commentWorthCount} worth a look. Open comments inbox`);
    document.querySelector('.stat-link[data-view="messages"]').setAttribute("aria-label", `${dms.length} direct messages, ${dmReplyCount} worth a reply. Open direct messages inbox`);
    const commentCount = document.querySelector("#comment-nav-count");
    const dmCount = document.querySelector("#dm-nav-count");
    commentCount.textContent = comments.length;
    commentCount.title = `${comments.length} total comments`;
    dmCount.textContent = dms.length;
    dmCount.title = `${dms.length} total conversations`;
    const briefing = [];
    if (needs) briefing.push({icon:"✳", tone:"peach", text:`${needs} ${needs === 1 ? "conversation may" : "conversations may"} deserve a reply.`, action:"messages", filter:"reply"});
    const questionCount = comments.filter(x => isInInbox(x) && x.messageType.toLowerCase().includes("question")).length;
    if (questionCount) briefing.push({icon:"◌", tone:"lilac", text:`${questionCount} audience questions are waiting in your comments.`, action:"comments", filter:"question"});
    const feedback = comments.filter(x => isInInbox(x) && x.messageType.toLowerCase().includes("feedback")).length;
    if (feedback) briefing.push({icon:"↗", tone:"green", text:`A useful piece of constructive feedback includes a concrete idea.`, action:"comments", filter:"feedback"});
    document.querySelector("#briefing-list").innerHTML = briefing.slice(0, 4).map(b => `<button class="briefing-item" ${b.action ? `data-view="${b.action}" data-target-filter="${b.filter}"` : ""}><span class="brief-icon ${b.tone}">${b.icon}</span><span>${escapeHtml(b.text)}</span>${b.action ? '<span class="brief-arrow">↗</span>' : ""}</button>`).join("");
    const topics = [
      {name:"Flexible planning", count:comments.filter(x => isInInbox(x) && /plan|week|flexib/i.test(x.text)).length + 1, color:"#9b8bd9"},
      {name:"Workspace details", count:comments.filter(x => isInInbox(x) && /stand|lamp|workspace/i.test(x.text)).length, color:"#df9c7c"},
      {name:"Tiny tools", count:comments.filter(x => isInInbox(x) && /tool|project/i.test(x.text)).length, color:"#74a694"}
    ].filter(x => x.count > 0);
    document.querySelector("#topic-list").innerHTML = topics.map(x => `<div class="topic-row"><span class="topic-dot" style="--dot:${x.color}"></span><span>${escapeHtml(x.name)}</span><span class="topic-bar"><i style="width:${Math.min(100, 18 + x.count * 14)}%;background:${x.color}"></i></span><b>${x.count}</b></div>`).join("");
    const commentHighlights = comments.filter(x => isInInbox(x) && x.priority === "Worth a look").slice(0, 3);
    const dmHighlights = dms.filter(x => isInInbox(x) && x.priority === "Needs a reply");
    const renderHighlight = (x, section) => `<button class="highlight-card" data-open="${x.id}" data-section="${section}"><div class="highlight-meta">${initialsAvatar(x)}<span><b>${escapeHtml(x.author)}</b><small>${escapeHtml(x.platform)} · ${escapeHtml(x.age)}</small></span><span class="card-arrow">↗</span></div><p>${escapeHtml(x.text)}</p><span class="pill ${classificationPillTone(x.messageType)}">${escapeHtml(x.messageType)}</span><span class="pill tone-muted">${escapeHtml(x.tone)}</span></button>`;
    const renderColumn = (title, section, items) => `<section class="highlight-column"><div class="highlight-column-heading"><h3>${title}</h3><button class="text-link" data-view="${section}">View all <span>→</span></button></div><div class="highlight-stack">${items.length ? items.map(x => renderHighlight(x, section)).join("") : '<p class="highlight-empty">Nothing to surface right now.</p>'}</div></section>`;
    document.querySelector("#highlight-list").innerHTML = renderColumn("Comments", "comments", commentHighlights) + renderColumn("Direct messages", "messages", dmHighlights);
  }
  function pillTone(priority) { return priority.includes("reply") ? "tone-peach" : priority.includes("look") ? "tone-lilac" : priority.includes("Review") ? "tone-blue" : "tone-muted"; }
  function classificationPillTone(messageType) { return /question|feedback|suggestion/i.test(messageType) ? "tone-lilac" : /collaboration|opportunity/i.test(messageType) ? "tone-peach" : "tone-muted"; }

  function setView(view) {
    activeView = view;
    document.querySelector("#overview-view").classList.toggle("hidden", view !== "overview");
    document.querySelector("#inbox-view").classList.toggle("hidden", view === "overview");
    document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === view));
    document.querySelector("#crumb-current").textContent = view === "overview" ? "Overview" : view === "comments" ? "Comments" : "Direct messages";
    if (view !== "overview") {
      const comments = view === "comments";
      document.querySelector("#inbox-eyebrow").textContent = comments ? "YOUR COMMUNITY" : "PERSONAL CONVERSATIONS";
      document.querySelector("#inbox-title").textContent = comments ? "Comments" : "Direct messages";
      document.querySelector("#inbox-subtitle").textContent = comments ? "The conversations happening around your work." : "A little context for the conversations that matter.";
      document.querySelector("#search-input").value = ""; activeFilter = "all"; activeSource = "all"; activeMessageType = "all"; activeTone = "all"; activeTag = "all"; sortOrder = "newest"; selectedId = null;
      renderFilters(); renderInbox(); renderDetail();
    }
    window.scrollTo({top:0, behavior:"smooth"});
  }
  function renderFilters() {
    const filters = activeView === "comments" ? [["all","Inbox"],["worth","Worth a look"],["question","Questions"],["feedback","Feedback"],["noise","Noise / spam"],["reported","Reported"],["blocked","Blocked"],["reviewed","Reviewed"],["unread","Unread"],["saved","Saved"]] : [["all","Inbox"],["reply","Needs a reply"],["follow","Follow-ups"],["opportunity","Opportunities"],["noise","Noise / spam"],["reported","Reported"],["blocked","Blocked"],["reviewed","Reviewed"],["unread","Unread"],["saved","Saved"]];
    document.querySelector("#filter-tabs").innerHTML = filters.map(([id,label]) => `<button class="filter-tab ${activeFilter === id ? "active" : ""}" data-filter="${id}">${label}</button>`).join("");
    const sources = [...new Set(visibleItems().map(item => item.platform))].sort();
    document.querySelector("#source-filter").innerHTML = '<option value="all">All apps</option>' + sources.map(source => `<option value="${escapeHtml(source)}">${escapeHtml(source)}</option>`).join("");
    const types = [...new Set([...categoryChoices("types", "messageType"), ...visibleItems().map(item => item.messageType).filter(Boolean)])].sort((a, b) => a.localeCompare(b));
    document.querySelector("#type-filter").innerHTML = '<option value="all">All types</option>' + types.map(type => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join("");
    const tones = [...new Set([...categoryChoices("tones", "tone"), ...visibleItems().map(item => item.tone).filter(Boolean)])].sort((a, b) => a.localeCompare(b));
    document.querySelector("#tone-filter").innerHTML = '<option value="all">All tones</option>' + tones.map(tone => `<option value="${escapeHtml(tone)}">${escapeHtml(tone)}</option>`).join("");
    const tags = [...new Set(visibleItems().flatMap(item => item.customTags || []))].sort((a, b) => a.localeCompare(b));
    document.querySelector("#tag-filter").innerHTML = '<option value="all">All tags</option>' + tags.map(tag => `<option value="${escapeHtml(tag)}">${escapeHtml(tag)}</option>`).join("");
    if (activeTag !== "all" && !tags.includes(activeTag)) activeTag = "all";
    if (activeMessageType !== "all" && !types.includes(activeMessageType)) activeMessageType = "all";
    if (activeTone !== "all" && !tones.includes(activeTone)) activeTone = "all";
    document.querySelector("#source-filter").value = activeSource;
    document.querySelector("#type-filter").value = activeMessageType;
    document.querySelector("#tone-filter").value = activeTone;
    document.querySelector("#tag-filter").value = activeTag;
    document.querySelector("#sort-order").value = sortOrder;
  }
  function ageInMinutes(age) {
    const match = String(age).match(/([\d.]+)\s*([mhd])/i);
    if (!match) return 0;
    const value = Number(match[1]);
    return match[2].toLowerCase() === "d" ? value * 1440 : match[2].toLowerCase() === "h" ? value * 60 : value;
  }
  function filterItems(items) {
    const q = document.querySelector("#search-input").value.trim().toLowerCase();
    return items.filter(x => {
      const match = activeFilter === "all" ||
        (activeFilter === "worth" && x.priority === "Worth a look") ||
        (activeFilter === "question" && x.messageType.toLowerCase().includes("question")) ||
        (activeFilter === "feedback" && x.messageType.toLowerCase().includes("feedback")) ||
        (activeFilter === "reply" && x.priority === "Needs a reply") ||
        (activeFilter === "follow" && x.messageType.toLowerCase().includes("follow")) ||
        (activeFilter === "opportunity" && x.messageType.toLowerCase().includes("collaboration")) ||
        (activeFilter === "noise" && isNoise(x)) ||
        (activeFilter === "reported" && Boolean(x.report)) ||
        (activeFilter === "blocked" && isBlocked(x)) ||
        (activeFilter === "reviewed" && x.reviewed) ||
        (activeFilter === "unread" && x.status === "unread") || (activeFilter === "saved" && x.saved);
      const customTags = x.customTags || [];
      const specialView = ["noise","reported","blocked","reviewed"].includes(activeFilter);
      const inInbox = specialView || isInInbox(x);
      return match && inInbox && (activeSource === "all" || x.platform === activeSource) && (activeMessageType === "all" || x.messageType === activeMessageType) && (activeTone === "all" || x.tone === activeTone) && (activeTag === "all" || customTags.includes(activeTag)) && (!q || `${x.author} ${x.handle} ${x.platform} ${x.post || ""} ${x.text} ${x.messageType} ${x.tone} ${customTags.join(" ")}`.toLowerCase().includes(q));
    }).sort((a, b) => (sortOrder === "newest" ? 1 : -1) * (ageInMinutes(a.age) - ageInMinutes(b.age)));
  }
  function renderInbox() {
    const items = filterItems(visibleItems());
    document.querySelector("#inbox-total-count").textContent = visibleItems().length;
    document.querySelector("#result-count").textContent = items.length;
    document.querySelector("#list-label").textContent = `${activeView === "comments" ? "COMMENTS" : "CONVERSATIONS"} · ${activeFilter === "all" ? "ALL" : activeFilter.toUpperCase()}`;
    document.querySelector("#message-list").innerHTML = items.length ? items.map(x => `<button class="message-row ${x.id === selectedId ? "selected" : ""} ${x.status === "unread" ? "unread" : ""}" data-open="${x.id}"><span class="message-avatar">${initialsAvatar(x)}</span><span class="message-main"><span class="message-row-top"><b>${escapeHtml(x.author)}</b><time>${escapeHtml(x.age)}</time></span><span class="message-snippet">${escapeHtml(x.text)}</span><span class="message-row-bottom"><span class="pill ${classificationPillTone(x.messageType)}">${escapeHtml(x.messageType)}</span><span class="pill tone-muted">${escapeHtml(x.tone)}</span>${x.reviewed ? '<span class="pill reviewed-pill">Reviewed</span>' : ""}${isNoise(x) ? `<span class="pill triage-pill">${x.triage === "spam" ? "Spam" : "Noise"}</span>` : ""}${x.report ? '<span class="pill report-pill">Reported</span>' : ""}${isBlocked(x) ? '<span class="pill blocked-pill">Blocked locally</span>' : ""}${(x.customTags || []).map(tag => `<span class="pill user-tag-pill">${escapeHtml(tag)}</span>`).join("")}${x.saved ? '<span class="saved-mark">◆ Saved</span>' : ""}</span></span></button>`).join("") : `<div class="no-results"><span>⌕</span><b>No messages found</b><p>Try a different filter or search term.</p></div>`;
    renderDetail();
  }
  function renderDetail() {
    const item = itemById(selectedId);
    const panel = document.querySelector("#detail-panel");
    if (!item || !filterItems(visibleItems()).some(x => x.id === selectedId)) {
      panel.innerHTML = `<div class="detail-empty"><span>✳</span><h3>Pick a message to explore</h3><p>See the original, its context, and why it caught your eye.</p></div>`; return;
    }
    const isDm = item.id.startsWith("d");
    panel.innerHTML = `<div class="detail-top"><span class="eyebrow">${isDm ? "DIRECT MESSAGE" : "PUBLIC COMMENT"}</span><button class="icon-button" id="detail-save" aria-label="${item.saved ? "Remove saved" : "Save message"}" title="${item.saved ? "Remove saved" : "Save message"}">${item.saved ? "◆" : "◇"}</button></div>
      <div class="detail-author">${initialsAvatar(item, "large")}<div><h2>${escapeHtml(item.author)}</h2><p>${escapeHtml(item.handle)} <span>·</span> ${escapeHtml(item.platform)} <span>·</span> ${escapeHtml(item.age)}</p></div></div>
      ${isDm ? `<div class="context-box"><div class="context-label">CONVERSATION CONTEXT <span>${item.history.length} messages</span></div>${item.history.map(h => `<div class="history-line ${h.from === "you" ? "from-you" : ""}"><span>${h.from === "you" ? "You" : escapeHtml(item.author)}</span><p>${escapeHtml(h.text)}</p></div>`).join("")}</div>` : `<div class="post-context"><span>COMMENT ON</span><b>${escapeHtml(item.post)}</b></div>`}
      <blockquote class="original-message">“${escapeHtml(item.text)}”</blockquote>
      <div class="recommendation"><div class="recommendation-head"><span class="recommendation-spark">✳</span><span><small>FILTER SUGGESTS</small><b>${escapeHtml(item.priority)}</b></span><span class="confidence">${item.confidence}%<small>confidence</small></span></div><p>${escapeHtml(item.reason)}</p><div class="confidence-track"><i style="width:${item.confidence}%"></i></div></div>
      <section class="classification-fields"><div class="classification-heading"><b>Message metadata</b><span>${item.classificationSource === "user" ? "Edited by you" : "Sample classification"}</span></div><label>Message type<input id="message-type-input" list="message-type-options" value="${escapeHtml(item.messageType)}" maxlength="48"><datalist id="message-type-options">${categoryChoices("types", "messageType").map(type=>`<option value="${escapeHtml(type)}"></option>`).join("")}</datalist></label><label>Tone<input id="tone-input" list="tone-options" value="${escapeHtml(item.tone)}" maxlength="32"><datalist id="tone-options">${categoryChoices("tones", "tone").map(tone=>`<option value="${escapeHtml(tone)}"></option>`).join("")}</datalist></label><p class="metadata-hint">Choose a suggestion or type a new value. Your tags stay separate.</p></section>
      <section class="user-tags-panel"><div class="user-tags-heading"><b>Your tags</b><span>Private to this message</span></div><div class="user-tags-list">${(item.customTags || []).length ? item.customTags.map((tag, index) => `<span class="user-tag-chip">${escapeHtml(tag)}<button type="button" data-remove-tag="${index}" aria-label="Remove tag ${escapeHtml(tag)}" title="Remove tag">×</button></span>`).join("") : '<span class="empty-tags">No tags yet</span>'}</div><form id="tag-form" class="tag-form"><label class="sr-only" for="tag-input">New tag</label><input id="tag-input" name="tag" type="text" maxlength="32" placeholder="Add a tag…" autocomplete="off"><button type="submit">Add tag</button></form></section>
      <section class="moderation-panel"><div class="user-tags-heading"><b>Noise &amp; safety</b><span>Local-only controls</span></div><label class="triage-control">Sort this message<select id="triage-select"><option value="keep" ${!item.triage ? "selected" : ""}>Keep in inbox</option><option value="noise" ${item.triage === "noise" ? "selected" : ""}>Noise</option><option value="spam" ${item.triage === "spam" ? "selected" : ""}>Spam</option></select></label><div class="moderation-actions"><button type="button" class="action-button ${isBlocked(item) ? "" : "danger-action"}" id="toggle-block">${isBlocked(item) ? "Unblock locally" : "Block sender locally"}</button><button type="button" class="action-button" id="open-report">${item.report ? "Edit local report" : "Report message"}</button></div>${item.report ? `<p class="report-summary">Local report saved: <b>${escapeHtml(item.report.reason)}</b>${item.report.notes ? ` · ${escapeHtml(item.report.notes)}` : ""}</p>` : ""}<p class="metadata-hint">Noise and spam leave the regular inbox but remain browseable here. Blocking affects this sender in this prototype only. Nothing is sent to the platform.</p></section>
      <section class="reply-panel"><div class="user-tags-heading"><b>Reply</b><span>Saved in this local prototype</span></div>${!isDm && (item.replies || []).length ? `<div class="reply-history">${item.replies.map(reply=>`<div class="history-line from-you"><span>You · local reply</span><p>${escapeHtml(reply.text)}</p></div>`).join("")}</div>` : ""}<form id="reply-form" class="reply-form"><label class="sr-only" for="reply-input">Write a reply to ${escapeHtml(item.author)}</label><textarea id="reply-input" rows="3" maxlength="1000" placeholder="Write a reply…"></textarea><div class="reply-form-footer"><span>Nothing is sent to a social platform.</span><button type="submit" class="action-button primary-action">Save reply locally</button></div></form></section>
      <div class="detail-actions"><button class="action-button ${item.reviewed ? "reviewed-action" : "primary-action"}" id="mark-reviewed" aria-pressed="${Boolean(item.reviewed)}">${item.reviewed ? "✓ Reviewed" : "Mark reviewed"}</button><button class="action-button" id="mark-read">${item.status === "read" ? "Mark unread" : "Mark read"}</button></div>
      <p class="disclaimer">A sample recommendation, not an AI result. You decide what to do.</p>`;
    panel.querySelector("#detail-save").addEventListener("click", () => {item.saved = !item.saved; save(); renderInbox(); showToast(item.saved ? "Saved for later" : "Removed from saved");});
    panel.querySelector("#mark-reviewed").addEventListener("click", () => {item.reviewed = !item.reviewed; save(); renderInbox(); showToast(item.reviewed ? "Marked as reviewed" : "Review marker removed");});
    panel.querySelector("#mark-read").addEventListener("click", () => {item.status = item.status === "read" ? "unread" : "read"; save(); renderOverview(); renderInbox(); showToast(item.status === "read" ? "Marked as read" : "Marked as unread");});
    panel.querySelector("#message-type-input").addEventListener("change", e => {
      const value = e.target.value.trim();
      if (!value) { e.target.value = item.messageType; return; }
      item.messageType = value; item.classificationSource = "user"; registerCategory("types", value); save(); renderFilters(); renderInbox(); showToast("Message type updated");
    });
    panel.querySelector("#tone-input").addEventListener("change", e => {
      const value = e.target.value.trim();
      if (!value) { e.target.value = item.tone; return; }
      item.tone = value; item.classificationSource = "user"; registerCategory("tones", value); save(); renderFilters(); renderInbox(); showToast("Tone updated");
    });
    panel.querySelector("#tag-form").addEventListener("submit", e => {
      e.preventDefault();
      const input = panel.querySelector("#tag-input");
      const tag = input.value.trim();
      if (!tag) { input.focus(); return; }
      item.customTags ||= [];
      if (item.customTags.some(existing => existing.toLowerCase() === tag.toLowerCase())) { showToast("That tag is already on this message"); input.focus(); return; }
      item.customTags.push(tag); save(); renderFilters(); renderInbox(); showToast(`Added tag: ${tag}`);
      document.querySelector("#tag-input")?.focus();
    });
    panel.querySelectorAll("[data-remove-tag]").forEach(button => button.addEventListener("click", () => {
      const removed = item.customTags.splice(Number(button.dataset.removeTag), 1)[0];
      save(); renderFilters(); renderInbox(); showToast(`Removed tag: ${removed}`);
    }));
    panel.querySelector("#reply-form").addEventListener("submit", e => {
      e.preventDefault();
      const input = panel.querySelector("#reply-input");
      const text = input.value.trim();
      if (!text) { input.focus(); return; }
      if (isDm) { item.history ||= []; item.history.push({from:"you", text}); }
      else { item.replies ||= []; item.replies.push({from:"you", text}); }
      save(); renderOverview(); renderInbox();
      document.querySelector("#reply-input")?.focus();
      showToast("Reply saved in this browser");
    });
    panel.querySelector("#triage-select").addEventListener("change", e => {
      item.triage = e.target.value === "keep" ? null : e.target.value;
      save(); renderInbox(); showToast(item.triage ? `Moved to ${item.triage}` : "Returned to your inbox");
    });
    panel.querySelector("#toggle-block").addEventListener("click", () => {
      const key = senderKey(item);
      if (isBlocked(item)) { state.blockedSenders = state.blockedSenders.filter(existing => existing !== key); showToast("Sender unblocked in this prototype"); }
      else { state.blockedSenders.push(key); showToast("Sender blocked in this prototype"); }
      save(); renderInbox();
    });
    panel.querySelector("#open-report").addEventListener("click", () => {
      reportTargetId = item.id;
      document.querySelector("#report-reason").value = item.report?.reason || "";
      document.querySelector("#report-notes").value = item.report?.notes || "";
      document.querySelector("#report-dialog").showModal();
    });
  }

  document.querySelector("#manage-categories").addEventListener("click", openCategoryEditor);
  document.querySelector("#close-category-dialog").addEventListener("click", () => document.querySelector("#category-dialog").close());
  document.querySelector("#cancel-category-edit").addEventListener("click", () => document.querySelector("#category-dialog").close());
  document.querySelector("#save-category-edit").addEventListener("click", saveCategoryEditor);
  document.querySelector("#category-groups").addEventListener("click", e => {
    const add = e.target.closest("[data-add-category]");
    if (add) {
      const row = {id:`custom-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, name:"New category", guidance:""};
      const entries = add.closest(".category-group").querySelector(".category-entries");
      entries.insertAdjacentHTML("beforeend", categoryRowMarkup(row));
      const input = entries.lastElementChild.querySelector(".category-name"); input.focus(); input.select(); return;
    }
    const remove = e.target.closest(".category-remove");
    if (remove) remove.closest(".category-entry").remove();
  });
  document.querySelector("#close-report-dialog").addEventListener("click", () => document.querySelector("#report-dialog").close());
  document.querySelector("#cancel-report").addEventListener("click", () => document.querySelector("#report-dialog").close());
  document.querySelector("#report-form").addEventListener("submit", e => {
    e.preventDefault();
    const item = itemById(reportTargetId);
    if (!item) return;
    item.report = {reason:document.querySelector("#report-reason").value, notes:document.querySelector("#report-notes").value.trim(), createdAt:new Date().toISOString()};
    save(); document.querySelector("#report-dialog").close(); renderInbox(); showToast("Report note saved locally");
  });

  document.addEventListener("click", e => {
    if (e.target.closest("#sidebar-toggle")) {
      const collapsed = !document.querySelector(".app-shell").classList.contains("sidebar-collapsed");
      setSidebarCollapsed(collapsed);
      localStorage.setItem(sidebarKey, String(collapsed));
      return;
    }
    const routedView = e.target.closest("[data-target-filter]");
    if (routedView) {
      setView(routedView.dataset.view);
      activeFilter = routedView.dataset.targetFilter;
      renderFilters(); renderInbox();
      return;
    }
    const view = e.target.closest("[data-view]");
    if (view) { setView(view.dataset.view); return; }
    const filter = e.target.closest("[data-filter]");
    if (filter) { activeFilter = filter.dataset.filter; renderFilters(); renderInbox(); return; }
    const open = e.target.closest("[data-open]");
    if (open) { if (open.dataset.section && open.dataset.section !== activeView) setView(open.dataset.section); selectedId = open.dataset.open; renderInbox(); return; }
    if (e.target.closest("#reset-button")) { localStorage.removeItem(key); localStorage.removeItem(blockedKey); location.reload(); }
  });
  document.querySelector("#search-input").addEventListener("input", renderInbox);
  document.querySelector("#source-filter").addEventListener("change", e => { activeSource = e.target.value; selectedId = null; renderInbox(); });
  document.querySelector("#type-filter").addEventListener("change", e => { activeMessageType = e.target.value; selectedId = null; renderInbox(); });
  document.querySelector("#tone-filter").addEventListener("change", e => { activeTone = e.target.value; selectedId = null; renderInbox(); });
  document.querySelector("#tag-filter").addEventListener("change", e => { activeTag = e.target.value; selectedId = null; renderInbox(); });
  document.querySelector("#sort-order").addEventListener("change", e => { sortOrder = e.target.value; renderInbox(); });
  setSidebarCollapsed(localStorage.getItem(sidebarKey) === "true");
  renderOverview();
})();
