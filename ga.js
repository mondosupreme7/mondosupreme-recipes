/* Google Analytics 4 for mondosupreme.com. One property only: G-T57HG8X9KM. */
(function () {
  var id = 'G-T57HG8X9KM';
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', id);
  var tag = document.createElement('script');
  tag.async = true;
  tag.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
  var first = document.getElementsByTagName('script')[0];
  if (first && first.parentNode) first.parentNode.insertBefore(tag, first);
  else document.head.appendChild(tag);
})();
