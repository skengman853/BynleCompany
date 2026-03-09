(function () {
  if (window.__bynleWidgetLoaded) {
    return;
  }
  window.__bynleWidgetLoaded = true;

  function findWidgetScript() {
    var scripts = document.querySelectorAll("script[src]");
    for (var i = scripts.length - 1; i >= 0; i -= 1) {
      var src = scripts[i].getAttribute("src") || "";
      if (src.indexOf("/widget.js") !== -1) {
        return scripts[i];
      }
    }
    return null;
  }

  function getStoredValue(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (_error) {
      return null;
    }
  }

  function setStoredValue(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (_error) {
      // no-op
    }
  }

  function createSessionId() {
    var random = Math.random().toString(36).slice(2, 10);
    return "sess_" + Date.now() + "_" + random;
  }

  function sanitizeBaseUrl(url) {
    if (!url || typeof url !== "string") {
      return "";
    }
    return url.replace(/\/+$/, "");
  }

  var script = document.currentScript || findWidgetScript();
  var scriptUrl = script && script.src ? new URL(script.src, window.location.href) : null;
  var config = window.BynleConfig || {};

  var tenantKey = config.tenantKey || (scriptUrl ? scriptUrl.searchParams.get("tenant") : null);
  var apiBaseUrl = sanitizeBaseUrl(
    config.apiBaseUrl ||
      (scriptUrl ? scriptUrl.searchParams.get("apiBaseUrl") : null) ||
      (scriptUrl ? scriptUrl.origin : window.location.origin)
  );

  if (!tenantKey) {
    console.error("[Bynle Widget] Missing tenantKey. Set window.BynleConfig.tenantKey or ?tenant=...");
    return;
  }

  var title = typeof config.title === "string" && config.title.trim() ? config.title : "Chat with us";
  var subtitle =
    typeof config.subtitle === "string" && config.subtitle.trim()
      ? config.subtitle
      : "Ask a question and we will reply instantly.";
  var greeting =
    typeof config.greeting === "string" && config.greeting.trim()
      ? config.greeting
      : "Hi there. How can I help you today?";
  var inputPlaceholder =
    typeof config.placeholder === "string" && config.placeholder.trim()
      ? config.placeholder
      : "Type your message";
  var privacyUrl = typeof config.privacyUrl === "string" ? config.privacyUrl : "";
  var bookingUrl = typeof config.bookingUrl === "string" ? config.bookingUrl : "";
  var requireConsent = Boolean(config.requireConsent);

  var sessionKey = "bynle_widget_session_" + tenantKey;
  var consentKey = "bynle_widget_consent_" + tenantKey;

  var sessionId = getStoredValue(sessionKey);
  if (!sessionId) {
    sessionId = createSessionId();
    setStoredValue(sessionKey, sessionId);
  }

  var hasConsent = !requireConsent || getStoredValue(consentKey) === "1";

  var style = document.createElement("style");
  style.textContent = [
    ".bynle-widget-root{position:fixed;right:20px;bottom:20px;z-index:2147483000;font-family:Arial,sans-serif;color:#1f1f1f}",
    ".bynle-widget-toggle{border:0;border-radius:999px;background:#1f1f1f;color:#fff;padding:12px 18px;cursor:pointer;font-weight:700;box-shadow:0 12px 24px rgba(0,0,0,.2)}",
    ".bynle-widget-panel{position:absolute;right:0;bottom:58px;width:360px;max-width:calc(100vw - 24px);height:540px;max-height:75vh;background:#fff;border:1px solid #e0e0e0;border-radius:16px;box-shadow:0 22px 44px rgba(0,0,0,.18);display:flex;flex-direction:column;overflow:hidden}",
    ".bynle-widget-header{padding:14px 16px;background:#1f1f1f;color:#fff;display:flex;justify-content:space-between;align-items:flex-start;gap:12px}",
    ".bynle-widget-title{font-size:15px;font-weight:700;line-height:1.2;margin:0}",
    ".bynle-widget-subtitle{font-size:12px;opacity:.9;line-height:1.3;margin-top:4px}",
    ".bynle-widget-close{border:0;background:transparent;color:#fff;font-size:20px;line-height:1;cursor:pointer;padding:0;margin:0}",
    ".bynle-widget-messages{flex:1;overflow:auto;background:#f7f6f2;padding:14px;display:flex;flex-direction:column;gap:10px}",
    ".bynle-widget-msg{max-width:85%;padding:10px 12px;border-radius:12px;font-size:13px;line-height:1.35;white-space:pre-wrap}",
    ".bynle-widget-msg-user{align-self:flex-end;background:#1f1f1f;color:#fff}",
    ".bynle-widget-msg-bot{align-self:flex-start;background:#fff;border:1px solid #e2ddd3;color:#1f1f1f}",
    ".bynle-widget-consent{padding:10px 12px;border-top:1px solid #eee;background:#fff8e8;font-size:12px;display:flex;gap:8px;align-items:center;justify-content:space-between}",
    ".bynle-widget-consent button{border:0;background:#1f1f1f;color:#fff;border-radius:8px;padding:6px 10px;cursor:pointer;font-size:12px}",
    ".bynle-widget-lead{padding:10px 12px;border-top:1px solid #eee;background:#fff}",
    ".bynle-widget-lead-title{font-size:12px;font-weight:700;margin-bottom:8px}",
    ".bynle-widget-lead-grid{display:grid;gap:8px}",
    ".bynle-widget-input,.bynle-widget-textarea{width:100%;border:1px solid #d9d2c8;border-radius:8px;padding:8px 10px;font-size:13px;outline:none}",
    ".bynle-widget-textarea{min-height:64px;resize:vertical}",
    ".bynle-widget-lead button{border:0;background:#1f1f1f;color:#fff;border-radius:8px;padding:8px 10px;cursor:pointer;font-size:13px;font-weight:700}",
    ".bynle-widget-composer{padding:10px;border-top:1px solid #eee;background:#fff;display:flex;gap:8px}",
    ".bynle-widget-send{border:0;background:#1f1f1f;color:#fff;border-radius:10px;padding:0 14px;cursor:pointer;font-size:13px;font-weight:700}",
    ".bynle-widget-send[disabled]{opacity:.6;cursor:not-allowed}",
    ".bynle-widget-footer{padding:0 10px 10px;background:#fff;text-align:right;font-size:11px;color:#666}",
    ".bynle-widget-footer a{color:#444;text-decoration:underline}",
    ".bynle-widget-hidden{display:none !important}",
    "@media (max-width:480px){.bynle-widget-root{right:10px;left:10px;bottom:10px}.bynle-widget-panel{right:0;left:0;width:auto;max-width:none;height:74vh}}"
  ].join("");
  document.head.appendChild(style);

  var root = document.createElement("div");
  root.className = "bynle-widget-root";

  var toggle = document.createElement("button");
  toggle.className = "bynle-widget-toggle";
  toggle.type = "button";
  toggle.textContent = "Chat";

  var panel = document.createElement("div");
  panel.className = "bynle-widget-panel bynle-widget-hidden";

  var header = document.createElement("div");
  header.className = "bynle-widget-header";

  var headingWrap = document.createElement("div");
  var hTitle = document.createElement("h2");
  hTitle.className = "bynle-widget-title";
  hTitle.textContent = title;
  var hSubtitle = document.createElement("div");
  hSubtitle.className = "bynle-widget-subtitle";
  hSubtitle.textContent = subtitle;
  headingWrap.appendChild(hTitle);
  headingWrap.appendChild(hSubtitle);

  var closeBtn = document.createElement("button");
  closeBtn.className = "bynle-widget-close";
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Close chat");
  closeBtn.textContent = "×";

  header.appendChild(headingWrap);
  header.appendChild(closeBtn);

  var messages = document.createElement("div");
  messages.className = "bynle-widget-messages";

  var consent = document.createElement("div");
  consent.className = "bynle-widget-consent" + (hasConsent ? " bynle-widget-hidden" : "");
  var consentText = document.createElement("span");
  consentText.textContent = "By continuing, you agree to chat processing.";
  var consentBtn = document.createElement("button");
  consentBtn.type = "button";
  consentBtn.textContent = "I Agree";
  consent.appendChild(consentText);
  consent.appendChild(consentBtn);

  var leadWrap = document.createElement("div");
  leadWrap.className = "bynle-widget-lead bynle-widget-hidden";
  var leadTitle = document.createElement("div");
  leadTitle.className = "bynle-widget-lead-title";
  leadTitle.textContent = "Share your details and we will contact you.";

  var leadForm = document.createElement("form");
  leadForm.className = "bynle-widget-lead-grid";

  var leadName = document.createElement("input");
  leadName.className = "bynle-widget-input";
  leadName.name = "name";
  leadName.placeholder = "Name";

  var leadPhone = document.createElement("input");
  leadPhone.className = "bynle-widget-input";
  leadPhone.name = "phone";
  leadPhone.placeholder = "Phone";

  var leadEmail = document.createElement("input");
  leadEmail.className = "bynle-widget-input";
  leadEmail.name = "email";
  leadEmail.type = "email";
  leadEmail.placeholder = "Email";

  var leadMessage = document.createElement("textarea");
  leadMessage.className = "bynle-widget-textarea";
  leadMessage.name = "message";
  leadMessage.placeholder = "Anything else we should know?";

  var leadSubmit = document.createElement("button");
  leadSubmit.type = "submit";
  leadSubmit.textContent = "Submit";

  leadForm.appendChild(leadName);
  leadForm.appendChild(leadPhone);
  leadForm.appendChild(leadEmail);
  leadForm.appendChild(leadMessage);
  leadForm.appendChild(leadSubmit);
  leadWrap.appendChild(leadTitle);
  leadWrap.appendChild(leadForm);

  var composer = document.createElement("form");
  composer.className = "bynle-widget-composer";
  var input = document.createElement("input");
  input.className = "bynle-widget-input";
  input.placeholder = inputPlaceholder;
  input.name = "message";
  input.autocomplete = "off";
  var sendBtn = document.createElement("button");
  sendBtn.className = "bynle-widget-send";
  sendBtn.type = "submit";
  sendBtn.textContent = "Send";
  composer.appendChild(input);
  composer.appendChild(sendBtn);

  var footer = document.createElement("div");
  footer.className = "bynle-widget-footer";
  if (privacyUrl) {
    var privacyLink = document.createElement("a");
    privacyLink.href = privacyUrl;
    privacyLink.target = "_blank";
    privacyLink.rel = "noreferrer";
    privacyLink.textContent = "Privacy";
    footer.appendChild(privacyLink);
  } else {
    footer.textContent = "Powered by Bynle";
  }

  panel.appendChild(header);
  panel.appendChild(messages);
  panel.appendChild(consent);
  panel.appendChild(leadWrap);
  panel.appendChild(composer);
  panel.appendChild(footer);

  root.appendChild(toggle);
  root.appendChild(panel);
  document.body.appendChild(root);

  function scrollToBottom() {
    messages.scrollTop = messages.scrollHeight;
  }

  function addMessage(role, text) {
    var div = document.createElement("div");
    div.className = "bynle-widget-msg " + (role === "user" ? "bynle-widget-msg-user" : "bynle-widget-msg-bot");
    div.textContent = text;
    messages.appendChild(div);
    scrollToBottom();
  }

  function addLinkMessage(text, linkUrl, linkLabel) {
    var div = document.createElement("div");
    div.className = "bynle-widget-msg bynle-widget-msg-bot";

    var textNode = document.createElement("div");
    textNode.textContent = text;
    div.appendChild(textNode);

    var link = document.createElement("a");
    link.href = linkUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = linkLabel;
    link.style.display = "inline-block";
    link.style.marginTop = "6px";
    link.style.color = "#1f1f1f";
    link.style.textDecoration = "underline";
    div.appendChild(link);

    messages.appendChild(div);
    scrollToBottom();
  }

  function setBusy(isBusy) {
    sendBtn.disabled = isBusy;
    input.disabled = isBusy || !hasConsent;
  }

  function showLeadForm(requiredFields, contextMessage) {
    leadWrap.classList.remove("bynle-widget-hidden");
    leadMessage.value = contextMessage || "";

    var needs = Array.isArray(requiredFields) ? requiredFields : [];
    leadName.required = needs.indexOf("name") !== -1;
    leadPhone.required = needs.indexOf("phone") !== -1;
    leadEmail.required = needs.indexOf("email") !== -1;
  }

  function hideLeadForm() {
    leadWrap.classList.add("bynle-widget-hidden");
    leadForm.reset();
  }

  async function postJson(endpoint, payload) {
    var response = await fetch(apiBaseUrl + endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    var body = null;
    try {
      body = await response.json();
    } catch (_error) {
      body = null;
    }

    if (!response.ok) {
      var message = body && body.error ? body.error : "Request failed";
      throw new Error(message);
    }

    return body || {};
  }

  var lastUserMessage = "";
  var greetingShown = false;

  async function sendMessage(text) {
    if (!text || !text.trim()) {
      return;
    }

    if (!hasConsent) {
      addMessage("bot", "Please accept consent before sending a message.");
      return;
    }

    lastUserMessage = text.trim();
    addMessage("user", lastUserMessage);
    hideLeadForm();
    setBusy(true);

    try {
      var result = await postJson("/v1/chat", {
        tenantKey: tenantKey,
        sessionId: sessionId,
        message: lastUserMessage,
        context: {
          pageUrl: window.location.href,
          userAgent: navigator.userAgent
        }
      });

      if (result.replyText) {
        addMessage("bot", result.replyText);
      } else {
        addMessage("bot", "I could not generate a response. Please try again.");
      }

      if (result.action === "CAPTURE_LEAD") {
        showLeadForm(result.leadFieldsNeeded || [], lastUserMessage);
      }

      if (result.action === "SHOW_BOOKING_LINK" && bookingUrl) {
        addLinkMessage("You can book directly here:", bookingUrl, "Book appointment");
      }
    } catch (error) {
      addMessage("bot", "Sorry, there was a network problem. Please try again.");
      console.error("[Bynle Widget] Chat failed", error);
    } finally {
      setBusy(false);
      input.focus();
    }
  }

  toggle.addEventListener("click", function () {
    var hidden = panel.classList.contains("bynle-widget-hidden");
    if (hidden) {
      panel.classList.remove("bynle-widget-hidden");
      toggle.textContent = "Close";

      if (!greetingShown) {
        addMessage("bot", greeting);
        greetingShown = true;
      }

      if (hasConsent) {
        input.focus();
      }
      return;
    }

    panel.classList.add("bynle-widget-hidden");
    toggle.textContent = "Chat";
  });

  closeBtn.addEventListener("click", function () {
    panel.classList.add("bynle-widget-hidden");
    toggle.textContent = "Chat";
  });

  composer.addEventListener("submit", function (event) {
    event.preventDefault();
    var value = input.value;
    input.value = "";
    void sendMessage(value);
  });

  consentBtn.addEventListener("click", function () {
    hasConsent = true;
    setStoredValue(consentKey, "1");
    consent.classList.add("bynle-widget-hidden");
    setBusy(false);
    input.focus();
  });

  leadForm.addEventListener("submit", function (event) {
    event.preventDefault();

    var payload = {
      tenantKey: tenantKey,
      sessionId: sessionId,
      name: leadName.value.trim(),
      phone: leadPhone.value.trim() || undefined,
      email: leadEmail.value.trim() || undefined,
      message: leadMessage.value.trim() || lastUserMessage || undefined
    };

    leadSubmit.disabled = true;

    postJson("/v1/leads", payload)
      .then(function () {
        hideLeadForm();
        addMessage("bot", "Thanks, we received your details and will follow up soon.");
      })
      .catch(function (error) {
        addMessage("bot", "Could not save your details. Please try again or contact us directly.");
        console.error("[Bynle Widget] Lead submit failed", error);
      })
      .finally(function () {
        leadSubmit.disabled = false;
      });
  });

  setBusy(false);
})();
