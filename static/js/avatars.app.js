(function () {
  const MAX_AVATAR_DISTANCE_METERS = 86000;
  const INTERP_DURATION_MS         = 2500;

  const AVATAR_BODY_LENGTH_SELF  = 80.0;
  const AVATAR_BODY_RADIUS_SELF  =  8.0;
  const AVATAR_BODY_LENGTH_OTHER = 70.0;
  const AVATAR_BODY_RADIUS_OTHER =  7.0;

  const OP_COLORS = {
    BUY:           "#22c55e",
    SELL:          "#f97316",
    TAKEOVER:      "#ef4444",
    BUY_FAIL:      "#ef4444",
    SELL_FAIL:     "#ef4444",
    TAKEOVER_FAIL: "#ef4444",
  };

  const OP_SCALES = {
    BUY:           1.6,
    SELL:          1.4,
    TAKEOVER:      1.8,
    BUY_FAIL:      1.6,
    SELL_FAIL:     1.4,
    TAKEOVER_FAIL: 1.8,
  };

  const OP_HIGHLIGHT_MS   = 30_000;
  const OP_PULSE_FREQ_HZ  = 1.5;

  const CALL_VISIBLE_MS = 60_000;

  const chatUIState = {
    activeUserId: null,
  };

  const chatCallState = {
    callers: {},
    widgetEl: null,
  };

  let avatarChatPoll = null;

  function getCookie(name) {
    if (!document.cookie) return null;
    const cookies = document.cookie.split(";");
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i].trim();
      if (cookie.startsWith(name + "=")) {
        return decodeURIComponent(cookie.substring(name.length + 1));
      }
    }
    return null;
  }

  window.getCookie = window.getCookie || getCookie;

  const csrftoken = getCookie("csrftoken");

  function normalizeOp(rawOp) {
    if (!rawOp) return null;
    const s = String(rawOp).trim().toUpperCase().replace(/\s+/g, "_");
    return s || null;
  }

  function getViewer() {
    return window.__viewer || window.viewer || null;
  }

  function getCameraLatLon() {
    const viewer = getViewer();
    if (!viewer || typeof Cesium === "undefined") return null;

    const c = viewer.camera.positionCartographic;
    return {
      lat: Cesium.Math.toDegrees(c.latitude),
      lon: Cesium.Math.toDegrees(c.longitude),
      alt: c.height,
    };
  }

  function distanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const phi1 = lat1 * Math.PI / 180;
    const phi2 = lat2 * Math.PI / 180;
    const dPhi = (lat2 - lat1) * Math.PI / 180;
    const dLambda = (lon2 - lon1) * Math.PI / 180;

    const a =
      Math.sin(dPhi / 2) ** 2 +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  let lastSentTs = 0;

  async function sendPositionToServer(lat, lon, alt) {
    const now =
      typeof performance !== "undefined" && performance.now
        ? performance.now()
        : Date.now();

    if (now - lastSentTs < 2000) {
      return;
    }
    lastSentTs = now;

    try {
      const csrf = getCookie("csrftoken");
      await fetch("/api/map/position/", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          ...(csrf ? { "X-CSRFToken": csrf } : {}),
        },
        body: JSON.stringify({ lat, lon, alt }),
      });
    } catch (e) {
      console.warn("[avatars] position POST failed", e);
    }
  }

  let myAvatarEntity = null;
  let bound = false;

  function initMyAvatar() {
    if (bound) return;
    const viewer = getViewer();
    if (!viewer || typeof Cesium === "undefined") {
      console.warn("[avatars] viewer not ready");
      return;
    }

    const pos = getCameraLatLon();
    if (!pos) return;

    const labelText = window.currentUsername || "You";
    const markerHeight = Number(pos.alt) || 150;

    myAvatarEntity = viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, markerHeight),

    point: {
        pixelSize: 8,
        color: Cesium.Color.fromCssColorString("#22c55e"),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },

    label: {
        text: labelText,
        font: '14px "Segoe UI", sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -12),
        showBackground: true,
        backgroundColor: new Cesium.Color(0.05, 0.05, 0.08, 0.9),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    });


    myAvatarEntity.__avatarSelf = true;
    if (window.currentUserId) {
      myAvatarEntity.__avatarUserId = String(window.currentUserId);
    }
    myAvatarEntity.__avatarName = labelText;
    myAvatarEntity.__avatarLat = pos.lat;
    myAvatarEntity.__avatarLon = pos.lon;
    myAvatarEntity.__avatarAlt = markerHeight;

    function updateFromCamera() {
      if (!myAvatarEntity) return;
      const p = getCameraLatLon();
      if (!p) return;

      const markerHeight2 = Number(p.alt) || 150;
      myAvatarEntity.position = Cesium.Cartesian3.fromDegrees(
        p.lon,
        p.lat,
        markerHeight2
      );
      myAvatarEntity.__avatarLat = p.lat;
      myAvatarEntity.__avatarLon = p.lon;
      myAvatarEntity.__avatarAlt = markerHeight2;

      sendPositionToServer(p.lat, p.lon, p.alt);
    }

    viewer.camera.moveEnd.addEventListener(updateFromCamera);
    bound = true;

    console.log("[avatars] my avatar initialized");
    window.__myAvatarEntity = myAvatarEntity;
  }

  function startOwnPositionHeartbeat() {
    const viewer = getViewer();
    if (!viewer || typeof Cesium === "undefined") return;

    setInterval(() => {
      const p = getCameraLatLon();
      if (!p) return;
      sendPositionToServer(p.lat, p.lon, p.alt);
    }, 3000);
  }

  const otherAvatars = {};

    function isAvatarActive(userId) {
    if (!userId) return false;
    const idStr = String(userId);
    return !!otherAvatars[idStr];
  }

  function gotoAvatar(userId) {
    if (!userId) return;
    const idStr = String(userId);
    const rec = otherAvatars[idStr];
    if (!rec || !rec.entity) {
      if (window.toast) window.toast("This user is not currently active.");
      return;
    }

    const ent = rec.entity;
    const lat =
      Number.isFinite(rec.toLat) && rec.toLat !== null
        ? rec.toLat
        : ent.__avatarLat;
    const lon =
      Number.isFinite(rec.toLon) && rec.toLon !== null
        ? rec.toLon
        : ent.__avatarLon;
    const alt =
      Number.isFinite(rec.toAlt) && rec.toAlt !== null
        ? rec.toAlt
        : ent.__avatarAlt;

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      if (window.toast) window.toast("Location for this user is not available.");
      return;
    }

    const height = Number(alt) || 300;
    const range = 600;
    const userName = ent.__avatarName || `User ${idStr}`;

    if (typeof window.flyToLonLat === "function") {
      window.flyToLonLat(lon, lat, {
        height,
        range,
        pitchDeg: 0,
        duration: 1.5,
      });
    } else {
      const viewer = getViewer();
      if (viewer && typeof Cesium !== "undefined") {
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(lon, lat, height),
          duration: 1.5,
          orientation: {
            heading: viewer.camera.heading,
            pitch: Cesium.Math.toRadians(0),
            roll: 0.0,
          },
        });
      }
    }

    if (window.toast) {
      window.toast(`Go to: ${userName}`);
    }
  }

  window.isAvatarActive = isAvatarActive;
  window.gotoAvatar = gotoAvatar;


  function gotoAvatar(userId) {
    if (!userId) return;
    const idStr = String(userId);
    const rec = otherAvatars[idStr];
    if (!rec || !rec.entity) {
      if (window.toast) window.toast("This user is not currently active.");
      return;
    }

    const ent = rec.entity;
    const lat =
      Number.isFinite(rec.toLat) && rec.toLat !== null
        ? rec.toLat
        : ent.__avatarLat;
    const lon =
      Number.isFinite(rec.toLon) && rec.toLon !== null
        ? rec.toLon
        : ent.__avatarLon;
    const alt =
      Number.isFinite(rec.toAlt) && rec.toAlt !== null
        ? rec.toAlt
        : ent.__avatarAlt;

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      if (window.toast) window.toast("Location for this user is not available.");
      return;
    }

    const height = Number(alt) || 300;
    const range = 600;
    const userName = ent.__avatarName || `User ${idStr}`;

    if (typeof window.flyToLonLat === "function") {
      window.flyToLonLat(lon, lat, {
        height,
        range,
        pitchDeg: 0,
        duration: 1.5,
      });
    } else {
      const viewer = getViewer();
      if (viewer && typeof Cesium !== "undefined") {
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(lon, lat, height),
          duration: 1.5,
          orientation: {
            heading: viewer.camera.heading,
            pitch: Cesium.Math.toRadians(0),
            roll: 0.0,
          },
        });
      }
    }

    if (window.toast) {
      window.toast(`Go to: ${userName}`);
    }
  }

  window.isAvatarActive = isAvatarActive;
  window.gotoAvatar = gotoAvatar;


  function ensureChatCallWidget() {
    if (chatCallState.widgetEl) return chatCallState.widgetEl;

    const div = document.createElement("div");
    div.id = "chatCallWidget";
    Object.assign(div.style, {
      position: "fixed",
      right: "12px",
      bottom: "12px",
      zIndex: "2100",
      display: "none",
      background: "rgba(15,23,42,0.96)",
      color: "#e5e7eb",
      padding: "6px 8px",
      borderRadius: "10px",
      font: '11px system-ui, -apple-system, "Segoe UI", sans-serif',
      boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
      maxWidth: "220px",
      maxHeight: "40vh",
      overflowY: "auto",
    });

    div.innerHTML = `<div style="font-weight:600;margin-bottom:4px;">Incoming chats</div>`;

    document.body.appendChild(div);
    chatCallState.widgetEl = div;

    div.addEventListener("click", (e) => {
      const row = e.target.closest("[data-chat-caller-id]");
      if (!row) return;

      const userId   = row.dataset.chatCallerId;
      const userName = row.dataset.chatCallerName || `User ${userId}`;

      const caller = chatCallState.callers[userId];
      if (caller) {
        caller.unread = 0;
      }

      renderChatCallWidget();

      if (typeof window.openChatWithUser === "function") {
        window.openChatWithUser(userId, userName);
      } else if (typeof window.openChatPanel === "function") {
        window.openChatPanel("conversations", { userId, userName });
      } else if (window.toast) {
        window.toast("Chat panel not ready");
      }
    });

    return div;
  }


  function renderChatCallWidget() {
    const w = ensureChatCallWidget();
    const now = Date.now();

    const callers = Object.values(chatCallState.callers)
      .filter((c) => c.unread > 0 && now - c.firstSeenMs <= CALL_VISIBLE_MS)
      .sort((a, b) => b.lastMsgMs - a.lastMsgMs)
      .slice(0, 5);

    if (!callers.length) {
      w.style.display = "none";
      return;
    }

    w.style.display = "block";

    const rowsHtml = callers.map((c) => {
      const name = c.userName || `User ${c.userId}`;
      const unread = c.unread;

      return `
        <div class="chatcall-row"
             data-chat-caller-id="${c.userId}"
             data-chat-caller-name="${name}"
             style="display:flex;align-items:center;gap:6px;margin-top:4px;cursor:pointer;">
          <div style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            ${name}
          </div>
          <div style="
            font-size:10px;
            min-width:22px;
            text-align:center;
            padding:2px 6px;
            border-radius:9999px;
            background:rgba(59,130,246,0.9);
            color:#f9fafb;
          ">
            ${unread}
          </div>
          <button type="button"
                  style="border:none;background:#22c55e;color:#f9fafb;
                         border-radius:6px;padding:2px 8px;font-size:10px;cursor:pointer;">
            Call
          </button>
        </div>
      `;
    }).join("");

    w.innerHTML = `
      <div style="font-weight:600;margin-bottom:4px;">Incoming chats</div>
      ${rowsHtml}
    `;
  }

  function onIncomingDirectChat(senderId, senderName, createdAtIso) {
    const now = Date.now();
    const t = createdAtIso ? Date.parse(createdAtIso) : now;
    const idStr = String(senderId);
    let caller = chatCallState.callers[idStr];

    if (!caller) {
      caller = {
        userId: idStr,
        userName: senderName || `User ${idStr}`,
        unread: 0,
        firstSeenMs: now,
        lastMsgMs: t,
      };
      chatCallState.callers[idStr] = caller;
    }

    caller.unread += 1;

    if (!caller.firstSeenMs) caller.firstSeenMs = now;
    if (t > caller.lastMsgMs) caller.lastMsgMs = t;

    renderChatCallWidget();
  }

  window.onIncomingDirectChat = onIncomingDirectChat;

  let avatarClickHandler = null;
  let avatarClickBound = false;
  let avatarMenuEl = null;
  let avatarMenuCurrent = null;

  function ensureAvatarMenu() {
    if (avatarMenuEl) return avatarMenuEl;
    const viewer = getViewer();
    if (!viewer) return null;

    const div = document.createElement("div");
    div.id = "avatarMenu";
    Object.assign(div.style, {
      position: "absolute",
      display: "none",
      zIndex: "2000",
      background: "rgba(15,23,42,0.96)",
      color: "#e5e7eb",
      padding: "6px 8px",
      borderRadius: "8px",
      font: '12px system-ui, -apple-system, "Segoe UI", sans-serif',
      boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
      minWidth: "140px",
    });

    div.innerHTML = `
      <div id="avatarMenuTitle" style="font-weight:600;margin-bottom:4px;"></div>

      <button type="button" id="avatarMenuGoto"
              style="display:block;width:100%;margin-bottom:4px;
                     border-radius:6px;border:none;padding:4px 6px;
                     background:#2563eb;color:#f9fafb;cursor:pointer;">
        Go to
      </button>

      <button type="button" id="avatarMenuChat"
              style="display:block;width:100%;margin-bottom:4px;
                     border-radius:6px;border:1px solid #4b5563;padding:4px 6px;
                     background:transparent;color:#e5e7eb;cursor:pointer;">
        Chat (Chat)
      </button>

      <button type="button" id="avatarMenuFriend"
              style="display:block;width:100%;
                     border-radius:6px;border:1px solid #16a34a;padding:4px 6px;
                     background:transparent;color:#bbf7d0;cursor:pointer;">
        Friend
      </button>
    `;


    viewer.container.appendChild(div);
    avatarMenuEl = div;

    const gotoBtn = div.querySelector("#avatarMenuGoto");
    const chatBtn = div.querySelector("#avatarMenuChat");
    const friendBtn = div.querySelector("#avatarMenuFriend");


    gotoBtn.addEventListener("click", () => {
      if (!avatarMenuCurrent) return;
      const { lat, lon, alt, userName } = avatarMenuCurrent;

      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        const height = Number(alt) || 300;
        const range = 600;

        if (typeof window.flyToLonLat === "function") {
          window.flyToLonLat(lon, lat, {
            height,
            range,
            pitchDeg: 0,
            duration: 1.5,
          });
        } else {
          const v = getViewer();
          if (v) {
            v.camera.flyTo({
              destination: Cesium.Cartesian3.fromDegrees(lon, lat, height),
              duration: 1.5,
              orientation: {
                heading: v.camera.heading,
                pitch: Cesium.Math.toRadians(0),
                roll: 0.0,
              },
            });
          }
        }
      }

      if (window.toast) {
        window.toast(`Go to: ${userName}`);
      }

      hideAvatarMenu();
    });

