const yearNodes = document.querySelectorAll("[data-year]");

for (const node of yearNodes) {
  node.textContent = new Date().getFullYear();
}
