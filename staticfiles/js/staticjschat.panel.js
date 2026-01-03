// static/js/chat.panel.js
(function () {
  const chatState = {
    isOpen: false,
    activeTab: "conversations", // 'conversations' | 'friends' | 'blocked' | 'settings'
    selectedUserId: null,
    selectedUserName: null,
    // na razie demo listy userów – potem podepniemy API
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
    },
  };

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
        <div id="chatPanelBody">
          <div class="chat-columns">
            <div class="chat-col chat-col-list" id="chatListCol"></div>
            <div class="chat-col chat-col-messages" id="chatMessagesCol"></div>
            <div class="chat-col chat-col-actions" id="chatActionsCol"></div>
          </div>
        </div>
      `;

      document.body.appendChild(panel);

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
    return panel;
  }

  function setActiveTab(tab) {
    chatState.activeTab = tab;
    const panel = ensureChatPanel();
    const tabs = panel.querySelectorAll(".chat-tab");
    tabs.forEach((b) => {
      b.classList.toggle("chat-tab-active", b.dataset.tab === tab);
    });
    renderActiveTab();
  }

  function openChatPanel(initialTab = "conversations", opts = {}) {
    const panel = ensureChatPanel();
    chatState.isOpen = true;
    panel.style.display = "flex";

    if (opts.userId) {
      chatState.selectedUserId = String(opts.userId);
      chatState.selectedUserName = opts.userName || `User ${opts.userId}`;
    }

    setActiveTab(initialTab);
  }

  function closeChatPanel() {
    const panel = document.getElementById("chatPanel");
    if (panel) panel.style.display = "none";
    chatState.isOpen = false;
  }

  function renderActiveTab() {
    switch (chatState.activeTab) {
      case "conversations":
        renderConversationsTab();
        break;
      case "friends":
        renderFriendsTab();
        break;
      case "blocked":
        renderBlockedTab();
        break;
      case "settings":
        renderSettingsTab();
        break;
      default:
        renderConversationsTab();
    }
  }

  // === TAB: Conversations ===

  function renderConversationsTab() {
    const panel = ensureChatPanel();
    const listCol = panel.querySelector("#chatListCol");
    const messagesCol = panel.querySelector("#chatMessagesCol");
    const actionsCol = panel.querySelector("#chatActionsCol");

    // lewa kolumna – demo lista konwersacji
    const convs = chatState.demoConversations;
    let htmlList = "";
    convs.forEach((u) => {
      const active =
        chatState.selectedUserId && chatState.selectedUserId === String(u.id);
      htmlList += `
        <div class="chat-list-item ${active ? "chat-list-item-active" : ""}"
             data-user-id="${u.id}"
             data-user-name="${u.name}">
          ${u.name}
        </div>
      `;
    });
    listCol.innerHTML = htmlList || "No conversations yet.";

    listCol.onclick = (e) => {
      const row = e.target.closest(".chat-list-item");
      if (!row) return;
      const uid = row.dataset.userId;
      const uname = row.dataset.userName;
      chatState.selectedUserId = uid;
      chatState.selectedUserName = uname;
      renderConversationsTab(); // odśwież listę (podświetlenie) + treść
    };

    // środkowa kolumna – treść czatu
    if (!chatState.selectedUserId && convs.length > 0) {
      const first = convs[0];
      chatState.selectedUserId = String(first.id);
      chatState.selectedUserName = first.name;
    }

    if (chatState.selectedUserId) {
      const uname = chatState.selectedUserName || `User ${chatState.selectedUserId}`;
      messagesCol.innerHTML = `
        <div id="chatMessagesScroll">
          <div class="chat-msg">
            <div class="chat-msg-meta">Demo conversation with ${uname}</div>
            <div class="chat-msg-text">Here will be real messages.</div>
          </div>
        </div>
        <div class="chat-input-row">
          <input id="chatInput" type="text" placeholder="Type a message...">
          <button class="chat-btn" id="chatSendBtn">Send</button>
        </div>
      `;

      const sendBtn = messagesCol.querySelector("#chatSendBtn");
      const inputEl = messagesCol.querySelector("#chatInput");
      if (sendBtn && inputEl) {
        sendBtn.onclick = () => {
          const txt = (inputEl.value || "").trim();
          if (!txt) return;
          // Na razie tylko demo – dopiszemy prawdziwe wysyłanie w kolejnym kroku
          const msgBox = messagesCol.querySelector("#chatMessagesScroll");
          if (msgBox) {
            msgBox.innerHTML += `
              <div class="chat-msg">
                <div class="chat-msg-meta">You (demo)</div>
                <div class="chat-msg-text">${txt}</div>
              </div>
            `;
            msgBox.scrollTop = msgBox.scrollHeight;
          }
          inputEl.value = "";
        };
      }
    } else {
      messagesCol.innerHTML = "Select a conversation.";
    }

    // prawa kolumna – akcje na userze (demo)
    renderUserActions(actionsCol);
  }

  // === TAB: Friends ===

  function renderFriendsTab() {
    const panel = ensureChatPanel();
    const listCol = panel.querySelector("#chatListCol");
    const messagesCol = panel.querySelector("#chatMessagesCol");
    const actionsCol = panel.querySelector("#chatActionsCol");

    const friends = chatState.demoFriends;
    let htmlList = "";
    friends.forEach((u) => {
      const active =
        chatState.selectedUserId && chatState.selectedUserId === String(u.id);
      htmlList += `
        <div class="chat-list-item ${active ? "chat-list-item-active" : ""}"
             data-user-id="${u.id}"
             data-user-name="${u.name}">
          ${u.name}
        </div>
      `;
    });
    listCol.innerHTML = htmlList || "You have no friends yet.";

    listCol.onclick = (e) => {
      const row = e.target.closest(".chat-list-item");
      if (!row) return;
      const uid = row.dataset.userId;
      const uname = row.dataset.userName;
      chatState.selectedUserId = uid;
      chatState.selectedUserName = uname;
      renderFriendsTab();
    };

    if (chatState.selectedUserId && chatState.selectedUserName) {
      const uname = chatState.selectedUserName;
      messagesCol.innerHTML = `
        <div id="chatMessagesScroll">
          <div class="chat-msg">
            <div class="chat-msg-meta">Chat with ${uname} (demo)</div>
            <div class="chat-msg-text">Here will be real messages with ${uname}.</div>
          </div>
        </div>
        <div class="chat-input-row">
          <input id="chatInput" type="text" placeholder="Type a message...">
          <button class="chat-btn" id="chatSendBtn">Send</button>
        </div>
      `;
      const sendBtn = messagesCol.querySelector("#chatSendBtn");
      const inputEl = messagesCol.querySelector("#chatInput");
      if (sendBtn && inputEl) {
        sendBtn.onclick = () => {
          const txt = (inputEl.value || "").trim();
          if (!txt) return;
          const msgBox = messagesCol.querySelector("#chatMessagesScroll");
          if (msgBox) {
            msgBox.innerHTML += `
              <div class="chat-msg">
                <div class="chat-msg-meta">You (demo)</div>
                <div class="chat-msg-text">${txt}</div>
              </div>
            `;
            msgBox.scrollTop = msgBox.scrollHeight;
          }
          inputEl.value = "";
        };
      }
    } else {
      messagesCol.innerHTML = "Select a friend to chat.";
    }

    renderUserActions(actionsCol);
  }

  // === TAB: Blocked ===

  function renderBlockedTab() {
    const panel = ensureChatPanel();
    const listCol = panel.querySelector("#chatListCol");
    const messagesCol = panel.querySelector("#chatMessagesCol");
    const actionsCol = panel.querySelector("#chatActionsCol");

    const blocked = chatState.demoBlocked;

    listCol.innerHTML = blocked.length
      ? blocked
          .map(
            (u) => `
      <div class="chat-blocked-item">
        <span>${u.name}</span>
        <button class="chat-btn chat-btn-outline" data-unblock-id="${u.id}">Unblock</button>
      </div>
    `
          )
          .join("")
      : "No blocked users.";

    listCol.onclick = (e) => {
      const btn = e.target.closest("[data-unblock-id]");
      if (!btn) return;
      const id = btn.dataset.unblockId;
      // Na razie tylko demo – usuwamy z lokalnej listy
      chatState.demoBlocked = blocked.filter((u) => String(u.id) !== String(id));
      renderBlockedTab();
    };

    messagesCol.innerHTML = "Blocked users will not be able to chat with you.";
    actionsCol.innerHTML = `
      <div class="chat-actions-section">
        <div class="chat-actions-section-title">Info</div>
        <div>Here we can show help about blocking.</div>
      </div>
    `;
  }

  // === TAB: Settings ===

  function renderSettingsTab() {
    const panel = ensureChatPanel();
    const listCol = panel.querySelector("#chatListCol");
    const messagesCol = panel.querySelector("#chatMessagesCol");
    const actionsCol = panel.querySelector("#chatActionsCol");

    listCol.innerHTML = "";
    messagesCol.innerHTML = `
      <div>
        <div class="chat-settings-row">
          <input type="checkbox" id="chatRejectStrangers" ${
            chatState.settings.reject_strangers ? "checked" : ""
          }>
          <label for="chatRejectStrangers">
            Do not receive messages from strangers (not in Friends)
          </label>
        </div>
        <div style="font-size:11px;opacity:0.7;">
          (For now this is only UI; backend enforcement zrobimy osobno.)
        </div>
      </div>
    `;
    actionsCol.innerHTML = "";

    const checkbox = messagesCol.querySelector("#chatRejectStrangers");
    if (checkbox) {
      checkbox.onchange = () => {
        chatState.settings.reject_strangers = !!checkbox.checked;
      };
    }
  }

  // === Prawa kolumna – akcje Friend / Block / Save (demo) ===

  function renderUserActions(actionsCol) {
    const uid = chatState.selectedUserId;
    const uname = chatState.selectedUserName;
    if (!uid) {
      actionsCol.innerHTML = "Select a user.";
      return;
    }

    actionsCol.innerHTML = `
      <div class="chat-actions-section">
        <div class="chat-actions-section-title">User</div>
        <div>${uname} (id: ${uid})</div>
      </div>
      <div class="chat-actions-section">
        <div class="chat-actions-section-title">Actions</div>
        <div class="chat-actions-buttons">
          <button class="chat-btn" data-action="friend-toggle">Friend / Unfriend</button>
          <button class="chat-btn chat-btn-outline" data-action="block-toggle">Block / Unblock</button>
          <button class="chat-btn chat-btn-outline" data-action="save-toggle">Save / Unsave chat</button>
        </div>
      </div>
    `;

    actionsCol.onclick = (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === "friend-toggle") {
        // tu później podepniemy /api/chat/friends/add/remove
        toastLocal("Friend/Unfriend (demo)");
      } else if (action === "block-toggle") {
        // tu później podepniemy /api/chat/blocked/add/remove
        toastLocal("Block/Unblock (demo)");
      } else if (action === "save-toggle") {
        // tu później podepniemy logikę zapisywania rozmowy
        toastLocal("Save/Unsave chat (demo)");
      }
    };
  }

  function toastLocal(msg) {
    if (window.toast) window.toast(msg);
    else alert(msg);
  }

  // === Publiczne API ===

  // otwarcie panelu, np. openChatPanel('conversations', {userId, userName})
  window.openChatPanel = openChatPanel;

  // helper: otwórz Conversations i zaznacz usera
  window.openChatWithUser = function (userId, userName) {
    openChatPanel("conversations", { userId, userName });
  };
})();
