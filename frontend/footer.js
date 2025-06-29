// Simple JS to include the footer on all pages
fetch('footer.html')
  .then(res => res.text())
  .then(html => {
    const footerDiv = document.getElementById('footer-include');
    if (footerDiv) {
      footerDiv.innerHTML = html;
    }
  }); 