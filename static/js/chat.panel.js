// static/js/chat.panel.js - Simple Chat Panel with WebSocket Support
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
    ws: null,
    wsConnected: false,
    wsReconnectTimer: null,
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
    try {
      const r = await fetch(url, opts);
      const json = await r.json();
      if (!r.ok && !json.error) {
        json.error = `HTTP ${r.status}`;
      }
      return json;
    } catch (e) {
      return { ok: false, error: e.message || 'Network error' };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WEBSOCKET CONNECTION
  // ═══════════════════════════════════════════════════════════════════════════
  function connectWebSocket() {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/chat/`;

    try {
      state.ws = new WebSocket(wsUrl);

      state.ws.onopen = () => {
        console.log('[ChatPanel] WebSocket connected');
        state.wsConnected = true;
        if (state.wsReconnectTimer) {
          clearTimeout(state.wsReconnectTimer);
          state.wsReconnectTimer = null;
        }
      };

      state.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleWsMessage(data);
        } catch (e) {
          console.warn('[ChatPanel] WS message parse error:', e);
        }
      };

      state.ws.onclose = () => {
        console.log('[ChatPanel] WebSocket closed');
        state.wsConnected = false;
        // Reconnect after 3 seconds
        if (!state.wsReconnectTimer) {
          state.wsReconnectTimer = setTimeout(() => {
            state.wsReconnectTimer = null;
            connectWebSocket();
          }, 3000);
        }
      };

      state.ws.onerror = (err) => {
        console.warn('[ChatPanel] WebSocket error:', err);
      };
    } catch (e) {
      console.warn('[ChatPanel] WebSocket connection failed:', e);
    }
  }

  function disconnectWebSocket() {
    if (state.wsReconnectTimer) {
      clearTimeout(state.wsReconnectTimer);
      state.wsReconnectTimer = null;
    }
    if (state.ws) {
      state.ws.close();
      state.ws = null;
    }
    state.wsConnected = false;
  }

  function handleWsMessage(data) {
    const type = data.type;

    if (type === 'connection.ack') {
      console.log('[ChatPanel] WS authenticated as user:', data.user_id);
      return;
    }

    if (type === 'message.new') {
      const msg = data.message;
      // If we're in a conversation with this user, add the message
      if (state.selectedUserId &&
          (String(msg.sender_id) === String(state.selectedUserId) ||
           String(msg.receiver_id) === String(state.selectedUserId))) {
        const isMine = String(msg.sender_id) === String(window.currentUserId);
        state.messages.push({
          id: msg.id,
          sender_id: msg.sender_id,
          content: msg.content,
          time: msg.time,
          mine: isMine
        });
        renderPanel();
        // Scroll to bottom
        setTimeout(() => {
          const msgList = document.getElementById('messageList');
          if (msgList) msgList.scrollTop = msgList.scrollHeight;
        }, 50);
      } else {
        // Refresh threads to show new message indicator
        loadThreads().then(() => {
          if (state.activeTab === 'chats' && !state.selectedUserId) {
            renderPanel();
          }
        });
      }
      return;
    }

    if (type === 'message.error') {
      console.warn('[ChatPanel] Message error:', data.error);
      showError(getErrorMessage(data.error));
      return;
    }

    if (type === 'pong') {
      // Keep-alive response
      return;
    }
  }

  function sendWsMessage(toUserId, text) {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
      console.warn('[ChatPanel] WebSocket not connected, falling back to HTTP');
      return false;
    }

    state.ws.send(JSON.stringify({
      type: 'message.send',
      to: toUserId,
      text: text
    }));
    return true;
  }

  // Keep-alive ping
  setInterval(() => {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify({ type: 'ping' }));
    }
  }, 30000);

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

    // Add friend search
    html += `
      <div class="chat-subtitle">Add Friend</div>
      <div class="friend-add-section" style="margin-bottom:16px;">
        <div style="display:flex;gap:8px;">
          <input type="text" id="addFriendSearch" class="chat-input" placeholder="Search username..." style="flex:1;">
        </div>
        <div id="addFriendResults" class="search-results" style="margin-top:4px;"></div>
      </div>
    `;

    // Pending requests
    if (state.pendingRequests.length > 0) {
      html += '<div class="chat-subtitle">Pending Requests</div><div class="chat-list">';
      for (const req of state.pendingRequests) {
        html += `
          <div class="chat-item pending-request" style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:rgba(255,200,0,0.1);border-radius:8px;margin-bottom:6px;">
            <span style="font-weight:600;">${escHtml(req.from_username)}</span>
            <div class="chat-item-actions" style="display:flex;gap:6px;">
              <button class="chat-btn accept" data-accept="${req.from_user_id}" style="background:#22c55e;color:#fff;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;">Accept</button>
              <button class="chat-btn decline" data-decline="${req.from_user_id}" style="background:#ef4444;color:#fff;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;">Decline</button>
            </div>
          </div>
        `;
      }
      html += '</div>';
    }

    // Friends list
    html += '<div class="chat-subtitle">My Friends</div><div class="chat-list">';
    if (state.friends.length === 0) {
      html += '<div class="chat-empty" style="color:var(--text-muted);padding:12px;">No friends yet. Search for users above to add friends!</div>';
    } else {
      for (const f of state.friends) {
        html += `
          <div class="chat-item friend-item" style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:var(--glass-light);border-radius:8px;margin-bottom:6px;">
            <span style="font-weight:600;">${escHtml(f.username)}</span>
            <div class="chat-item-actions" style="display:flex;gap:6px;">
              <button class="chat-btn message" data-message="${f.id}" data-name="${escHtml(f.username)}" style="background:var(--accent);color:#fff;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;">Message</button>
              <button class="chat-btn remove" data-remove-friend="${f.id}" style="background:#ef4444;color:#fff;border:none;padding:6px 10px;border-radius:6px;cursor:pointer;">X</button>
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

    // User search (in chats)
    const searchInput = document.getElementById('userSearch');
    if (searchInput) {
      let debounce = null;
      searchInput.oninput = () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => searchUsers(searchInput.value), 300);
      };
    }

    // Friend search (in friends tab)
    const addFriendSearch = document.getElementById('addFriendSearch');
    if (addFriendSearch) {
      let debounce = null;
      addFriendSearch.oninput = () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => searchUsersForFriend(addFriendSearch.value), 300);
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

    // Try WebSocket first for real-time delivery
    const wsSent = sendWsMessage(state.selectedUserId, text);

    if (wsSent) {
      // Optimistically add to local messages (will be confirmed by WS response)
      state.messages.push({
        content: text,
        time: new Date().toISOString(),
        mine: true
      });
      renderPanel();
      // Clear input
      const msgInput = document.getElementById('messageInput');
      if (msgInput) msgInput.value = '';
    } else {
      // Fall back to HTTP API
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
        // Clear input
        const msgInput = document.getElementById('messageInput');
        if (msgInput) msgInput.value = '';
      } else {
        showError(getErrorMessage(res.error));
      }
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

  async function searchUsersForFriend(query) {
    const resultsDiv = document.getElementById('addFriendResults');
    if (!resultsDiv) return;

    if (!query || query.length < 2) {
      resultsDiv.innerHTML = '';
      return;
    }

    const res = await api(`/api/users/search/?q=${encodeURIComponent(query)}`);
    if (res.ok && res.users) {
      // Filter out self and existing friends
      const friendIds = state.friends.map(f => String(f.id));
      const filtered = res.users.filter(u =>
        String(u.id) !== String(window.currentUserId) &&
        !friendIds.includes(String(u.id))
      );

      if (filtered.length === 0) {
        resultsDiv.innerHTML = '<div style="padding:8px;color:var(--text-muted);font-size:12px;">No users found</div>';
        return;
      }

      resultsDiv.innerHTML = filtered.map(u => `
        <div class="search-result" style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:var(--glass-light);border-radius:6px;margin-bottom:4px;">
          <span>${escHtml(u.username)}</span>
          <button class="add-friend-btn" data-user-id="${u.id}" style="background:var(--accent);color:#fff;border:none;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:12px;">+ Add</button>
        </div>
      `).join('');

      resultsDiv.querySelectorAll('.add-friend-btn').forEach(btn => {
        btn.onclick = async (e) => {
          e.stopPropagation();
          const userId = btn.dataset.userId;
          btn.disabled = true;
          btn.textContent = '...';

          const result = await addFriend(userId);

          // Clear search after adding
          const input = document.getElementById('addFriendSearch');
          if (input) input.value = '';
          resultsDiv.innerHTML = '';
        };
      });
    }
  }

  async function addFriend(userId) {
    if (!userId) return;
    const res = await api('/api/friends/add/', 'POST', { user_id: userId });
    if (res.ok) {
      showSuccess('Friend request sent!');
    } else {
      showError(getErrorMessage(res.error));
    }
  }

  async function acceptFriend(userId) {
    const res = await api('/api/friends/accept/', 'POST', { from_user_id: userId });
    if (res.ok) {
      showSuccess('Friend request accepted!');
      loadTabData();
    } else {
      showError(getErrorMessage(res.error));
    }
  }

  async function declineFriend(userId) {
    const res = await api('/api/friends/remove/', 'POST', { user_id: userId });
    if (res.ok) {
      showSuccess('Friend request declined');
      loadTabData();
    } else {
      showError(getErrorMessage(res.error));
    }
  }

  async function removeFriend(userId) {
    const confirmed = await window.Modal?.confirm('Remove this friend?', 'Remove Friend', { confirmText: 'Remove', cancelText: 'Cancel' });
    if (!confirmed) return;
    const res = await api('/api/friends/remove/', 'POST', { user_id: userId });
    if (res.ok) {
      showSuccess('Friend removed');
      loadTabData();
    } else {
      showError(getErrorMessage(res.error));
    }
  }

  async function blockUser(userId) {
    if (!userId) return;
    const confirmed = await window.Modal?.confirm('Block this user?', 'Block User', { confirmText: 'Block', cancelText: 'Cancel' });
    if (!confirmed) return;
    const res = await api('/api/block/', 'POST', { user_id: userId });
    if (res.ok) {
      state.selectedUserId = null;
      state.selectedUserName = null;
      showSuccess('User blocked');
      loadTabData();
    } else {
      showError(getErrorMessage(res.error));
    }
  }

  async function unblockUser(userId) {
    const res = await api('/api/unblock/', 'POST', { user_id: userId });
    if (res.ok) {
      showSuccess('User unblocked');
      loadTabData();
    } else {
      showError(getErrorMessage(res.error));
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

  // Error message mapping for user-friendly display
  const ERROR_MESSAGES = {
    'MISSING_RECEIVER': 'Receiver not specified',
    'EMPTY_MESSAGE': 'Message cannot be empty',
    'USER_NOT_FOUND': 'User not found',
    'CANNOT_MESSAGE_SELF': 'Cannot message yourself',
    'BLOCKED': 'You are blocked by this user',
    'BLOCKED_BY_USER': 'You are blocked by this user',
    'MISSING_TO_OR_TEXT': 'Missing recipient or message',
    'BAD_TO_ID': 'Invalid recipient ID',
    'MISSING_USER_ID': 'User ID not specified',
    'CANNOT_ADD_SELF': 'Cannot add yourself as friend',
    'ALREADY_FRIENDS': 'Already friends',
    'REQUEST_PENDING': 'Friend request already pending',
    'REQUEST_NOT_FOUND': 'Friend request not found',
    'CANNOT_BLOCK_SELF': 'Cannot block yourself',
    'AUTH_REQUIRED': 'Please log in first',
    'NOT_AUTHENTICATED': 'Please log in first',
  };

  function getErrorMessage(code) {
    return ERROR_MESSAGES[code] || code || 'An error occurred';
  }

  function showError(message) {
    if (window.Modal) {
      window.Modal.alert(message, 'Błąd', 'error');
    } else if (window.toast) {
      window.toast(message);
    }
  }

  function showSuccess(message) {
    if (window.toast) {
      window.toast(message);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INIT & EXPORTS
  // ═══════════════════════════════════════════════════════════════════════════

  function initChatPanel() {
    loadTabData();
    // Connect WebSocket if user is logged in
    if (window.currentUserId) {
      connectWebSocket();
    }
  }

  // Export to window
  window.ChatPanel = {
    init: initChatPanel,
    open: async function() {
      const panel = document.getElementById('chatPanel');
      if (panel) {
        panel.style.display = 'block';
        await loadTabData();
        // Ensure WebSocket is connected when panel opens
        if (window.currentUserId) {
          connectWebSocket();
        }
      }
    },
    close: function() {
      const panel = document.getElementById('chatPanel');
      if (panel) {
        panel.style.display = 'none';
      }
      // Don't disconnect WebSocket - keep it for notifications
    },
    openChat: openConversation,
    render: renderPanel,
    connectWs: connectWebSocket,
    disconnectWs: disconnectWebSocket,
  };

  // Export global function for inbox polling (called from menu.js on login)
  window.startChatInboxPolling = function() {
    connectWebSocket();
  };

  // Auto-init when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChatPanel);
  } else {
    initChatPanel();
  }
})();
