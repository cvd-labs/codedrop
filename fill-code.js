"use strict";
(() => {
  // src/lib/fill.ts
  function fillCodeInDocument(doc, code, protocol) {
    if (!/^\d{6}$/.test(code)) return { ok: false, reason: "invalid_code" };
    if (protocol !== "https:") return { ok: false, reason: "not_https" };
    const inputs = [...doc.querySelectorAll("input")];
    const eligible = inputs.filter(isEligible);
    const dedicated = eligible.filter(
      (element) => hasToken(element.getAttribute("autocomplete"), "one-time-code") && element.maxLength !== 1
    );
    const singleDigit = eligible.filter((element) => element.maxLength === 1);
    if (dedicated.length > 1 || dedicated.length === 1 && singleDigit.length > 0) {
      return { ok: false, reason: "ambiguous_field" };
    }
    if (dedicated.length === 1 && dedicated[0]) {
      setNativeValue(dedicated[0], code);
      return { ok: true, mode: "one-time-code" };
    }
    const split = findSplit(eligible);
    if (split === "ambiguous") return { ok: false, reason: "ambiguous_field" };
    if (split) {
      split.forEach((element, index) => setNativeValue(element, code[index] ?? ""));
      return { ok: true, mode: "split" };
    }
    const labeled = eligible.filter(isLabeledCode);
    if (labeled.length > 1) return { ok: false, reason: "ambiguous_field" };
    if (labeled.length === 1) {
      setNativeValue(labeled[0], code);
      return { ok: true, mode: "labeled" };
    }
    return { ok: false, reason: "no_field" };
  }
  function setNativeValue(element, value) {
    const view = element.ownerDocument.defaultView;
    const prototype = view?.HTMLInputElement.prototype;
    const descriptor = prototype ? Object.getOwnPropertyDescriptor(prototype, "value") : void 0;
    if (descriptor?.set) descriptor.set.call(element, value);
    else element.value = value;
    const EventCtor = view?.Event ?? Event;
    element.dispatchEvent(new EventCtor("input", { bubbles: true }));
    element.dispatchEvent(new EventCtor("change", { bubbles: true }));
  }
  function findSplit(eligible) {
    const digits = eligible.filter((element) => {
      if (element.maxLength !== 1) return false;
      const mode = (element.getAttribute("inputmode") || "").toLowerCase();
      return mode === "numeric" || hasToken(element.getAttribute("autocomplete"), "one-time-code") || element.type === "tel";
    });
    if (digits.length === 0) return null;
    if (digits.length !== 6) return "ambiguous";
    const parent = digits[0]?.parentElement;
    const form = digits[0]?.form;
    const grouped = parent && digits.every((element) => element.parentElement === parent) || form && digits.every((element) => element.form === form);
    return grouped ? digits : "ambiguous";
  }
  function isEligible(element) {
    if (element.disabled || element.readOnly) return false;
    const blocked = /* @__PURE__ */ new Set(["hidden", "password", "submit", "button", "checkbox", "radio", "file", "email", "search"]);
    if (blocked.has(element.type)) return false;
    if (element.getAttribute("aria-hidden") === "true") return false;
    if (element.closest("[hidden], [aria-hidden='true']")) return false;
    const view = element.ownerDocument.defaultView;
    const style = view?.getComputedStyle(element);
    if (style && (style.display === "none" || style.visibility === "hidden")) return false;
    const autocomplete = (element.getAttribute("autocomplete") || "").toLowerCase();
    if (/\b(current-password|new-password|username|email)\b/.test(autocomplete)) return false;
    return true;
  }
  function isLabeledCode(element) {
    const text = labelText(element);
    if (/\b(zip|postal|country|area|promo|coupon|barcode|bar code|error|status)\b/.test(text)) return false;
    return /\b(otp|one-time|one time|verification|passcode|auth code|security code|login code)\b/.test(text);
  }
  function labelText(element) {
    const bits = [
      element.name,
      element.id,
      element.getAttribute("aria-label") || "",
      element.getAttribute("placeholder") || "",
      element.getAttribute("autocomplete") || ""
    ];
    if (element.id && typeof CSS !== "undefined" && typeof CSS.escape === "function") {
      const label = element.ownerDocument.querySelector(`label[for="${CSS.escape(element.id)}"]`);
      if (label?.textContent) bits.push(label.textContent);
    }
    const wrapping = element.closest("label");
    if (wrapping?.textContent) bits.push(wrapping.textContent);
    return bits.join(" ").toLowerCase();
  }
  function hasToken(value, token) {
    return (value || "").toLowerCase().split(/\s+/).includes(token);
  }

  // src/inject/fill-code.ts
  globalThis.__kamalFillCode = (code) => fillCodeInDocument(document, code, location.protocol);
})();
