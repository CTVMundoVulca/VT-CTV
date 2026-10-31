/* Geração de PDF no próprio aparelho — Apps CTV Campo
   window.print() é ignorado no iOS quando o app roda pela tela inicial,
   então o relatório é convertido em um arquivo .pdf (html2canvas + jsPDF,
   servidos localmente em vendor/ e cacheados pelo service worker) e entregue
   pela folha de compartilhamento do sistema (ou download, como fallback). */
(function () {
  'use strict';

  var CAP_WIDTH = 760;          // largura de layout do relatório (px)
  var MIN_FIT = 0.8;            // redução máxima do texto para caber na página 1
  var MARGIN_MM = 8;
  var PAGE_W_MM = 210, PAGE_H_MM = 297;
  var libsPromise = null;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Falha ao carregar ' + src)); };
      document.head.appendChild(s);
    });
  }

  function ensureLibs() {
    if (window.jspdf && window.html2canvas) return Promise.resolve();
    if (!libsPromise) {
      libsPromise = Promise.all([
        window.html2canvas ? null : loadScript('vendor/html2canvas.min.js'),
        window.jspdf ? null : loadScript('vendor/jspdf.umd.min.js')
      ]).catch(function (e) { libsPromise = null; throw e; });
    }
    return libsPromise;
  }

  function isStandaloneIOS() {
    return window.navigator.standalone === true;
  }

  function fileNameFrom(html) {
    var m = /<title>([\s\S]*?)<\/title>/i.exec(html);
    var t = m ? m[1] : 'Relatorio';
    var tmp = document.createElement('textarea');
    tmp.innerHTML = t;
    t = tmp.value.replace(/[\\/:*?"<>|#]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/ /g, '_');
    return (t || 'Relatorio').slice(0, 80) + '.pdf';
  }

  /* Monta o relatório dentro de `host`, trocando o seletor body{ por #id{
     para não afetar o app. Barras de ferramenta e scripts são descartados. */
  function mountReport(html, host) {
    var brk = document.createElement('style');
    // text-size-adjust: o iOS aumenta sozinho o texto de blocos mais largos que a tela,
    // o que deixa fontes desiguais e desalinha medição e captura (quebras erradas).
    brk.textContent = '#' + host.id + ',#' + host.id + ' *{-webkit-text-size-adjust:100%!important;text-size-adjust:100%!important}'
      + '#' + host.id + ' .foto-section,#' + host.id + ' .pdf-fotos{page-break-before:always;break-before:page}';
    host.appendChild(brk);
    var parsed = new DOMParser().parseFromString(html, 'text/html');
    parsed.querySelectorAll('style').forEach(function (s) {
      var st = document.createElement('style');
      st.textContent = s.textContent.replace(/\bbody\s*\{/g, '#' + host.id + '{');
      host.appendChild(st);
    });
    Array.from(parsed.body.children).forEach(function (el) {
      if (el.classList && el.classList.contains('toolbar')) return;
      if (el.tagName === 'SCRIPT') return;
      host.appendChild(document.importNode(el, true));
    });
  }

  function waitImages(root) {
    var imgs = Array.from(root.querySelectorAll('img'));
    return Promise.all(imgs.map(function (img) {
      if (img.complete) return null;
      return new Promise(function (r) { img.onload = img.onerror = r; });
    }));
  }

  /* Escolhe as quebras de página sem cortar linhas de tabela, imagens,
     títulos e outros blocos pequenos; respeita page-break-before. */
  function pageBreaks(host, pageH) {
    var base = host.getBoundingClientRect().top;
    var total = host.scrollHeight;
    var atoms = [], forced = [];
    host.querySelectorAll('*').forEach(function (el) {
      if (el.tagName === 'STYLE') return;
      var r = el.getBoundingClientRect();
      if (!r.height) return;
      var top = r.top - base, bottom = r.bottom - base;
      var cs = getComputedStyle(el);
      if (cs.position === 'fixed') return;
      if ((cs.breakBefore === 'page' || cs.pageBreakBefore === 'always') && top > 1) forced.push(top);
      if (/^(H[1-6])$/.test(el.tagName) || el.classList.contains('sec') || el.classList.contains('sec-title')) {
        atoms.push([top, bottom + 40]);   // título não fica sozinho no fim da página
      } else if (r.height <= pageH * 0.15 || (r.height <= pageH * 0.4 && (el.tagName === 'IMG' || el.querySelector('img')))) {
        atoms.push([top, bottom]);
      }
    });
    forced.sort(function (a, b) { return a - b; });

    var breaks = [0], y0 = 0;
    while (y0 < total - 1) {
      var limit = y0 + pageH;
      var f = forced.filter(function (v) { return v > y0 + 20 && v < limit; })[0];
      if (f !== undefined) { breaks.push(f); y0 = f; continue; }
      if (limit >= total) { breaks.push(total); break; }
      var y = limit, moved = true, guard = 0;
      while (moved && guard++ < 50) {
        moved = false;
        for (var i = 0; i < atoms.length; i++) {
          var a = atoms[i];
          if (a[0] < y - 1 && a[1] > y + 1 && a[0] > y0) { y = a[0]; moved = true; }
        }
      }
      if (y < y0 + pageH * 0.5) y = limit;
      breaks.push(y);
      y0 = y;
    }
    return breaks;
  }

  function fromHtml(html, filename) {
    filename = filename || fileNameFrom(html);
    return ensureLibs().then(function () {
      var host = document.createElement('div');
      host.id = '_pdfCap';
      host.style.cssText = 'position:absolute;left:0;top:0;width:' + CAP_WIDTH + 'px;background:#fff;z-index:-1;pointer-events:none;-webkit-text-size-adjust:100%;text-size-adjust:100%';
      mountReport(html, host);
      document.body.appendChild(host);

      return waitImages(host).then(function () {
        var contentWmm = PAGE_W_MM - 2 * MARGIN_MM;
        var pageHmm = PAGE_H_MM - 2 * MARGIN_MM;
        var basePageHpx = pageHmm * CAP_WIDTH / contentWmm;
        var fotos = host.querySelector('.foto-section, .pdf-fotos');
        var textHeight = function () {
          return fotos ? fotos.getBoundingClientRect().top - host.getBoundingClientRect().top : host.scrollHeight;
        };
        // Reduz até MIN_FIT (layout mais largo, depois encolhido) para o texto caber na página 1.
        var fit = 1;
        for (var k = 1; k >= MIN_FIT - 0.001; k -= 0.05) {
          host.style.width = (CAP_WIDTH / k) + 'px';
          if (textHeight() <= basePageHpx / k) { fit = k; break; }
          fit = 0;
        }
        if (!fit) { fit = 1; host.style.width = CAP_WIDTH + 'px'; }
        var layoutW = CAP_WIDTH / fit;
        var pxPerMm = layoutW / contentWmm;
        var pageHpx = Math.floor(pageHmm * pxPerMm);
        var breaks = pageBreaks(host, pageHpx);
        var rect = host.getBoundingClientRect();
        var docTop = rect.top + window.pageYOffset;
        var docLeft = rect.left + window.pageXOffset;
        var scale = 2;
        var pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
        var title = filename.replace(/\.pdf$/, '').replace(/_/g, ' ');
        pdf.setProperties({ title: title, author: 'CTV Consultoria Técnica em Vulcanização', creator: 'CTV Apps Campo' });

        var chain = Promise.resolve();
        breaks.slice(0, -1).forEach(function (y0, i) {
          var hPx = Math.ceil(breaks[i + 1] - y0);
          chain = chain.then(function () {
            return window.html2canvas(host, {
              scale: scale, backgroundColor: '#ffffff', logging: false, useCORS: true,
              x: docLeft, y: docTop + y0, width: Math.ceil(layoutW), height: hPx,
              scrollX: -window.pageXOffset, scrollY: -window.pageYOffset,
              windowWidth: Math.ceil(layoutW)
            }).then(function (canvas) {
              if (i > 0) pdf.addPage();
              var img = canvas.toDataURL('image/jpeg', 0.92);
              pdf.addImage(img, 'JPEG', MARGIN_MM, MARGIN_MM, contentWmm, hPx / pxPerMm);
              canvas.width = canvas.height = 0;
            });
          });
        });
        return chain.then(function () {
          return new File([pdf.output('blob')], filename, { type: 'application/pdf' });
        });
      }).finally(function () { host.remove(); });
    });
  }

  function download(file) {
    var url = URL.createObjectURL(file);
    var a = document.createElement('a');
    a.href = url; a.download = file.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }

  /* Deve ser chamado direto do toque do usuário (exigência do navigator.share). */
  function deliver(file) {
    if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
      return navigator.share({ files: [file], title: file.name.replace(/\.pdf$/, '') })
        .catch(function (e) { if (!e || e.name !== 'AbortError') download(file); });
    }
    download(file);
    return Promise.resolve();
  }

  function btn(label, bg) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.style.cssText = 'padding:10px 14px;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;color:#fff;background:' + bg;
    return b;
  }

  /* Tela de pré-visualização + botões. Gera o PDF assim que abre, para que
     o toque em "Compartilhar" chame navigator.share imediatamente. */
  function openReport(html, filename) {
    filename = filename || fileNameFrom(html);
    ['_rptOvr', '_rptCSS'].forEach(function (id) { var e = document.getElementById(id); if (e) e.remove(); });

    var ovr = document.createElement('div'); ovr.id = '_rptOvr';
    ovr.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#fff;overflow:auto;-webkit-overflow-scrolling:touch';
    var bar = document.createElement('div'); bar.id = '_rptBar';
    bar.style.cssText = 'position:sticky;top:0;z-index:1;background:#f5f5f5;padding:8px 10px;padding-top:max(8px,env(safe-area-inset-top));display:flex;flex-wrap:wrap;gap:8px;border-bottom:1px solid #ddd';
    var bV = btn('← Voltar', '#001a33');
    var bS = btn('⏳ Gerando PDF...', '#28a745');
    bS.disabled = true; bS.style.opacity = '.6';
    bar.appendChild(bV); bar.appendChild(bS);
    var bP = null;
    if (!isStandaloneIOS()) { bP = btn('🖨 Imprimir', '#43a6ea'); bar.appendChild(bP); }
    ovr.appendChild(bar);

    var wrap = document.createElement('div'); wrap.id = '_rptWrap';
    mountReport(html, wrap);
    ovr.appendChild(wrap);
    document.body.appendChild(ovr);

    var pCSS = document.createElement('style'); pCSS.id = '_rptCSS';
    pCSS.textContent = '@media print{body>*:not(#_rptOvr){display:none!important}#_rptOvr{position:static!important;overflow:visible!important;inset:auto!important;z-index:auto!important;background:#fff!important}#_rptBar{display:none!important}#_rptWrap{-webkit-print-color-adjust:exact;print-color-adjust:exact}@page{margin:6mm;size:A4}}';
    document.head.appendChild(pCSS);

    var file = null, closed = false;
    bV.onclick = function () { closed = true; ovr.remove(); pCSS.remove(); };
    if (bP) bP.onclick = function () { window.print(); };
    bS.onclick = function () { if (file) deliver(file); };

    fromHtml(html, filename).then(function (f) {
      if (closed) return;
      file = f;
      bS.textContent = '📄 Salvar / Compartilhar PDF';
      bS.disabled = false; bS.style.opacity = '1';
    }).catch(function (e) {
      if (closed) return;
      console.error('[pdf-export]', e);
      bS.textContent = '⚠ Falha ao gerar — tocar p/ tentar';
      bS.disabled = false; bS.style.opacity = '1';
      bS.onclick = function () { closed = true; ovr.remove(); pCSS.remove(); openReport(html, filename); };
    });
  }

  window.CTVPdf = { fromHtml: fromHtml, deliver: deliver, openReport: openReport, fileNameFrom: fileNameFrom, isStandaloneIOS: isStandaloneIOS };
})();
