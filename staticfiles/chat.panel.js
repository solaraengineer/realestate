// static/js/chat.panel.js
(function () {
  const chatState = {
    miniOpen: false,
    fullOpen: false,
    activeTab: "conversations", // 'conversations' | 'friends' | 'blocked' | 'settings'
    selectedUserId: null,
    selectedUserName: null,
    // Na razie demo listy – w kolejnych krokach podepniemy API
    demoConversations: [
      { id: 101, name: "Alice" },
      { id: 102, name: "Bob" },
    ],
    demoFriends: [
      { id: 201, name: "FriendMike" },
      { id: 202, name: "FriendSara" },
    ],
    demoBlocked: [
      { id: 301, name: "Spammer" },
    ],
    settings: {
      reject_strangers: false,
      opacity: 0.9, // 0–1, przezroczystość dużego panelu
    },
  };

  // === MINI PANEL (małe okienko po kliknięciu "chat" przy awatarze) ===

  // === DRAG HELPER – przesuwanie okienka po ekranie ===
  function makeDraggable(panel, handle) {
    if (!panel || !handle) return;

    let isDragging = false;
    let startX, startY, startLeft, startTop;

    handle.style.cursor = "move";

    handle.addEventListener("mousedown", (e) => {
      // tylko lewy przycisk
      if (e.button !== 0) return;

      // jeśli kliknąłeś w button / input itp. – nie przeciągaj
      if (e.target.closest("button") || e.target.closest("input") || e.target.closest("a")) {
        return;
      }

      const rect = panel.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      isDragging = true;

      // zamieniamy "right/bottom" na konkretny left/top
      panel.style.left = rect.left + "px";
      panel.style.top = rect.top + "px";
      panel.style.right = "auto";
      panel.style.bottom = "auto";

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      e.preventDefault();
    });

    function onMouseMove(e) {
      if (!isDragging) return;
      let newLeft = startLeft + (e.clientX - startX);
      let newTop = startTop + (e.clientY - startY);

      // opcjonalne ograniczenie do okna przeglądarki
      const maxLeft = window.innerWidth - panel.offsetWidth;
      const maxTop = window.innerHeight - panel.offsetHeight;
      newLeft = Math.min(Math.max(0, newLeft), Math.max(0, maxLeft));
      newTop = Math.min(Math.max(0, newTop), Math.max(0, maxTop));

      panel.style.left = newLeft + "px";
      panel.style.top = newTop + "px";
    }

    function onMouseUp() {
      if (!isDragging) return;
      isDragging = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }
  }


  function ensureMiniChatPanel() {
    let panel = document.getElementById("miniChatPanel");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "miniChatPanel";
      panel.className = "mini-chat-panel";
      panel.style.display = "none";

      panel.innerHTML = `
        <div class="mini-chat-header">
          <div class="mini-chat-title" id="miniChatTitle">Chat</div>
          <button type="button" class="mini-chat-close" data-mini-close>✕</button>
        </div>

        <div class="mini-chat-row">
          <button type="button" class="mini-chat-btn" data-mini-action="switch-full">
            Switch to full
          </button>
        </div>

        <div class="mini-chat-row mini-chat-actions-row">
          <button type="button" class="mini-chat-btn mini-chat-btn-outline" data-mini-action="block">block</button>
          <button type="button" class="mini-chat-btn mini-chat-btn-outline" data-mini-action="save">save</button>
          <button type="button" class="mini-chat-btn mini-chat-btn-outline" data-mini-action="friend">friend</button>
        </div>

        <div class="mini-chat-messages" id="miniChatMessages">
          <div class="chat-msg">
            <div class="chat-msg-meta">No conversation selected</div>
            <div class="chat-msg-text">Pick a user to start chatting.</div>
          </div>
        </div>

        <div class="mini-chat-input-row">
          <input id="miniChatInput" type="text" placeholder="Type a message..." />
          <button type="button" class="mini-chat-btn" id="miniChatSendBtn">SEND</button>
        </div>
      `;

      document.body.appendChild(panel);

      const headerEl = panel.querySelector(".mini-chat-header");
      if (headerEl) {
        makeDraggable(panel, headerEl);
      }

      // Zamknięcie
      panel.querySelector("[data-mini-close]").addEventListener("click", () => {
        closeMiniChatPanel();
      });

    
      // Switch to full – startuj duży panel tam, gdzie stoi mały
      panel
        .querySelector('[data-mini-action="switch-full"]')
        .addEventListener("click", () => {
          if (!chatState.selectedUserId) return;

          const uid = chatState.selectedUserId;
          const uname = chatState.selectedUserName;

          // pozycja mini panelu przed zamknięciem
          const rect = panel.getBoundingClientRect();

          openChatPanel("conversations", {
            userId: uid,
            userName: uname,
            fromMini: {
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
            },
          });
        });


      // Akcje block/save/friend
      panel
        .querySelector(".mini-chat-actions-row")
        .addEventListener("click", (e) => {
          const btn = e.target.closest("button[data-mini-action]");
          if (!btn) return;
          const action = btn.dataset.miniAction;
          handleInlineAction(action, chatState.selectedUserId, chatState.selectedUserName, "mini");
        });

      // Wysyłanie wiadomości (demo)
      const inputEl = panel.querySelector("#miniChatInput");
      const sendBtn = panel.querySelector("#miniChatSendBtn");

      function sendMiniMessage() {
        if (!chatState.selectedUserId) {
          toastLocal("No user selected.");
          return;
        }
        const txt = (inputEl.value || "").trim();
        if (!txt) return;
        const box = panel.querySelector("#miniChatMessages");
        if (box) {
          box.innerHTML += `
            <div class="chat-msg chat-msg-outgoing">
              <div class="chat-msg-text">${escapeHtml(txt)}</div>
            </div>
          `;
          box.scrollTop = box.scrollHeight;
        }
        inputEl.value = "";
      }

      if (sendBtn && inputEl) {
        sendBtn.addEventListener("click", sendMiniMessage);
        inputEl.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMiniMessage();
          }
        });
      }
    }
    return panel;
  }

  function openMiniChatPanel(userId, userName) {
    const panel = ensureMiniChatPanel();
    chatState.miniOpen = true;
    chatState.selectedUserId = String(userId);
    chatState.selectedUserName = userName || `User ${userId}`;

    const title = panel.querySelector("#miniChatTitle");
    if (title) {
      title.textContent = chatState.selectedUserName;
    }

    const box = panel.querySelector("#miniChatMessages");
    if (box) {
      box.innerHTML = `
        <div class="chat-msg">
          <div class="chat-msg-meta">Chat with ${chatState.selectedUserName} (demo)</div>
          <div class="chat-msg-text">Here will be real messages from the backend.</div>
        </div>
      `;
    }

    panel.style.display = "flex";
  }

  function closeMiniChatPanel() {
    const panel = document.getElementById("miniChatPanel");
    if (panel) {
      panel.style.display = "none";
    }
    chatState.miniOpen = false;
  }

  // === DUŻY PANEL (Conversations / Friends / Blocked / Settings) ===

  function ensureChatPanel() {
    let panel = document.getElementById("chatPanel");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "chatPanel";
      panel.style.display = "none";
      panel.style.flexDirection = "column";

      panel.innerHTML = `
        <div id="chatPanelHeader">
          <div id="chatPanelTabs">
            <button class="chat-tab chat-tab-active" data-tab="conversations">Conversations</button>
            <button class="chat-tab" data-tab="friends">Friends</button>
            <button class="chat-tab" data-tab="blocked">Blocked</button>
            <button class="chat-tab" data-tab="settings">Settings</button>
          </div>
          <button type="button" class="chat-close-btn" data-chat-close>✕</button>
        </div>
        <div id="chatPanelBody"></div>
      `;

      document.body.appendChild(panel);

      const bigHeader = panel.querySelector("#chatPanelHeader");
      if (bigHeader) {
        makeDraggable(panel, bigHeader);
      }

      // Tabs click handler
      panel.querySelector("#chatPanelTabs").addEventListener("click", (e) => {
        const btn = e.target.closest(".chat-tab");
        if (!btn) return;
        const tab = btn.dataset.tab;
        if (!tab) return;
        setActiveTab(tab);
      });

      // Close button
      panel.querySelector("[data-chat-close]").addEventListener("click", () => {
        closeChatPanel();
      });
    }
    applyPanelOpacity();
    return panel;
  }

  function setActiveTab(tab) {
    chatState.activeTab = tab;

    const panel = ensureChatPanel();
    const tabsRoot = panel.querySelector("#chatPanelTabs");
    if (tabsRoot) {
      tabsRoot.querySelectorAll(".chat-tab").forEach((btn) => {
        if (btn.dataset.tab === tab) {
          btn.classList.add("chat-tab-active");
        } else {
          btn.classList.remove("chat-tab-active");
        }
      });
    }
    renderActiveTab();
  }

  function renderActiveTab() {
    switch (chatState.activeTab) {
      case "friends":
        renderListTab("friends");
        break;
      case "blocked":
        renderListTab("blocked");
        break;
      case "settings":
        renderSettingsTab();
        break;
      case "conversations":
      default:
        renderListTab("conversations");
        break;
    }
  }

  // === Widok 2 kolumn – Conversations / Friends / Blocked ===

  function renderListTab(kind) {
    const panel = ensureChatPanel();
    const body = panel.querySelector("#chatPanelBody");
    if (!body) return;

    body.innerHTML = `
      <div class="chat-columns">
        <div class="chat-col chat-col-list">
          <div id="chatListCol" class="chat-list"></div>
        </div>
        <div class="chat-col chat-col-messages">
          <div class="chat-messages-wrapper">
            <div id="chatMessagesScroll" class="chat-messages-scroll">
              <div class="chat-msg">
                <div class="chat-msg-meta">No conversation selected</div>
                <div class="chat-msg-text">Choose a user from the list.</div>
              </div>
            </div>
            <div class="chat-input-row">
              <input id="chatInputFull" type="text" placeholder="Type a message..." />
              <button class="chat-btn" id="chatSendBtnFull">Send</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const listCol = body.querySelector("#chatListCol");
    const messagesScroll = body.querySelector("#chatMessagesScroll");
    const inputEl = body.querySelector("#chatInputFull");
    const sendBtn = body.querySelector("#chatSendBtnFull");

    let list;
    if (kind === "friends") {
      list = chatState.demoFriends;
    } else if (kind === "blocked") {
      list = chatState.demoBlocked;
    } else {
      list = chatState.demoConversations;
    }

    if (!list || !list.length) {
      listCol.innerHTML = `<div class="chat-empty">No ${kind} yet.</div>`;
    } else {
      listCol.innerHTML = list
        .map(
          (u) => `
        <div class="chat-list-item" data-kind="${kind}" data-user-id="${u.id}" data-user-name="${u.name}">
          <div class="chat-list-name-row">${u.name}</div>
          <div class="chat-list-options">
            <button type="button" class="chat-btn chat-btn-xs chat-btn-outline" data-action="block">block</button>
            <button type="button" class="chat-btn chat-btn-xs chat-btn-outline" data-action="save">save conv</button>
            <button type="button" class="chat-btn chat-btn-xs chat-btn-outline" data-action="friend">friend</button>
          </div>
        </div>
      `
        )
        .join("");
    }

    // Klik w listę – wybór usera + pokazanie opcji pod nickiem
    listCol.onclick = function (e) {
      const item = e.target.closest(".chat-list-item");
      if (!item) return;

      const userId = item.dataset.userId;
      const userName = item.dataset.userName || `User ${userId}`;

      const optBtn = e.target.closest(".chat-list-options button");
      if (optBtn) {
        const action = optBtn.dataset.action;
        handleInlineAction(action, userId, userName, "full");
        e.stopPropagation();
        return;
      }

      chatState.selectedUserId = userId;
      chatState.selectedUserName = userName;

      // rozwiń opcje tylko pod klikniętym
      listCol.querySelectorAll(".chat-list-item").forEach((el) => {
        const opts = el.querySelector(".chat-list-options");
        if (!opts) return;
        if (el === item) {
          opts.style.display = "flex";
          el.classList.add("chat-list-item-active");
        } else {
          opts.style.display = "none";
          el.classList.remove("chat-list-item-active");
        }
      });

      renderMessagesForSelected(kind, messagesScroll);
    };

    // Jeśli mamy już wybranego usera – zaznacz go automatycznie
    if (chatState.selectedUserId && list && list.length) {
      const initialItem = listCol.querySelector(
        `.chat-list-item[data-user-id="${chatState.selectedUserId}"]`
      );
      if (initialItem) {
        initialItem.querySelector(".chat-list-name-row").click();
      }
    }

    // Wysyłanie wiadomości (demo)
    function sendFullMessage() {
      if (!chatState.selectedUserId) {
        toastLocal("Select a user from the list first.");
        return;
      }
      const txt = (inputEl.value || "").trim();
      if (!txt) return;
      if (messagesScroll) {
        messagesScroll.innerHTML += `
          <div class="chat-msg chat-msg-outgoing">
            <div class="chat-msg-text">${escapeHtml(txt)}</div>
          </div>
        `;
        messagesScroll.scrollTop = messagesScroll.scrollHeight;
      }
      inputEl.value = "";
    }

    if (sendBtn && inputEl) {
      sendBtn.onclick = sendFullMessage;
      inputEl.onkeydown = function (e) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          sendFullMessage();
        }
      };
    }
  }

  function renderMessagesForSelected(kind, messagesScroll) {
    const scroll =
      messagesScroll ||
      (document.getElementById("chatPanel") &&
        document.getElementById("chatPanel").querySelector("#chatMessagesScroll"));
    if (!scroll) return;

    if (!chatState.selectedUserId) {
      scroll.innerHTML = `
        <div class="chat-msg">
          <div class="chat-msg-meta">No conversation selected</div>
          <div class="chat-msg-text">Choose a user from the list.</div>
        </div>
      `;
      return;
    }

    const uname =
      chatState.selectedUserName || `User ${chatState.selectedUserId}`;

    if (kind === "blocked") {
      scroll.innerHTML = `
        <div class="chat-msg">
          <div class="chat-msg-meta">User is blocked (demo)</div>
          <div class="chat-msg-text">
            In a real version you would not receive new messages from this user.
          </div>
        </div>
      `;
      return;
    }

    scroll.innerHTML = `
      <div class="chat-msg">
        <div class="chat-msg-meta">Conversation with ${uname} (${kind}, demo)</div>
        <div class="chat-msg-text">
          Here will be real messages loaded from the backend.
        </div>
      </div>
    `;
  }

  // === TAB: Settings ===

  function renderSettingsTab() {
    const panel = ensureChatPanel();
    const body = panel.querySelector("#chatPanelBody");
    if (!body) return;

    const reject = !!chatState.settings.reject_strangers;
    const opacityPercent = Math.round(
      (chatState.settings.opacity || 0.9) * 100
    );

    body.innerHTML = `
      <div class="chat-settings-panel">
        <label class="chat-settings-row">
          <input type="checkbox" id="chatRejectStrangers" ${
            reject ? "checked" : ""
          } />
          <span class="chat-settings-label">
            Do not receive messages from strangers (not in Friends).
          </span>
        </label>

        <div class="chat-settings-row">
          <span class="chat-settings-label">Panel transparency</span>
          <div class="chat-settings-slider">
            <input
              type="range"
              id="chatOpacityRange"
              min="40"
              max="100"
              step="5"
              value="${opacityPercent}"
            />
            <span id="chatOpacityValue">${opacityPercent}%</span>
          </div>
        </div>

        <p class="chat-settings-hint">
          Higher value = less transparent. This slider affects only the large chat panel.
        </p>
      </div>
    `;

    const checkbox = body.querySelector("#chatRejectStrangers");
    if (checkbox) {
      checkbox.addEventListener("change", () => {
        chatState.settings.reject_strangers = !!checkbox.checked;
        toastLocal(
          checkbox.checked
            ? "Stranger messages disabled (demo)."
            : "Stranger messages allowed (demo)."
        );
      });
    }

    const range = body.querySelector("#chatOpacityRange");
    const valueSpan = body.querySelector("#chatOpacityValue");

    if (range) {
      range.addEventListener("input", () => {
        const val = parseInt(range.value || "90", 10);
        if (valueSpan) valueSpan.textContent = `${val}%`;
        chatState.settings.opacity = Math.max(0.3, Math.min(1, val / 100));
        applyPanelOpacity();
      });
    }

    applyPanelOpacity();
  }

  function applyPanelOpacity() {
    const panel = document.getElementById("chatPanel");
    if (!panel) return;

    // alpha głównego panelu (tak jak dotychczas)
    let main = chatState.settings.opacity || 0.9; // 0.4–1.0
    main = Math.max(0.4, Math.min(1, main));

    // dolne panele: reagują wolniej – mniejszy zakres zmian
    // przy minimalnej przejrzystości ~0.50, przy maksymalnej ~0.75
    let inner = 0.5 + (main - 0.4) * 0.4;
    inner = Math.max(0.5, Math.min(0.75, inner));

    // ustawiamy zmienne CSS, resztę robi CSS
    panel.style.setProperty("--chat-alpha-main", String(main));
    panel.style.setProperty("--chat-alpha-inner", String(inner));
  }

  // === Otwieranie / zamykanie dużego panelu ===

  function openChatPanel(initialTab = "conversations", opts = {}) {
    const panel = ensureChatPanel();
    chatState.fullOpen = true;

    if (opts.userId) {
      chatState.selectedUserId = String(opts.userId);
      chatState.selectedUserName =
        opts.userName || `User ${opts.userId}`;
    }

    // domyślne położenie (prawy-dolny róg)
    let useMiniPos = opts.fromMini && typeof opts.fromMini.left === "number";

    if (useMiniPos) {
      // start tam, gdzie stał mini chat
      panel.style.left = opts.fromMini.left + "px";
      panel.style.top = opts.fromMini.top + "px";
      panel.style.right = "auto";
      panel.style.bottom = "auto";
    } else {
      // normalny start (np. otwarcie z menu)
      panel.style.right = "16px";
      panel.style.bottom = "16px";
      panel.style.left = "auto";
      panel.style.top = "auto";
    }

    panel.style.display = "flex";
    applyPanelOpacity();
    setActiveTab(initialTab);

    // przy pełnym widoku chowamy mini panel
    closeMiniChatPanel();
  }


  function closeChatPanel() {
    const panel = document.getElementById("chatPanel");
    if (panel) {
      panel.style.display = "none";
    }
    chatState.fullOpen = false;
  }

  // === Akcje block/save/friend – na razie tylko demo ===

  function handleInlineAction(action, userId, userName, where) {
    if (!userId) {
      toastLocal("No user selected.");
      return;
    }
    const place = where === "mini" ? "mini" : "full";
    if (action === "block") {
      toastLocal(`Block user ${userName || userId} (${place}, demo).`);
    } else if (action === "save") {
      toastLocal(`Save/unsave conversation with ${
        userName || userId
      } (${place}, demo).`);
    } else if (action === "friend") {
      toastLocal(`Toggle friend for ${userName || userId} (${place}, demo).`);
    }
  }

  function toastLocal(msg) {
    if (window.toast) window.toast(msg);
    else console.log("[chat]", msg);
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
  }

  // === Publiczne API ===

  // Otwórz duży panel – np. z głównego menu
  window.openChatPanel = openChatPanel;

  // Mały panel po kliknięciu "chat" przy awatarze
  window.openChatWithUser = function (userId, userName) {
    openMiniChatPanel(userId, userName);
  };
})();