chatBtn.addEventListener("click", () => {
  if (!avatarMenuCurrent) return;
  const { userId, userName } = avatarMenuCurrent;
  hideAvatarMenu();
  if (typeof window.openChatWithUser === "function") {
    window.openChatWithUser(userId, userName);
  } else if (window.toast) {
    window.toast("Chat panel not ready");
  }
});


    return div;
  }
  function openAvatarChatPanel(userId, userName) {
    const panel = ensureAvatarChatPanel();
    const body  = panel.querySelector("#chatPanelBody");
    const title = panel.querySelector("#chatPanelTitle");

    const idStr = String(userId);
    chatUIState.activeUserId = idStr;

    const caller = chatCallState.callers[idStr];
    if (caller) {
      caller.unread = 0;
      renderChatCallWidget();
    }

    panel.style.display = "flex";

    title.textContent = `Chat with ${userName}`;

    body.innerHTML = `
      <div id="avatarChatWrap"
           style="display:flex;flex-direction:column;height:100%;gap:8px;">
        <div id="avatarChatMessages">
          Loading...
        </div>
        <div class="avatar-chat-input-row">
          <input id="avatarChatInput" class="input" type="text"
                 placeholder="Type a message...">
          <button id="avatarChatSend" class="btn" type="button">Send</button>
        </div>
        <div style="display:flex;justify-content:flex-end;margin-top:4px;">
          <button id="avatarChatRefresh" class="btn btn-outline" type="button">
            Refresh
          </button>
        </div>
      </div>
    `;

    const sendBtn    = body.querySelector("#avatarChatSend");
    const inputEl    = body.querySelector("#avatarChatInput");
    const refreshBtn = body.querySelector("#avatarChatRefresh");
    const msgsEl     = body.querySelector("#avatarChatMessages");

    async function loadMessages() {
      if (!msgsEl) return;

      try {
        const res = await fetch(
          `/api/chat/thread/${encodeURIComponent(userId)}/?t=${Date.now()}`,
          {
            method: "GET",
            credentials: "same-origin",
            headers: {
              "Accept": "application/json",
              "Cache-Control": "no-cache",
            },
            cache: "no-store",
          }
        );

        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          msgsEl.textContent = data.error || "Error loading chat.";
          return;
        }

        const list = Array.isArray(data.messages) ? data.messages : [];

        if (!list.length) {
          msgsEl.textContent = "No messages yet.";
          return;
        }

        const lines = list.map((m) => {
          const who  = m.is_me ? "You" : (m.sender_name || `User ${m.sender_id}`);
          const cls  = m.is_me ? "me" : "other";
          const text = (m.text || "")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
          const time = m.created_at
            ? new Date(m.created_at).toLocaleTimeString()
            : "";

          return `
            <div class="msg msg-${cls}" style="margin-bottom:4px;">
              <div style="font-size:11px;opacity:0.7;">${who} • ${time}</div>
              <div>${text}</div>
            </div>
          `;
        });

        msgsEl.innerHTML = lines.join("");
        msgsEl.scrollTop = msgsEl.scrollHeight;
      } catch (e) {
        msgsEl.textContent = e.message || "Error loading chat.";
      }
    }

    async function sendMessage() {
      if (!inputEl) return;
      const txt = (inputEl.value || "").trim();
      if (!txt) return;

      try {
        const csrf = getCookie("csrftoken");
        const res = await fetch("/api/chat/send/", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            ...(csrf ? { "X-CSRFToken": csrf } : {}),
          },
          body: new URLSearchParams({
            to_user_id: String(userId),
            text: txt,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          const msg = data.error || "Send failed";
          if (window.Modal) window.Modal.alert(msg, 'Error', 'error');
          else if (window.toast) window.toast(msg);
          return;
        }
        inputEl.value = "";
        await loadMessages();
      } catch (e) {
        const msg = e.message || "Send failed";
        if (window.Modal) window.Modal.alert(msg, 'Error', 'error');
        else if (window.toast) window.toast(msg);
      }
    }

    if (sendBtn) {
      sendBtn.addEventListener("click", sendMessage);
    }
    if (refreshBtn) {
      refreshBtn.addEventListener("click", loadMessages);
    }
    if (inputEl) {
      inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          sendMessage();
        }
      });
    }

    loadMessages();

    if (avatarChatPoll) {
      clearInterval(avatarChatPoll);
      avatarChatPoll = null;
    }

    avatarChatPoll = setInterval(() => {
      const panel = document.getElementById("avatarChatPanel");
      if (!panel || panel.style.display === "none") {
        clearInterval(avatarChatPoll);
        avatarChatPoll = null;
        return;
      }
      loadMessages();
    }, 3000);


  document.addEventListener("click", (e) => {
    const btn = e.target.closest('[data-close="appPanel"], [data-close="avatarChatPanel"]');
    if (!btn) return;

    if (avatarChatPoll) {
      clearInterval(avatarChatPoll);
      avatarChatPoll = null;
    }

    if (btn.getAttribute("data-close") === "avatarChatPanel") {
      const panel = document.getElementById("avatarChatPanel");
      if (panel) {
        panel.style.display = "none";
      }
    }
  });
}

  function showAvatarMenu(entity, screenPosition) {
    const viewer = getViewer();
    if (!viewer) return;
    const menu = ensureAvatarMenu();
    if (!menu) return;

    const userId = entity.__avatarUserId;
    const userName = entity.__avatarName || `User ${userId}`;
    const lat = entity.__avatarLat;
    const lon = entity.__avatarLon;
    const alt = entity.__avatarAlt || 300;

    avatarMenuCurrent = { userId, userName, lat, lon, alt };

    const title = menu.querySelector("#avatarMenuTitle");
    if (title) title.textContent = userName;

    const canvasRect = viewer.canvas.getBoundingClientRect();
    const x = canvasRect.left + screenPosition.x + 10;
    const y = canvasRect.top + screenPosition.y + 10;

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.style.display = "block";
  }

  function hideAvatarMenu() {
    if (avatarMenuEl) avatarMenuEl.style.display = "none";
    avatarMenuCurrent = null;
  }


  function handleAvatarClick(entity, screenPosition) {
    if (!entity) return;
    if (!entity.__avatarUserId) return;
    if (entity.__avatarSelf) return;
    showAvatarMenu(entity, screenPosition);
  }

  async function addAvatarFriend(userId, userName) {
    try {
      const csrf = getCookie("csrftoken");
      const res = await fetch("/api/chat/friends/add/", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          ...(csrf ? { "X-CSRFToken": csrf } : {}),
        },
        body: new URLSearchParams({
          user_id: String(userId),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        const msg = data.error || "Could not add friend";
        if (window.Modal) window.Modal.alert(msg, 'Error', 'error');
        else if (window.toast) window.toast(msg);
        return;
      }

      const msg = data.created
        ? `Added ${userName} to friends`
        : `${userName} is already in your friends`;
      if (window.toast) window.toast(msg);
    } catch (e) {
      const msg = e && e.message ? e.message : "Error adding friend";
      if (window.Modal) window.Modal.alert(msg, 'Error', 'error');
      else if (window.toast) window.toast(msg);
    } finally {
      hideAvatarMenu();
    }
  }




  function setupAvatarClickHandler() {
    if (avatarClickBound) return;
    const viewer = getViewer();
    if (!viewer || typeof Cesium === "undefined") return;

    avatarClickHandler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);

    avatarClickHandler.setInputAction((movement) => {
      const v = getViewer();
      if (!v) return;
      const picked = v.scene.pick(movement.position);

      if (!picked || !picked.id) {
        hideAvatarMenu();
        return;
      }

      const entity = picked.id;
      if (entity && entity.__avatarUserId) {
        handleAvatarClick(entity, movement.position);
      } else {
        hideAvatarMenu();
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    avatarClickBound = true;
    console.log("[avatars] click handler bound");
  }

  async function refreshOtherAvatars() {
    const viewer = getViewer();
    if (!viewer || typeof Cesium === "undefined") return;

    const camPos = getCameraLatLon();
    const now =
      typeof performance !== "undefined" && performance.now
        ? performance.now()
        : Date.now();

    try {
      const res = await fetch("/api/map/positions/", {
        method: "GET",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });

      if (!res.ok) {
        return;
      }

      const list = await res.json().catch(() => []);
      if (!Array.isArray(list)) return;

      const seenIds = new Set();

      for (const item of list) {
        if (!item || item.id == null) continue;

        const idStr = String(item.id);
        const lat = Number(item.lat);
        const lon = Number(item.lon);
        const alt = Number(item.alt);
        const opRaw = item.op ?? null;
        const opKey = normalizeOp(opRaw);

        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

        if (
          camPos &&
          Number.isFinite(camPos.lat) &&
          Number.isFinite(camPos.lon)
        ) {
          const dist = distanceMeters(camPos.lat, camPos.lon, lat, lon);
          if (dist > MAX_AVATAR_DISTANCE_METERS) {
            continue;
          }
        }

        seenIds.add(idStr);

        const markerHeight = Number.isFinite(alt) ? alt : 150;

        if (otherAvatars[idStr]) {
          const rec = otherAvatars[idStr];
          const ent = rec.entity;

          const prevOpKey = ent.__avatarOpKey || null;

          if (opKey && opKey !== prevOpKey) {
            ent.__avatarOpKey     = opKey;
            ent.__avatarOpStartMs = now;
          }

          if (opKey) {
            ent.__avatarOp = opKey;
          }

          const prevToLat = Number.isFinite(rec.toLat) ? rec.toLat : lat;
          const prevToLon = Number.isFinite(rec.toLon) ? rec.toLon : lon;
          const prevToAlt = Number.isFinite(rec.toAlt) ? rec.toAlt : markerHeight;

          rec.fromLat = prevToLat;
          rec.fromLon = prevToLon;
          rec.fromAlt = prevToAlt;

          rec.toLat = lat;
          rec.toLon = lon;
          rec.toAlt = markerHeight;

          rec.startMs = now;
          rec.endMs   = now + INTERP_DURATION_MS;
          continue;
        }


        const labelText = item.name || `User ${idStr}`;

        const baseColorCss = OP_COLORS[opKey] || "#3b82f6";
        const baseScale    = OP_SCALES[opKey] || 1.0;

        const pixelSize    = 8 * baseScale;

        const ent = viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(lon, lat, markerHeight),

          point: {
            pixelSize: pixelSize,
            color: Cesium.Color.fromCssColorString(baseColorCss),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },

          label: {
            text: labelText,
            font: '13px "Segoe UI", sans-serif',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -12),
            showBackground: true,
            backgroundColor: new Cesium.Color(0.05, 0.05, 0.08, 0.9),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });

        ent.__avatarUserId     = idStr;
        ent.__avatarName       = labelText;
        ent.__avatarBaseLabel  = labelText;
        ent.__avatarLat        = lat;
        ent.__avatarLon        = lon;
        ent.__avatarAlt        = markerHeight;
        ent.__avatarOp         = opKey;
        ent.__avatarOpKey      = opKey;
        ent.__avatarOpStartMs  = opKey ? now : 0;


        otherAvatars[idStr] = {
          entity:  ent,
          fromLat: lat,
          fromLon: lon,
          fromAlt: markerHeight,
          toLat:   lat,
          toLon:   lon,
          toAlt:   markerHeight,
          startMs: now,
          endMs:   now,
        };

            }

      for (const idStr in otherAvatars) {
        if (!seenIds.has(idStr)) {
          const rec = otherAvatars[idStr];
          if (rec && rec.entity) {
            try {
              viewer.entities.remove(rec.entity);
            } catch (e) {}
          }
          delete otherAvatars[idStr];
        }
      }
    } catch (e) {
      console.warn("[avatars] refreshOtherAvatars error", e);
    }
  }

  function updateInterpolatedAvatarPositions() {
    const viewer = getViewer();
    if (!viewer || typeof Cesium === "undefined") return;

    const now =
      typeof performance !== "undefined" && performance.now
        ? performance.now()
        : Date.now();

    let anyMoved = false;

    for (const idStr in otherAvatars) {
      const rec = otherAvatars[idStr];
      if (!rec || !rec.entity) continue;

      const ent = rec.entity;
      const start = rec.startMs || 0;
      const end = rec.endMs || 0;

      if (!start || !end || end <= start) {
        const lat = rec.toLat;
        const lon = rec.toLon;
        const alt = rec.toAlt;
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          ent.position = Cesium.Cartesian3.fromDegrees(lon, lat, alt);
          ent.__avatarLat = lat;
          ent.__avatarLon = lon;
          ent.__avatarAlt = alt;
          anyMoved = true;
        }
        continue;
      }

      let t = (now - start) / (end - start);
      if (t < 0) t = 0;
      if (t > 1) t = 1;

      const lat = rec.fromLat + (rec.toLat - rec.fromLat) * t;
      const lon = rec.fromLon + (rec.toLon - rec.fromLon) * t;
      const alt = rec.fromAlt + (rec.toAlt - rec.fromAlt) * t;

      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        ent.position = Cesium.Cartesian3.fromDegrees(lon, lat, alt);
        ent.__avatarLat = lat;
        ent.__avatarLon = lon;
        ent.__avatarAlt = alt;
        anyMoved = true;
      }
      const opKey = ent.__avatarOpKey || null;
      const opStartMs = ent.__avatarOpStartMs || 0;
      let highlightActive = false;

      if (opKey && opStartMs && now - opStartMs <= OP_HIGHLIGHT_MS) {
        highlightActive = true;
      }

      const baseLabel = ent.__avatarBaseLabel || ent.__avatarName;
      if (ent.label && baseLabel) {
        if (highlightActive && opKey) {
          let opLabel;
          if (opKey.endsWith("_FAIL")) {
            const baseOp = opKey.replace("_FAIL", "");
            opLabel = `${baseOp} FAIL`;
          } else {
            opLabel = opKey;
          }
          ent.label.text = `${baseLabel} • ${opLabel}`;
        } else {
          ent.label.text = `${baseLabel} • FLY`;
        }
      }


      if (ent.point) {
        if (highlightActive) {
          const colorCss = OP_COLORS[opKey] || "#3b82f6";
          const opScale  = OP_SCALES[opKey] || 1.0;

          const elapsedSec  = (now - opStartMs) / 1000.0;
          const pulsePhase  = elapsedSec * OP_PULSE_FREQ_HZ * 2.0 * Math.PI;
          const pulseFactor = 0.85 + 0.30 * (0.5 * (Math.sin(pulsePhase) + 1.0));

          const pixelSize = 8 * opScale * pulseFactor;
          ent.point.pixelSize = pixelSize;
          ent.point.color = Cesium.Color.fromCssColorString(colorCss);
        } else {
          ent.point.pixelSize = 8;
          ent.point.color = Cesium.Color.fromCssColorString("#3b82f6");
        }
      }

      if (highlightActive) {
        anyMoved = true;
      }
    }

    if (anyMoved && viewer.scene && typeof viewer.scene.requestRender === "function") {
      viewer.scene.requestRender();
    }
  }

  let avatarsAnimStarted = false;
  let lastRefreshMs = 0;

  function startAvatarAnimationLoop() {
    if (avatarsAnimStarted) return;
    avatarsAnimStarted = true;

    function step() {
      const now =
        typeof performance !== "undefined" && performance.now
          ? performance.now()
          : Date.now();

      updateInterpolatedAvatarPositions();

      if (!lastRefreshMs || now - lastRefreshMs >= 3000) {
        lastRefreshMs = now;
        refreshOtherAvatars();
      }

      requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  }

  function startAll() {
    initMyAvatar();
    startOwnPositionHeartbeat();
    setupAvatarClickHandler();
    startAvatarAnimationLoop();
  }
  function ensureAvatarChatPanel() {
    let panel = document.getElementById("avatarChatPanel");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "avatarChatPanel";
      panel.setAttribute("data-panel", "avatar-chat");

      panel.style.position = "fixed";
      panel.style.left = "16px";
      panel.style.bottom = "16px";
      panel.style.width = "360px";
      panel.style.maxWidth = "90vw";
      panel.style.height = "60vh";
      panel.style.maxHeight = "70vh";

      panel.style.display = "none";
      panel.style.flexDirection = "column";

      panel.style.backgroundColor = "rgb(15, 23, 42)";
      panel.style.color = "#e5e7eb";

      panel.style.borderRadius = "10px";
      panel.style.boxShadow = "0 18px 35px rgba(0, 0, 0, 0.7)";
      panel.style.zIndex = "2100";
      panel.style.fontFamily = 'system-ui, -apple-system, "Segoe UI", sans-serif';
      panel.style.fontSize = "13px";

      panel.innerHTML = `
        <div class="chat-header">
          <div id="chatPanelTitle">Chat</div>
          <button type="button"
                  class="chat-close-btn"
                  data-close="avatarChatPanel">
            ✕
          </button>
        </div>
        <div id="chatPanelBody"></div>
      `;

      document.body.appendChild(panel);
    }
    return panel;
  }



  window.openAvatarChatPanel = openAvatarChatPanel;

  if (getViewer()) {
    startAll();
  } else {
    window.addEventListener("cesium-ready", startAll);
  }


})();
