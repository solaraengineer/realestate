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
