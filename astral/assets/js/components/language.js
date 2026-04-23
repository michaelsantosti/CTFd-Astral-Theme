import Alpine from "alpinejs";

Alpine.data("LanguageForm", () => ({
  async set(event) {
    let language = event.target.getAttribute("value");
    document.cookie = `language=${language};SameSite=Lax`;
    localStorage.setItem("language", language);

    if (window.init.userId) {
      await fetch(`${window.init.urlRoot}/api/v1/users/me`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "CSRF-Token": window.init.csrfNonce,
        },
        body: JSON.stringify({ language }),
      });
    }

    window.location.reload();
  },
}));
