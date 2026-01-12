<<<<<<< HEAD
// static/js/chat.panel.js
  const chatState = {
    miniOpen: false,
    fullOpen: false,
    activeTab: "conversations", // 'conversations' | 'friends' | 'blocked' | 'settings'
    selectedUserId: null,
    selectedUserName: null,

    // REALNE rozmowy 1:1 – zarówno friends, jak i nieznajomi
    // [{ id: "123", name: "Nick" }, ...]
    conversations: [],

    // zaciągane z backendu /api/chat/friends/
    friends: [],

    // zaciągane z backendu /api/chat/blocked/
    blocked: [],

    settings: {
      reject_strangers: false,
      opacity: 0.9, // 0–1, przezroczystość dużego panelu
    },
  };



  const CHAT_API = {
    friends: "/api/chat/friends/",
    friendsAdd: "/api/chat/friends/add/",
    friendsRemove: "/api/chat/friends/remove/",
    blocked: "/api/chat/blocked/",
    blockedAdd: "/api/chat/blocked/add/",
    blockedRemove: "/api/chat/blocked/remove/",
    settings: "/api/chat/settings/",
    friendPosition: "/api/chat/friend_position/",   // <--- NOWE
    saveToggle: "/api/chat/save_toggle/",     
  };

  function ensureConversationUser(userId, userName) {
    if (!userId) return;

    const id = String(userId);
    const name = userName || `User ${id}`;

    if (!Array.isArray(chatState.conversations)) {
      chatState.conversations = [];
    }

    const existing = chatState.conversations.find(
      (c) => String(c.id) === id
    );
    if (existing) {
      // ewentualna aktualizacja nazwiska
      if (!existing.name && name) {
        existing.name = name;
      }
      return;
    }

    chatState.conversations.push({
      id,
      name,
    });
  }


  // === WebSocket chat ===
  let chatSocket = null;
  let pendingMessages = [];

  function connectChatSocket() {
    // jeśli już mamy otwarte LUB w trakcie łączenia – nic nie rób
    if (
      chatSocket &&
      (chatSocket.readyState === WebSocket.OPEN ||
        chatSocket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const url = `${proto}://${window.location.host}/ws/chat/`;

    chatSocket = new WebSocket(url);

    chatSocket.onopen = () => {
      console.log("[chat] WS connected");

      // po otwarciu gniazda – dociśnij wszystkie wiadomości z kolejki
      if (pendingMessages.length) {
        pendingMessages.forEach((payload) => {
          try {
            chatSocket.send(JSON.stringify(payload));
          } catch (e) {
            console.warn("[chat] failed to flush pending message", e);
          }
        });
        pendingMessages = [];
      }
    };

    chatSocket.onclose = () => {
      console.log("[chat] WS closed");
      // tu kiedyś możesz dodać reconnect / backoff
    };

    chatSocket.onerror = (e) => {
      console.warn("[chat] WS error", e);
    };

    chatSocket.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch (err) {
        console.warn("[chat] bad WS message", err);
        return;
      }
      handleChatSocketEvent(data);
    };
  }

  // tu ląduje CAŁA logika odbierania eventów z WebSocketa
  function handleChatSocketEvent(ev) {
    if (!ev || typeof ev !== "object") return;

    // handshake z backendem – zapamiętujemy user_id i wyłączamy stary polling inboxa
    if (ev.type === "connection.ack") {
      chatState.currentUserId = ev.user_id;
      window.__chatWsSupportsInbox = true;
      return;
    }

    // nowa wiadomość 1:1
    if (ev.type === "message.new" && ev.message) {
      const m = ev.message;

      const myId = String(chatState.currentUserId || "");
      const senderId = String(m.sender_id);
      const receiverId = String(m.receiver_id);

      // otherId = ten drugi w rozmowie
      const otherId = senderId === myId ? receiverId : senderId;

      // spróbuj sensownie dobrać nazwę rozmówcy
      let otherName;
      if (senderId === myId) {
        // to ja wysłałem → drugi to odbiorca
        otherName =
          chatState.selectedUserName ||
          m.receiver_name ||
          `User ${otherId}`;
      } else {
        // weszło do mnie → nadawca = rozmówca
        otherName = m.sender_name || `User ${senderId}`;
      }

      // dopisz rozmówcę do listy Conversations
      ensureConversationUser(otherId, otherName);

      // aktywny thread TYLKO gdy duży panel jest otwarty i wybrany ten user
      const isActiveThread =
        chatState.fullOpen &&
        chatState.selectedUserId &&
        String(chatState.selectedUserId) === otherId;

      if (isActiveThread) {
        // otwarty duży thread → dopisujemy do okna rozmowy
        appendMessageToCurrentThread(m);
      } else if (typeof window.onIncomingDirectChat === "function") {
        // panel nie jest otwarty / inny user → pokazujemy "Incoming chats"
        const name = m.sender_name || `User ${senderId}`;
        window.onIncomingDirectChat(senderId, name, m.created_at);
      }

      return;
    }

    // inne typy (thread.data, inbox.data) dopiszemy później
  }

  // wysyłanie wiadomości DO aktualnie wybranego usera
  function sendMessageToSelectedUser(text) {
    const toId = chatState.selectedUserId;
    const txt = (text || "").trim();
    if (!toId || !txt) return;

    // żeby rozmówca zawsze był w Conversations (nawet jeśli my zaczęliśmy)
    ensureConversationUser(toId, chatState.selectedUserName);

    const payload = {
      type: "message.send",
      to: toId,
      text: txt,
    };

    // jeśli socket jest otwarty – wyślij od razu
    if (chatSocket && chatSocket.readyState === WebSocket.OPEN) {
      chatSocket.send(JSON.stringify(payload));
      return;
    }

    // w innym wypadku – dodaj do kolejki i upewnij się, że łączymy
    pendingMessages.push(payload);
    connectChatSocket();
  }




  function getCsrf() {
    return window.getCookie ? window.getCookie("csrftoken") : null;
  }

  function fetchJson(url, options) {
    const opts = options || {};
    return fetch(url, {
      credentials: "same-origin",
      ...opts,
    })
      .then((res) =>
        res
          .json()
          .catch(() => ({}))
          .then((data) => ({ ok: res.ok, data }))
      )
      .catch((err) => {
        console.warn("[chat] fetchJson error", err);
        return { ok: false, data: null };
      });
  }
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
    applyPanelOpacity();    
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

    if (tab === "friends") {
      syncFriendsFromServer();
    } else if (tab === "blocked") {
      syncBlockedFromServer();
    }
  } // ← TA klamra była brakująca

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

    if (kind === "friends") {
      // TYLKO lista friends – bez rozmowy po prawej
      body.innerHTML = `
        <div class="chat-columns chat-columns-single">
          <div class="chat-col chat-col-list chat-col-list-full">
            <div id="chatListCol" class="chat-list"></div>
          </div>
        </div>
      `;
    } else {
      // Conversations + Blocked → standardowe 2 kolumny
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
    }

    const listCol = body.querySelector("#chatListCol");
    const messagesScroll =
      kind === "friends"
        ? null
        : body.querySelector("#chatMessagesScroll");




    let list;
    if (kind === "friends") {
      list = chatState.friends || [];
    } else if (kind === "blocked") {
      list = chatState.blocked || [];
    } else {
      // Conversations – wszyscy rozmówcy (friends + nieznajomi)
      list = chatState.conversations || [];
    }


    if (!list || !list.length) {
      listCol.innerHTML = `<div class="chat-empty">No ${kind} yet.</div>`;
    } else {
      listCol.innerHTML = list
        .map((u) => {
          const idStr = String(u.id);
          const name =
            u.name || u.username || u.email || `User ${idStr}`;
          const canGoTo = kind === "friends" ? !!u.isActive : false;

          if (kind === "friends") {
            // FRIENDS: jeden wiersz = nick + przyciski obok
            return `
              <div class="chat-list-item chat-list-item-friend"
                   data-kind="${kind}"
                   data-user-id="${idStr}"
                   data-user-name="${name}">
                <div class="chat-list-name-row">${name}</div>
                <div class="chat-list-options chat-list-options-inline">
                  <button type="button"
                          class="chat-btn chat-btn-xs chat-btn-outline"
                          data-action="chat">
                    chat
                  </button>
                  <button type="button"
                          class="chat-btn chat-btn-xs chat-btn-outline"
                          data-action="block">
                    block
                  </button>
                  <button type="button"
                          class="chat-btn chat-btn-xs chat-btn-outline"
                          data-action="save">
                    save conv
                  </button>
                  <button type="button"
                          class="chat-btn chat-btn-xs chat-btn-outline"
                          data-action="friend">
                    unfriend
                  </button>
                  ${
                    canGoTo
                      ? '<button type="button" class="chat-btn chat-btn-xs chat-btn-outline" data-action="goto">go to</button>'
                      : ""
                  }
                </div>
              </div>
            `;
          }

          // CONVERSATIONS / BLOCKED – klasyczny układ: nick + opcje pod spodem
          return `
            <div class="chat-list-item"
                 data-kind="${kind}"
                 data-user-id="${idStr}"
                 data-user-name="${name}">
              <div class="chat-list-name-row">${name}</div>
              <div class="chat-list-options">
                <button type="button"
                        class="chat-btn chat-btn-xs chat-btn-outline"
                        data-action="block">
                  block
                </button>
                <button type="button"
                        class="chat-btn chat-btn-xs chat-btn-outline"
                        data-action="save">
                  save conv
                </button>
                <button type="button"
                        class="chat-btn chat-btn-xs chat-btn-outline"
                        data-action="friend">
                  friend
                </button>
              </div>
            </div>
          `;
        })
        .join("");
    }





    // Klik w listę
    listCol.onclick = function (e) {
      const item = e.target.closest(".chat-list-item");
      if (!item) return;

      const userId = item.dataset.userId;
      const userName = item.dataset.userName || `User ${userId}`;

      const optBtn = e.target.closest(".chat-list-options button");
      if (optBtn) {
        const action = optBtn.dataset.action;

        if (action === "chat") {
          // Friends: Chat -> przejście do Conversations + otwarcie rozmowy
          ensureConversationUser(userId, userName);
          chatState.selectedUserId = userId;
          chatState.selectedUserName = userName;
          setActiveTab("conversations");
          e.stopPropagation();
          return;
        }

        // inne akcje (block / save / friend / goto)
        handleInlineAction(action, userId, userName, "full");
        e.stopPropagation();
        return;
      }

      if (kind === "friends") {
        // klik w wiersz frienda (poza przyciskami) = też wejście w rozmowę
        ensureConversationUser(userId, userName);
        chatState.selectedUserId = userId;
        chatState.selectedUserName = userName;
        setActiveTab("conversations");
        return;
      }

      // standardowo dla Conversations / Blocked:
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

      if (kind !== "friends" && messagesScroll) {
        renderMessagesForSelected(kind, messagesScroll);
      }
    };

    // Jeśli mamy już wybranego usera – zaznacz go automatycznie (tylko dla Conversations/Blocked)
    if (kind !== "friends") {
      if (chatState.selectedUserId && list && list.length) {
        const initialItem = listCol.querySelector(
          `.chat-list-item[data-user-id="${chatState.selectedUserId}"]`
        );
        if (initialItem) {
          // klik udaje normalny wybór z listy
          initialItem.querySelector(".chat-list-name-row").click();
        } else {
          // lista istnieje, ale nie ma tam tego usera
          renderMessagesForSelected(kind, messagesScroll);
        }
      } else if (chatState.selectedUserId) {
        // lista pusta, ale mamy wybranego usera (np. z Incoming chats / avatara)
        renderMessagesForSelected(kind, messagesScroll);
      }
    }

    const inputEl = body.querySelector("#chatInputFull");
    const sendBtn = body.querySelector("#chatSendBtnFull");
  


    function sendFullMessage() {
      if (!chatState.selectedUserId) {
        toastLocal("Select a user from the list first.");
        return;
      }
      const txt = (inputEl.value || "").trim();
      if (!txt) return;

      // wysyłamy przez WebSocket;
      // UI zaktualizuje się, gdy przyjdzie event message.new
      sendMessageToSelectedUser(txt);
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

    const userId = chatState.selectedUserId;
    if (!userId) {
      scroll.innerHTML = `
        <div class="chat-msg">
          <div class="chat-msg-meta">No conversation selected</div>
          <div class="chat-msg-text">Choose a user from the list.</div>
        </div>
      `;
      return;
    }

    if (kind === "blocked") {
      scroll.innerHTML = `
        <div class="chat-msg">
          <div class="chat-msg-meta">User is blocked</div>
          <div class="chat-msg-text">
            You do not receive messages from this user.
          </div>
        </div>
      `;
      return;
    }

    // Dla friends / conversations: dociągnij historię z backendu
    fetchJson(`/api/chat/thread/${userId}/`).then(({ ok, data }) => {
      if (!ok || !data || data.ok === false) {
        scroll.innerHTML = `
          <div class="chat-msg">
            <div class="chat-msg-meta">Error</div>
            <div class="chat-msg-text">
              Cannot load conversation history.
            </div>
          </div>
        `;
        return;
      }

      const msgs = data.messages || [];
      if (!msgs.length) {
        scroll.innerHTML = `
          <div class="chat-msg">
            <div class="chat-msg-meta">No saved history</div>
            <div class="chat-msg-text">
              Chat is not saved yet or no messages were stored.
            </div>
          </div>
        `;
        return;
      }

      let html = "";
      const myId = String(chatState.currentUserId || "");
      msgs.forEach((m) => {
        const isMe = m.is_me || String(m.sender_id) === myId;
        const who = isMe ? "You" : (m.sender_name || `User ${m.sender_id}`);
        const time = typeof m.created_at === "string" ? m.created_at : "";
        html += `
          <div class="chat-msg ${isMe ? "chat-msg-outgoing" : ""}">
            <div class="chat-msg-meta">
              ${escapeHtml(who)} · ${escapeHtml(time)}
            </div>
            <div class="chat-msg-text">
              ${escapeHtml(m.text || "")}
            </div>
          </div>
        `;
      });
      scroll.innerHTML = html;
      scroll.scrollTop = scroll.scrollHeight;
    });

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
        saveSettings();
        toastLocal(
          checkbox.checked
            ? "Stranger messages disabled."
            : "Stranger messages allowed."
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

      // zapis do backendu dopiero po puszczeniu suwaka
      range.addEventListener("change", () => {
        saveSettings();
      });
    }

    applyPanelOpacity();
  }

  function applyPanelOpacity() {
    // wylicz na podstawie ustawień
    let main = chatState.settings.opacity || 0.9; // 0.4–1.0
    main = Math.max(0.4, Math.min(1, main));

    // "wolniejsze" rozjaśnianie – tak jak w dużym panelu
    let inner = 0.5 + (main - 0.4) * 0.4;
    inner = Math.max(0.5, Math.min(0.75, inner));

    // DUŻY PANEL (#chatPanel)
    const panel = document.getElementById("chatPanel");
    if (panel) {
      panel.style.setProperty("--chat-alpha-main", String(main));
      panel.style.setProperty("--chat-alpha-inner", String(inner));
    }

    // MAŁY PANEL (#miniChatPanel)
    const mini = document.getElementById("miniChatPanel");
    if (mini) {
      // zewnętrzna ramka mini‑okna – mocniej (jak main)
      mini.style.setProperty("--chat-alpha-mini", String(main));
      // środek z tekstem – wolniej (jak inner)
      mini.style.setProperty("--chat-alpha-mini-inner", String(inner));
    }
  }



  function syncSettingsFromServer() {
    fetchJson(CHAT_API.settings).then(({ ok, data }) => {
      if (!ok || !data || data.ok === false) return;

      chatState.settings.reject_strangers = !!data.reject_strangers;

      const op =
        typeof data.panel_opacity === "number"
          ? data.panel_opacity
          : chatState.settings.opacity;
      chatState.settings.opacity = Math.max(0.3, Math.min(1, op));
      chatState.settingsLoaded = true;

      applyPanelOpacity();

      if (chatState.activeTab === "settings") {
        // prze-renderuj, żeby slider i checkbox miały realne wartości
        renderSettingsTab();
      }
    });
  }

  function saveSettings() {
    const csrf = getCsrf();
    fetchJson(CHAT_API.settings, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(csrf ? { "X-CSRFToken": csrf } : {}),
      },
      body: JSON.stringify({
        reject_strangers: !!chatState.settings.reject_strangers,
        panel_opacity: chatState.settings.opacity,
      }),
    }).then(({ ok, data }) => {
      if (!ok || !data) {
        toastLocal("Saving chat settings failed.");
        return;
      }
      // można ewentualnie zaktualizować stan z serwera, ale nie jest to konieczne
    });
  }

  // === Otwieranie / zamykanie dużego panelu ===
  function openChatPanel(initialTab = "conversations", opts = {}) {
    const panel = ensureChatPanel();
    chatState.fullOpen = true;

    connectChatSocket();


    if (opts.userId) {
      chatState.selectedUserId = String(opts.userId);
      chatState.selectedUserName =
        opts.userName || `User ${opts.userId}`;

      // KLUCZ: w każdej takiej sytuacji user ląduje w Conversations
      ensureConversationUser(
        chatState.selectedUserId,
        chatState.selectedUserName
      );
    }

    const useMiniPos = opts.fromMini && typeof opts.fromMini.left === "number";

    if (useMiniPos) {
      // start tam, gdzie stoi mini chat – wstępnie
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

    // musimy go najpierw pokazać, żeby znać prawdziwy rect.width/height
    panel.style.display = "flex";

    // Jeśli otwieramy z mini – docięcie, żeby na pewno cały był w oknie
    if (useMiniPos) {
      const rect = panel.getBoundingClientRect();

      let newLeft = rect.left;
      let newTop = rect.top;

      const maxLeft = window.innerWidth - rect.width;
      const maxTop = window.innerHeight - rect.height;

      // jeśli panel szerszy niż okno, maxLeft będzie ujemny – wtedy trzymamy się 0
      if (maxLeft <= 0) {
        newLeft = 0;
      } else {
        newLeft = Math.min(Math.max(0, newLeft), maxLeft);
      }

      if (maxTop <= 0) {
        newTop = 0;
      } else {
        newTop = Math.min(Math.max(0, newTop), maxTop);
      }

      panel.style.left = newLeft + "px";
      panel.style.top = newTop + "px";
      panel.style.right = "auto";
      panel.style.bottom = "auto";
    }

    if (!chatState.settingsLoaded) {
      syncSettingsFromServer();
    }

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

  function syncFriendsFromServer() {
    fetchJson(CHAT_API.friends).then(({ ok, data }) => {
      if (!ok || !data || data.ok === false) return;

      chatState.friends = (data.friends || []).map((u) => ({
        id: String(u.id),
        name: u.username || u.email || `User ${u.id}`,
        email: u.email || null,
        isActive: !!u.is_active,  // <-- tu wczytujemy flagę z backendu
      }));

      if (chatState.activeTab === "friends") {
        renderListTab("friends");
      }
    });
  }


  function syncBlockedFromServer() {
    fetchJson(CHAT_API.blocked).then(({ ok, data }) => {
      if (!ok || !data || data.ok === false) return;

      chatState.blocked = (data.blocked || []).map((u) => ({
        id: String(u.id),
        name: u.username || u.email || `User ${u.id}`,
        email: u.email || null,
      }));

      if (chatState.activeTab === "blocked") {
        renderListTab("blocked");
      }
    });
  }

  function isFriend(userId) {
    const id = String(userId);
    return (chatState.friends || []).some((f) => String(f.id) === id);
  }

  function isBlocked(userId) {
    const id = String(userId);
    return (chatState.blocked || []).some((b) => String(b.id) === id);
  }

  function toggleFriend(userId, userName) {
    const wasFriend = isFriend(userId);
    const url = wasFriend ? CHAT_API.friendsRemove : CHAT_API.friendsAdd;
    const csrf = getCsrf();

    fetchJson(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(csrf ? { "X-CSRFToken": csrf } : {}),
      },
      body: JSON.stringify({ user_id: userId }),
    }).then(({ ok, data }) => {
      if (!ok || !data || data.ok === false) {
        const err = data && data.error ? data.error : "Cannot update friends.";
        toastLocal(err);
        return;
      }
      toastLocal(
        wasFriend
          ? `Removed friend ${userName || userId}.`
          : `Added friend ${userName || userId}.`
      );
      syncFriendsFromServer();
    });
  }

  function toggleBlocked(userId, userName) {
    const wasBlocked = isBlocked(userId);
    const url = wasBlocked ? CHAT_API.blockedRemove : CHAT_API.blockedAdd;
    const csrf = getCsrf();

    fetchJson(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(csrf ? { "X-CSRFToken": csrf } : {}),
      },
      body: JSON.stringify({ user_id: userId }),
    }).then(({ ok, data }) => {
      if (!ok || !data || data.ok === false) {
        const err =
          data && data.error ? data.error : "Cannot update blocked list.";
        toastLocal(err);
        return;
      }
      toastLocal(
        wasBlocked
          ? `Unblocked ${userName || userId}.`
          : `Blocked ${userName || userId}.`
      );
      syncBlockedFromServer();
    });
  }

  function toggleSaved(userId, userName) {
    if (!userId) {
      toastLocal("No user selected.");
      return;
    }

    const csrf = getCsrf();
    fetchJson(CHAT_API.saveToggle, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(csrf ? { "X-CSRFToken": csrf } : {}),
      },
      body: JSON.stringify({ user_id: userId }),
    }).then(({ ok, data }) => {
      if (!ok || !data || data.ok === false) {
        const err = data && data.error ? data.error : "Cannot toggle save.";
        toastLocal(err);
        return;
      }
      const saved = !!data.saved;
      toastLocal(
        saved
          ? `Chat with ${userName || userId} saved.`
          : `Chat with ${userName || userId} unsaved.`
      );
      // tu ewentualnie można podświetlić przycisk "save conv"
    });
  }


  function gotoFriend(userId, userName) {
    if (!userId) {
      toastLocal("No user selected.");
      return;
    }

    // budujemy URL: /api/chat/friend_position/<id>/
    const url =
      CHAT_API.friendPosition.replace(/\/$/, "") + "/" + String(userId) + "/";

    fetchJson(url).then(({ ok, data }) => {
      if (!ok || !data || data.ok === false) {
        const err = data && data.error;
        if (err === "NOT_ACTIVE") {
          toastLocal("This friend is not active on the map.");
        } else if (err === "NOT_FRIEND") {
          toastLocal("This user is not your friend.");
        } else if (err === "USER_NOT_FOUND") {
          toastLocal("User not found.");
        } else {
          toastLocal("Cannot locate this user.");
        }
        return;
      }

      const lat = Number(data.lat);
      const lon = Number(data.lon);
      const alt = Number(data.alt || 300);

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        toastLocal("Location data is invalid.");
        return;
      }

      const height = alt || 300;
      const range = 600;

      // preferowany helper z mapy, jeśli istnieje
      if (typeof window.flyToLonLat === "function") {
        window.flyToLonLat(lon, lat, {
          height,
          range,
          pitchDeg: 0,
          duration: 1.5,
        });
      } else if (typeof window.gotoAvatar === "function") {
        // fallback do starej logiki, jeśli kiedyś będziesz chciał
        window.gotoAvatar(userId);
      } else {
        toastLocal("Map navigation is not available.");
        return;
      }

      toastLocal(`Go to: ${userName || "User " + userId}`);
    });
  }
 

    // === Akcje block/save/friend – 
  function handleInlineAction(action, userId, userName, where) {
    if (!userId) {
      toastLocal("No user selected.");
      return;
    }

    if (action === "block") {
      toggleBlocked(userId, userName);
    } else if (action === "save") {
      toggleSaved(userId, userName);
    } else if (action === "friend") {
      toggleFriend(userId, userName);
    } else if (action === "goto") {
      gotoFriend(userId, userName);
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

  // Chat z konkretnym userem → od razu DUŻY panel, zakładka Conversations
  window.openChatWithUser = function (userId, userName) {
    openChatPanel("conversations", {
      userId,
      userName,
    });
  };
=======
// static/js/chat.panel.js - Simple Chat Panel
(function() {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════════════════════════════════════
  const state = {
    activeTab: 'chats',  // 'chats' | 'friends' | 'blocked'
    selectedUserId: null,
    selectedUserName: null,
    threads: [],
    friends: [],
    pendingRequests: [],
    blocked: [],
    messages: [],
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // API HELPERS
  // ═══════════════════════════════════════════════════════════════════════════
  const csrf = () => window.getCookie ? window.getCookie('csrftoken') : '';

  async function api(url, method = 'GET', data = null) {
    const opts = {
      method,
      credentials: 'same-origin',
      headers: {}
    };
    if (method !== 'GET' && data) {
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['X-CSRFToken'] = csrf();
      opts.body = JSON.stringify(data);
    }
    const r = await fetch(url, opts);
    return r.json();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  function renderPanel() {
    const panel = document.getElementById('chatPanel');
    if (!panel) return;

    panel.innerHTML = `
      <div class="chat-header">
        <div class="chat-tabs">
          <button class="chat-tab ${state.activeTab === 'chats' ? 'active' : ''}" data-tab="chats">Chats</button>
          <button class="chat-tab ${state.activeTab === 'friends' ? 'active' : ''}" data-tab="friends">Friends</button>
          <button class="chat-tab ${state.activeTab === 'blocked' ? 'active' : ''}" data-tab="blocked">Blocked</button>
        </div>
        <button class="chat-close" data-close="chatPanel">X</button>
      </div>
      <div class="chat-body">
        ${renderTabContent()}
      </div>
    `;

    bindPanelEvents();
  }

  function renderTabContent() {
    switch (state.activeTab) {
      case 'chats': return renderChatsTab();
      case 'friends': return renderFriendsTab();
      case 'blocked': return renderBlockedTab();
      default: return '';
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CHATS TAB
  // ─────────────────────────────────────────────────────────────────────────────
  function renderChatsTab() {
    if (state.selectedUserId) {
      return renderConversation();
    }
    return renderThreadList();
  }

  function renderThreadList() {
    let html = `
      <div class="chat-section">
        <div class="chat-search">
          <input type="text" id="userSearch" class="chat-input" placeholder="Search users...">
          <div id="searchResults" class="search-results"></div>
        </div>
        <div class="chat-list" id="threadList">
    `;

    if (state.threads.length === 0) {
      html += '<div class="chat-empty">No conversations yet</div>';
    } else {
      for (const t of state.threads) {
        html += `
          <div class="chat-item" data-user-id="${t.user_id}" data-username="${t.username}">
            <div class="chat-item-name">${escHtml(t.username)}</div>
            <div class="chat-item-preview">${escHtml(t.last_message || '')}</div>
          </div>
        `;
      }
    }

    html += '</div></div>';
    return html;
  }

  function renderConversation() {
    let html = `
      <div class="chat-conversation">
        <div class="chat-conv-header">
          <button class="chat-back" id="backToList">&larr;</button>
          <span class="chat-conv-name">${escHtml(state.selectedUserName || 'Chat')}</span>
          <div class="chat-conv-actions">
            <button class="chat-action-btn" id="addFriendBtn" title="Add Friend">+Friend</button>
            <button class="chat-action-btn danger" id="blockUserBtn" title="Block">Block</button>
          </div>
        </div>
        <div class="chat-messages" id="messageList">
    `;

    for (const m of state.messages) {
      html += `
        <div class="chat-msg ${m.mine ? 'mine' : 'theirs'}">
          <div class="chat-msg-content">${escHtml(m.content)}</div>
          <div class="chat-msg-time">${formatTime(m.time)}</div>
        </div>
      `;
    }

    html += `
        </div>
        <div class="chat-composer">
          <input type="text" id="messageInput" class="chat-input" placeholder="Type a message...">
          <button class="chat-send-btn" id="sendBtn">Send</button>
        </div>
      </div>
    `;
    return html;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // FRIENDS TAB
  // ─────────────────────────────────────────────────────────────────────────────
  function renderFriendsTab() {
    let html = '<div class="chat-section">';

    // Pending requests
    if (state.pendingRequests.length > 0) {
      html += '<div class="chat-subtitle">Pending Requests</div><div class="chat-list">';
      for (const req of state.pendingRequests) {
        html += `
          <div class="chat-item pending-request">
            <span>${escHtml(req.from_username)}</span>
            <div class="chat-item-actions">
              <button class="chat-btn accept" data-accept="${req.from_user_id}">Accept</button>
              <button class="chat-btn decline" data-decline="${req.from_user_id}">Decline</button>
            </div>
          </div>
        `;
      }
      html += '</div>';
    }

    // Friends list
    html += '<div class="chat-subtitle">Friends</div><div class="chat-list">';
    if (state.friends.length === 0) {
      html += '<div class="chat-empty">No friends yet</div>';
    } else {
      for (const f of state.friends) {
        html += `
          <div class="chat-item friend-item">
            <span>${escHtml(f.username)}</span>
            <div class="chat-item-actions">
              <button class="chat-btn message" data-message="${f.id}" data-name="${escHtml(f.username)}">Message</button>
              <button class="chat-btn remove" data-remove-friend="${f.id}">Remove</button>
            </div>
          </div>
        `;
      }
    }
    html += '</div></div>';
    return html;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // BLOCKED TAB
  // ─────────────────────────────────────────────────────────────────────────────
  function renderBlockedTab() {
    let html = '<div class="chat-section"><div class="chat-subtitle">Blocked Users</div><div class="chat-list">';

    if (state.blocked.length === 0) {
      html += '<div class="chat-empty">No blocked users</div>';
    } else {
      for (const b of state.blocked) {
        html += `
          <div class="chat-item blocked-item">
            <span>${escHtml(b.username)}</span>
            <button class="chat-btn unblock" data-unblock="${b.id}">Unblock</button>
          </div>
        `;
      }
    }

    html += '</div></div>';
    return html;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENT BINDING
  // ═══════════════════════════════════════════════════════════════════════════

  function bindPanelEvents() {
    const panel = document.getElementById('chatPanel');
    if (!panel) return;

    // Tab switching
    panel.querySelectorAll('.chat-tab').forEach(tab => {
      tab.onclick = () => {
        state.activeTab = tab.dataset.tab;
        state.selectedUserId = null;
        loadTabData();
      };
    });

    // Close button
    const closeBtn = panel.querySelector('[data-close]');
    if (closeBtn) {
      closeBtn.onclick = () => {
        panel.style.display = 'none';
      };
    }

    // User search
    const searchInput = document.getElementById('userSearch');
    if (searchInput) {
      let debounce = null;
      searchInput.oninput = () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => searchUsers(searchInput.value), 300);
      };
    }

    // Thread list clicks
    panel.querySelectorAll('.chat-item[data-user-id]').forEach(item => {
      item.onclick = () => openConversation(item.dataset.userId, item.dataset.username);
    });

    // Back button
    const backBtn = document.getElementById('backToList');
    if (backBtn) {
      backBtn.onclick = () => {
        state.selectedUserId = null;
        state.selectedUserName = null;
        state.messages = [];
        renderPanel();
      };
    }

    // Send message
    const sendBtn = document.getElementById('sendBtn');
    const msgInput = document.getElementById('messageInput');
    if (sendBtn && msgInput) {
      sendBtn.onclick = () => sendMessage(msgInput.value);
      msgInput.onkeypress = (e) => {
        if (e.key === 'Enter') sendMessage(msgInput.value);
      };
    }

    // Add friend from conversation
    const addFriendBtn = document.getElementById('addFriendBtn');
    if (addFriendBtn) {
      addFriendBtn.onclick = () => addFriend(state.selectedUserId);
    }

    // Block from conversation
    const blockBtn = document.getElementById('blockUserBtn');
    if (blockBtn) {
      blockBtn.onclick = () => blockUser(state.selectedUserId);
    }

    // Friends tab actions
    panel.querySelectorAll('[data-accept]').forEach(btn => {
      btn.onclick = (e) => { e.stopPropagation(); acceptFriend(btn.dataset.accept); };
    });
    panel.querySelectorAll('[data-decline]').forEach(btn => {
      btn.onclick = (e) => { e.stopPropagation(); declineFriend(btn.dataset.decline); };
    });
    panel.querySelectorAll('[data-message]').forEach(btn => {
      btn.onclick = (e) => { e.stopPropagation(); openConversation(btn.dataset.message, btn.dataset.name); };
    });
    panel.querySelectorAll('[data-remove-friend]').forEach(btn => {
      btn.onclick = (e) => { e.stopPropagation(); removeFriend(btn.dataset.removeFriend); };
    });

    // Blocked tab actions
    panel.querySelectorAll('[data-unblock]').forEach(btn => {
      btn.onclick = (e) => { e.stopPropagation(); unblockUser(btn.dataset.unblock); };
    });

    // Scroll messages to bottom
    const msgList = document.getElementById('messageList');
    if (msgList) {
      msgList.scrollTop = msgList.scrollHeight;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA LOADING
  // ═══════════════════════════════════════════════════════════════════════════

  async function loadTabData() {
    switch (state.activeTab) {
      case 'chats':
        await loadThreads();
        break;
      case 'friends':
        await loadFriends();
        await loadPendingRequests();
        break;
      case 'blocked':
        await loadBlocked();
        break;
    }
    renderPanel();
  }

  async function loadThreads() {
    const res = await api('/api/chat/threads/');
    if (res.ok) {
      state.threads = res.threads || [];
    }
  }

  async function loadFriends() {
    const res = await api('/api/friends/');
    if (res.ok) {
      state.friends = res.friends || [];
    }
  }

  async function loadPendingRequests() {
    const res = await api('/api/friends/pending/');
    if (res.ok) {
      state.pendingRequests = res.requests || [];
    }
  }

  async function loadBlocked() {
    const res = await api('/api/blocked/');
    if (res.ok) {
      state.blocked = res.blocked || [];
    }
  }

  async function loadMessages(userId) {
    const res = await api(`/api/chat/history/${userId}/`);
    if (res.ok) {
      state.messages = res.messages || [];
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  async function openConversation(userId, username) {
    state.selectedUserId = userId;
    state.selectedUserName = username;
    state.activeTab = 'chats';
    await loadMessages(userId);
    renderPanel();
  }

  async function sendMessage(text) {
    text = (text || '').trim();
    if (!text || !state.selectedUserId) return;

    const res = await api('/api/chat/send/', 'POST', {
      to: state.selectedUserId,
      content: text
    });

    if (res.ok) {
      // Add to local messages
      state.messages.push({
        content: text,
        time: new Date().toISOString(),
        mine: true
      });
      renderPanel();
    }
  }

  async function searchUsers(query) {
    const resultsDiv = document.getElementById('searchResults');
    if (!resultsDiv) return;

    if (!query || query.length < 2) {
      resultsDiv.innerHTML = '';
      return;
    }

    const res = await api(`/api/users/search/?q=${encodeURIComponent(query)}`);
    if (res.ok && res.users) {
      resultsDiv.innerHTML = res.users.map(u => `
        <div class="search-result" data-user-id="${u.id}" data-username="${escHtml(u.username)}">
          ${escHtml(u.username)}
        </div>
      `).join('');

      resultsDiv.querySelectorAll('.search-result').forEach(item => {
        item.onclick = () => {
          openConversation(item.dataset.userId, item.dataset.username);
          resultsDiv.innerHTML = '';
        };
      });
    }
  }

  async function addFriend(userId) {
    if (!userId) return;
    const res = await api('/api/friends/add/', 'POST', { user_id: userId });
    if (res.ok) {
      alert('Friend request sent!');
    } else {
      alert(res.error || 'Failed to send request');
    }
  }

  async function acceptFriend(userId) {
    const res = await api('/api/friends/accept/', 'POST', { user_id: userId });
    if (res.ok) {
      loadTabData();
    }
  }

  async function declineFriend(userId) {
    const res = await api('/api/friends/remove/', 'POST', { user_id: userId });
    if (res.ok) {
      loadTabData();
    }
  }

  async function removeFriend(userId) {
    if (!confirm('Remove this friend?')) return;
    const res = await api('/api/friends/remove/', 'POST', { user_id: userId });
    if (res.ok) {
      loadTabData();
    }
  }

  async function blockUser(userId) {
    if (!userId) return;
    if (!confirm('Block this user?')) return;
    const res = await api('/api/block/', 'POST', { user_id: userId });
    if (res.ok) {
      state.selectedUserId = null;
      state.selectedUserName = null;
      loadTabData();
    }
  }

  async function unblockUser(userId) {
    const res = await api('/api/unblock/', 'POST', { user_id: userId });
    if (res.ok) {
      loadTabData();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatTime(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INIT & EXPORTS
  // ═══════════════════════════════════════════════════════════════════════════

  function initChatPanel() {
    loadTabData();
  }

  // Export to window
  window.ChatPanel = {
    init: initChatPanel,
    open: async function() {
      const panel = document.getElementById('chatPanel');
      if (panel) {
        panel.style.display = 'block';
        await loadTabData();
      }
    },
    openChat: openConversation,
    render: renderPanel,
  };

  // Auto-init when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChatPanel);
  } else {
    initChatPanel();
  }
})();
>>>>>>> 7ee9b21 (Inital at 01.12.2026)
